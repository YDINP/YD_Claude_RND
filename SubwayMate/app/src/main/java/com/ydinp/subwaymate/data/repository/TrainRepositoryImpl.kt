package com.ydinp.subwaymate.data.repository

import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.model.TrainLocation
import com.ydinp.subwaymate.domain.repository.TrainLocationRepository
import com.ydinp.subwaymate.domain.repository.TrainRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * TrainRepository 구현체
 *
 * TrainLocationRepository를 위임받아 실시간 열차 위치를 제공합니다.
 */
@Singleton
class TrainRepositoryImpl @Inject constructor(
    private val trainLocationRepository: TrainLocationRepository
) : TrainRepository {

    override fun getTrainLocations(lineId: String): Flow<List<TrainLocation>> = flow {
        while (true) {
            val result = trainLocationRepository.getTrainLocationsByLine(lineId)
            result.onSuccess { trains ->
                emit(trains)
            }
            delay(10_000L)
        }
    }

    override suspend fun getApproachingTrains(
        stationId: String,
        direction: Direction?
    ): List<TrainLocation> {
        // stationId에서 노선 ID를 추출하거나 기본값 사용
        val lineId = extractLineId(stationId)
        val result = trainLocationRepository.getTrainsAtStation(
            stationId = stationId,
            lineId = lineId,
            direction = direction
        )
        return result.getOrNull() ?: emptyList()
    }

    override suspend fun getTrainLocation(trainNo: String): TrainLocation? {
        // 모든 노선에서 열차 검색 (간소화된 버전)
        val lines = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9")
        for (lineId in lines) {
            val result = trainLocationRepository.getTrainLocation(trainNo, lineId)
            result.onSuccess { train ->
                return train
            }
        }
        return null
    }

    override fun trackTrain(
        trainNo: String,
        intervalMillis: Long
    ): Flow<TrainLocation?> = flow {
        while (true) {
            val train = getTrainLocation(trainNo)
            emit(train)
            delay(intervalMillis)
        }
    }

    override suspend fun getArrivalInfo(
        stationName: String,
        direction: Direction?
    ): List<TrainLocation> {
        val result = trainLocationRepository.getArrivingTrains(stationName)
        val trains = result.getOrNull() ?: emptyList()

        return if (direction != null) {
            trains.filter { it.direction == direction }
        } else {
            trains
        }
    }

    override suspend fun refreshTrainLocations(lineId: String) {
        trainLocationRepository.getTrainLocationsByLine(lineId)
    }

    /**
     * 역 ID에서 노선 ID 추출 (간소화된 버전)
     */
    private fun extractLineId(stationId: String): String {
        // 역 ID 형식에 따라 노선 ID 추출
        // 예: "0201" -> "2" (2호선)
        return stationId.take(2).trimStart('0').ifEmpty { "1" }
    }
}
