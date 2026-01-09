package com.ydinp.subwaymate.presentation.main

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ydinp.subwaymate.domain.common.Result
import com.ydinp.subwaymate.domain.model.Line
import com.ydinp.subwaymate.domain.model.RideSession
import com.ydinp.subwaymate.domain.model.Station
import com.ydinp.subwaymate.domain.repository.FavoriteRoute
import com.ydinp.subwaymate.domain.repository.FavoriteStation
import com.ydinp.subwaymate.domain.usecase.GetStationsUseCase
import com.ydinp.subwaymate.domain.usecase.ManageFavoritesUseCase
import com.ydinp.subwaymate.domain.usecase.StartTrackingUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * 메인 화면의 ViewModel
 *
 * 노선 목록, 즐겨찾기 역, 활성 세션 등의 데이터를 관리합니다.
 */
@HiltViewModel
class MainViewModel @Inject constructor(
    private val getStationsUseCase: GetStationsUseCase,
    private val manageFavoritesUseCase: ManageFavoritesUseCase,
    private val startTrackingUseCase: StartTrackingUseCase
) : ViewModel() {

    private val _isRefreshing = MutableStateFlow(false)
    val isRefreshing: StateFlow<Boolean> = _isRefreshing

    private val _errorMessage = MutableStateFlow<String?>(null)

    /**
     * UI 상태를 Flow로 제공
     * 노선 목록, 즐겨찾기, 활성 세션을 결합하여 상태 생성
     */
    val uiState: StateFlow<MainUiState> = combine(
        getStationsUseCase.observeAllLines(),
        manageFavoritesUseCase.observeFavoriteStations(),
        manageFavoritesUseCase.observeFavoriteRoutes(),
        startTrackingUseCase.getActiveSession(),
        startTrackingUseCase.getRecentSessions(5),
        _errorMessage
    ) { linesResult, favoritesResult, routesResult, activeSession, recentSessions, error ->

        // 에러 메시지가 있으면 에러 상태 반환
        if (error != null) {
            return@combine MainUiState.Error(error)
        }

        // 결과 처리
        when {
            linesResult is Result.Loading -> MainUiState.Loading
            linesResult is Result.Error -> MainUiState.Error(
                message = linesResult.getDisplayMessage(),
                throwable = linesResult.exception
            )
            favoritesResult is Result.Error -> MainUiState.Error(
                message = favoritesResult.getDisplayMessage(),
                throwable = favoritesResult.exception
            )
            routesResult is Result.Error -> MainUiState.Error(
                message = routesResult.getDisplayMessage(),
                throwable = routesResult.exception
            )
            else -> {
                MainUiState.Success(
                    lines = linesResult.getOrDefault(emptyList()),
                    favoriteStations = favoritesResult.getOrDefault(emptyList()),
                    favoriteRoutes = routesResult.getOrDefault(emptyList()),
                    activeSession = activeSession,
                    recentSessions = recentSessions
                )
            }
        }
    }
        .catch { e ->
            emit(MainUiState.Error(e.message ?: "알 수 없는 오류가 발생했습니다.", e))
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = MainUiState.Loading
        )

    // 일회성 효과(Side Effect)를 위한 Channel
    private val _sideEffect = Channel<MainSideEffect>(Channel.BUFFERED)
    val sideEffect = _sideEffect.receiveAsFlow()

    init {
        loadInitialData()
    }

    /**
     * 초기 데이터 로드
     */
    private fun loadInitialData() {
        viewModelScope.launch {
            _isRefreshing.value = true
            _errorMessage.value = null

            // 데이터 초기화 확인 및 로드
            if (!getStationsUseCase.isDataLoaded()) {
                val result = getStationsUseCase.loadInitialData()
                if (result is Result.Error) {
                    _errorMessage.value = result.getDisplayMessage()
                }
            }

            _isRefreshing.value = false
        }
    }

    /**
     * UI 이벤트 처리
     *
     * @param event 처리할 이벤트
     */
    fun onEvent(event: MainUiEvent) {
        when (event) {
            is MainUiEvent.SelectLine -> handleSelectLine(event.line)
            is MainUiEvent.SelectStation -> handleSelectStation(event.station)
            is MainUiEvent.SelectRoute -> handleSelectRoute(event.route)
            is MainUiEvent.StartNewTracking -> handleStartNewTracking()
            is MainUiEvent.ViewActiveSession -> handleViewActiveSession(event.session)
            is MainUiEvent.EndSession -> handleEndSession(event.sessionId)
            is MainUiEvent.ToggleFavoriteStation -> handleToggleFavoriteStation(event.station)
            is MainUiEvent.NavigateToSettings -> handleNavigateToSettings()
            is MainUiEvent.Refresh -> handleRefresh()
            is MainUiEvent.DismissError -> handleDismissError()
            is MainUiEvent.RequestLocationPermission -> handleRequestLocationPermission()
            is MainUiEvent.UpdateLocation -> handleUpdateLocation(event.latitude, event.longitude)
        }
    }

    /**
     * 노선 선택 처리
     */
    private fun handleSelectLine(line: Line) {
        viewModelScope.launch {
            _sideEffect.send(MainSideEffect.NavigateToStationSelect(line.id))
        }
    }

    /**
     * 역 선택 처리 (즐겨찾기에서)
     */
    private fun handleSelectStation(station: Station) {
        viewModelScope.launch {
            _sideEffect.send(MainSideEffect.NavigateToStationSelect(station.lineId))
        }
    }

    /**
     * 즐겨찾기 경로 선택 처리
     */
    private fun handleSelectRoute(route: FavoriteRoute) {
        viewModelScope.launch {
            // 사용 횟수 증가
            manageFavoritesUseCase.incrementRouteUsage(route.id)

            // 추적 시작
            _sideEffect.send(MainSideEffect.StartTrackingWithRoute(route))
        }
    }

    /**
     * 새 탑승 추적 시작 처리
     */
    private fun handleStartNewTracking() {
        viewModelScope.launch {
            // 이미 활성 세션이 있는지 확인
            val currentState = uiState.value
            if (currentState is MainUiState.Success && currentState.activeSession != null) {
                _sideEffect.send(MainSideEffect.ShowSnackbar("이미 진행 중인 탑승이 있습니다."))
                _sideEffect.send(MainSideEffect.NavigateToTracking(currentState.activeSession.id))
            } else {
                _sideEffect.send(MainSideEffect.NavigateToStationSelect(null))
            }
        }
    }

    /**
     * 활성 세션 상세 보기 처리
     */
    private fun handleViewActiveSession(session: RideSession) {
        viewModelScope.launch {
            _sideEffect.send(MainSideEffect.NavigateToTracking(session.id))
        }
    }

    /**
     * 세션 종료 처리
     */
    private fun handleEndSession(sessionId: String) {
        viewModelScope.launch {
            startTrackingUseCase.stopTracking(sessionId)
                .onSuccess {
                    _sideEffect.send(MainSideEffect.ShowSnackbar("탑승 추적이 종료되었습니다."))
                }
                .onError { _, message ->
                    _sideEffect.send(MainSideEffect.ShowSnackbar("종료 실패: ${message ?: "알 수 없는 오류"}"))
                }
        }
    }

    /**
     * 즐겨찾기 역 토글 처리
     */
    private fun handleToggleFavoriteStation(station: Station) {
        viewModelScope.launch {
            manageFavoritesUseCase.toggleFavoriteStation(station)
                .onSuccess { isFavorite ->
                    val message = if (isFavorite) {
                        "즐겨찾기에 추가되었습니다."
                    } else {
                        "즐겨찾기에서 제거되었습니다."
                    }
                    _sideEffect.send(MainSideEffect.ShowToast(message))
                }
                .onError { _, message ->
                    _sideEffect.send(MainSideEffect.ShowSnackbar("오류: ${message ?: "알 수 없는 오류"}"))
                }
        }
    }

    /**
     * 설정 화면 이동 처리
     */
    private fun handleNavigateToSettings() {
        viewModelScope.launch {
            _sideEffect.send(MainSideEffect.NavigateToSettings)
        }
    }

    /**
     * 새로고침 처리
     */
    private fun handleRefresh() {
        viewModelScope.launch {
            _isRefreshing.value = true
            _errorMessage.value = null

            val result = getStationsUseCase.loadInitialData()
            if (result is Result.Error) {
                _sideEffect.send(MainSideEffect.ShowSnackbar(result.getDisplayMessage()))
            }

            _isRefreshing.value = false
        }
    }

    /**
     * 에러 메시지 해제 처리
     */
    private fun handleDismissError() {
        _errorMessage.value = null
    }

    /**
     * 위치 권한 요청 처리
     */
    private fun handleRequestLocationPermission() {
        viewModelScope.launch {
            _sideEffect.send(MainSideEffect.RequestLocationPermission)
        }
    }

    /**
     * 위치 업데이트 처리
     */
    private fun handleUpdateLocation(latitude: Double, longitude: Double) {
        viewModelScope.launch {
            // 주변 역 검색 (향후 구현 시 활용)
            val nearbyResult = getStationsUseCase.getNearbyStations(latitude, longitude)
            nearbyResult.onSuccess { stations ->
                // 주변 역 정보 업데이트 (필요시 상태에 반영)
            }
        }
    }
}
