package com.ydinp.subwaymate.presentation.tracking

import com.ydinp.subwaymate.domain.model.AlertSetting
import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.model.Line
import com.ydinp.subwaymate.domain.model.RideSession
import com.ydinp.subwaymate.domain.model.RideStatus
import com.ydinp.subwaymate.domain.model.Station
import com.ydinp.subwaymate.domain.model.TrainLocation

/**
 * 추적 화면의 UI 상태를 나타내는 sealed class
 */
sealed class TrackingUiState {
    /**
     * 로딩 중 상태
     */
    data object Loading : TrackingUiState()

    /**
     * 세션 준비 중 상태 - 세션 생성 또는 열차 탑승 대기
     *
     * @property session 탑승 세션
     * @property approachingTrains 접근 중인 열차 목록
     */
    data class Preparing(
        val session: RideSession,
        val approachingTrains: List<TrainLocation> = emptyList()
    ) : TrackingUiState() {
        val departureStation: Station get() = session.departureStation
        val arrivalStation: Station get() = session.arrivalStation
        val line: Line get() = session.line
        val direction: Direction get() = session.direction
    }

    /**
     * 추적 중 상태 - 열차에 탑승하여 이동 중
     *
     * @property session 탑승 세션
     * @property trainLocation 현재 추적 중인 열차 위치 (null이면 위치 확인 불가)
     * @property routeStations 경로 상의 전체 역 목록
     * @property currentStationIndex 현재 역의 인덱스
     */
    data class Tracking(
        val session: RideSession,
        val trainLocation: TrainLocation? = null,
        val routeStations: List<Station> = emptyList(),
        val currentStationIndex: Int = 0
    ) : TrackingUiState() {
        val departureStation: Station get() = session.departureStation
        val arrivalStation: Station get() = session.arrivalStation
        val line: Line get() = session.line
        val direction: Direction get() = session.direction
        val currentStation: Station? get() = session.currentStation
        val status: RideStatus get() = session.status
        val remainingStations: Int get() = session.remainingStations
        val alertSetting: AlertSetting get() = session.alertSetting

        /**
         * 탑승 진행률 (0.0 ~ 1.0)
         */
        val progress: Float
            get() = if (routeStations.isNotEmpty()) {
                session.calculateProgress(routeStations.size)
            } else {
                0f
            }

        /**
         * 예상 남은 시간 (분)
         */
        val estimatedRemainingMinutes: Int?
            get() = session.getEstimatedRemainingMinutes()

        /**
         * 도착 임박 상태인지 확인
         */
        val isApproaching: Boolean
            get() = status == RideStatus.APPROACHING

        /**
         * 알림이 보내져야 하는지 확인
         */
        val shouldAlert: Boolean
            get() = session.shouldSendAlert()

        /**
         * 열차 위치 정보가 있는지 확인
         */
        val hasTrainInfo: Boolean
            get() = trainLocation != null

        /**
         * 경로 진행 상태 텍스트
         */
        val progressText: String
            get() = "${routeStations.size - remainingStations}/${routeStations.size} 역"
    }

    /**
     * 도착 완료 상태
     *
     * @property session 완료된 탑승 세션
     * @property totalStations 총 이동 역 수
     * @property totalTimeMinutes 총 소요 시간 (분)
     */
    data class Completed(
        val session: RideSession,
        val totalStations: Int = 0,
        val totalTimeMinutes: Int = 0
    ) : TrackingUiState() {
        val departureStation: Station get() = session.departureStation
        val arrivalStation: Station get() = session.arrivalStation
        val line: Line get() = session.line
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
    ) : TrackingUiState()
}

/**
 * 추적 화면에서 발생하는 이벤트
 */
sealed class TrackingUiEvent {
    /**
     * 열차 선택 이벤트 (탑승 시작)
     *
     * @property trainNo 선택된 열차 번호
     */
    data class SelectTrain(val trainNo: String) : TrackingUiEvent()

    /**
     * 알림 설정 변경 이벤트
     *
     * @property alertSetting 새로운 알림 설정
     */
    data class UpdateAlertSetting(val alertSetting: AlertSetting) : TrackingUiEvent()

    /**
     * 추적 중단 이벤트
     */
    data object StopTracking : TrackingUiEvent()

    /**
     * 추적 완료 이벤트 (수동 도착 처리)
     */
    data object CompleteTracking : TrackingUiEvent()

    /**
     * 새로고침 이벤트
     */
    data object Refresh : TrackingUiEvent()

    /**
     * 뒤로가기 이벤트
     */
    data object NavigateBack : TrackingUiEvent()

    /**
     * 에러 해제 이벤트
     */
    data object DismissError : TrackingUiEvent()

    /**
     * 알림 확인 이벤트 (알림 발송됨 처리)
     */
    data object AcknowledgeAlert : TrackingUiEvent()

    /**
     * 경로 즐겨찾기 추가 이벤트
     */
    data object AddRouteToFavorites : TrackingUiEvent()

    /**
     * 도착 열차 목록 새로고침 이벤트
     */
    data object RefreshApproachingTrains : TrackingUiEvent()

    /**
     * 알림 테스트 이벤트 (디버그용)
     */
    data object TestAlert : TrackingUiEvent()
}

/**
 * 추적 화면에서 발생하는 일회성 효과
 */
sealed class TrackingSideEffect {
    /**
     * 메인 화면으로 이동
     */
    data object NavigateToMain : TrackingSideEffect()

    /**
     * 뒤로 이동
     */
    data object NavigateBack : TrackingSideEffect()

    /**
     * 스낵바 메시지 표시
     *
     * @property message 표시할 메시지
     * @property actionLabel 액션 버튼 라벨
     */
    data class ShowSnackbar(
        val message: String,
        val actionLabel: String? = null
    ) : TrackingSideEffect()

    /**
     * 토스트 메시지 표시
     *
     * @property message 표시할 메시지
     */
    data class ShowToast(val message: String) : TrackingSideEffect()

    /**
     * 알림 발송
     *
     * @property title 알림 제목
     * @property message 알림 내용
     * @property stationsRemaining 남은 역 수
     */
    data class SendNotification(
        val title: String,
        val message: String,
        val stationsRemaining: Int
    ) : TrackingSideEffect()

    /**
     * 진동 알림
     *
     * @property pattern 진동 패턴 (밀리초)
     */
    data class Vibrate(val pattern: LongArray = longArrayOf(0, 500, 200, 500)) : TrackingSideEffect()

    /**
     * 알림음 재생
     */
    data object PlayAlertSound : TrackingSideEffect()

    /**
     * 알림 설정 다이얼로그 표시
     *
     * @property currentSetting 현재 알림 설정
     */
    data class ShowAlertSettingDialog(val currentSetting: AlertSetting) : TrackingSideEffect()

    /**
     * 추적 중단 확인 다이얼로그 표시
     */
    data object ShowStopConfirmDialog : TrackingSideEffect()

    /**
     * 도착 완료 다이얼로그 표시
     *
     * @property totalStations 총 이동 역 수
     * @property totalTimeMinutes 총 소요 시간
     */
    data class ShowCompletionDialog(
        val totalStations: Int,
        val totalTimeMinutes: Int
    ) : TrackingSideEffect()
}
