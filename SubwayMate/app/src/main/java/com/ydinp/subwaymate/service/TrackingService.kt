package com.ydinp.subwaymate.service

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import com.ydinp.subwaymate.domain.common.Result
import com.ydinp.subwaymate.domain.model.AlertSetting
import com.ydinp.subwaymate.domain.model.RideSession
import com.ydinp.subwaymate.domain.model.RideStatus
import com.ydinp.subwaymate.domain.model.TrainLocation
import com.ydinp.subwaymate.domain.repository.TrainLocationRepository
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.LocalDateTime
import javax.inject.Inject

/**
 * 백그라운드 위치 추적을 위한 Foreground Service
 *
 * 사용자가 설정한 탑승 세션에 따라 열차 위치를 주기적으로 조회하고,
 * 도착역 접근 시 알림을 발송합니다.
 */
@AndroidEntryPoint
class TrackingService : Service() {

    /** 열차 위치 조회 Repository */
    @Inject
    lateinit var trainLocationRepository: TrainLocationRepository

    /** 알림 관리자 */
    @Inject
    lateinit var notificationManager: ServiceNotificationManager

    /** 현재 탑승 세션 */
    private var currentSession: RideSession? = null

    /** 현재 알림 설정 */
    private var alertSetting: AlertSetting? = null

    /** 백그라운드 작업용 Coroutine Scope */
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    /** 폴링 Job (취소를 위해 별도 관리) */
    private var pollingJob: Job? = null

