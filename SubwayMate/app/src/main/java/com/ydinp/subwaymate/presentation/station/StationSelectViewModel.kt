package com.ydinp.subwaymate.presentation.station

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ydinp.subwaymate.domain.common.Result
import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.model.Line
import com.ydinp.subwaymate.domain.model.Station
import com.ydinp.subwaymate.domain.usecase.GetStationsUseCase
import com.ydinp.subwaymate.domain.usecase.ManageFavoritesUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * 역 선택 화면의 ViewModel
 *
 * 노선 선택, 역 검색, 출발역/도착역 선택을 관리합니다.
 */
@HiltViewModel
class StationSelectViewModel @Inject constructor(
    private val savedStateHandle: SavedStateHandle,
    private val getStationsUseCase: GetStationsUseCase,
    private val manageFavoritesUseCase: ManageFavoritesUseCase
) : ViewModel() {

    companion object {
        const val ARG_LINE_ID = "lineId"
        private const val SEARCH_DEBOUNCE_MS = 300L
    }

    // 내부 상태 관리
    private val _selectedLineId = MutableStateFlow<String?>(savedStateHandle[ARG_LINE_ID])
    private val _searchQuery = MutableStateFlow("")
    private val _departureStation = MutableStateFlow<Station?>(null)
    private val _arrivalStation = MutableStateFlow<Station?>(null)
    private val _selectedDirection = MutableStateFlow<Direction?>(null)
    private val _selectionMode = MutableStateFlow(SelectionMode.DEPARTURE)
    private val _errorMessage = MutableStateFlow<String?>(null)

    // 검색 쿼리 디바운스 처리
    @OptIn(FlowPreview::class)
    private val debouncedSearchQuery = _searchQuery
        .debounce(SEARCH_DEBOUNCE_MS)
        .distinctUntilChanged()

    // 선택된 노선 정보
    private val selectedLineFlow = _selectedLineId.flatMapLatest { lineId ->
        if (lineId == null) {
            flowOf(Result.success<Line?>(null))
        } else {
            flowOf(getStationsUseCase.getLineById(lineId).map { it })
        }
    }

    // 선택된 노선의 역 목록
    private val stationsFlow = _selectedLineId.flatMapLatest { lineId ->
        if (lineId == null) {
            flowOf(Result.success(emptyList<Station>()))
        } else {
            getStationsUseCase.observeStationsByLine(lineId)
        }
    }

    // 검색 결과
    @OptIn(FlowPreview::class)
    private val searchResultsFlow = debouncedSearchQuery.flatMapLatest { query ->
        if (query.length < 2) {
            flowOf(Result.success(emptyList<Station>()))
        } else {
            getStationsUseCase.observeSearchStations(query)
        }
    }

    // 최근 검색 역
    private val recentStationsFlow = manageFavoritesUseCase.observeRecentSearchStations()

    /**
     * UI 상태
     */
    val uiState: StateFlow<StationSelectUiState> = combine(
        getStationsUseCase.observeAllLines(),
        selectedLineFlow,
        stationsFlow,
        searchResultsFlow,
        recentStationsFlow,
        _searchQuery,
        _departureStation,
        _arrivalStation,
        _selectedDirection,
        _selectionMode,
        _errorMessage
    ) { flows ->
        val linesResult = flows[0] as Result<List<Line>>
        val selectedLineResult = flows[1] as Result<Line?>
        val stationsResult = flows[2] as Result<List<Station>>
        val searchResult = flows[3] as Result<List<Station>>
        val recentResult = flows[4] as Result<List<Station>>
        val searchQuery = flows[5] as String
        val departureStation = flows[6] as Station?
        val arrivalStation = flows[7] as Station?
        val selectedDirection = flows[8] as Direction?
        val selectionMode = flows[9] as SelectionMode
        val error = flows[10] as String?

        // 에러 처리
        if (error != null) {
            return@combine StationSelectUiState.Error(error)
        }

        when {
            linesResult is Result.Loading -> StationSelectUiState.Loading
            linesResult is Result.Error -> StationSelectUiState.Error(
                message = linesResult.getDisplayMessage(),
                throwable = linesResult.exception
            )
            else -> {
                StationSelectUiState.Success(
                    lines = linesResult.getOrDefault(emptyList()),
                    selectedLine = selectedLineResult.getOrNull(),
                    stations = stationsResult.getOrDefault(emptyList()),
                    filteredStations = searchResult.getOrDefault(emptyList()),
                    searchQuery = searchQuery,
                    recentStations = recentResult.getOrDefault(emptyList()),
                    departureStation = departureStation,
                    arrivalStation = arrivalStation,
                    selectedDirection = selectedDirection,
                    selectionMode = selectionMode
                )
            }
        }
    }
        .catch { e ->
            emit(StationSelectUiState.Error(e.message ?: "알 수 없는 오류가 발생했습니다.", e))
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = StationSelectUiState.Loading
        )

    // 일회성 효과
    private val _sideEffect = Channel<StationSelectSideEffect>(Channel.BUFFERED)
    val sideEffect = _sideEffect.receiveAsFlow()

    /**
     * 이벤트 처리
     */
    fun onEvent(event: StationSelectUiEvent) {
        when (event) {
            is StationSelectUiEvent.SelectLine -> handleSelectLine(event.line)
            is StationSelectUiEvent.SelectStation -> handleSelectStation(event.station)
            is StationSelectUiEvent.SearchQueryChanged -> handleSearchQueryChanged(event.query)
            is StationSelectUiEvent.ClearSearch -> handleClearSearch()
            is StationSelectUiEvent.ChangeSelectionMode -> handleChangeSelectionMode(event.mode)
            is StationSelectUiEvent.SelectDirection -> handleSelectDirection(event.direction)
            is StationSelectUiEvent.SwapStations -> handleSwapStations()
            is StationSelectUiEvent.ClearDepartureStation -> handleClearDepartureStation()
            is StationSelectUiEvent.ClearArrivalStation -> handleClearArrivalStation()
            is StationSelectUiEvent.ConfirmSelection -> handleConfirmSelection()
            is StationSelectUiEvent.NavigateBack -> handleNavigateBack()
            is StationSelectUiEvent.Refresh -> handleRefresh()
            is StationSelectUiEvent.DismissError -> handleDismissError()
            is StationSelectUiEvent.ToggleFavorite -> handleToggleFavorite(event.station)
        }
    }

    /**
     * 노선 선택 처리
     */
    private fun handleSelectLine(line: Line) {
        _selectedLineId.value = line.id
        // 검색어 초기화
        _searchQuery.value = ""
    }

    /**
     * 역 선택 처리
     */
    private fun handleSelectStation(station: Station) {
        viewModelScope.launch {
            // 최근 검색에 추가
            manageFavoritesUseCase.addRecentSearchStation(station)

            when (_selectionMode.value) {
                SelectionMode.DEPARTURE -> {
                    _departureStation.value = station
                    // 노선도 함께 설정
                    if (_selectedLineId.value != station.lineId) {
                        _selectedLineId.value = station.lineId
                    }
                    // 자동으로 도착역 선택 모드로 전환
                    _selectionMode.value = SelectionMode.ARRIVAL
                }
                SelectionMode.ARRIVAL -> {
                    // 출발역과 같은 역 선택 불가
                    if (station.id == _departureStation.value?.id) {
                        _sideEffect.send(StationSelectSideEffect.ShowSnackbar("출발역과 다른 역을 선택하세요"))
                        return@launch
                    }
                    _arrivalStation.value = station

                    // 방향 자동 결정 또는 다이얼로그 표시
                    determineDirection()
                }
            }
        }
    }

    /**
     * 방향 결정
     */
    private fun determineDirection() {
        viewModelScope.launch {
            val currentState = uiState.value
            if (currentState !is StationSelectUiState.Success) return@launch

            val line = currentState.selectedLine ?: return@launch
            val departure = _departureStation.value ?: return@launch
            val arrival = _arrivalStation.value ?: return@launch

            // 순환선인 경우 방향 선택 다이얼로그 표시
            if (line.isCircular()) {
                _sideEffect.send(StationSelectSideEffect.ShowDirectionDialog(line))
            } else {
                // 일반 노선은 역 순서로 방향 결정
                val stations = currentState.stations
                val departureIndex = stations.indexOfFirst { it.id == departure.id }
                val arrivalIndex = stations.indexOfFirst { it.id == arrival.id }

                val direction = if (arrivalIndex > departureIndex) {
                    Direction.DOWN
                } else {
                    Direction.UP
                }
                _selectedDirection.value = direction
            }
        }
    }

    /**
     * 검색어 변경 처리
     */
    private fun handleSearchQueryChanged(query: String) {
        _searchQuery.value = query
    }

    /**
     * 검색 초기화 처리
     */
    private fun handleClearSearch() {
        _searchQuery.value = ""
    }

    /**
     * 선택 모드 변경 처리
     */
    private fun handleChangeSelectionMode(mode: SelectionMode) {
        _selectionMode.value = mode
    }

    /**
     * 방향 선택 처리
     */
    private fun handleSelectDirection(direction: Direction) {
        _selectedDirection.value = direction
    }

    /**
     * 출발역/도착역 교환 처리
     */
    private fun handleSwapStations() {
        val departure = _departureStation.value
        val arrival = _arrivalStation.value

        _departureStation.value = arrival
        _arrivalStation.value = departure

        // 방향 반전
        _selectedDirection.value = when (_selectedDirection.value) {
            Direction.UP -> Direction.DOWN
            Direction.DOWN -> Direction.UP
            Direction.INNER -> Direction.OUTER
            Direction.OUTER -> Direction.INNER
            null -> null
        }
    }

    /**
     * 출발역 초기화 처리
     */
    private fun handleClearDepartureStation() {
        _departureStation.value = null
        _selectedDirection.value = null
        _selectionMode.value = SelectionMode.DEPARTURE
    }

    /**
     * 도착역 초기화 처리
     */
    private fun handleClearArrivalStation() {
        _arrivalStation.value = null
        _selectedDirection.value = null
        _selectionMode.value = SelectionMode.ARRIVAL
    }

    /**
     * 선택 확정 처리
     */
    private fun handleConfirmSelection() {
        viewModelScope.launch {
            val currentState = uiState.value
            if (currentState !is StationSelectUiState.Success) return@launch

            val departure = currentState.departureStation
            val arrival = currentState.arrivalStation
            val direction = currentState.selectedDirection
            val line = currentState.selectedLine

            if (departure == null || arrival == null || direction == null || line == null) {
                _sideEffect.send(StationSelectSideEffect.ShowSnackbar("출발역, 도착역, 방향을 모두 선택하세요"))
                return@launch
            }

            _sideEffect.send(
                StationSelectSideEffect.NavigateToTracking(
                    departureStationId = departure.id,
                    arrivalStationId = arrival.id,
                    lineId = line.id,
                    direction = direction
                )
            )
        }
    }

    /**
     * 뒤로가기 처리
     */
    private fun handleNavigateBack() {
        viewModelScope.launch {
            _sideEffect.send(StationSelectSideEffect.NavigateBack)
        }
    }

    /**
     * 새로고침 처리
     */
    private fun handleRefresh() {
        viewModelScope.launch {
            _errorMessage.value = null
            val result = getStationsUseCase.loadInitialData()
            if (result is Result.Error) {
                _sideEffect.send(StationSelectSideEffect.ShowSnackbar(result.getDisplayMessage()))
            }
        }
    }

    /**
     * 에러 해제 처리
     */
    private fun handleDismissError() {
        _errorMessage.value = null
    }

    /**
     * 즐겨찾기 토글 처리
     */
    private fun handleToggleFavorite(station: Station) {
        viewModelScope.launch {
            manageFavoritesUseCase.toggleFavoriteStation(station)
                .onSuccess { isFavorite ->
                    val message = if (isFavorite) {
                        "즐겨찾기에 추가되었습니다."
                    } else {
                        "즐겨찾기에서 제거되었습니다."
                    }
                    _sideEffect.send(StationSelectSideEffect.ShowToast(message))
                }
                .onError { _, message ->
                    _sideEffect.send(StationSelectSideEffect.ShowSnackbar(message ?: "오류가 발생했습니다"))
                }
        }
    }

    /**
     * 초기 노선 ID 설정 (네비게이션에서 전달받은 경우)
     */
    fun setInitialLineId(lineId: String?) {
        if (lineId != null && _selectedLineId.value == null) {
            _selectedLineId.value = lineId
        }
    }
}
