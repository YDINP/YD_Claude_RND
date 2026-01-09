package com.ydinp.subwaymate.domain.usecase

import com.ydinp.subwaymate.domain.common.Result
import com.ydinp.subwaymate.domain.model.AlertSetting
import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.model.Station
import com.ydinp.subwaymate.domain.repository.FavoriteRepository
import com.ydinp.subwaymate.domain.repository.FavoriteRoute
import com.ydinp.subwaymate.domain.repository.FavoriteStation
import com.ydinp.subwaymate.domain.repository.StationRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject

/**
 * 즐겨찾기 역/경로 관리 UseCase
 *
 * 즐겨찾기의 조회, 추가, 삭제, 토글 기능을 제공합니다.
 */
class ManageFavoritesUseCase @Inject constructor(
    private val favoriteRepository: FavoriteRepository,
    private val stationRepository: StationRepository
) {
    // ============== 즐겨찾기 역 관련 ==============

    /**
     * 즐겨찾기 역 목록을 조회
     *
     * @return 즐겨찾기 역 목록 Result
     */
    suspend fun getFavoriteStations(): Result<List<FavoriteStation>> {
        return favoriteRepository.getFavoriteStations()
    }

    /**
     * 즐겨찾기 역 목록을 Flow로 관찰
     *
     * @return 즐겨찾기 역 목록 Flow
     */
    fun observeFavoriteStations(): Flow<Result<List<FavoriteStation>>> {
        return favoriteRepository.observeFavoriteStations()
    }

    /**
     * 즐겨찾기 역의 Station 목록만 추출하여 반환
     *
     * @return Station 목록 Flow
     */
    fun observeFavoriteStationsOnly(): Flow<Result<List<Station>>> {
        return favoriteRepository.observeFavoriteStations()
            .map { result ->
                result.map { favorites -> favorites.map { it.station } }
            }
    }

    /**
     * 특정 역이 즐겨찾기인지 확인
     *
     * @param stationId 역 ID
     * @return 즐겨찾기 여부
     */
    suspend fun isFavoriteStation(stationId: String): Boolean {
        return favoriteRepository.isFavoriteStation(stationId)
    }

    /**
     * 특정 역의 즐겨찾기 여부를 Flow로 관찰
     *
     * @param stationId 역 ID
     * @return 즐겨찾기 여부 Flow
     */
    fun observeIsFavoriteStation(stationId: String): Flow<Boolean> {
        return favoriteRepository.observeIsFavoriteStation(stationId)
    }

    /**
     * 즐겨찾기에 역을 추가
     *
     * @param stationId 추가할 역 ID
     * @param nickname 별명 (선택사항)
     * @return 추가 결과
     */
    suspend fun addFavoriteStation(stationId: String, nickname: String? = null): Result<Unit> {
        // 역이 존재하는지 확인
        val stationResult = stationRepository.getStationById(stationId)
        return when (stationResult) {
            is Result.Success -> {
                favoriteRepository.addFavoriteStation(stationResult.data, nickname)
            }
            is Result.Error -> Result.error(
                stationResult.exception,
                "역을 찾을 수 없습니다: $stationId"
            )
            is Result.Loading -> Result.error(
                IllegalStateException("데이터 로딩 중"),
                "데이터를 불러오는 중입니다"
            )
        }
    }

    /**
     * 즐겨찾기에서 역을 제거
     *
     * @param stationId 제거할 역 ID
     * @return 제거 결과
     */
    suspend fun removeFavoriteStation(stationId: String): Result<Unit> {
        return favoriteRepository.removeFavoriteStation(stationId)
    }

    /**
     * 즐겨찾기 상태를 토글
     *
     * @param station 역 정보
     * @return 토글 후 즐겨찾기 여부 Result
     */
    suspend fun toggleFavoriteStation(station: Station): Result<Boolean> {
        return favoriteRepository.toggleFavoriteStation(station)
    }

    /**
     * 즐겨찾기 역의 별명을 수정
     *
     * @param stationId 역 ID
     * @param nickname 새로운 별명 (null이면 삭제)
     * @return 수정 결과
     */
    suspend fun updateFavoriteStationNickname(
        stationId: String,
        nickname: String?
    ): Result<Unit> {
        return favoriteRepository.updateFavoriteStationNickname(stationId, nickname)
    }

    /**
     * 즐겨찾기 역 순서 변경
     *
     * @param stationIds 새로운 순서의 역 ID 목록
     * @return 변경 결과
     */
    suspend fun reorderFavoriteStations(stationIds: List<String>): Result<Unit> {
        return favoriteRepository.reorderFavoriteStations(stationIds)
    }

    // ============== 즐겨찾기 경로 관련 ==============

    /**
     * 즐겨찾기 경로 목록을 조회
     *
     * @return 즐겨찾기 경로 목록 Result
     */
    suspend fun getFavoriteRoutes(): Result<List<FavoriteRoute>> {
        return favoriteRepository.getFavoriteRoutes()
    }

    /**
     * 즐겨찾기 경로 목록을 Flow로 관찰
     *
     * @return 즐겨찾기 경로 목록 Flow
     */
    fun observeFavoriteRoutes(): Flow<Result<List<FavoriteRoute>>> {
        return favoriteRepository.observeFavoriteRoutes()
    }

    /**
     * 경로를 즐겨찾기에 추가
     *
     * @param departureStationId 출발역 ID
     * @param arrivalStationId 도착역 ID
     * @param lineId 노선 ID
     * @param direction 방향
     * @param alertSetting 알림 설정
     * @param nickname 별명 (선택사항)
     * @return 추가 결과
     */
    suspend fun addFavoriteRoute(
        departureStationId: String,
        arrivalStationId: String,
        lineId: String,
        direction: Direction,
        alertSetting: AlertSetting = AlertSetting.default(),
        nickname: String? = null
    ): Result<Unit> {
        // 출발역, 도착역이 존재하는지 확인
        val departureResult = stationRepository.getStationById(departureStationId)
        val arrivalResult = stationRepository.getStationById(arrivalStationId)

        return when {
            departureResult is Result.Error -> Result.error(
                departureResult.exception,
                "출발역을 찾을 수 없습니다"
            )
            arrivalResult is Result.Error -> Result.error(
                arrivalResult.exception,
                "도착역을 찾을 수 없습니다"
            )
            departureResult is Result.Success && arrivalResult is Result.Success -> {
                favoriteRepository.addFavoriteRoute(
                    departureStation = departureResult.data,
                    arrivalStation = arrivalResult.data,
                    lineId = lineId,
                    direction = direction,
                    alertSetting = alertSetting,
                    nickname = nickname
                )
            }
            else -> Result.error(
                IllegalStateException("데이터 로딩 중"),
                "데이터를 불러오는 중입니다"
            )
        }
    }

    /**
     * 경로를 즐겨찾기에서 제거
     *
     * @param routeId 경로 ID
     * @return 제거 결과
     */
    suspend fun removeFavoriteRoute(routeId: String): Result<Unit> {
        return favoriteRepository.removeFavoriteRoute(routeId)
    }

    /**
     * 즐겨찾기 경로의 알림 설정을 수정
     *
     * @param routeId 경로 ID
     * @param alertSetting 새로운 알림 설정
     * @return 수정 결과
     */
    suspend fun updateFavoriteRouteAlertSetting(
        routeId: String,
        alertSetting: AlertSetting
    ): Result<Unit> {
        return favoriteRepository.updateFavoriteRouteAlertSetting(routeId, alertSetting)
    }

    /**
     * 경로 사용 기록 업데이트 (사용 횟수 증가)
     *
     * @param routeId 경로 ID
     * @return 업데이트 결과
     */
    suspend fun incrementRouteUsage(routeId: String): Result<Unit> {
        return favoriteRepository.incrementRouteUsage(routeId)
    }

    /**
     * 경로가 즐겨찾기에 있는지 확인
     *
     * @param departureStationId 출발역 ID
     * @param arrivalStationId 도착역 ID
     * @param lineId 노선 ID
     * @return 즐겨찾기 여부
     */
    suspend fun isFavoriteRoute(
        departureStationId: String,
        arrivalStationId: String,
        lineId: String
    ): Boolean {
        return favoriteRepository.isFavoriteRoute(departureStationId, arrivalStationId, lineId)
    }

    // ============== 최근 검색 관련 ==============

    /**
     * 최근 검색한 역 목록 조회
     *
     * @param limit 반환할 개수
     * @return 최근 검색 역 목록 Result
     */
    suspend fun getRecentSearchStations(limit: Int = 10): Result<List<Station>> {
        return favoriteRepository.getRecentSearchStations(limit)
    }

    /**
     * 최근 검색 역 목록을 Flow로 관찰
     *
     * @param limit 반환할 개수
     * @return 최근 검색 역 목록 Flow
     */
    fun observeRecentSearchStations(limit: Int = 10): Flow<Result<List<Station>>> {
        return favoriteRepository.observeRecentSearchStations(limit)
    }

    /**
     * 역을 최근 검색 기록에 추가
     *
     * @param station 검색한 역
     * @return 추가 결과
     */
    suspend fun addRecentSearchStation(station: Station): Result<Unit> {
        return favoriteRepository.addRecentSearchStation(station)
    }

    /**
     * 최근 검색 기록 삭제
     *
     * @return 삭제 결과
     */
    suspend fun clearRecentSearchStations(): Result<Unit> {
        return favoriteRepository.clearRecentSearchStations()
    }

    // ============== 데이터 관리 ==============

    /**
     * 모든 즐겨찾기를 삭제
     *
     * @return 삭제 결과
     */
    suspend fun clearAllFavorites(): Result<Unit> {
        return favoriteRepository.clearAllFavorites()
    }

    /**
     * 즐겨찾기 역 수를 조회
     *
     * @return 즐겨찾기 역 수
     */
    suspend fun getFavoriteStationCount(): Int {
        return favoriteRepository.getFavoriteStations()
            .getOrDefault(emptyList())
            .size
    }

    /**
     * 역 목록에 즐겨찾기 상태를 포함하여 반환
     *
     * @param stations 역 목록 Flow
     * @return 역과 즐겨찾기 상태 Pair 목록 Flow
     */
    fun observeStationsWithFavoriteStatus(
        stations: Flow<Result<List<Station>>>
    ): Flow<Result<List<Pair<Station, Boolean>>>> {
        return combine(
            stations,
            favoriteRepository.observeFavoriteStations()
        ) { stationsResult, favoritesResult ->
            when {
                stationsResult is Result.Error -> Result.error(stationsResult.exception)
                favoritesResult is Result.Error -> Result.error(favoritesResult.exception)
                stationsResult is Result.Loading || favoritesResult is Result.Loading -> Result.loading()
                else -> {
                    val stationList = stationsResult.getOrDefault(emptyList())
                    val favoriteIds = favoritesResult.getOrDefault(emptyList())
                        .map { it.station.id }
                        .toSet()
                    Result.success(
                        stationList.map { station ->
                            station to (station.id in favoriteIds)
                        }
                    )
                }
            }
        }
    }

    /**
     * 즐겨찾기 역을 최상단에 배치하여 반환
     *
     * @param stations 역 목록 Flow
     * @return 즐겨찾기가 상단에 배치된 역 목록 Flow
     */
    fun observeStationsSortedByFavorite(
        stations: Flow<Result<List<Station>>>
    ): Flow<Result<List<Station>>> {
        return combine(
            stations,
            favoriteRepository.observeFavoriteStations()
        ) { stationsResult, favoritesResult ->
            when {
                stationsResult is Result.Error -> Result.error(stationsResult.exception)
                favoritesResult is Result.Error -> Result.error(favoritesResult.exception)
                stationsResult is Result.Loading || favoritesResult is Result.Loading -> Result.loading()
                else -> {
                    val stationList = stationsResult.getOrDefault(emptyList())
                    val favoriteIds = favoritesResult.getOrDefault(emptyList())
                        .map { it.station.id }
                        .toSet()
                    Result.success(
                        stationList.sortedByDescending { it.id in favoriteIds }
                    )
                }
            }
        }
    }
}