    /** 서비스 실행 상태 */
    private var isServiceRunning = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "TrackingService created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand: action=${intent?.action}")

        when (intent?.action) {
            ACTION_START -> {
                val session = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(EXTRA_SESSION, RideSession::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(EXTRA_SESSION) as? RideSession
                }

                val alertSettingExtra = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(EXTRA_ALERT_SETTING, AlertSetting::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(EXTRA_ALERT_SETTING) as? AlertSetting
                }

                if (session != null) {
                    startTracking(session, alertSettingExtra)
                } else {
                    Log.e(TAG, "ACTION_START: session is null")
                    stopSelf()
                }
            }
            ACTION_STOP -> {
                stopTracking()
            }
            ACTION_UPDATE_ALERT -> {
                val newAlertSetting = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(EXTRA_ALERT_SETTING, AlertSetting::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(EXTRA_ALERT_SETTING) as? AlertSetting
                }
                updateAlertSetting(newAlertSetting)
            }
            else -> {
                Log.w(TAG, "Unknown action: ${intent?.action}")
            }
        }

        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "TrackingService destroyed")
        cleanup()
    }

    /**
     * 추적 시작
     *
     * @param session 탑승 세션 정보
     * @param alertSettingParam 알림 설정 (null이면 세션의 기본 설정 사용)
     */
    private fun startTracking(session: RideSession, alertSettingParam: AlertSetting?) {
        Log.d(TAG, "startTracking: ${session.departureStation.name} -> ${session.arrivalStation.name}")

        currentSession = session
        alertSetting = alertSettingParam ?: session.alertSetting
        isServiceRunning = true

        // Foreground Service 시작
        val notification = notificationManager.createTrackingNotification(session)
        startForeground(ServiceNotificationManager.TRACKING_NOTIFICATION_ID, notification)

        // 폴링 시작
        startPolling()

        // 상태 브로드캐스트 전송
        broadcastSessionUpdate(session)
    }

    /**
     * 추적 중지
     */
    private fun stopTracking() {
        Log.d(TAG, "stopTracking")

        isServiceRunning = false

        // 폴링 중지
        pollingJob?.cancel()
        pollingJob = null

        // Foreground 해제
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }

        // 서비스 종료
        stopSelf()

        // 종료 브로드캐스트 전송
        broadcastServiceStopped()
    }

    /**
     * 알림 설정 업데이트
     */
    private fun updateAlertSetting(newAlertSetting: AlertSetting?) {
        Log.d(TAG, "updateAlertSetting: $newAlertSetting")

        if (newAlertSetting != null) {
            alertSetting = newAlertSetting
            currentSession?.let { session ->
                currentSession = session.copy(alertSetting = newAlertSetting)
            }
        }
    }

    /**
     * 주기적 폴링 시작
     */
    private fun startPolling() {
        pollingJob?.cancel()
        pollingJob = serviceScope.launch {
            while (isActive && isServiceRunning) {
                try {
                    pollTrainLocation()
                } catch (e: Exception) {
                    Log.e(TAG, "Polling error", e)
                }

                delay(POLLING_INTERVAL_MS)
            }
        }
    }

    /**
     * 열차 위치 조회 및 상태 업데이트
     */
    private suspend fun pollTrainLocation() {
        val session = currentSession ?: return
        val trainNo = session.trackedTrainNo

        Log.d(TAG, "pollTrainLocation: trainNo=$trainNo, lineId=${session.line.id}")

        if (trainNo == null) {
            // 아직 열차가 지정되지 않은 경우 - 출발역 근처 열차 찾기
            findAndAssignTrain(session)
            return
        }

        // 추적 중인 열차 위치 조회
        val result = trainLocationRepository.getTrainLocation(
            trainNo = trainNo,
            lineId = session.line.id
        )

        when (result) {
            is Result.Success -> {
                updateSessionWithTrainLocation(session, result.data)
            }
            is Result.Error -> {
                Log.e(TAG, "Failed to get train location: ${result.exception.message}")
                // 에러 발생 시에도 UI에 현재 상태 전달
                broadcastSessionUpdate(session)
            }
            is Result.Loading -> {
                // 무시
            }
        }
    }

    /**
     * 출발역 근처 열차를 찾아 할당
     */
    private suspend fun findAndAssignTrain(session: RideSession) {
        val result = trainLocationRepository.getNextTrain(
            stationId = session.departureStation.id,
            lineId = session.line.id,
            direction = session.direction
        )

        when (result) {
            is Result.Success -> {
                result.data?.let { train ->
                    Log.d(TAG, "Assigned train: ${train.trainNo}")
                    currentSession = session.assignTrain(train.trainNo)
                    currentSession?.let { updatedSession ->
                        notificationManager.updateTrackingNotification(updatedSession)
                        broadcastSessionUpdate(updatedSession)
                    }
                }
            }
            is Result.Error -> {
                Log.e(TAG, "Failed to find train: ${result.exception.message}")
            }
            is Result.Loading -> {
                // 무시
            }
        }
    }

    /**
     * 열차 위치 정보로 세션 업데이트
     */
    private fun updateSessionWithTrainLocation(session: RideSession, trainLocation: TrainLocation) {
        // 현재 역과 남은 역 수 계산 (실제 구현에서는 노선 정보 기반 계산 필요)
        val remainingStations = calculateRemainingStations(session, trainLocation)

        val updatedSession = session.updateLocation(
            newCurrentStation = session.currentStation ?: session.departureStation,
            newRemainingStations = remainingStations,
            newEstimatedArrivalTime = trainLocation.estimatedArrivalTime
        )

        currentSession = updatedSession

        // 알림 업데이트
        notificationManager.updateTrackingNotification(updatedSession)

        // 도착 알림 체크
        checkArrivalAlert(updatedSession)

        // 상태 브로드캐스트 전송
        broadcastSessionUpdate(updatedSession)

        // 도착 완료 체크
        if (updatedSession.status == RideStatus.ARRIVED) {
            handleArrival(updatedSession)
        }
    }

    /**
     * 남은 역 수 계산 (간단한 구현 - 실제로는 노선 정보 기반 계산 필요)
     */
    private fun calculateRemainingStations(
        session: RideSession,
        trainLocation: TrainLocation
    ): Int {
        // 현재 역이 도착역이면 0
        if (trainLocation.currentStationId == session.arrivalStation.id ||
            trainLocation.nextStationId == session.arrivalStation.id) {
            return if (trainLocation.currentStationId == session.arrivalStation.id) 0 else 1
        }

        // 실제 구현에서는 역 순서 정보를 사용하여 정확한 계산 필요
        // 여기서는 임시로 이전 값 유지 또는 감소
        return maxOf(0, session.remainingStations - 1)
    }

    /**
     * 도착 알림 조건 확인 및 발송
     */
    private fun checkArrivalAlert(session: RideSession) {
        val setting = alertSetting ?: session.alertSetting

        if (session.alertSent) {
            return // 이미 알림 발송됨
        }

        val shouldAlert = when {
            setting.isStationAlertEnabled() &&
                    session.remainingStations <= setting.stationsBefore -> true
            setting.isTimeAlertEnabled() -> {
                val remainingMinutes = session.getEstimatedRemainingMinutes() ?: Int.MAX_VALUE
                remainingMinutes <= setting.minutesBefore
            }
            else -> false
        }

        if (shouldAlert) {
            Log.d(TAG, "Sending arrival alert: ${session.remainingStations} stations remaining")
            notificationManager.sendArrivalAlert(session)
            currentSession = session.markAlertSent()
            broadcastAlertSent()
        }
    }

    /**
     * 도착 완료 처리
     */
    private fun handleArrival(session: RideSession) {
        Log.d(TAG, "Arrived at destination: ${session.arrivalStation.name}")

        // 도착 완료 알림
        notificationManager.sendArrivalCompleteNotification(session)

        // 추적 종료
        stopTracking()
    }

    /**
     * 리소스 정리
     */
    private fun cleanup() {
        pollingJob?.cancel()
        serviceScope.cancel()
        currentSession = null
        alertSetting = null
        isServiceRunning = false
    }

    // ============== 브로드캐스트 메서드 ==============

    /**
     * 세션 업데이트 브로드캐스트 전송
     */
    private fun broadcastSessionUpdate(session: RideSession) {
        val intent = Intent(BROADCAST_SESSION_UPDATE).apply {
            setPackage(packageName)
            putExtra(EXTRA_SESSION, session)
        }
        sendBroadcast(intent)
    }

    /**
     * 알림 발송 브로드캐스트 전송
     */
    private fun broadcastAlertSent() {
        val intent = Intent(BROADCAST_ALERT_SENT).apply {
            setPackage(packageName)
        }
        sendBroadcast(intent)
    }

    /**
     * 서비스 종료 브로드캐스트 전송
     */
    private fun broadcastServiceStopped() {
        val intent = Intent(BROADCAST_SERVICE_STOPPED).apply {
            setPackage(packageName)
        }
        sendBroadcast(intent)
    }

    companion object {
        private const val TAG = "TrackingService"

        /** 폴링 간격 (30초) */
        private const val POLLING_INTERVAL_MS = 30_000L

        // ============== 액션 상수 ==============
        /** 추적 시작 액션 */
        const val ACTION_START = "com.ydinp.subwaymate.ACTION_START_TRACKING"

        /** 추적 중지 액션 */
        const val ACTION_STOP = "com.ydinp.subwaymate.ACTION_STOP_TRACKING"

        /** 알림 설정 업데이트 액션 */
        const val ACTION_UPDATE_ALERT = "com.ydinp.subwaymate.ACTION_UPDATE_ALERT"

        // ============== Extra 키 상수 ==============
        /** 탑승 세션 Extra 키 */
        const val EXTRA_SESSION = "extra_session"

        /** 알림 설정 Extra 키 */
        const val EXTRA_ALERT_SETTING = "extra_alert_setting"

        // ============== 브로드캐스트 액션 ==============
        /** 세션 업데이트 브로드캐스트 */
        const val BROADCAST_SESSION_UPDATE = "com.ydinp.subwaymate.BROADCAST_SESSION_UPDATE"

        /** 알림 발송 브로드캐스트 */
        const val BROADCAST_ALERT_SENT = "com.ydinp.subwaymate.BROADCAST_ALERT_SENT"

        /** 서비스 종료 브로드캐스트 */
        const val BROADCAST_SERVICE_STOPPED = "com.ydinp.subwaymate.BROADCAST_SERVICE_STOPPED"

        // ============== 유틸리티 메서드 ==============

        /**
         * 추적 서비스 시작
         *
         * @param context Context
         * @param session 탑승 세션
         * @param alertSetting 알림 설정 (선택적)
         */
        fun startTracking(
            context: Context,
            session: RideSession,
            alertSetting: AlertSetting? = null
        ) {
            val intent = Intent(context, TrackingService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_SESSION, session)
                alertSetting?.let { putExtra(EXTRA_ALERT_SETTING, it) }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        /**
         * 추적 서비스 중지
         *
         * @param context Context
         */
        fun stopTracking(context: Context) {
            val intent = Intent(context, TrackingService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }

        /**
         * 알림 설정 업데이트
         *
         * @param context Context
         * @param alertSetting 새 알림 설정
         */
        fun updateAlertSetting(context: Context, alertSetting: AlertSetting) {
            val intent = Intent(context, TrackingService::class.java).apply {
                action = ACTION_UPDATE_ALERT
                putExtra(EXTRA_ALERT_SETTING, alertSetting)
            }
            context.startService(intent)
        }
    }
}
