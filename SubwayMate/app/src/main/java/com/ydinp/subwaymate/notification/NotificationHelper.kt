package com.ydinp.subwaymate.notification

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.ydinp.subwaymate.SubwayMateApp
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 알림 관련 유틸리티 및 권한 체크를 담당하는 헬퍼 클래스
 *
 * Android 13 이상에서 필요한 POST_NOTIFICATIONS 권한 체크,
 * 알림 채널 활성화 상태 확인, 설정 화면 이동 등의 기능을 제공합니다.
 */
@Singleton
class NotificationHelper @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val notificationManager: NotificationManager by lazy {
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    }

    private val notificationManagerCompat: NotificationManagerCompat by lazy {
        NotificationManagerCompat.from(context)
    }

    /**
     * Android 13+ POST_NOTIFICATIONS 권한 체크
     *
     * Android 12 이하에서는 항상 true를 반환합니다.
     * Android 13 이상에서는 POST_NOTIFICATIONS 권한이 부여되었는지 확인합니다.
     *
     * @return 알림 권한이 있으면 true, 없으면 false
     */
    fun hasNotificationPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            // Android 12 이하에서는 권한 체크 불필요
            true
        }
    }

    /**
     * 알림 권한 요청 필요 여부 확인
     *
     * Android 13 이상에서만 true를 반환할 수 있습니다.
     *
     * @return 알림 권한 요청이 필요하면 true
     */
    fun shouldRequestPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            !hasNotificationPermission()
        } else {
            false
        }
    }

    /**
     * 앱 전체 알림이 활성화되어 있는지 확인
     *
     * @return 앱 알림이 활성화되어 있으면 true
     */
    fun areNotificationsEnabled(): Boolean {
        return notificationManagerCompat.areNotificationsEnabled()
    }

    /**
     * 알림 채널 활성화 상태 체크
     *
     * Android 8.0 이상에서 해당 채널이 사용자에 의해 비활성화되었는지 확인합니다.
     * Android 8.0 미만에서는 항상 true를 반환합니다.
     *
     * @param channelId 확인할 알림 채널 ID
     * @return 채널이 활성화되어 있으면 true, 비활성화 또는 존재하지 않으면 false
     */
    fun isChannelEnabled(channelId: String): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = notificationManager.getNotificationChannel(channelId)
            channel?.importance != NotificationManager.IMPORTANCE_NONE
        } else {
            true
        }
    }

    /**
     * 추적 채널(Foreground Service용)이 활성화되어 있는지 확인
     *
     * @return 추적 채널이 활성화되어 있으면 true
     */
    fun isTrackingChannelEnabled(): Boolean {
        return isChannelEnabled(SubwayMateApp.CHANNEL_TRACKING)
    }

    /**
     * 알림 채널(도착 알림용)이 활성화되어 있는지 확인
     *
     * @return 알림 채널이 활성화되어 있으면 true
     */
    fun isAlertChannelEnabled(): Boolean {
        return isChannelEnabled(SubwayMateApp.CHANNEL_ALERT)
    }

    /**
     * 알림 채널 정보 조회
     *
     * @param channelId 조회할 채널 ID
     * @return NotificationChannel 객체, 없으면 null
     */
    fun getChannel(channelId: String): NotificationChannel? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            notificationManager.getNotificationChannel(channelId)
        } else {
            null
        }
    }

    /**
     * 앱 알림 설정 화면으로 이동
     *
     * 사용자가 알림을 비활성화한 경우 설정에서 직접 활성화할 수 있도록 합니다.
     */
    fun openNotificationSettings() {
        val intent = Intent().apply {
            when {
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O -> {
                    action = Settings.ACTION_APP_NOTIFICATION_SETTINGS
                    putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                }
                else -> {
                    action = Settings.ACTION_APPLICATION_DETAILS_SETTINGS
                    data = android.net.Uri.parse("package:${context.packageName}")
                }
            }
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        context.startActivity(intent)
    }

    /**
     * 특정 채널 설정 화면으로 이동
     *
     * Android 8.0 이상에서만 채널별 설정 화면으로 이동합니다.
     * Android 8.0 미만에서는 일반 알림 설정 화면으로 이동합니다.
     *
     * @param channelId 설정할 채널 ID
     */
    fun openChannelSettings(channelId: String) {
        val intent = Intent().apply {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                action = Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS
                putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                putExtra(Settings.EXTRA_CHANNEL_ID, channelId)
            } else {
                action = Settings.ACTION_APPLICATION_DETAILS_SETTINGS
                data = android.net.Uri.parse("package:${context.packageName}")
            }
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        context.startActivity(intent)
    }

    /**
     * 도착 알림 채널 설정 화면으로 이동
     */
    fun openAlertChannelSettings() {
        openChannelSettings(SubwayMateApp.CHANNEL_ALERT)
    }

    /**
     * 추적 채널 설정 화면으로 이동
     */
    fun openTrackingChannelSettings() {
        openChannelSettings(SubwayMateApp.CHANNEL_TRACKING)
    }

    /**
     * 알림 서비스 사용 가능 여부 종합 체크
     *
     * 권한, 앱 알림 활성화, 필수 채널 활성화 상태를 모두 확인합니다.
     *
     * @return 알림 서비스를 사용할 수 있으면 true
     */
    fun canShowNotifications(): Boolean {
        return hasNotificationPermission() &&
                areNotificationsEnabled() &&
                isAlertChannelEnabled()
    }

    /**
     * 알림 서비스 상태 정보 조회
     *
     * @return 현재 알림 서비스 상태 정보를 담은 NotificationStatus 객체
     */
    fun getNotificationStatus(): NotificationStatus {
        return NotificationStatus(
            hasPermission = hasNotificationPermission(),
            notificationsEnabled = areNotificationsEnabled(),
            trackingChannelEnabled = isTrackingChannelEnabled(),
            alertChannelEnabled = isAlertChannelEnabled()
        )
    }

    companion object {
        /**
         * POST_NOTIFICATIONS 권한 문자열 (Android 13+)
         */
        val NOTIFICATION_PERMISSION: String
            get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                Manifest.permission.POST_NOTIFICATIONS
            } else {
                ""
            }
    }
}

/**
 * 알림 서비스 상태 정보를 담는 data class
 *
 * @property hasPermission POST_NOTIFICATIONS 권한 보유 여부
 * @property notificationsEnabled 앱 알림 활성화 여부
 * @property trackingChannelEnabled 추적 채널 활성화 여부
 * @property alertChannelEnabled 알림 채널 활성화 여부
 */
data class NotificationStatus(
    val hasPermission: Boolean,
    val notificationsEnabled: Boolean,
    val trackingChannelEnabled: Boolean,
    val alertChannelEnabled: Boolean
) {
    /**
     * 모든 알림 기능이 사용 가능한지 확인
     */
    val isFullyEnabled: Boolean
        get() = hasPermission && notificationsEnabled && trackingChannelEnabled && alertChannelEnabled

    /**
     * 도착 알림 기능 사용 가능 여부
     */
    val canShowAlerts: Boolean
        get() = hasPermission && notificationsEnabled && alertChannelEnabled

    /**
     * 추적 서비스 알림 기능 사용 가능 여부
     */
    val canShowTracking: Boolean
        get() = hasPermission && notificationsEnabled && trackingChannelEnabled
}
