package com.ydinp.subwaymate.presentation.tracking

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ydinp.subwaymate.domain.common.Result
import com.ydinp.subwaymate.domain.model.AlertSetting
import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.model.RideSession
import com.ydinp.subwaymate.domain.model.RideStatus
import com.ydinp.subwaymate.domain.model.Station
import com.ydinp.subwaymate.domain.model.TrainLocation
import com.ydinp.subwaymate.domain.usecase.GetStationsUseCase
import com.ydinp.subwaymate.domain.usecase.GetTrainLocationUseCase
import com.ydinp.subwaymate.domain.usecase.ManageFavoritesUseCase
import com.ydinp.subwaymate.domain.usecase.StartTrackingUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.LocalDateTime
import javax.inject.Inject

/**
 * 추적 화면의 ViewModel
 *
 * 실시간 열차 위치 추적, 도착 알림, 세션 관리를 담당합니다.
 */
@HiltViewModel
class TrackingViewModel @Inject constructor(
    private val savedStateHandle: SavedStateHandle,
    private val startTrackingUseCase: StartTrackingUseCase,
    private val getTrainLocationUseCase: GetTrainLocationUseCase,
    private val getStationsUseCase: GetStationsUseCase,
    private val manageFavoritesUseCase: ManageFavoritesUseCase
) : ViewModel() {

    companion object {
        // NavHost에서 사용하는 argument 이름과 동일하게 맞춤
        const val ARG_SESSION_ID = "sessionId"
        const val ARG_DEPARTURE_STATION_ID = "departureId"
        const val ARG_ARRIVAL_STATION_ID = "arrivalId"
        const val ARG_LINE_ID = "lineId"
        const val ARG_DIRECTION = "direction"

        private const val TRAIN_UPDATE_INTERVAL_MS = 10_000L // 10초
        private const val APPROACHING_TRAINS_UPDATE_INTERVAL_MS = 30_000L // 30초
    }

    // 내부 상태
    private val _sessionId = MutableStateFlow<String?>(savedStateHandle[ARG_SESSION_ID])
    private val _approachingTrains = MutableStateFlow<List<TrainLocation>>(emptyList())
    private val _routeStations = MutableStateFlow<List<Station>>(emptyList())
    private val _currentStationIndex = MutableStateFlow(0)
    private val _errorMessage = MutableStateFlow<String?>(null)

    // 열차 위치 업데이트 Job
    private var trainTrackingJob: Job? = null
    private var approachingTrainsJob: Job? = null

    // 세션 StateFlow (캐싱)
    private val _currentSession = MutableStateFlow<RideSession?>(null)

    // 세션 Flow
    private val sessionFlow = startTrackingUseCase.getActiveSession()

    // 열차 위치 Flow
    private val trainLocationFlow = sessionFlow.flatMapLatest { session ->
        _currentSession.value = session  // 세션 캐싱
        if (session?.trackedTrainNo != null) {
            getTrainLocationUseCase.trackTrain(session.trackedTrainNo, TRAIN_UPDATE_INTERVAL_MS)
        } else {
            flowOf(null)
        }
    }

    /**
     * UI 상태
     */
    val uiState: StateFlow<TrackingUiState> = combine(
        sessionFlow,
        trainLocationFlow,
        _approachingTrains,
        _routeStations,
        _currentStationIndex,
        _errorMessage
    ) { results: Array<Any?> ->
        val session = results[0] as? RideSession
        val trainLocation = results[1] as? TrainLocation
        @Suppress("UNCHECKED_CAST")
        val approachingTrains = results[2] as List<TrainLocation>
        @Suppress("UNCHECKED_CAST")
        val routeStations = results[3] as List<Station>
        val currentIndex = results[4] as Int
        val error = results[5] as? String

        // 에러 처리
        if (error != null) {
            return@combine TrackingUiState.Error(error)
        }

        // 세션이 없으면 로딩
        if (session == null) {
            return@combine TrackingUiState.Loading
        }

        // 상태에 따른 UI 상태 결정
        when (session.status) {
            RideStatus.BOARDING -> {
                TrackingUiState.Preparing(
                    session = session,
                    approachingTrains = approachingTrains
                )
            }
            RideStatus.IN_TRANSIT, RideStatus.APPROACHING -> {
                TrackingUiState.Tracking(
                    session = session,
                    trainLocation = trainLocation,
                    routeStations = routeStations,
                    currentStationIndex = currentIndex
                )
            }
            RideStatus.ARRIVED -> {
                val totalTime = Duration.between(session.startTime, LocalDateTime.now())
                    .toMinutes().toInt()
                TrackingUiState.Completed(
                    session = session,
                    totalStations = routeStations.size,
                    totalTimeMinutes = totalTime
                )
            }
        }
    }
        .catch { e ->
            emit(TrackingUiState.Error(e.message ?: "알 수 없는 오류가 발생했습니다.", e))
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = TrackingUiState.Loading
        )

    // 일회성 효과
    private val _sideEffect = Channel<TrackingSideEffect>(Channel.BUFFERED)
    val sideEffect = _sideEffect.receiveAsFlow()

    init {
        // 초기화 시 세션 확인 및 설정
        viewModelScope.launch {
            initializeSession()
        }
    }

    /**
     * 세션 초기화
     */
    private suspend fun initializeSession() {
        val sessionId = savedStateHandle.get<String>(ARG_SESSION_ID)

        if (sessionId != null) {
            // 기존 세션 로드
            _sessionId.value = sessionId
        } else {
            // 새 세션 생성
            createNewSession()
        }

        // 경로 상의 역 정보 로드
        loadRouteStations()

        // 접근 중인 열차 목록 업데이트 시작
        startApproachingTrainsUpdate()
    }

    /**
     * 새 세션 생성
     */
    private suspend fun createNewSession() {
        val departureId = savedStateHandle.get<String>(ARG_DEPARTURE_STATION_ID) ?: return
        val arrivalId = savedStateHandle.get<String>(ARG_ARRIVAL_STATION_ID) ?: return
        val lineId = savedStateHandle.get<String>(ARG_LINE_ID) ?: return
        val directionCode = savedStateHandle.get<String>(ARG_DIRECTION) ?: return

        val direction = Direction.fromCode(directionCode)

        val params = StartTrackingUseCase.TrackingParams(
            departureStationId = departureId,
            arrivalStationId = arrivalId,
            lineId = lineId,
            direction = direction
        )

        startTrackingUseCase.startTracking(params)
            .onSuccess { session ->
                _sessionId.value = session.id
            }
            .onError { _, message ->
                _errorMessage.value = message ?: "세션 생성에 실패했습니다"
            }
    }

    /**
     * 경로 상의 역 정보 로드
     */
    private suspend fun loadRouteStations() {
        sessionFlow.collect { session ->
            if (session != null) {
                val result = getStationsUseCase.getStationsBetween(
                    fromStationId = session.departureStation.id,
                    toStationId = session.arrivalStation.id,
                    lineId = session.line.id
                )

                result.onSuccess { stations ->
                    _routeStations.value = stations
                }
            }
        }
    }

    /**
     * 접근 중인 열차 목록 주기적 업데이트
     */
    private fun startApproachingTrainsUpdate() {
        approachingTrainsJob?.cancel()
        approachingTrainsJob = viewModelScope.launch {
            while (isActive) {
                updateApproachingTrains()
                delay(APPROACHING_TRAINS_UPDATE_INTERVAL_MS)
            }
        }
    }

    /**
     * 접근 중인 열차 목록 업데이트
     */
    private suspend fun updateApproachingTrains() {
        val session = _currentSession.value ?: return

        if (session.status == RideStatus.BOARDING) {
            val trains = getTrainLocationUseCase.getApproachingTrains(
                stationId = session.departureStation.id,
                direction = session.direction
            )
            _approachingTrains.value = trains
        }
    }

    /**
     * 이벤트 처리
     */
    fun onEvent(event: TrackingUiEvent) {
        when (event) {
            is TrackingUiEvent.SelectTrain -> handleSelectTrain(event.trainNo)
            is TrackingUiEvent.UpdateAlertSetting -> handleUpdateAlertSetting(event.alertSetting)
            is TrackingUiEvent.StopTracking -> handleStopTracking()
            is TrackingUiEvent.CompleteTracking -> handleCompleteTracking()
            is TrackingUiEvent.Refresh -> handleRefresh()
            is TrackingUiEvent.NavigateBack -> handleNavigateBack()
            is TrackingUiEvent.DismissError -> handleDismissError()
            is TrackingUiEvent.AcknowledgeAlert -> handleAcknowledgeAlert()
            is TrackingUiEvent.AddRouteToFavorites -> handleAddRouteToFavorites()
            is TrackingUiEvent.RefreshApproachingTrains -> handleRefreshApproachingTrains()
            is TrackingUiEvent.TestAlert -> handleTestAlert()
        }
    }

    /**
     * 열차 선택 처리 (탑승 시작)
     */
    private fun handleSelectTrain(trainNo: String) {
        viewModelScope.launch {
            val sessionId = _sessionId.value ?: return@launch

            startTrackingUseCase.assignTrain(sessionId, trainNo)
                .onSuccess { session ->
                    _sideEffect.send(TrackingSideEffect.ShowToast("열차 탑승을 시작합니다"))

                    // 열차 추적 시작
                    startTrainTracking(trainNo)
                }
                .onError { _, message ->
                    _sideEffect.send(TrackingSideEffect.ShowSnackbar(message ?: "열차 선택에 실패했습니다"))
                }
        }
    }

    /**
     * 열차 추적 시작
     */
    private fun startTrainTracking(trainNo: String) {
        trainTrackingJob?.cancel()
        trainTrackingJob = viewModelScope.launch {
            getTrainLocationUseCase.trackTrain(trainNo, TRAIN_UPDATE_INTERVAL_MS)
                .collect { trainLocation ->
                    if (trainLocation != null) {
                        updateSessionFromTrainLocation(trainLocation)
                    }
                }
        }
    }

    /**
     * 열차 위치로 세션 업데이트
     */
    private suspend fun updateSessionFromTrainLocation(trainLocation: TrainLocation) {
        val sessionId = _sessionId.value ?: return
        val session = _currentSession.value ?: return

        // 남은 역 수 계산
        val remainingResult = getTrainLocationUseCase.calculateRemainingStations(
            train = trainLocation,
            targetStationId = session.arrivalStation.id
        )

        remainingResult.onSuccess { remainingStations ->
            // 현재 역 인덱스 업데이트
            val routeStations = _routeStations.value
            val currentIndex = routeStations.indexOfFirst { it.id == trainLocation.currentStationId }
            if (currentIndex >= 0) {
                _currentStationIndex.value = currentIndex
            }

            // 세션 위치 업데이트
            startTrackingUseCase.updateSessionLocation(
                sessionId = sessionId,
                currentStationId = trainLocation.currentStationId,
                remainingStations = remainingStations,
                estimatedArrivalTime = trainLocation.estimatedArrivalTime
            )

            // 알림 확인
            checkAndSendAlert(remainingStations)

            // 도착 확인
            if (remainingStations <= 0) {
                handleArrival()
            }
        }
    }

    /**
     * 알림 확인 및 발송
     */
    private suspend fun checkAndSendAlert(remainingStations: Int) {
        val session = _currentSession.value ?: return

        if (session.shouldSendAlert() && !session.alertSent) {
            val alertSetting = session.alertSetting

            // 알림 발송
            _sideEffect.send(
                TrackingSideEffect.SendNotification(
                    title = "도착 알림",
                    message = "${session.arrivalStation.name}역까지 ${remainingStations}역 남았습니다",
                    stationsRemaining = remainingStations
                )
            )

            // 진동
            if (alertSetting.vibrationEnabled) {
                _sideEffect.send(TrackingSideEffect.Vibrate())
            }

            // 소리
            if (alertSetting.soundEnabled) {
                _sideEffect.send(TrackingSideEffect.PlayAlertSound)
            }

            // 알림 발송됨 표시
            startTrackingUseCase.markAlertSent(_sessionId.value!!)
        }
    }

    /**
     * 도착 처리
     */
    private suspend fun handleArrival() {
        val sessionId = _sessionId.value ?: return

        startTrackingUseCase.completeSession(sessionId)
            .onSuccess { session ->
                val totalTime = Duration.between(session.startTime, LocalDateTime.now())
                    .toMinutes().toInt()

                _sideEffect.send(
                    TrackingSideEffect.ShowCompletionDialog(
                        totalStations = _routeStations.value.size,
                        totalTimeMinutes = totalTime
                    )
                )
            }
    }

    /**
     * 알림 설정 변경 처리
     */
    private fun handleUpdateAlertSetting(alertSetting: AlertSetting) {
        viewModelScope.launch {
            // 세션의 알림 설정 업데이트 (Repository에 반영 필요)
            _sideEffect.send(TrackingSideEffect.ShowToast("알림 설정이 변경되었습니다"))
        }
    }

    /**
     * 추적 중단 처리
     */
    private fun handleStopTracking() {
        viewModelScope.launch {
            _sideEffect.send(TrackingSideEffect.ShowStopConfirmDialog)
        }
    }

    /**
     * 추적 완료 처리 (수동)
     */
    private fun handleCompleteTracking() {
        viewModelScope.launch {
            val sessionId = _sessionId.value ?: return@launch

            startTrackingUseCase.stopTracking(sessionId)
                .onSuccess {
                    trainTrackingJob?.cancel()
                    approachingTrainsJob?.cancel()
                    _sideEffect.send(TrackingSideEffect.NavigateToMain)
                }
                .onError { _, message ->
                    _sideEffect.send(TrackingSideEffect.ShowSnackbar(message ?: "종료에 실패했습니다"))
                }
        }
    }

    /**
     * 새로고침 처리
     */
    private fun handleRefresh() {
        viewModelScope.launch {
            val session = _currentSession.value ?: return@launch

            // 열차 데이터 새로고침
            getTrainLocationUseCase.refreshTrainData(session.line.id)

            // 접근 열차 업데이트
            updateApproachingTrains()

            _sideEffect.send(TrackingSideEffect.ShowToast("새로고침 완료"))
        }
    }

    /**
     * 뒤로가기 처리
     */
    private fun handleNavigateBack() {
        viewModelScope.launch {
            val currentState = uiState.value

            when (currentState) {
                is TrackingUiState.Tracking -> {
                    // 추적 중에는 확인 다이얼로그 표시
                    _sideEffect.send(TrackingSideEffect.ShowStopConfirmDialog)
                }
                else -> {
                    _sideEffect.send(TrackingSideEffect.NavigateBack)
                }
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
     * 알림 확인 처리
     */
    private fun handleAcknowledgeAlert() {
        viewModelScope.launch {
            val sessionId = _sessionId.value ?: return@launch
            startTrackingUseCase.markAlertSent(sessionId)
        }
    }

    /**
     * 경로 즐겨찾기 추가 처리
     */
    private fun handleAddRouteToFavorites() {
        viewModelScope.launch {
            val session = _currentSession.value ?: return@launch

            manageFavoritesUseCase.addFavoriteRoute(
                departureStationId = session.departureStation.id,
                arrivalStationId = session.arrivalStation.id,
                lineId = session.line.id,
                direction = session.direction,
                alertSetting = session.alertSetting
            )
                .onSuccess {
                    _sideEffect.send(TrackingSideEffect.ShowToast("즐겨찾기에 추가되었습니다"))
                }
                .onError { _, message ->
                    _sideEffect.send(TrackingSideEffect.ShowSnackbar(message ?: "추가에 실패했습니다"))
                }
        }
    }

    /**
     * 접근 열차 새로고침 처리
     */
    private fun handleRefreshApproachingTrains() {
        viewModelScope.launch {
            updateApproachingTrains()
        }
    }

    /**
     * 알림 테스트 처리 (디버그용)
     */
    private fun handleTestAlert() {
        viewModelScope.launch {
            _sideEffect.send(
                TrackingSideEffect.SendNotification(
                    title = "테스트 알림",
                    message = "알림 테스트입니다",
                    stationsRemaining = 2
                )
            )
            _sideEffect.send(TrackingSideEffect.Vibrate())
            _sideEffect.send(TrackingSideEffect.PlayAlertSound)
        }
    }

    override fun onCleared() {
        super.onCleared()
        trainTrackingJob?.cancel()
        approachingTrainsJob?.cancel()
    }
}
