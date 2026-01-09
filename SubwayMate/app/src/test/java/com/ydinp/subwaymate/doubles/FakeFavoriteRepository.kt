package com.ydinp.subwaymate.doubles

import com.ydinp.subwaymate.domain.common.Result
import com.ydinp.subwaymate.domain.model.AlertSetting
import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.model.Station
import com.ydinp.subwaymate.domain.repository.FavoriteRepository
import com.ydinp.subwaymate.domain.repository.FavoriteRoute
import com.ydinp.subwaymate.domain.repository.FavoriteStation
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import java.util.UUID

/**
 * 테스트용 FakeFavoriteRepository 구현
 *
 * FavoriteRepository 인터페이스를 구현하여 테스트에서 실제 데이터베이스 없이
 * 즐겨찾기 기능의 동작을 시뮬레이션합니다.
 */
class FakeFavoriteRepository : FavoriteRepository {

    // 내부 데이터 저장소
    private val _favoriteStations = MutableStateFlow<List<FavoriteStation>>(emptyList())
    private val _favoriteRoutes = MutableStateFlow<List<FavoriteRoute>>(emptyList())
    private val _recentSearchStations = MutableStateFlow<List<Station>>(emptyList())

    // 에러 시뮬레이션 플래그
    var shouldReturnError = false
    var errorMessage = "테스트 에러"

    /**
     * 테스트용 데이터 설정
     */
    fun setFavoriteStations(stations: List<FavoriteStation>) {
        _favoriteStations.value = stations
    }

    fun setFavoriteRoutes(routes: List<FavoriteRoute>) {
        _favoriteRoutes.value = routes
    }

    fun setRecentSearchStations(stations: List<Station>) {
        _recentSearchStations.value = stations
    }

    // ============== 즐겨찾기 역 관련 ==============

