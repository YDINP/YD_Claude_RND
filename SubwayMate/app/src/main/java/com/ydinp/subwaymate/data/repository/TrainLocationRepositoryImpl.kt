package com.ydinp.subwaymate.data.repository

import com.ydinp.subwaymate.data.remote.api.SeoulOpenApi
import com.ydinp.subwaymate.data.remote.dto.RealtimeArrival
import com.ydinp.subwaymate.data.remote.dto.RealtimePosition
import com.ydinp.subwaymate.domain.common.Result
import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.model.TrainLocation
import com.ydinp.subwaymate.domain.model.TrainStatus
import com.ydinp.subwaymate.domain.repository.TrainLocationRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import java.time.LocalDateTime
import com.ydinp.subwaymate.di.IoDispatcher
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import javax.inject.Singleton

/**
 * TrainLocationRepository 구현체
 *
 * 서울 열린데이터광장 API를 통해 실시간 열차 위치 정보를 조회합니다.
 */
@Singleton
class TrainLocationRepositoryImpl @Inject constructor(
    private val seoulOpenApi: SeoulOpenApi,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : TrainLocationRepository {

    // API 키 (BuildConfig에서 가져오거나 환경변수로 관리)
    // TODO: 실제 API 키로 교체 필요
    private val apiKey: String = "sample"

    // 메모리 캐시
    private val trainLocationCache = mutableMapOf<String, CachedData<List<TrainLocation>>>()
    private val arrivalCache = mutableMapOf<String, CachedData<List<TrainLocation>>>()

    // 캐시 유효 시간 (밀리초)
    private val cacheValidDuration = 10_000L

    // ============== 실시간 위치 조회 ==============

    override suspend fun getTrainLocationsByLine(lineId: String): Result<List<TrainLocation>> =
        withContext(ioDispatcher) {
            try {
                // 캐시 확인
                trainLocationCache[lineId]?.let { cached ->
                    if (!cached.isExpired()) {
                        return@withContext Result.success(cached.data)
                    }
                }

                // API 호출
                val lineName = getLineNameFromId(lineId)
                val response = seoulOpenApi.getRealtimePosition(
                    apiKey = apiKey,
                    subwayLine = lineName
                )

                // 에러 체크
                response.errorMessage?.let { error ->
                    if (error.code != "INFO-000") {
                        return@withContext Result.error(
                            Exception(error.message),
                            error.message ?: "API 호출 실패"
                        )
                    }
                }

                // DTO -> Domain 변환
                val isCircularLine = lineId == "line2"
                val trainLocations = response.realtimePositionList?.map { dto ->
                    dto.toDomain(isCircularLine)
                } ?: emptyList()

                // 캐시 저장
                trainLocationCache[lineId] = CachedData(trainLocations)

                Result.success(trainLocations)
            } catch (e: Exception) {
                Result.error(e, "열차 위치 정보를 불러오는데 실패했습니다")
            }
        }

    override fun observeTrainLocationsByLine(
        lineId: String,
        refreshIntervalMs: Long
    ): Flow<Result<List<TrainLocation>>> = flow {
        while (true) {
            emit(Result.Loading)
            val result = getTrainLocationsByLine(lineId)
            emit(result)
            delay(refreshIntervalMs)
        }
    }.flowOn(ioDispatcher)

    override suspend fun getArrivingTrains(stationName: String): Result<List<TrainLocation>> =
        withContext(ioDispatcher) {
            try {
                // 캐시 확인
                arrivalCache[stationName]?.let { cached ->
                    if (!cached.isExpired()) {
                        return@withContext Result.success(cached.data)
                    }
                }

                // API 호출
                val response = seoulOpenApi.getRealtimeStationArrival(
                    apiKey = apiKey,
                    stationName = stationName
                )

                // 에러 체크
                response.errorMessage?.let { error ->
                    if (error.code != "INFO-000") {
                        return@withContext Result.error(
                            Exception(error.message),
                            error.message ?: "API 호출 실패"
                        )
                    }
                }

                // DTO -> Domain 변환
                val trainLocations = response.realtimeArrivalList?.map { dto ->
                    dto.toDomain()
                } ?: emptyList()

                // 캐시 저장
                arrivalCache[stationName] = CachedData(trainLocations)

                Result.success(trainLocations)
            } catch (e: Exception) {
                Result.error(e, "도착 정보를 불러오는데 실패했습니다")
            }
        }

    override fun observeArrivingTrains(
        stationName: String,
        refreshIntervalMs: Long
    ): Flow<Result<List<TrainLocation>>> = flow {
        while (true) {
            emit(Result.Loading)
            val result = getArrivingTrains(stationName)
            emit(result)
            delay(refreshIntervalMs)
        }
    }.flowOn(ioDispatcher)

    // ============== 특정 열차 추적 ==============

    override suspend fun getTrainLocation(
        trainNo: String,
        lineId: String
    ): Result<TrainLocation> = withContext(ioDispatcher) {
        try {
            val allTrains = getTrainLocationsByLine(lineId)
            allTrains.map { trains ->
                trains.find { it.trainNo == trainNo }
                    ?: throw NoSuchElementException("열차를 찾을 수 없습니다: $trainNo")
            }
        } catch (e: NoSuchElementException) {
            Result.error(e, "열차를 찾을 수 없습니다")
        } catch (e: Exception) {
            Result.error(e, "열차 정보를 불러오는데 실패했습니다")
        }
    }

    override fun trackTrain(
        trainNo: String,
        lineId: String,
        refreshIntervalMs: Long
    ): Flow<Result<TrainLocation>> = flow {
        while (true) {
            emit(Result.Loading)
            val result = getTrainLocation(trainNo, lineId)
            emit(result)
            delay(refreshIntervalMs)
        }
    }.flowOn(ioDispatcher)

    // ============== 필터링된 조회 ==============

    override suspend fun getTrainsAtStation(
        stationId: String,
        lineId: String,
        direction: Direction?
    ): Result<List<TrainLocation>> = withContext(ioDispatcher) {
        getTrainLocationsByLine(lineId).map { trains ->
            trains.filter { train ->
                (train.currentStationId == stationId || train.nextStationId == stationId) &&
                        (direction == null || train.direction == direction)
            }
        }
    }

    override suspend fun getTrainsByDirection(
        lineId: String,
        direction: Direction
    ): Result<List<TrainLocation>> = withContext(ioDispatcher) {
        getTrainLocationsByLine(lineId).map { trains ->
            trains.filter { it.direction == direction }
        }
    }

    override fun observeTrainsAtStation(
        stationId: String,
        lineId: String,
        direction: Direction,
        refreshIntervalMs: Long
    ): Flow<Result<List<TrainLocation>>> = flow {
        while (true) {
            emit(Result.Loading)
            val result = getTrainsAtStation(stationId, lineId, direction)
            emit(result)
            delay(refreshIntervalMs)
        }
    }.flowOn(ioDispatcher)

    // ============== 도착 예측 ==============

    override suspend fun getEstimatedArrivalTime(
        trainNo: String,
        lineId: String,
        destinationStationId: String
    ): Result<Int> = withContext(ioDispatcher) {
        try {
            // 현재 열차 위치를 기반으로 예상 도착 시간 계산
            // 실제로는 StationRepository와 연동하여 역 간 소요 시간을 계산해야 함
            val trainResult = getTrainLocation(trainNo, lineId)
            trainResult.map {
                // 임시: 역당 평균 2분 소요로 계산
                // TODO: 실제 역 간 거리/시간 데이터 기반으로 계산
                120 // 기본 2분 (초 단위)
            }
        } catch (e: Exception) {
            Result.error(e, "도착 예정 시간을 계산하는데 실패했습니다")
        }
    }

    override suspend fun getNextTrain(
        stationId: String,
        lineId: String,
        direction: Direction
    ): Result<TrainLocation?> = withContext(ioDispatcher) {
        getTrainsAtStation(stationId, lineId, direction).map { trains ->
            // 가장 가까운 열차 (도착 예정 시간 기준)
            trains.minByOrNull { train ->
                train.estimatedArrivalTime?.let {
                    java.time.Duration.between(LocalDateTime.now(), it).seconds
                } ?: Long.MAX_VALUE
            }
        }
    }

    // ============== 캐시 관련 ==============

    override suspend fun clearCache() {
        trainLocationCache.clear()
        arrivalCache.clear()
    }

    override suspend fun getLastUpdateTime(lineId: String): Long? {
        return trainLocationCache[lineId]?.timestamp
    }

    // ============== Private Helper Methods ==============

    private fun getLineNameFromId(lineId: String): String {
        return when (lineId) {
            "line1" -> "1호선"
            "line2" -> "2호선"
            "line3" -> "3호선"
            "line4" -> "4호선"
            "line5" -> "5호선"
            "line6" -> "6호선"
            "line7" -> "7호선"
            "line8" -> "8호선"
            "line9" -> "9호선"
            "gyeongui_jungang" -> "경의중앙선"
            "gyeongchun" -> "경춘선"
            "suin_bundang" -> "수인분당선"
            "shinbundang" -> "신분당선"
            "airport" -> "공항철도"
            "gtx_a" -> "GTX-A"
            else -> lineId
        }
    }

    private fun RealtimePosition.toDomain(isCircularLine: Boolean): TrainLocation {
        val dateFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
        val updatedAt = try {
            LocalDateTime.parse(lastRecptnDt ?: recptnDt, dateFormatter)
        } catch (e: Exception) {
            LocalDateTime.now()
        }

        return TrainLocation(
            trainNo = trainNo ?: "",
            lineId = subwayId ?: "",
            currentStationId = statnId ?: "",
            nextStationId = statnId ?: "", // API에서는 현재역만 제공
            direction = Direction.fromCode(updnLine ?: "0", isCircularLine),
            estimatedArrivalTime = null,
            trainStatus = when (trainSttus) {
                "0" -> TrainStatus.APPROACHING
                "1" -> TrainStatus.ARRIVED
                "2" -> TrainStatus.DEPARTING
                "3" -> TrainStatus.IN_TRANSIT
                else -> TrainStatus.UNKNOWN
            },
            destinationStationId = statnTid ?: "",
            updatedAt = updatedAt
        )
    }

    private fun RealtimeArrival.toDomain(): TrainLocation {
        val dateFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
        val updatedAt = try {
            LocalDateTime.parse(recptnDt, dateFormatter)
        } catch (e: Exception) {
            LocalDateTime.now()
        }

        // 도착 예정 시간 계산
        val estimatedArrival = arrivalTimeInSeconds?.let {
            LocalDateTime.now().plusSeconds(it.toLong())
        }

        // 순환선 여부 (2호선)
        val isCircularLine = subwayId == "1002"

        return TrainLocation(
            trainNo = btrainNo ?: "",
            lineId = subwayId ?: "",
            currentStationId = statnId ?: "",
            nextStationId = statnId ?: "",
            direction = when {
                isCircularLine && (updnLine == "내선" || updnLine?.contains("내선") == true) -> Direction.INNER
                isCircularLine && (updnLine == "외선" || updnLine?.contains("외선") == true) -> Direction.OUTER
                updnLine == "상행" || updnLine?.contains("상행") == true -> Direction.UP
                else -> Direction.DOWN
            },
            estimatedArrivalTime = estimatedArrival,
            trainStatus = when (arvlCd) {
                "0" -> TrainStatus.APPROACHING
                "1" -> TrainStatus.ARRIVED
                "2" -> TrainStatus.DEPARTING
                "3", "4", "5", "99" -> TrainStatus.IN_TRANSIT
                else -> TrainStatus.UNKNOWN
            },
            destinationStationId = bstatnId ?: "",
            updatedAt = updatedAt
        )
    }

    /**
     * 캐시 데이터 래퍼 클래스
     */
    private data class CachedData<T>(
        val data: T,
        val timestamp: Long = System.currentTimeMillis()
    ) {
        fun isExpired(validDuration: Long = 10_000L): Boolean {
            return System.currentTimeMillis() - timestamp > validDuration
        }
    }
}
