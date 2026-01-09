package com.ydinp.subwaymate

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

/**
 * SubwayMate Application 클래스
 *
 * Hilt 의존성 주입 및 앱 초기화를 담당합니다.
 * WorkManager의 Hilt Worker Factory 지원을 위해 Configuration.Provider를 구현합니다.
 */
@HiltAndroidApp
class SubwayMateApp : Application(), Configuration.Provider {

    /** Hilt WorkerFactory - Worker에 의존성 주입을 지원 */
    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
        Log.d(TAG, "SubwayMateApp initialized")
    }

    /**
     * WorkManager Configuration 제공
     *
     * Hilt Worker Factory를 사용하도록 WorkManager를 구성합니다.
     * 이를 통해 @HiltWorker 어노테이션이 붙은 Worker에서
     * 의존성 주입을 사용할 수 있습니다.
     *
     * 주의: AndroidManifest.xml에서 default WorkManager initializer를 비활성화해야 합니다.
     * <provider
     *     android:name="androidx.startup.InitializationProvider"
     *     android:authorities="${applicationId}.androidx-startup"
     *     tools:node="merge">
     *     <meta-data
     *         android:name="androidx.work.WorkManagerInitializer"
     *         android:value="androidx.startup"
     *         tools:node="remove" />
     * </provider>
     */
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .setMinimumLoggingLevel(
                if (BuildConfig.DEBUG) Log.DEBUG else Log.INFO
            )
            .build()

    /**
     * 알림 채널 생성
     *
     * Android 8.0 (API 26) 이상에서 알림을 표시하려면 채널이 필요합니다.
     */
    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(NotificationManager::class.java)

            // 실시간 추적 채널 (Foreground Service용)
            // 중요도 LOW: 소리/진동 없이 상태 표시줄에만 표시
            val trackingChannel = NotificationChannel(
                CHANNEL_TRACKING,
                getString(R.string.notification_channel_tracking),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "지하철 실시간 위치 추적 알림. 백그라운드에서 현재 위치를 추적합니다."
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
                setSound(null, null)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            }

            // 도착 알림 채널
            // 중요도 HIGH: 소리/진동 ON, 헤드업 알림 표시
            val alertChannel = NotificationChannel(
                CHANNEL_ALERT,
                getString(R.string.notification_channel_alert),
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "도착역 접근 시 알림을 받습니다. 중요한 알림이므로 소리와 진동이 포함됩니다."
                setShowBadge(true)
                enableLights(true)
                lightColor = ContextCompat.getColor(this@SubwayMateApp, R.color.alert_light_color)
                enableVibration(true)
                vibrationPattern = DEFAULT_VIBRATE_PATTERN
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                setBypassDnd(false)

                // 커스텀 알림음 설정 시도 (res/raw/arrival_alert.mp3)
                val customSoundUri = getCustomAlertSoundUri()
                if (customSoundUri != null) {
                    val audioAttributes = AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                    setSound(customSoundUri, audioAttributes)
                }
            }

            notificationManager.createNotificationChannels(listOf(trackingChannel, alertChannel))
            Log.d(TAG, "Notification channels created")
        }
    }

    /**
     * 커스텀 알림음 URI 가져오기
     * res/raw/arrival_alert.mp3 파일이 있으면 해당 URI를 반환
     * 없으면 null 반환 (시스템 기본음 사용)
     */
    private fun getCustomAlertSoundUri(): Uri? {
        return try {
            val resId = resources.getIdentifier("arrival_alert", "raw", packageName)
            if (resId != 0) {
                Uri.parse("android.resource://$packageName/$resId")
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }

    companion object {
        private const val TAG = "SubwayMateApp"

        /** 추적 채널 ID (Foreground Service용, 중요도 LOW) */
        const val CHANNEL_TRACKING = "tracking_channel"

        /** 알림 채널 ID (도착 알림용, 중요도 HIGH) */
        const val CHANNEL_ALERT = "alert_channel"

        /** 기본 진동 패턴 */
        private val DEFAULT_VIBRATE_PATTERN = longArrayOf(0, 500, 200, 500)
    }
}
