package com.ydinp.subwaymate.worker

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.ydinp.subwaymate.domain.model.RideSession
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * WorkManager 기반 추적 작업 관리 클래스
 *
 * Foreground Service를 보완하여 Doze 모드에서도 주기적인 위치 폴링을 수행합니다.
 * WorkManager의 최소 주기 제한(15분)에 따라 주기적 작업이 예약됩니다.
 *
 * 주요 기능:
 * - 주기적 폴링 작업 시작/중지
 * - 일회성 즉시 폴링
 * - 작업 상태 관찰
 * - 배터리 최적화 예외 요청
 */
@Singleton
class TrackingWorkManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val workManager: WorkManager
) {
    /**
     * 주기적 폴링 작업 시작
     *
     * WorkManager의 최소 주기 제한(15분)에 따라 주기적으로 열차 위치를 조회합니다.
     * 배터리 최적화 예외가 설정되어 있으면 더 정확한 타이밍에 실행됩니다.
     *
     * @param session 탑승 세션 정보
     */
    fun startPeriodicPolling(session: RideSession) {
        Log.d(TAG, "Starting periodic polling for session: ${session.id}")

        val inputData = createInputData(session)

        // 네트워크 연결 필요 제약 조건
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        // 15분 주기 작업 (WorkManager 최소 간격)
        val periodicWorkRequest = PeriodicWorkRequestBuilder<LocationPollingWorker>(
            PERIODIC_INTERVAL_MINUTES, TimeUnit.MINUTES,
            FLEX_INTERVAL_MINUTES, TimeUnit.MINUTES // Flex interval로 정확도 향상
        )
            .setConstraints(constraints)
            .setInputData(inputData)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                BACKOFF_DELAY_SECONDS,
                TimeUnit.SECONDS
            )
            .addTag(TAG_POLLING)
            .addTag(createSessionTag(session.id))
            .build()

        // 기존 작업 대체하며 시작
        workManager.enqueueUniquePeriodicWork(
            createWorkName(session.id),
            ExistingPeriodicWorkPolicy.UPDATE,
            periodicWorkRequest
        )

        Log.d(TAG, "Periodic polling scheduled: ${createWorkName(session.id)}")
    }

    /**
     * 일회성 즉시 폴링
     *
     * 주기적 작업과 별개로 즉시 열차 위치를 조회합니다.
     * 사용자가 앱을 열었을 때나 특정 이벤트 발생 시 호출합니다.
     *
     * @param session 탑승 세션 정보
     */
    fun enqueueImmediatePolling(session: RideSession) {
        Log.d(TAG, "Enqueueing immediate polling for session: ${session.id}")

        val inputData = createInputData(session)

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val oneTimeWorkRequest = OneTimeWorkRequestBuilder<LocationPollingWorker>()
            .setConstraints(constraints)
            .setInputData(inputData)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                BACKOFF_DELAY_SECONDS,
                TimeUnit.SECONDS
            )
            .addTag(TAG_POLLING)
            .addTag(TAG_IMMEDIATE)
            .addTag(createSessionTag(session.id))
            .build()

        workManager.enqueueUniqueWork(
            createImmediateWorkName(session.id),
            ExistingWorkPolicy.REPLACE,
            oneTimeWorkRequest
        )

        Log.d(TAG, "Immediate polling enqueued: ${createImmediateWorkName(session.id)}")
    }

    /**
     * 특정 세션의 폴링 작업 취소
     *
     * @param sessionId 취소할 세션 ID
     */
    fun cancelPolling(sessionId: String) {
        Log.d(TAG, "Cancelling polling for session: $sessionId")

        // 주기적 작업 취소
        workManager.cancelUniqueWork(createWorkName(sessionId))

        // 일회성 작업 취소
        workManager.cancelUniqueWork(createImmediateWorkName(sessionId))

        // 태그로 관련 작업 모두 취소
        workManager.cancelAllWorkByTag(createSessionTag(sessionId))

        Log.d(TAG, "Polling cancelled for session: $sessionId")
    }

    /**
     * 모든 폴링 작업 취소
     */
    fun cancelAllPolling() {
        Log.d(TAG, "Cancelling all polling work")
        workManager.cancelAllWorkByTag(TAG_POLLING)
    }

    /**
     * 특정 세션의 폴링 작업 상태 관찰
     *
     * @param sessionId 관찰할 세션 ID
     * @return 작업 상태 Flow (null이면 작업이 없음)
     */
    fun observePollingState(sessionId: String): Flow<WorkInfo.State?> {
        return workManager.getWorkInfosForUniqueWorkFlow(createWorkName(sessionId))
            .map { workInfos ->
                workInfos.firstOrNull()?.state
            }
    }

    /**
     * 특정 세션의 작업 정보 목록을 Flow로 관찰
     *
     * @param sessionId 관찰할 세션 ID
     * @return WorkInfo 목록 Flow
     */
    fun observePollingWorkInfo(sessionId: String): Flow<List<WorkInfo>> {
        return workManager.getWorkInfosByTagFlow(createSessionTag(sessionId))
    }

    /**
     * 현재 활성 폴링 작업이 있는지 확인
     *
     * @param sessionId 세션 ID
     * @return 활성 작업이 있으면 true
     */
    suspend fun hasActivePolling(sessionId: String): Boolean {
        val workInfos = workManager.getWorkInfosForUniqueWork(createWorkName(sessionId)).get()
        return workInfos.any { workInfo ->
            workInfo.state == WorkInfo.State.RUNNING ||
                    workInfo.state == WorkInfo.State.ENQUEUED
        }
    }

    // ============== 배터리 최적화 관련 ==============

    /**
     * 배터리 최적화 예외 요청
     *
     * 사용자에게 배터리 최적화 예외 설정을 요청하는 시스템 다이얼로그를 표시합니다.
     * Android 6.0 (API 23) 이상에서만 동작합니다.
     *
     * @return Intent가 성공적으로 시작되면 true
     */
    fun requestBatteryOptimizationExemption(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true // 6.0 미만에서는 배터리 최적화 기능이 없음
        }

        return try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            Log.d(TAG, "Battery optimization exemption request sent")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to request battery optimization exemption", e)
            false
        }
    }

    /**
     * 현재 배터리 최적화 예외 상태 확인
     *
     * @return 배터리 최적화 예외가 설정되어 있으면 true
     */
    fun isBatteryOptimizationExempted(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true // 6.0 미만에서는 배터리 최적화 기능이 없음
        }

        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return powerManager.isIgnoringBatteryOptimizations(context.packageName)
    }

    /**
     * 배터리 최적화 설정 화면으로 이동
     *
     * 직접 예외 요청이 아닌 전체 배터리 최적화 설정 화면을 열 때 사용합니다.
     *
     * @return Intent가 성공적으로 시작되면 true
     */
    fun openBatteryOptimizationSettings(): Boolean {
        return try {
            val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open battery optimization settings", e)
            false
        }
    }

    // ============== Private Helper Methods ==============

    /**
     * RideSession에서 InputData 생성
     */
    private fun createInputData(session: RideSession): Data {
        return Data.Builder()
            .putString(LocationPollingWorker.KEY_SESSION_ID, session.id)
            .putString(LocationPollingWorker.KEY_DEPARTURE_STATION, session.departureStation.id)
            .putString(LocationPollingWorker.KEY_ARRIVAL_STATION, session.arrivalStation.id)
            .putString(LocationPollingWorker.KEY_LINE_ID, session.line.id)
            .putString(LocationPollingWorker.KEY_DIRECTION, session.direction.code)
            .putInt(LocationPollingWorker.KEY_ALERT_STATIONS_BEFORE, session.alertSetting.stationsBefore)
            .putString(LocationPollingWorker.KEY_TRACKED_TRAIN_NO, session.trackedTrainNo)
            .build()
    }

    /**
     * 세션별 고유 작업 이름 생성 (주기적)
     */
    private fun createWorkName(sessionId: String): String {
        return "${WORK_NAME_PREFIX}$sessionId"
    }

    /**
     * 세션별 고유 작업 이름 생성 (일회성)
     */
    private fun createImmediateWorkName(sessionId: String): String {
        return "${WORK_NAME_PREFIX}immediate_$sessionId"
    }

    /**
     * 세션별 태그 생성
     */
    private fun createSessionTag(sessionId: String): String {
        return "${TAG_SESSION_PREFIX}$sessionId"
    }

    companion object {
        private const val TAG = "TrackingWorkManager"

        /** 작업 이름 접두사 */
        const val WORK_NAME_PREFIX = "subway_polling_"

        /** 폴링 작업 태그 */
        const val TAG_POLLING = "subway_polling"

        /** 즉시 실행 작업 태그 */
        const val TAG_IMMEDIATE = "subway_polling_immediate"

        /** 세션별 태그 접두사 */
        const val TAG_SESSION_PREFIX = "session_"

        /** 주기적 작업 간격 (분) - WorkManager 최소 간격 */
        private const val PERIODIC_INTERVAL_MINUTES = 15L

        /** Flex 간격 (분) - 정확도 향상을 위한 유연 구간 */
        private const val FLEX_INTERVAL_MINUTES = 5L

        /** 재시도 시 백오프 지연 (초) */
        private const val BACKOFF_DELAY_SECONDS = 30L
    }
}
