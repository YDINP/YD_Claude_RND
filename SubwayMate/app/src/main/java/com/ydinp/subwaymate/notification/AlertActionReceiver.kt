package com.ydinp.subwaymate.notification

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.ydinp.subwaymate.service.TrackingService
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * 알림 액션 버튼 클릭 시 호출되는 BroadcastReceiver
 *
 * 알림의 액션 버튼(추적 중지 등)을 처리합니다.
 */
@AndroidEntryPoint
class AlertActionReceiver : BroadcastReceiver() {

    @Inject
    lateinit var soundVibrateManager: SoundVibrateManager

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            AlertNotificationBuilder.ACTION_STOP_TRACKING -> {
                // 추적 서비스 중지
                stopTrackingService(context)
                // 반복 알림 중지
                soundVibrateManager.stopAll()
                // 알림 닫기
                cancelAlertNotifications(context)
            }
        }
    }

    private fun stopTrackingService(context: Context) {
        val stopIntent = Intent(context, TrackingService::class.java).apply {
            action = TrackingService.ACTION_STOP
        }
        context.startService(stopIntent)
    }

    private fun cancelAlertNotifications(context: Context) {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.cancel(AlertNotificationBuilder.NOTIFICATION_ID_APPROACHING)
        notificationManager.cancel(AlertNotificationBuilder.NOTIFICATION_ID_URGENT)
        notificationManager.cancel(AlertNotificationBuilder.NOTIFICATION_ID_ARRIVAL_COMPLETE)
        notificationManager.cancel(AlertNotificationBuilder.NOTIFICATION_ID_TRANSFER)
    }
}
