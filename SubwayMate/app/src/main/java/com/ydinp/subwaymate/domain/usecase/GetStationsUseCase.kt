package com.ydinp.subwaymate.domain.usecase

import com.ydinp.subwaymate.domain.common.Result
import com.ydinp.subwaymate.domain.model.Line
import com.ydinp.subwaymate.domain.model.Station
import com.ydinp.subwaymate.domain.repository.StationRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import javax.inject.Inject

/**
 * 역 및 노선 정보를 조회하는 UseCase
 *
 * 노선별 역 목록, 역 검색, 주변 역 조회 등의 기능을 제공합니다.
 */
class GetStationsUseCase @Inject constructor(
    private val stationRepository: StationRepository
) {
    /**
     * 모든 노선 목록을 조회
     *
     * @return 노선 목록 Result
     */
    suspend fun getAllLines(): Result<List<Line>> {
        return stationRepository.getAllLines()
    }

    /**
     * 모든 노선 목록을 Flow로 관찰
     *
     * @return 노선 목록 Flow
     */
    fun observeAllLines(): Flow<Result<List<Line>>> {
        return stationRepository.observeAllLines()
    }

    /**
     * 특정 노선의 역 목록을 조회
     *
     * @param lineId 노선 ID
     * @return 역 목록 Result
     */
    suspend fun getStationsByLine(lineId: String): Result<List<Station>> {
        return stationRepository.getStationsByLine(lineId)
    }

    /**
     * 특정 노선의 역 목록을 Flow로 관찰
     *
     * @param lineId 노선 ID
     * @return 역 목록 Flow
     */
    fun observeStationsByLine(lineId: String): Flow<Result<List<Station>>> {
        return stationRepository.observeStationsByLine(lineId)
    }

    /**
     * 모든 역 목록을 조회
     *
     * @return 역 목록 Result
     */
    suspend fun getAllStations(): Result<List<Station>> {
        return stationRepository.getAllStations()
    }

    /**
     * 모든 역 목록을 Flow로 관찰
     *
     * @return 역 목록 Flow
     */
    fun observeAllStations(): Flow<Result<List<Station>>> {
        return stationRepository.observeAllStations()
    }

    /**
     * 역 이름으로 검색
     *
     * @param query 검색어 (2글자 이상)
     * @return 검색 결과 역 목록 Result
     */
    suspend fun searchStations(query: String): Result<List<Station>> {
        if (query.length < 2) {
            return Result.success(emptyList())
        }
        return stationRepository.searchStations(query)
    }

    /**
     * 역 이름으로 검색 (Flow)
     *
     * @param query 검색어 (2글자 이상)
     * @return 검색 결과 Flow
     */
    fun observeSearchStations(query: String): Flow<Result<List<Station>>> {
        if (query.length < 2) {
            return flowOf(Result.success(emptyList()))
        }
        return stationRepository.observeSearchStations(query)
    }

    /**
     * 특정 역의 상세 정보를 조회
     *
     * @param stationId 역 ID
     * @return Station Result
     */
    suspend fun getStationById(stationId: String): Result<Station> {
        return stationRepository.getStationById(stationId)
    }

    /**
     * 특정 노선의 정보를 조회
     *
     * @param lineId 노선 ID
     * @return Line Result
     */
    suspend fun getLineById(lineId: String): Result<Line> {
        return stationRepository.getLineById(lineId)
    }

    /**
     * 두 역 사이의 역 수를 계산
     *
     * @param fromStationId 출발역 ID
     * @param toStationId 도착역 ID
     * @param lineId 노선 ID
     * @return 역 개수 Result (출발역 제외, 도착역 포함)
     */
    suspend fun getStationCountBetween(
        fromStationId: String,
        toStationId: String,
        lineId: String
    ): Result<Int> {
        return stationRepository.getStationCount(fromStationId, toStationId, lineId)
    }

    /**
     * 두 역 사이의 경로 상 역 목록을 조회
     *
     * @param fromStationId 출발역 ID
     * @param toStationId 도착역 ID
     * @param lineId 노선 ID
     * @return 경로 상의 역 목록 Result
     */
    suspend fun getStationsBetween(
        fromStationId: String,
        toStationId: String,
        lineId: String
    ): Result<List<Station>> {
        return stationRepository.getStationsBetween(fromStationId, toStationId, lineId)
    }

    /**
     * 두 역 사이의 예상 소요 시간을 계산
     *
     * @param fromStationId 출발역 ID
     * @param toStationId 도착역 ID
     * @param lineId 노선 ID
     * @return 예상 소요 시간 (분) Result
     */
    suspend fun getEstimatedTravelTime(
        fromStationId: String,
        toStationId: String,
        lineId: String
    ): Result<Int> {
        return stationRepository.getEstimatedTravelTime(fromStationId, toStationId, lineId)
    }

    /**
     * 현재 위치 주변의 역 목록을 조회
     *
     * @param latitude 위도
     * @param longitude 경도
     * @param radiusMeters 검색 반경 (미터, 기본 500m)
     * @param limit 최대 반환 개수
     * @return 거리순으로 정렬된 주변 역 목록 Result
     */
    suspend fun getNearbyStations(
        latitude: Double,
        longitude: Double,
        radiusMeters: Int = 500,
        limit: Int = 5
    ): Result<List<Station>> {
        return stationRepository.getNearbyStations(latitude, longitude, radiusMeters, limit)
    }

    /**
     * 주변 역을 Flow로 관찰
     *
     * @param latitude 위도
     * @param longitude 경도
     * @param limit 최대 반환 개수
     * @return 주변 역 목록 Flow
     */
    fun observeNearbyStations(
        latitude: Double,
        longitude: Double,
        limit: Int = 5
    ): Flow<Result<List<Station>>> {
        return stationRepository.observeNearbyStations(latitude, longitude, limit)
    }

    /**
     * 환승역 목록을 조회
     *
     * @return 환승 가능한 역 목록 Result
     */
    suspend fun getTransferStations(): Result<List<Station>> {
        return stationRepository.getTransferStations()
    }

    /**
     * 노선 목록과 함께 그룹화된 역 정보를 조회
     *
     * @return 노선별로 그룹화된 역 정보 Flow
     */
    fun observeStationsGroupedByLine(): Flow<Result<Map<Line, List<Station>>>> {
        return combine(
            stationRepository.observeAllLines(),
            stationRepository.observeAllStations()
        ) { linesResult, stationsResult ->
            when {
                linesResult is Result.Error -> Result.error(linesResult.exception, linesResult.message)
                stationsResult is Result.Error -> Result.error(stationsResult.exception, stationsResult.message)
                linesResult is Result.Loading || stationsResult is Result.Loading -> Result.loading()
                else -> {
                    val lines = linesResult.getOrDefault(emptyList())
                    val stations = stationsResult.getOrDefault(emptyList())
                    Result.success(
                        lines.associateWith { line ->
                            stations.filter { it.lineId == line.id }
                        }
                    )
                }
            }
        }
    }

    /**
     * 초기 데이터 로드
     *
     * @return 로드 결과 Result
     */
    suspend fun loadInitialData(): Result<Unit> {
        return stationRepository.loadInitialData()
    }

    /**
     * 데이터가 로드되었는지 확인
     *
     * @return 로드 여부
     */
    suspend fun isDataLoaded(): Boolean {
        return stationRepository.isDataLoaded()
    }
}
