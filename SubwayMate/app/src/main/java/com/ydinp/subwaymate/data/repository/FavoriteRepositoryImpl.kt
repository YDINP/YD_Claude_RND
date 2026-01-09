package com.ydinp.subwaymate.data.repository

import com.ydinp.subwaymate.data.local.dao.FavoriteDao
import com.ydinp.subwaymate.data.local.dao.StationDao
import com.ydinp.subwaymate.data.local.entity.FavoriteRouteEntity
import com.ydinp.subwaymate.data.local.entity.RecentStationEntity
import com.ydinp.subwaymate.di.IoDispatcher
import com.ydinp.subwaymate.domain.common.Result
import com.ydinp.subwaymate.domain.model.AlertSetting
import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.model.Station
import com.ydinp.subwaymate.domain.repository.FavoriteRepository
import com.ydinp.subwaymate.domain.repository.FavoriteRoute
import com.ydinp.subwaymate.domain.repository.FavoriteStation
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * FavoriteRepository 구현체
 *
 * Room DB와 메모리 캐시를 조합하여 즐겨찾기 데이터를 관리합니다.
 *
 * - 즐겨찾기 역: 메모리 캐시 (Room DB 미지원, 향후 확장 가능)
 * - 즐겨찾기 경로: Room DB (FavoriteDao)
 * - 최근 검색: Room DB (StationDao - RecentStationEntity)
 */
