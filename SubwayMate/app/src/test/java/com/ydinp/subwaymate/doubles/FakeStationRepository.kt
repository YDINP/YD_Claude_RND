package com.ydinp.subwaymate.doubles

import com.ydinp.subwaymate.domain.common.Result
import com.ydinp.subwaymate.domain.model.Line
import com.ydinp.subwaymate.domain.model.Station
import com.ydinp.subwaymate.domain.repository.StationRepository
import com.ydinp.subwaymate.util.TestData
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map

/**
 * 테스트용 FakeStationRepository 구현
 *
 * StationRepository 인터페이스를 구현하여 테스트에서 실제 데이터베이스 없이
 * Repository의 동작을 시뮬레이션합니다.
 */
class FakeStationRepository : StationRepository {

    // 내부 데이터 저장소
    private val _lines = MutableStateFlow<List<Line>>(TestData.allLines)
    private val _stations = MutableStateFlow<List<Station>>(TestData.allStations)
    private var _isDataLoaded = true

    // 에러 시뮬레이션 플래그
    var shouldReturnError = false
    var errorMessage = "테스트 에러"

    /**
     * 테스트용 데이터 설정
     */
    fun setLines(lines: List<Line>) {
        _lines.value = lines
    }

    fun setStations(stations: List<Station>) {
        _stations.value = stations
    }

    fun setDataLoaded(loaded: Boolean) {
        _isDataLoaded = loaded
    }

    // ============== 노선 관련 ==============

    override suspend fun getAllLines(): Result<List<Line>> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            Result.success(_lines.value)
        }
    }

    override fun observeAllLines(): Flow<Result<List<Line>>> {
        return _lines.map { lines ->
            if (shouldReturnError) {
                Result.error(Exception(errorMessage), errorMessage)
            } else {
                Result.success(lines)
            }
        }
    }

    override suspend fun getLineById(lineId: String): Result<Line> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            val line = _lines.value.find { it.id == lineId }
            if (line != null) {
                Result.success(line)
            } else {
                Result.error(NoSuchElementException("노선을 찾을 수 없습니다: $lineId"))
            }
        }
    }

    override suspend fun searchLines(query: String): Result<List<Line>> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            val filtered = _lines.value.filter { it.name.contains(query) }
            Result.success(filtered)
        }
    }

    // ============== 역 관련 ==============

    override suspend fun getStationsByLine(lineId: String): Result<List<Station>> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            val filtered = _stations.value.filter { it.lineId == lineId }
            Result.success(filtered)
        }
    }

    override fun observeStationsByLine(lineId: String): Flow<Result<List<Station>>> {
        return _stations.map { stations ->
            if (shouldReturnError) {
                Result.error(Exception(errorMessage), errorMessage)
            } else {
                val filtered = stations.filter { it.lineId == lineId }
                Result.success(filtered)
            }
        }
    }

    override suspend fun getAllStations(): Result<List<Station>> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            Result.success(_stations.value)
        }
    }

    override fun observeAllStations(): Flow<Result<List<Station>>> {
        return _stations.map { stations ->
            if (shouldReturnError) {
                Result.error(Exception(errorMessage), errorMessage)
            } else {
                Result.success(stations)
            }
        }
    }

    override suspend fun searchStations(query: String): Result<List<Station>> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            val filtered = _stations.value.filter { it.name.contains(query) }
            Result.success(filtered)
        }
    }

    override fun observeSearchStations(query: String): Flow<Result<List<Station>>> {
        return _stations.map { stations ->
            if (shouldReturnError) {
                Result.error(Exception(errorMessage), errorMessage)
            } else {
                val filtered = stations.filter { it.name.contains(query) }
                Result.success(filtered)
            }
        }
    }

    override suspend fun getStationById(stationId: String): Result<Station> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            val station = _stations.value.find { it.id == stationId }
            if (station != null) {
                Result.success(station)
            } else {
                Result.error(NoSuchElementException("역을 찾을 수 없습니다: $stationId"))
            }
        }
    }

    override suspend fun getStationByName(name: String, lineId: String): Result<Station> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            val station = _stations.value.find { it.name == name && it.lineId == lineId }
            if (station != null) {
                Result.success(station)
            } else {
                Result.error(NoSuchElementException("역을 찾을 수 없습니다: $name"))
            }
        }
    }

    override suspend fun getTransferStations(): Result<List<Station>> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            val transfers = _stations.value.filter { it.isTransferStation() }
            Result.success(transfers)
        }
    }

    // ============== 위치 기반 ==============

    override suspend fun getNearbyStations(
        latitude: Double,
        longitude: Double,
        radiusMeters: Int,
        limit: Int
    ): Result<List<Station>> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            // 간단한 거리 계산으로 정렬하여 반환
            val sorted = _stations.value
                .sortedBy { it.distanceTo(latitude, longitude) }
                .take(limit)
            Result.success(sorted)
        }
    }

    override fun observeNearbyStations(
        latitude: Double,
        longitude: Double,
        limit: Int
    ): Flow<Result<List<Station>>> {
        return _stations.map { stations ->
            if (shouldReturnError) {
                Result.error(Exception(errorMessage), errorMessage)
            } else {
                val sorted = stations
                    .sortedBy { it.distanceTo(latitude, longitude) }
                    .take(limit)
                Result.success(sorted)
            }
        }
    }

    // ============== 경로 관련 ==============

    override suspend fun getStationsBetween(
        fromStationId: String,
        toStationId: String,
        lineId: String
    ): Result<List<Station>> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            val lineStations = _stations.value.filter { it.lineId == lineId }
            val fromIndex = lineStations.indexOfFirst { it.id == fromStationId }
            val toIndex = lineStations.indexOfFirst { it.id == toStationId }

            if (fromIndex == -1 || toIndex == -1) {
                Result.error(IllegalArgumentException("역을 찾을 수 없습니다"))
            } else {
                val range = if (fromIndex <= toIndex) {
                    lineStations.subList(fromIndex, toIndex + 1)
                } else {
                    lineStations.subList(toIndex, fromIndex + 1).reversed()
                }
                Result.success(range)
            }
        }
    }

    override suspend fun getStationCount(
        fromStationId: String,
        toStationId: String,
        lineId: String
    ): Result<Int> {
        val stationsBetweenResult = getStationsBetween(fromStationId, toStationId, lineId)
        return stationsBetweenResult.map { stations ->
            (stations.size - 1).coerceAtLeast(0)
        }
    }

    override suspend fun getEstimatedTravelTime(
        fromStationId: String,
        toStationId: String,
        lineId: String
    ): Result<Int> {
        val countResult = getStationCount(fromStationId, toStationId, lineId)
        return countResult.map { count -> count * 2 } // 역당 평균 2분 가정
    }

    // ============== 데이터 관리 ==============

    override suspend fun refreshStationData(): Result<Unit> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            Result.success(Unit)
        }
    }

    override suspend fun isDataLoaded(): Boolean {
        return _isDataLoaded
    }

    override suspend fun loadInitialData(): Result<Unit> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            _isDataLoaded = true
            Result.success(Unit)
        }
    }
}
