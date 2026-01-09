package com.ydinp.subwaymate.data.repository

import android.content.Context
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.ydinp.subwaymate.data.local.dao.StationDao
import com.ydinp.subwaymate.data.local.entity.StationEntity
import com.ydinp.subwaymate.di.IoDispatcher
import com.ydinp.subwaymate.domain.common.Result
import com.ydinp.subwaymate.domain.model.Line
import com.ydinp.subwaymate.domain.model.LineType
import com.ydinp.subwaymate.domain.model.Station
import com.ydinp.subwaymate.domain.repository.StationRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * StationRepository 구현체
 *
 * assets의 JSON 파일에서 역/노선 데이터를 로드하고,
 * Room DB에 캐싱하여 오프라인에서도 사용 가능하게 합니다.
 */
@Singleton
class StationRepositoryImpl @Inject constructor(
    @ApplicationContext private val context: Context,
    private val stationDao: StationDao,
    private val moshi: Moshi,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : StationRepository {

    // 메모리 캐시 (노선 정보는 자주 변경되지 않으므로 메모리에만 캐시)
    private val linesCache = MutableStateFlow<List<Line>>(emptyList())
    private val stationsCache = MutableStateFlow<Map<String, List<Station>>>(emptyMap())
    private val allStationsCache = MutableStateFlow<List<Station>>(emptyList())

    private val mutex = Mutex()
    private var isInitialized = false

    // ============== 노선 관련 ==============

    override suspend fun getAllLines(): Result<List<Line>> = withContext(ioDispatcher) {
        try {
            ensureInitialized()
            Result.success(linesCache.value)
        } catch (e: Exception) {
            Result.error(e, "노선 정보를 불러오는데 실패했습니다")
        }
    }

    override fun observeAllLines(): Flow<Result<List<Line>>> = flow {
        ensureInitialized()
        linesCache.collect { lines ->
            emit(Result.success(lines))
        }
    }.catch { e ->
        emit(Result.error(e as Exception, "노선 정보를 불러오는데 실패했습니다"))
    }.flowOn(ioDispatcher)

    override suspend fun getLineById(lineId: String): Result<Line> = withContext(ioDispatcher) {
        try {
            ensureInitialized()
            val line = linesCache.value.find { it.id == lineId }
            if (line != null) {
                Result.success(line)
            } else {
                Result.error(NoSuchElementException("노선을 찾을 수 없습니다: $lineId"))
            }
        } catch (e: Exception) {
            Result.error(e, "노선 정보를 불러오는데 실패했습니다")
        }
    }

    override suspend fun searchLines(query: String): Result<List<Line>> = withContext(ioDispatcher) {
        try {
            ensureInitialized()
            val results = linesCache.value.filter { line ->
                line.name.contains(query, ignoreCase = true)
            }
            Result.success(results)
        } catch (e: Exception) {
            Result.error(e, "노선 검색에 실패했습니다")
        }
    }

    // ============== 역 관련 ==============

    override suspend fun getStationsByLine(lineId: String): Result<List<Station>> = withContext(ioDispatcher) {
        try {
            ensureInitialized()
            // 우선 메모리 캐시에서 조회
            val cachedStations = stationsCache.value[lineId]
            if (!cachedStations.isNullOrEmpty()) {
                return@withContext Result.success(cachedStations)
            }

            // Room DB에서 조회
            val dbStations = stationDao.getStationsByLineOnce(lineId)
            if (dbStations.isNotEmpty()) {
                val stations = dbStations.map { it.toDomain() }
                // 메모리 캐시 업데이트
                val updatedMap = stationsCache.value.toMutableMap()
                updatedMap[lineId] = stations
                stationsCache.value = updatedMap
                return@withContext Result.success(stations)
            }

            Result.success(emptyList())
        } catch (e: Exception) {
            Result.error(e, "역 정보를 불러오는데 실패했습니다")
        }
    }

    override fun observeStationsByLine(lineId: String): Flow<Result<List<Station>>> =
        stationDao.getStationsByLine(lineId)
            .map { entities ->
                Result.success(entities.map { it.toDomain() })
            }
            .catch { e ->
                emit(Result.error(e as Exception, "역 정보를 불러오는데 실패했습니다"))
            }
            .flowOn(ioDispatcher)

    override suspend fun getAllStations(): Result<List<Station>> = withContext(ioDispatcher) {
        try {
            ensureInitialized()
            // 우선 메모리 캐시에서 조회
            if (allStationsCache.value.isNotEmpty()) {
                return@withContext Result.success(allStationsCache.value)
            }

            // Room DB에서 조회
            val dbStations = stationDao.getAllStationsOnce()
            if (dbStations.isNotEmpty()) {
                val stations = dbStations.map { it.toDomain() }
                allStationsCache.value = stations
                return@withContext Result.success(stations)
            }

            Result.success(emptyList())
        } catch (e: Exception) {
            Result.error(e, "역 정보를 불러오는데 실패했습니다")
        }
    }

    override fun observeAllStations(): Flow<Result<List<Station>>> =
        stationDao.getAllStations()
            .map { entities ->
                Result.success(entities.map { it.toDomain() })
            }
            .catch { e ->
                emit(Result.error(e as Exception, "역 정보를 불러오는데 실패했습니다"))
            }
            .flowOn(ioDispatcher)

    override suspend fun searchStations(query: String): Result<List<Station>> = withContext(ioDispatcher) {
        try {
            if (query.isBlank()) {
                return@withContext Result.success(emptyList())
            }

            // Room DB에서 검색
            val dbStations = stationDao.searchStationsByNameOnce(query)
            if (dbStations.isNotEmpty()) {
                val stations = dbStations.map { it.toDomain() }.distinctBy { it.name }
                return@withContext Result.success(stations)
            }

            // 메모리 캐시에서 검색 (폴백)
            ensureInitialized()
            val results = allStationsCache.value.filter { station ->
                station.name.contains(query, ignoreCase = true)
            }.distinctBy { it.name }
            Result.success(results)
        } catch (e: Exception) {
            Result.error(e, "역 검색에 실패했습니다")
        }
    }

    override fun observeSearchStations(query: String): Flow<Result<List<Station>>> =
        if (query.isBlank()) {
            flow { emit(Result.success(emptyList())) }
        } else {
            stationDao.searchStationsByName(query)
                .map { entities ->
                    Result.success(entities.map { it.toDomain() }.distinctBy { it.name })
                }
                .catch { e ->
                    emit(Result.error(e as Exception, "역 검색에 실패했습니다"))
                }
        }.flowOn(ioDispatcher)

    override suspend fun getStationById(stationId: String): Result<Station> = withContext(ioDispatcher) {
        try {
            // Room DB에서 조회
            val dbStation = stationDao.getStationById(stationId)
            if (dbStation != null) {
                return@withContext Result.success(dbStation.toDomain())
            }

            // 메모리 캐시에서 검색 (폴백)
            ensureInitialized()
            val station = allStationsCache.value.find { it.id == stationId }
            if (station != null) {
                Result.success(station)
            } else {
                Result.error(NoSuchElementException("역을 찾을 수 없습니다: $stationId"))
            }
        } catch (e: Exception) {
            Result.error(e, "역 정보를 불러오는데 실패했습니다")
        }
    }

    override suspend fun getStationByName(name: String, lineId: String): Result<Station> = withContext(ioDispatcher) {
        try {
            // Room DB에서 조회
            val dbStations = stationDao.searchStationsByNameOnce(name)
            val dbStation = dbStations.find { it.name == name && it.lineId == lineId }
            if (dbStation != null) {
                return@withContext Result.success(dbStation.toDomain())
            }

            // 메모리 캐시에서 검색 (폴백)
            ensureInitialized()
            val station = stationsCache.value[lineId]?.find { it.name == name }
            if (station != null) {
                Result.success(station)
            } else {
                Result.error(NoSuchElementException("역을 찾을 수 없습니다: $name ($lineId)"))
            }
        } catch (e: Exception) {
            Result.error(e, "역 정보를 불러오는데 실패했습니다")
        }
    }

    override suspend fun getTransferStations(): Result<List<Station>> = withContext(ioDispatcher) {
        try {
            ensureInitialized()
            val transferStations = allStationsCache.value.filter { it.isTransferStation() }
                .distinctBy { it.name }
            Result.success(transferStations)
        } catch (e: Exception) {
            Result.error(e, "환승역 정보를 불러오는데 실패했습니다")
        }
    }

    // ============== 위치 기반 ==============

    override suspend fun getNearbyStations(
        latitude: Double,
        longitude: Double,
        radiusMeters: Int,
        limit: Int
    ): Result<List<Station>> = withContext(ioDispatcher) {
        try {
            ensureInitialized()
            val nearbyStations = allStationsCache.value
                .map { station -> station to station.distanceTo(latitude, longitude) }
                .filter { (_, distance) -> distance <= radiusMeters }
                .sortedBy { (_, distance) -> distance }
                .take(limit)
                .map { (station, _) -> station }
            Result.success(nearbyStations)
        } catch (e: Exception) {
            Result.error(e, "주변 역 정보를 불러오는데 실패했습니다")
        }
    }

    override fun observeNearbyStations(
        latitude: Double,
        longitude: Double,
        limit: Int
    ): Flow<Result<List<Station>>> = allStationsCache.map { stations ->
        val nearbyStations = stations
            .map { station -> station to station.distanceTo(latitude, longitude) }
            .sortedBy { (_, distance) -> distance }
            .take(limit)
            .map { (station, _) -> station }
        Result.success(nearbyStations)
    }.flowOn(ioDispatcher)

    // ============== 경로 관련 ==============

    override suspend fun getStationsBetween(
        fromStationId: String,
        toStationId: String,
        lineId: String
    ): Result<List<Station>> = withContext(ioDispatcher) {
        try {
            ensureInitialized()
            val lineStations = stationsCache.value[lineId] ?: return@withContext Result.error(
                NoSuchElementException("노선을 찾을 수 없습니다: $lineId")
            )

            val fromIndex = lineStations.indexOfFirst { it.id == fromStationId }
            val toIndex = lineStations.indexOfFirst { it.id == toStationId }

            if (fromIndex == -1) {
                return@withContext Result.error(NoSuchElementException("출발역을 찾을 수 없습니다: $fromStationId"))
            }
            if (toIndex == -1) {
                return@withContext Result.error(NoSuchElementException("도착역을 찾을 수 없습니다: $toStationId"))
            }

            val stations = if (fromIndex <= toIndex) {
                lineStations.subList(fromIndex, toIndex + 1)
            } else {
                // 역방향의 경우
                lineStations.subList(toIndex, fromIndex + 1).reversed()
            }

            Result.success(stations)
        } catch (e: Exception) {
            Result.error(e, "경로 정보를 불러오는데 실패했습니다")
        }
    }

    override suspend fun getStationCount(
        fromStationId: String,
        toStationId: String,
        lineId: String
    ): Result<Int> {
        return getStationsBetween(fromStationId, toStationId, lineId).map { stations ->
            (stations.size - 1).coerceAtLeast(0)
        }
    }

    override suspend fun getEstimatedTravelTime(
        fromStationId: String,
        toStationId: String,
        lineId: String
    ): Result<Int> {
        return getStationCount(fromStationId, toStationId, lineId).map { count ->
            // 역 간 평균 소요 시간: 2분
            count * 2
        }
    }

    // ============== 데이터 관리 ==============

    override suspend fun refreshStationData(): Result<Unit> = withContext(ioDispatcher) {
        try {
            mutex.withLock {
                isInitialized = false
                // Room DB 클리어
                stationDao.deleteAllStations()
                // 다시 로드
                loadData()
                isInitialized = true
            }
            Result.success(Unit)
        } catch (e: Exception) {
            Result.error(e, "데이터 새로고침에 실패했습니다")
        }
    }

    override suspend fun isDataLoaded(): Boolean {
        return isInitialized || stationDao.getStationCount() > 0
    }

    override suspend fun loadInitialData(): Result<Unit> = withContext(ioDispatcher) {
        try {
            ensureInitialized()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.error(e, "초기 데이터 로드에 실패했습니다")
        }
    }

    // ============== Private Methods ==============

    private suspend fun ensureInitialized() {
        if (!isInitialized) {
            mutex.withLock {
                if (!isInitialized) {
                    // Room DB에 데이터가 있는지 확인
                    val dbStationCount = stationDao.getStationCount()
                    if (dbStationCount > 0) {
                        // DB에서 로드
                        loadFromDatabase()
                    } else {
                        // assets에서 로드하고 DB에 저장
                        loadData()
                    }
                    isInitialized = true
                }
            }
        }
    }

    private suspend fun loadFromDatabase() {
        // 노선 정보는 항상 assets에서 로드 (DB에 저장하지 않음)
        val lines = loadLinesFromAssets()
        linesCache.value = lines

        // 역 정보는 DB에서 로드
        val allDbStations = stationDao.getAllStationsOnce()
        val allStations = allDbStations.map { it.toDomain() }
        allStationsCache.value = allStations

        // 노선별로 그룹핑
        val stationsMap = allStations.groupBy { it.lineId }
        stationsCache.value = stationsMap
    }

    private suspend fun loadData() {
        // 노선 정보 로드
        val lines = loadLinesFromAssets()
        linesCache.value = lines

        // 역 정보 로드
        val stationsMap = mutableMapOf<String, List<Station>>()
        val allStations = mutableListOf<Station>()
        val stationEntities = mutableListOf<StationEntity>()

        // 현재는 1호선, 2호선만 있음
        val availableLineFiles = listOf("line1", "line2")

        for (lineId in availableLineFiles) {
            try {
                val stations = loadStationsFromAssets(lineId)
                stationsMap[lineId] = stations
                allStations.addAll(stations)

                // Entity로 변환
                stationEntities.addAll(stations.map { StationEntity.fromDomain(it) })
            } catch (e: Exception) {
                // 파일이 없는 노선은 무시
            }
        }

        // Room DB에 저장
        if (stationEntities.isNotEmpty()) {
            stationDao.insertStations(stationEntities)
        }

        stationsCache.value = stationsMap
        allStationsCache.value = allStations
    }

    private fun loadLinesFromAssets(): List<Line> {
        val jsonString = context.assets.open("lines.json").bufferedReader().use { it.readText() }

        val type = Types.newParameterizedType(List::class.java, LineJson::class.java)
        val adapter = moshi.adapter<List<LineJson>>(type)
        val lineJsonList = adapter.fromJson(jsonString) ?: emptyList()

        return lineJsonList.map { it.toDomain() }
    }

    private fun loadStationsFromAssets(lineId: String): List<Station> {
        val fileName = "stations_$lineId.json"
        val jsonString = context.assets.open(fileName).bufferedReader().use { it.readText() }

        val adapter = moshi.adapter(StationsFileJson::class.java)
        val stationsFile = adapter.fromJson(jsonString) ?: return emptyList()

        val stations = mutableListOf<Station>()

        // 메인 루프 또는 일반 역 목록
        val mainStations = stationsFile.mainLoop ?: stationsFile.stations ?: emptyList()
        stations.addAll(mainStations.map { it.toDomain() })

        // 지선 역 목록 (2호선의 경우)
        stationsFile.branches?.forEach { (_, branch) ->
            stations.addAll(branch.stations.map { it.toDomain() })
        }

        return stations
    }
}

// ============== JSON DTO Classes ==============

@JsonClass(generateAdapter = true)
internal data class LineJson(
    @Json(name = "id") val id: String,
    @Json(name = "name") val name: String,
    @Json(name = "color") val color: String,
    @Json(name = "type") val type: String,
    @Json(name = "stations_count") val stationsCount: Int?
) {
    fun toDomain(): Line = Line(
        id = id,
        name = name,
        color = color,
        type = when (type) {
            "circular" -> LineType.CIRCULAR
            "branch" -> LineType.BRANCH
            "light_rail" -> LineType.LIGHT_RAIL
            "express" -> LineType.EXPRESS
            else -> LineType.STANDARD
        }
    )
}

@JsonClass(generateAdapter = true)
internal data class StationsFileJson(
    @Json(name = "line_id") val lineId: String,
    @Json(name = "line_name") val lineName: String,
    @Json(name = "type") val type: String,
    @Json(name = "stations") val stations: List<StationJson>?,
    @Json(name = "main_loop") val mainLoop: List<StationJson>?,
    @Json(name = "branches") val branches: Map<String, BranchJson>?
)

@JsonClass(generateAdapter = true)
internal data class BranchJson(
    @Json(name = "name") val name: String,
    @Json(name = "branch_from") val branchFrom: String,
    @Json(name = "stations") val stations: List<StationJson>
)

@JsonClass(generateAdapter = true)
internal data class StationJson(
    @Json(name = "id") val id: String,
    @Json(name = "name") val name: String,
    @Json(name = "line_id") val lineId: String,
    @Json(name = "sequence") val sequence: Int,
    @Json(name = "latitude") val latitude: Double,
    @Json(name = "longitude") val longitude: Double,
    @Json(name = "transfer_lines") val transferLines: List<String>,
    @Json(name = "prev_station_id") val prevStationId: String?,
    @Json(name = "next_station_id") val nextStationId: String?,
    @Json(name = "avg_time_to_next") val avgTimeToNext: Int?
) {
    fun toDomain(): Station = Station(
        id = id,
        name = name,
        lineId = lineId,
        latitude = latitude,
        longitude = longitude,
        transferLines = transferLines
    )
}
