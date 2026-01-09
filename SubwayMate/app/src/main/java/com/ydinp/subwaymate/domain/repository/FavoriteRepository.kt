package com.ydinp.subwaymate.domain.repository

import com.ydinp.subwaymate.domain.common.Result
import com.ydinp.subwaymate.domain.model.AlertSetting
import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.model.Station
import kotlinx.coroutines.flow.Flow

/**
 * 즐겨찾기(자주 가는 역, 경로) 관리에 대한 Repository 인터페이스
 *
 * Room DB를 사용하여 로컬에 저장합니다.
 */
interface FavoriteRepository {

    // ============== 즐겨찾기 역 관련 ==============

    /**
     * 즐겨찾기 역 목록을 조회
     *
     * @return 즐겨찾기 역 목록
     */
    suspend fun getFavoriteStations(): Result<List<FavoriteStation>>

    /**
     * 즐겨찾기 역 목록을 Flow로 관찰
     *
     * @return 즐겨찾기 역 목록 Flow
     */
    fun observeFavoriteStations(): Flow<Result<List<FavoriteStation>>>

    /**
     * 특정 역이 즐겨찾기인지 확인
     *
     * @param stationId 역 ID
     * @return 즐겨찾기 여부
     */
    suspend fun isFavoriteStation(stationId: String): Boolean

    /**
     * 특정 역의 즐겨찾기 여부를 Flow로 관찰
     *
     * @param stationId 역 ID
     * @return 즐겨찾기 여부를 Flow로 반환
     */
    fun observeIsFavoriteStation(stationId: String): Flow<Boolean>

    /**
     * 역을 즐겨찾기에 추가
     *
     * @param station 추가할 역
     * @param nickname 별명 (선택사항)
     * @return 추가 결과
     */
    suspend fun addFavoriteStation(
        station: Station,
        nickname: String? = null
    ): Result<Unit>

    /**
     * 역을 즐겨찾기에서 제거
     *
     * @param stationId 제거할 역 ID
     * @return 제거 결과
     */
    suspend fun removeFavoriteStation(stationId: String): Result<Unit>

    /**
     * 즐겨찾기 상태를 토글
     *
     * @param station 역 정보
     * @return 토글 후 즐겨찾기 여부
     */
    suspend fun toggleFavoriteStation(station: Station): Result<Boolean>

    /**
     * 즐겨찾기 역의 별명 수정
     *
     * @param stationId 역 ID
     * @param nickname 새로운 별명 (null이면 삭제)
     * @return 수정 결과
     */
    suspend fun updateFavoriteStationNickname(
        stationId: String,
        nickname: String?
    ): Result<Unit>

    /**
     * 즐겨찾기 역 순서 변경
     *
     * @param stationIds 새로운 순서대로 정렬된 역 ID 목록
     * @return 변경 결과
     */
    suspend fun reorderFavoriteStations(stationIds: List<String>): Result<Unit>

    // ============== 즐겨찾기 경로 관련 ==============

    /**
     * 즐겨찾기 경로 목록 조회
     *
     * @return 즐겨찾기 경로 목록
     */
    suspend fun getFavoriteRoutes(): Result<List<FavoriteRoute>>

    /**
     * 즐겨찾기 경로 목록을 Flow로 관찰
     *
     * @return 즐겨찾기 경로 목록 Flow
     */
    fun observeFavoriteRoutes(): Flow<Result<List<FavoriteRoute>>>

    /**
     * 경로를 즐겨찾기에 추가
     *
     * @param departureStation 출발역
     * @param arrivalStation 도착역
     * @param lineId 노선 ID
     * @param direction 방향
     * @param alertSetting 알림 설정
     * @param nickname 별명 (선택사항)
     * @return 추가 결과
     */
    suspend fun addFavoriteRoute(
        departureStation: Station,
        arrivalStation: Station,
        lineId: String,
        direction: Direction,
        alertSetting: AlertSetting = AlertSetting.default(),
        nickname: String? = null
    ): Result<Unit>

    /**
     * 경로를 즐겨찾기에서 제거
     *
     * @param routeId 제거할 경로 ID
     * @return 제거 결과
     */
    suspend fun removeFavoriteRoute(routeId: String): Result<Unit>

