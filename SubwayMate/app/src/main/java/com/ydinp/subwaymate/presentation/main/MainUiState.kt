package com.ydinp.subwaymate.presentation.main

import com.ydinp.subwaymate.domain.model.Line
import com.ydinp.subwaymate.domain.model.RideSession
import com.ydinp.subwaymate.domain.model.Station
import com.ydinp.subwaymate.domain.repository.FavoriteRoute
import com.ydinp.subwaymate.domain.repository.FavoriteStation

/**
 * 메인 화면의 UI 상태를 나타내는 sealed class
 */
sealed class MainUiState {
    /**
     * 로딩 중 상태
     */
    data object Loading : MainUiState()

    /**
     * 성공 상태 - 데이터 로드 완료
     *
     * @property lines 노선 목록
     * @property favoriteStations 즐겨찾기 역 목록
     * @property favoriteRoutes 즐겨찾기 경로 목록
     * @property activeSession 현재 활성화된 탑승 세션
     * @property recentSessions 최근 탑승 기록
     * @property nearbyStations 주변 역 목록
     */
    data class Success(
        val lines: List<Line> = emptyList(),
        val favoriteStations: List<FavoriteStation> = emptyList(),
        val favoriteRoutes: List<FavoriteRoute> = emptyList(),
        val activeSession: RideSession? = null,
        val recentSessions: List<RideSession> = emptyList(),
        val nearbyStations: List<Station> = emptyList()
    ) : MainUiState() {
        /**
         * 데이터가 비어있는지 확인
         */
        val isEmpty: Boolean
            get() = lines.isEmpty() && favoriteStations.isEmpty() && activeSession == null
    }

    /**
     * 에러 상태
     *
     * @property message 에러 메시지
     * @property throwable 에러 원인 (선택적)
     */
    data class Error(
        val message: String,
        val throwable: Throwable? = null
    ) : MainUiState()
}

/**
 * 메인 화면에서 발생하는 이벤트를 나타내는 sealed class
 */
sealed class MainUiEvent {
    /**
     * 노선 선택 이벤트
     *
     * @property line 선택된 노선
     */
    data class SelectLine(val line: Line) : MainUiEvent()

    /**
     * 역 선택 이벤트 (즐겨찾기에서)
     *
     * @property station 선택된 역
     */
    data class SelectStation(val station: Station) : MainUiEvent()

    /**
     * 즐겨찾기 경로 선택 이벤트
     *
     * @property route 선택된 경로
     */
    data class SelectRoute(val route: FavoriteRoute) : MainUiEvent()

    /**
     * 탑승 추적 시작 이벤트
     */
    data object StartNewTracking : MainUiEvent()

    /**
     * 활성 세션 상세 보기 이벤트
     *
     * @property session 조회할 세션
     */
    data class ViewActiveSession(val session: RideSession) : MainUiEvent()

    /**
     * 활성 세션 종료 이벤트
     *
     * @property sessionId 종료할 세션 ID
     */
    data class EndSession(val sessionId: String) : MainUiEvent()

    /**
     * 즐겨찾기 역 토글 이벤트
     *
     * @property station 토글할 역
     */
    data class ToggleFavoriteStation(val station: Station) : MainUiEvent()

    /**
     * 설정 화면 이동 이벤트
     */
    data object NavigateToSettings : MainUiEvent()

    /**
     * 새로고침 이벤트
     */
    data object Refresh : MainUiEvent()

    /**
     * 에러 메시지 확인 이벤트
     */
    data object DismissError : MainUiEvent()

    /**
     * 위치 권한 요청 이벤트
     */
    data object RequestLocationPermission : MainUiEvent()

    /**
     * 위치 업데이트 이벤트
     *
     * @property latitude 위도
     * @property longitude 경도
     */
    data class UpdateLocation(val latitude: Double, val longitude: Double) : MainUiEvent()
}

/**
 * 메인 화면에서 발생하는 일회성 효과(Side Effect)를 나타내는 sealed class
 */
sealed class MainSideEffect {
    /**
     * 역 선택 화면으로 이동
     *
     * @property lineId 선택된 노선 ID (선택적)
     */
    data class NavigateToStationSelect(val lineId: String? = null) : MainSideEffect()

    /**
     * 추적 화면으로 이동
     *
     * @property sessionId 세션 ID
     */
    data class NavigateToTracking(val sessionId: String) : MainSideEffect()

    /**
     * 경로로 추적 시작
     *
     * @property route 즐겨찾기 경로
     */
    data class StartTrackingWithRoute(val route: FavoriteRoute) : MainSideEffect()

    /**
     * 설정 화면으로 이동
     */
    data object NavigateToSettings : MainSideEffect()

    /**
     * 스낵바 메시지 표시
     *
     * @property message 표시할 메시지
     * @property actionLabel 액션 버튼 라벨 (선택적)
     */
    data class ShowSnackbar(
        val message: String,
        val actionLabel: String? = null
    ) : MainSideEffect()

    /**
     * 토스트 메시지 표시
     *
     * @property message 표시할 메시지
     */
    data class ShowToast(val message: String) : MainSideEffect()

    /**
     * 위치 권한 요청
     */
    data object RequestLocationPermission : MainSideEffect()
}