    override suspend fun getFavoriteStations(): Result<List<FavoriteStation>> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            Result.success(_favoriteStations.value)
        }
    }

    override fun observeFavoriteStations(): Flow<Result<List<FavoriteStation>>> {
        return _favoriteStations.map { stations ->
            if (shouldReturnError) {
                Result.error(Exception(errorMessage), errorMessage)
            } else {
                Result.success(stations)
            }
        }
    }

    override suspend fun isFavoriteStation(stationId: String): Boolean {
        return _favoriteStations.value.any { it.station.id == stationId }
    }

    override fun observeIsFavoriteStation(stationId: String): Flow<Boolean> {
        return _favoriteStations.map { stations ->
            stations.any { it.station.id == stationId }
        }
    }

    override suspend fun addFavoriteStation(station: Station, nickname: String?): Result<Unit> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            val newFavorite = FavoriteStation(
                station = station,
                nickname = nickname,
                order = _favoriteStations.value.size,
                createdAt = System.currentTimeMillis()
            )
            _favoriteStations.value = _favoriteStations.value + newFavorite
            Result.success(Unit)
        }
    }

    override suspend fun removeFavoriteStation(stationId: String): Result<Unit> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            _favoriteStations.value = _favoriteStations.value.filter { it.station.id != stationId }
            Result.success(Unit)
        }
    }

    override suspend fun toggleFavoriteStation(station: Station): Result<Boolean> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            val isFavorite = isFavoriteStation(station.id)
            if (isFavorite) {
                removeFavoriteStation(station.id)
                Result.success(false)
            } else {
                addFavoriteStation(station)
                Result.success(true)
            }
        }
    }

    override suspend fun updateFavoriteStationNickname(
        stationId: String,
        nickname: String?
    ): Result<Unit> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            _favoriteStations.value = _favoriteStations.value.map { favorite ->
                if (favorite.station.id == stationId) {
                    favorite.copy(nickname = nickname)
                } else {
                    favorite
                }
            }
            Result.success(Unit)
        }
    }

    override suspend fun reorderFavoriteStations(stationIds: List<String>): Result<Unit> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            val reordered = stationIds.mapIndexedNotNull { index, id ->
                _favoriteStations.value.find { it.station.id == id }?.copy(order = index)
            }
            _favoriteStations.value = reordered
            Result.success(Unit)
        }
    }

    // ============== 즐겨찾기 경로 관련 ==============

    override suspend fun getFavoriteRoutes(): Result<List<FavoriteRoute>> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            Result.success(_favoriteRoutes.value)
        }
    }

    override fun observeFavoriteRoutes(): Flow<Result<List<FavoriteRoute>>> {
        return _favoriteRoutes.map { routes ->
            if (shouldReturnError) {
                Result.error(Exception(errorMessage), errorMessage)
            } else {
                Result.success(routes)
            }
        }
    }

    override suspend fun addFavoriteRoute(
        departureStation: Station,
        arrivalStation: Station,
        lineId: String,
        direction: Direction,
        alertSetting: AlertSetting,
        nickname: String?
    ): Result<Unit> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            val newRoute = FavoriteRoute(
                id = UUID.randomUUID().toString(),
                departureStation = departureStation,
                arrivalStation = arrivalStation,
                lineId = lineId,
                direction = direction,
                alertSetting = alertSetting,
                nickname = nickname,
                usageCount = 0,
                lastUsedAt = null,
                createdAt = System.currentTimeMillis()
            )
            _favoriteRoutes.value = _favoriteRoutes.value + newRoute
            Result.success(Unit)
        }
    }

    override suspend fun removeFavoriteRoute(routeId: String): Result<Unit> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            _favoriteRoutes.value = _favoriteRoutes.value.filter { it.id != routeId }
            Result.success(Unit)
        }
    }

    override suspend fun updateFavoriteRouteAlertSetting(
        routeId: String,
        alertSetting: AlertSetting
    ): Result<Unit> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            _favoriteRoutes.value = _favoriteRoutes.value.map { route ->
                if (route.id == routeId) {
                    route.copy(alertSetting = alertSetting)
                } else {
                    route
                }
            }
            Result.success(Unit)
        }
    }

    override suspend fun updateFavoriteRouteNickname(
        routeId: String,
        nickname: String?
    ): Result<Unit> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            _favoriteRoutes.value = _favoriteRoutes.value.map { route ->
                if (route.id == routeId) {
                    route.copy(nickname = nickname)
                } else {
                    route
                }
            }
            Result.success(Unit)
        }
    }

    override suspend fun getFavoriteRouteById(routeId: String): Result<FavoriteRoute> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            val route = _favoriteRoutes.value.find { it.id == routeId }
            if (route != null) {
                Result.success(route)
            } else {
                Result.error(NoSuchElementException("경로를 찾을 수 없습니다: $routeId"))
            }
        }
    }

    override suspend fun isFavoriteRoute(
        departureStationId: String,
        arrivalStationId: String,
        lineId: String
    ): Boolean {
        return _favoriteRoutes.value.any { route ->
            route.departureStation.id == departureStationId &&
                route.arrivalStation.id == arrivalStationId &&
                route.lineId == lineId
        }
    }

    override suspend fun incrementRouteUsage(routeId: String): Result<Unit> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            _favoriteRoutes.value = _favoriteRoutes.value.map { route ->
                if (route.id == routeId) {
                    route.copy(
                        usageCount = route.usageCount + 1,
                        lastUsedAt = System.currentTimeMillis()
                    )
                } else {
                    route
                }
            }
            Result.success(Unit)
        }
    }

    // ============== 최근 검색 관련 ==============

    override suspend fun getRecentSearchStations(limit: Int): Result<List<Station>> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            Result.success(_recentSearchStations.value.take(limit))
        }
    }

    override fun observeRecentSearchStations(limit: Int): Flow<Result<List<Station>>> {
        return _recentSearchStations.map { stations ->
            if (shouldReturnError) {
                Result.error(Exception(errorMessage), errorMessage)
            } else {
                Result.success(stations.take(limit))
            }
        }
    }

    override suspend fun addRecentSearchStation(station: Station): Result<Unit> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            // 기존 항목 제거 후 맨 앞에 추가
            val filtered = _recentSearchStations.value.filter { it.id != station.id }
            _recentSearchStations.value = listOf(station) + filtered.take(9)
            Result.success(Unit)
        }
    }

    override suspend fun clearRecentSearchStations(): Result<Unit> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            _recentSearchStations.value = emptyList()
            Result.success(Unit)
        }
    }

    // ============== 데이터 관리 ==============

    override suspend fun clearAllFavorites(): Result<Unit> {
        return if (shouldReturnError) {
            Result.error(Exception(errorMessage), errorMessage)
        } else {
            _favoriteStations.value = emptyList()
            _favoriteRoutes.value = emptyList()
            Result.success(Unit)
        }
    }
}