    /**
     * 즐겨찾기 경로의 알림 설정 수정
     *
     * @param routeId 경로 ID
     * @param alertSetting 새로운 알림 설정
     * @return 수정 결과
     */
    suspend fun updateFavoriteRouteAlertSetting(
        routeId: String,
        alertSetting: AlertSetting
    ): Result<Unit>

    /**
     * 즐겨찾기 경로의 별명 수정
     *
     * @param routeId 경로 ID
     * @param nickname 새로운 별명 (null이면 삭제)
     * @return 수정 결과
     */
    suspend fun updateFavoriteRouteNickname(
        routeId: String,
        nickname: String?
    ): Result<Unit>

    /**
     * 즐겨찾기 경로 상세 조회
     *
     * @param routeId 경로 ID
     * @return 경로 상세 정보
     */
    suspend fun getFavoriteRouteById(routeId: String): Result<FavoriteRoute>

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
    ): Boolean

    /**
     * 경로 사용 기록 업데이트 (사용 횟수 증가)
     *
     * @param routeId 경로 ID
     * @return 업데이트 결과
     */
    suspend fun incrementRouteUsage(routeId: String): Result<Unit>

    // ============== 최근 검색 관련 ==============

    /**
     * 최근 검색한 역 목록 조회
     *
     * @param limit 반환할 개수 (기본값 10)
     * @return 최근 검색 역 목록
     */
    suspend fun getRecentSearchStations(limit: Int = 10): Result<List<Station>>

    /**
     * 최근 검색 역 목록을 Flow로 관찰
     *
     * @param limit 반환할 개수
     * @return 최근 검색 역 목록 Flow
     */
    fun observeRecentSearchStations(limit: Int = 10): Flow<Result<List<Station>>>

    /**
     * 역을 최근 검색 기록에 추가
     *
     * @param station 검색한 역
     * @return 추가 결과
     */
    suspend fun addRecentSearchStation(station: Station): Result<Unit>

    /**
     * 최근 검색 기록 삭제
     *
     * @return 삭제 결과
     */
    suspend fun clearRecentSearchStations(): Result<Unit>

    // ============== 데이터 관리 ==============

    /**
     * 모든 즐겨찾기를 삭제
     *
     * @return 삭제 결과
     */
    suspend fun clearAllFavorites(): Result<Unit>
}

/**
 * 즐겨찾기 역 정보
 *
 * @property station 역 정보
 * @property nickname 사용자 지정 별명
 * @property order 정렬 순서
 * @property createdAt 추가 시각 (밀리초)
 */
data class FavoriteStation(
    val station: Station,
    val nickname: String? = null,
    val order: Int = 0,
    val createdAt: Long = System.currentTimeMillis()
) {
    /**
     * 표시명 반환 (별명이 있으면 별명, 없으면 역명)
     */
    fun getDisplayName(): String = nickname ?: station.name
}

/**
 * 즐겨찾기 경로 정보
 *
 * @property id 경로 고유 ID
 * @property departureStation 출발역 정보
 * @property arrivalStation 도착역 정보
 * @property lineId 노선 ID
 * @property direction 방향
 * @property alertSetting 알림 설정
 * @property nickname 사용자 지정 별명
 * @property usageCount 사용 횟수
 * @property lastUsedAt 마지막 사용 시각 (밀리초)
 * @property createdAt 추가 시각 (밀리초)
 */
data class FavoriteRoute(
    val id: String,
    val departureStation: Station,
    val arrivalStation: Station,
    val lineId: String,
    val direction: Direction,
    val alertSetting: AlertSetting = AlertSetting.default(),
    val nickname: String? = null,
    val usageCount: Int = 0,
    val lastUsedAt: Long? = null,
    val createdAt: Long = System.currentTimeMillis()
) {
    /**
     * 경로 표시명 생성
     *
     * @return "출발역 -> 도착역" 형태의 문자열 또는 별명
     */
    fun getDisplayName(): String {
        return nickname ?: "${departureStation.name} -> ${arrivalStation.name}"
    }

    /**
     * 간략한 경로 표시 (노선 포함)
     *
     * @param lineName 노선명
     * @return "[노선] 출발역 -> 도착역" 형태의 문자열
     */
    fun getSummary(lineName: String): String {
        return "[$lineName] ${departureStation.name} -> ${arrivalStation.name}"
    }
}