@Singleton
class FavoriteRepositoryImpl @Inject constructor(
    private val favoriteDao: FavoriteDao,
    private val stationDao: StationDao,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : FavoriteRepository {

    // 메모리 기반 저장소 (즐겨찾기 역 - Room DB 스키마 확장 전까지 임시)
    private val favoriteStationsFlow = MutableStateFlow<List<FavoriteStation>>(emptyList())

    private val mutex = Mutex()

    // ============== 즐겨찾기 역 관련 (메모리 기반) ==============

    override suspend fun getFavoriteStations(): Result<List<FavoriteStation>> =
        withContext(ioDispatcher) {
            try {
                Result.success(favoriteStationsFlow.value.sortedBy { it.order })
            } catch (e: Exception) {
                Result.error(e, "즐겨찾기 역 목록을 불러오는데 실패했습니다")
            }
        }

    override fun observeFavoriteStations(): Flow<Result<List<FavoriteStation>>> =
        favoriteStationsFlow.map { stations ->
            Result.success(stations.sortedBy { it.order })
        }.flowOn(ioDispatcher)

    override suspend fun isFavoriteStation(stationId: String): Boolean =
        withContext(ioDispatcher) {
            favoriteStationsFlow.value.any { it.station.id == stationId }
        }

    override fun observeIsFavoriteStation(stationId: String): Flow<Boolean> =
        favoriteStationsFlow.map { stations ->
            stations.any { it.station.id == stationId }
        }.flowOn(ioDispatcher)

    override suspend fun addFavoriteStation(
        station: Station,
        nickname: String?
    ): Result<Unit> = withContext(ioDispatcher) {
        try {
            mutex.withLock {
                // 이미 존재하는지 확인
                if (favoriteStationsFlow.value.any { it.station.id == station.id }) {
                    return@withContext Result.error(
                        IllegalStateException("이미 즐겨찾기에 추가된 역입니다"),
                        "이미 즐겨찾기에 추가된 역입니다"
                    )
                }

                val currentList = favoriteStationsFlow.value.toMutableList()
                val newOrder = currentList.maxOfOrNull { it.order }?.plus(1) ?: 0

                val favoriteStation = FavoriteStation(
                    station = station,
                    nickname = nickname,
                    order = newOrder,
                    createdAt = System.currentTimeMillis()
                )

                currentList.add(favoriteStation)
                favoriteStationsFlow.value = currentList
            }
            Result.success(Unit)
        } catch (e: Exception) {
            Result.error(e, "즐겨찾기 추가에 실패했습니다")
        }
    }

    override suspend fun removeFavoriteStation(stationId: String): Result<Unit> =
        withContext(ioDispatcher) {
            try {
                mutex.withLock {
                    val currentList = favoriteStationsFlow.value.toMutableList()
                    val removed = currentList.removeIf { it.station.id == stationId }

                    if (!removed) {
                        return@withContext Result.error(
                            NoSuchElementException("즐겨찾기에서 해당 역을 찾을 수 없습니다"),
                            "즐겨찾기에서 해당 역을 찾을 수 없습니다"
                        )
                    }

                    favoriteStationsFlow.value = currentList
                }
                Result.success(Unit)
            } catch (e: Exception) {
                Result.error(e, "즐겨찾기 제거에 실패했습니다")
            }
        }

    override suspend fun toggleFavoriteStation(station: Station): Result<Boolean> =
        withContext(ioDispatcher) {
            try {
                val isFavorite = isFavoriteStation(station.id)
                if (isFavorite) {
                    removeFavoriteStation(station.id)
                    Result.success(false)
                } else {
                    addFavoriteStation(station)
                    Result.success(true)
                }
            } catch (e: Exception) {
                Result.error(e, "즐겨찾기 토글에 실패했습니다")
            }
        }

    override suspend fun updateFavoriteStationNickname(
        stationId: String,
        nickname: String?
    ): Result<Unit> = withContext(ioDispatcher) {
        try {
            mutex.withLock {
                val currentList = favoriteStationsFlow.value.toMutableList()
                val index = currentList.indexOfFirst { it.station.id == stationId }

                if (index == -1) {
                    return@withContext Result.error(
                        NoSuchElementException("즐겨찾기에서 해당 역을 찾을 수 없습니다"),
                        "즐겨찾기에서 해당 역을 찾을 수 없습니다"
                    )
                }

                currentList[index] = currentList[index].copy(nickname = nickname)
                favoriteStationsFlow.value = currentList
            }
            Result.success(Unit)
        } catch (e: Exception) {
            Result.error(e, "별명 수정에 실패했습니다")
        }
    }

    override suspend fun reorderFavoriteStations(stationIds: List<String>): Result<Unit> =
        withContext(ioDispatcher) {
            try {
                mutex.withLock {
                    val currentMap = favoriteStationsFlow.value.associateBy { it.station.id }
                    val reorderedList = stationIds.mapIndexedNotNull { index, stationId ->
                        currentMap[stationId]?.copy(order = index)
                    }

                    favoriteStationsFlow.value = reorderedList
                }
                Result.success(Unit)
            } catch (e: Exception) {
                Result.error(e, "순서 변경에 실패했습니다")
            }
        }

    // ============== 즐겨찾기 경로 관련 (Room DB 기반) ==============

    override suspend fun getFavoriteRoutes(): Result<List<FavoriteRoute>> =
        withContext(ioDispatcher) {
            try {
                val dbRoutes = favoriteDao.getAllFavoriteRoutesOnce()
                val routes = dbRoutes.map { it.toFavoriteRoute() }
                Result.success(routes.sortedByDescending { it.lastUsedAt ?: it.createdAt })
            } catch (e: Exception) {
                Result.error(e, "즐겨찾기 경로 목록을 불러오는데 실패했습니다")
            }
        }

    override fun observeFavoriteRoutes(): Flow<Result<List<FavoriteRoute>>> =
        favoriteDao.getAllFavoriteRoutes()
            .map { entities ->
                Result.success(entities.map { it.toFavoriteRoute() }
                    .sortedByDescending { it.lastUsedAt ?: it.createdAt })
            }
            .catch { e ->
                emit(Result.error(e as Exception, "즐겨찾기 경로 목록을 불러오는데 실패했습니다"))
            }
            .flowOn(ioDispatcher)

    override suspend fun addFavoriteRoute(
        departureStation: Station,
        arrivalStation: Station,
        lineId: String,
        direction: Direction,
        alertSetting: AlertSetting,
        nickname: String?
    ): Result<Unit> = withContext(ioDispatcher) {
        try {
            // 이미 존재하는지 확인
            val exists = favoriteDao.isFavoriteRouteExists(
                departureStation.id,
                arrivalStation.id
            )

            if (exists) {
                return@withContext Result.error(
                    IllegalStateException("이미 즐겨찾기에 추가된 경로입니다"),
                    "이미 즐겨찾기에 추가된 경로입니다"
                )
            }

            val entity = FavoriteRouteEntity.create(
                departureStation = departureStation,
                arrivalStation = arrivalStation,
                alias = nickname
            )

            favoriteDao.insertFavoriteRoute(entity)
            Result.success(Unit)
        } catch (e: Exception) {
            Result.error(e, "즐겨찾기 경로 추가에 실패했습니다")
        }
    }

    override suspend fun removeFavoriteRoute(routeId: String): Result<Unit> =
        withContext(ioDispatcher) {
            try {
                val id = routeId.toLongOrNull()
                if (id == null) {
                    return@withContext Result.error(
                        IllegalArgumentException("잘못된 경로 ID입니다"),
                        "잘못된 경로 ID입니다"
                    )
                }

                favoriteDao.deleteFavoriteRouteById(id)
                Result.success(Unit)
            } catch (e: Exception) {
                Result.error(e, "즐겨찾기 경로 제거에 실패했습니다")
            }
        }

    override suspend fun updateFavoriteRouteAlertSetting(
        routeId: String,
        alertSetting: AlertSetting
    ): Result<Unit> = withContext(ioDispatcher) {
        try {
            // 현재 FavoriteRouteEntity에는 alertSetting 필드가 없음
            // 향후 스키마 확장 시 구현
            Result.success(Unit)
        } catch (e: Exception) {
            Result.error(e, "알림 설정 수정에 실패했습니다")
        }
    }

    override suspend fun updateFavoriteRouteNickname(
        routeId: String,
        nickname: String?
    ): Result<Unit> = withContext(ioDispatcher) {
        try {
            val id = routeId.toLongOrNull()
            if (id == null) {
                return@withContext Result.error(
                    IllegalArgumentException("잘못된 경로 ID입니다"),
                    "잘못된 경로 ID입니다"
                )
            }

            favoriteDao.updateAlias(id, nickname)
            Result.success(Unit)
        } catch (e: Exception) {
            Result.error(e, "별명 수정에 실패했습니다")
        }
    }

    override suspend fun getFavoriteRouteById(routeId: String): Result<FavoriteRoute> =
        withContext(ioDispatcher) {
            try {
                val id = routeId.toLongOrNull()
                if (id == null) {
                    return@withContext Result.error(
                        IllegalArgumentException("잘못된 경로 ID입니다"),
                        "잘못된 경로 ID입니다"
                    )
                }

                val entity = favoriteDao.getFavoriteRouteById(id)
                if (entity != null) {
                    Result.success(entity.toFavoriteRoute())
                } else {
                    Result.error(
                        NoSuchElementException("즐겨찾기에서 해당 경로를 찾을 수 없습니다"),
                        "즐겨찾기에서 해당 경로를 찾을 수 없습니다"
                    )
                }
            } catch (e: Exception) {
                Result.error(e, "경로 정보를 불러오는데 실패했습니다")
            }
        }

    override suspend fun isFavoriteRoute(
        departureStationId: String,
        arrivalStationId: String,
        lineId: String
    ): Boolean = withContext(ioDispatcher) {
        favoriteDao.isFavoriteRouteExists(departureStationId, arrivalStationId)
    }

    override suspend fun incrementRouteUsage(routeId: String): Result<Unit> =
        withContext(ioDispatcher) {
            try {
                val id = routeId.toLongOrNull()
                if (id == null) {
                    return@withContext Result.error(
                        IllegalArgumentException("잘못된 경로 ID입니다"),
                        "잘못된 경로 ID입니다"
                    )
                }

                favoriteDao.incrementUsageCount(id)
                Result.success(Unit)
            } catch (e: Exception) {
                Result.error(e, "사용 기록 업데이트에 실패했습니다")
            }
        }

    // ============== 최근 검색 관련 (Room DB 기반) ==============

    override suspend fun getRecentSearchStations(limit: Int): Result<List<Station>> =
        withContext(ioDispatcher) {
            try {
                val recentEntities = stationDao.getRecentStationsOnce(limit)
                val stations = recentEntities.map { it.toStation() }
                Result.success(stations)
            } catch (e: Exception) {
                Result.error(e, "최근 검색 기록을 불러오는데 실패했습니다")
            }
        }

    override fun observeRecentSearchStations(limit: Int): Flow<Result<List<Station>>> =
        stationDao.getRecentStations(limit)
            .map { entities ->
                Result.success(entities.map { it.toStation() })
            }
            .catch { e ->
                emit(Result.error(e as Exception, "최근 검색 기록을 불러오는데 실패했습니다"))
            }
            .flowOn(ioDispatcher)

    override suspend fun addRecentSearchStation(station: Station): Result<Unit> =
        withContext(ioDispatcher) {
            try {
                val entity = RecentStationEntity.fromStation(station)
                stationDao.upsertRecentStation(entity)
                Result.success(Unit)
            } catch (e: Exception) {
                Result.error(e, "최근 검색 기록 추가에 실패했습니다")
            }
        }

    override suspend fun clearRecentSearchStations(): Result<Unit> = withContext(ioDispatcher) {
        try {
            stationDao.deleteAllRecentStations()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.error(e, "최근 검색 기록 삭제에 실패했습니다")
        }
    }

    // ============== 데이터 관리 ==============

    override suspend fun clearAllFavorites(): Result<Unit> = withContext(ioDispatcher) {
        try {
            mutex.withLock {
                favoriteStationsFlow.value = emptyList()
            }
            favoriteDao.deleteAllFavoriteRoutes()
            stationDao.deleteAllRecentStations()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.error(e, "즐겨찾기 삭제에 실패했습니다")
        }
    }

    // ============== Private Helper Methods ==============

    /**
     * FavoriteRouteEntity를 FavoriteRoute 도메인 모델로 변환
     */
    private fun FavoriteRouteEntity.toFavoriteRoute(): FavoriteRoute {
        return FavoriteRoute(
            id = id.toString(),
            departureStation = Station(
                id = departureStationId,
                name = departureStationName,
                lineId = departureLineId,
                latitude = 0.0, // Room Entity에 없는 정보
                longitude = 0.0,
                transferLines = emptyList()
            ),
            arrivalStation = Station(
                id = arrivalStationId,
                name = arrivalStationName,
                lineId = arrivalLineId,
                latitude = 0.0,
                longitude = 0.0,
                transferLines = emptyList()
            ),
            lineId = departureLineId,
            direction = Direction.UP, // 기본값 (Entity에 없는 정보)
            alertSetting = AlertSetting.default(),
            nickname = alias,
            usageCount = usageCount,
            lastUsedAt = null, // Entity에 없는 정보
            createdAt = createdAt
        )
    }
}
