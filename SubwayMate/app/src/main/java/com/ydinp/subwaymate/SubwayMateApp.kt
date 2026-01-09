package com.ydinp.subwaymate

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import androidx.core.content.ContextCompat
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class SubwayMateApp : Application() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

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
        /** 추적 채널 ID (Foreground Service용, 중요도 LOW) */
        const val CHANNEL_TRACKING = "tracking_channel"

        /** 알림 채널 ID (도착 알림용, 중요도 HIGH) */
        const val CHANNEL_ALERT = "alert_channel"

        /** 기본 진동 패턴 */
        private val DEFAULT_VIBRATE_PATTERN = longArrayOf(0, 500, 200, 500)
    }
}
