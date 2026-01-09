package com.ydinp.subwaymate.presentation.station

import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.model.Line
import com.ydinp.subwaymate.domain.model.Station

/**
 * 역 선택 화면의 UI 상태를 나타내는 sealed class
 */
sealed class StationSelectUiState {
    /**
     * 로딩 중 상태
     */
    data object Loading : StationSelectUiState()

    /**
     * 성공 상태 - 데이터 로드 완료
     *
     * @property lines 노선 목록
     * @property selectedLine 현재 선택된 노선
     * @property stations 현재 노선의 역 목록
     * @property filteredStations 검색 필터링된 역 목록
     * @property searchQuery 검색어
     * @property recentStations 최근 검색 역 목록
     * @property departureStation 선택된 출발역
     * @property arrivalStation 선택된 도착역
     * @property selectedDirection 선택된 방향
     * @property selectionMode 현재 선택 모드 (출발역/도착역)
     */
    data class Success(
        val lines: List<Line> = emptyList(),
        val selectedLine: Line? = null,
        val stations: List<Station> = emptyList(),
        val filteredStations: List<Station> = emptyList(),
        val searchQuery: String = "",
        val recentStations: List<Station> = emptyList(),
        val departureStation: Station? = null,
        val arrivalStation: Station? = null,
        val selectedDirection: Direction? = null,
        val selectionMode: SelectionMode = SelectionMode.DEPARTURE
    ) : StationSelectUiState() {

        /**
         * 검색 중인지 확인
         */
        val isSearching: Boolean
            get() = searchQuery.isNotEmpty()

        /**
         * 표시할 역 목록 (검색 중이면 필터링된 목록, 아니면 전체 목록)
         */
        val displayStations: List<Station>
            get() = if (isSearching) filteredStations else stations

        /**
         * 출발역과 도착역 모두 선택되었는지 확인
         */
        val isSelectionComplete: Boolean
            get() = departureStation != null && arrivalStation != null && selectedDirection != null

        /**
         * 다음 단계로 진행 가능한지 확인
         */
        val canProceed: Boolean
            get() = isSelectionComplete

        /**
         * 현재 선택할 역 타입 설명
         */
        val selectionHint: String
            get() = when (selectionMode) {
                SelectionMode.DEPARTURE -> "출발역을 선택하세요"
                SelectionMode.ARRIVAL -> "도착역을 선택하세요"
            }
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
    ) : StationSelectUiState()
}

/**
 * 역 선택 모드
 */
enum class SelectionMode {
    /** 출발역 선택 */
    DEPARTURE,
    /** 도착역 선택 */
    ARRIVAL
}

/**
 * 역 선택 화면에서 발생하는 이벤트
 */
sealed class StationSelectUiEvent {
    /**
     * 노선 선택 이벤트
     *
     * @property line 선택된 노선
     */
    data class SelectLine(val line: Line) : StationSelectUiEvent()

    /**
     * 역 선택 이벤트
     *
     * @property station 선택된 역
     */
    data class SelectStation(val station: Station) : StationSelectUiEvent()

    /**
     * 검색어 변경 이벤트
     *
     * @property query 검색어
     */
    data class SearchQueryChanged(val query: String) : StationSelectUiEvent()

    /**
     * 검색 초기화 이벤트
     */
    data object ClearSearch : StationSelectUiEvent()

    /**
     * 선택 모드 변경 이벤트
     *
     * @property mode 새로운 선택 모드
     */
    data class ChangeSelectionMode(val mode: SelectionMode) : StationSelectUiEvent()

    /**
     * 방향 선택 이벤트
     *
     * @property direction 선택된 방향
     */
    data class SelectDirection(val direction: Direction) : StationSelectUiEvent()

    /**
     * 출발역/도착역 교환 이벤트
     */
    data object SwapStations : StationSelectUiEvent()

    /**
     * 출발역 초기화 이벤트
     */
    data object ClearDepartureStation : StationSelectUiEvent()

    /**
     * 도착역 초기화 이벤트
     */
    data object ClearArrivalStation : StationSelectUiEvent()

    /**
     * 선택 확정 이벤트
     */
    data object ConfirmSelection : StationSelectUiEvent()

    /**
     * 뒤로가기 이벤트
     */
    data object NavigateBack : StationSelectUiEvent()

    /**
     * 새로고침 이벤트
     */
    data object Refresh : StationSelectUiEvent()

    /**
     * 에러 해제 이벤트
     */
    data object DismissError : StationSelectUiEvent()

    /**
     * 즐겨찾기 토글 이벤트
     *
     * @property station 토글할 역
     */
    data class ToggleFavorite(val station: Station) : StationSelectUiEvent()
}

/**
 * 역 선택 화면에서 발생하는 일회성 효과
 */
sealed class StationSelectSideEffect {
    /**
     * 추적 화면으로 이동
     *
     * @property departureStationId 출발역 ID
     * @property arrivalStationId 도착역 ID
     * @property lineId 노선 ID
     * @property direction 방향
     */
    data class NavigateToTracking(
        val departureStationId: String,
        val arrivalStationId: String,
        val lineId: String,
        val direction: Direction
    ) : StationSelectSideEffect()

    /**
     * 뒤로 이동
     */
    data object NavigateBack : StationSelectSideEffect()

    /**
     * 스낵바 메시지 표시
     *
     * @property message 표시할 메시지
     */
    data class ShowSnackbar(val message: String) : StationSelectSideEffect()

    /**
     * 토스트 메시지 표시
     *
     * @property message 표시할 메시지
     */
    data class ShowToast(val message: String) : StationSelectSideEffect()

    /**
     * 방향 선택 다이얼로그 표시
     *
     * @property line 현재 선택된 노선
     */
    data class ShowDirectionDialog(val line: Line) : StationSelectSideEffect()
}
