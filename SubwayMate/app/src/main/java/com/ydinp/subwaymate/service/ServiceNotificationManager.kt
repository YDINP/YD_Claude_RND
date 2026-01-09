package com.ydinp.subwaymate.service

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.ydinp.subwaymate.R
import com.ydinp.subwaymate.SubwayMateApp
import com.ydinp.subwaymate.domain.model.RideSession
import com.ydinp.subwaymate.domain.model.RideStatus
import com.ydinp.subwaymate.presentation.MainActivity
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Foreground Service 알림 생성 및 업데이트를 담당하는 헬퍼 클래스
 *
 * 추적 서비스의 현재 상태를 알림으로 표시하고,
 * 도착 임박 시 별도의 알림을 발송합니다.
 */
@Singleton
class ServiceNotificationManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val notificationManager: NotificationManager by lazy {
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    }

    /**
     * Foreground Service용 추적 알림 생성
     *
     * @param session 현재 탑승 세션 정보
     * @return Foreground Service에 사용할 Notification
     */
    fun createTrackingNotification(session: RideSession): Notification {
        val contentIntent = createContentIntent()
        val stopIntent = createStopIntent()

        val title = buildTrackingTitle(session)
        val content = buildTrackingContent(session)

        return NotificationCompat.Builder(context, SubwayMateApp.CHANNEL_TRACKING)
            .setContentTitle(title)
            .setContentText(content)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(contentIntent)
            .addAction(
                R.drawable.ic_launcher_foreground,
                context.getString(R.string.notification_action_stop),
                stopIntent
            )
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()
    }

    /**
     * 추적 알림 업데이트
     *
     * @param session 현재 탑승 세션 정보
     */
    fun updateTrackingNotification(session: RideSession) {
        val notification = createTrackingNotification(session)
        notificationManager.notify(TRACKING_NOTIFICATION_ID, notification)
    }

    /**
     * 도착 임박 알림 발송
     *
     * @param session 현재 탑승 세션 정보
     */
    fun sendArrivalAlert(session: RideSession) {
        val contentIntent = createContentIntent()

        val title = context.getString(R.string.notification_alert_title)
        val content = buildAlertContent(session)

        val notification = NotificationCompat.Builder(context, SubwayMateApp.CHANNEL_ALERT)
            .setContentTitle(title)
            .setContentText(content)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .build()

        notificationManager.notify(ALERT_NOTIFICATION_ID, notification)
    }

    /**
     * 도착 완료 알림 발송
     *
     * @param session 완료된 탑승 세션 정보
     */
    fun sendArrivalCompleteNotification(session: RideSession) {
        val contentIntent = createContentIntent()

        val title = context.getString(R.string.notification_arrived_title)
        val content = context.getString(
            R.string.notification_arrived_content,
            session.arrivalStation.name
        )

        val notification = NotificationCompat.Builder(context, SubwayMateApp.CHANNEL_ALERT)
            .setContentTitle(title)
            .setContentText(content)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()

        notificationManager.notify(ARRIVAL_COMPLETE_NOTIFICATION_ID, notification)
    }

    /**
     * 알림 클릭 시 앱으로 이동하는 PendingIntent 생성
     */
    private fun createContentIntent(): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            action = ACTION_OPEN_APP
        }

        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        return PendingIntent.getActivity(context, REQUEST_CODE_OPEN_APP, intent, flags)
    }

    /**
     * 추적 중지 버튼용 PendingIntent 생성
     */
    private fun createStopIntent(): PendingIntent {
        val intent = Intent(context, TrackingService::class.java).apply {
            action = TrackingService.ACTION_STOP
        }

        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        return PendingIntent.getService(context, REQUEST_CODE_STOP, intent, flags)
    }

    /**
     * 추적 알림 제목 생성
     */
    private fun buildTrackingTitle(session: RideSession): String {
        return context.getString(
            R.string.notification_tracking_title,
            session.departureStation.name,
            session.arrivalStation.name
        )
    }

    /**
     * 추적 알림 내용 생성
     */
    private fun buildTrackingContent(session: RideSession): String {
        return when (session.status) {
            RideStatus.BOARDING -> context.getString(R.string.notification_status_boarding)
            RideStatus.IN_TRANSIT -> {
                if (session.remainingStations > 0) {
                    context.getString(
                        R.string.notification_status_in_transit,
                        session.remainingStations
                    )
                } else {
                    context.getString(R.string.notification_status_moving)
                }
            }
            RideStatus.APPROACHING -> context.getString(
                R.string.notification_status_approaching,
                session.remainingStations
            )
            RideStatus.ARRIVED -> context.getString(R.string.notification_status_arrived)
        }
    }

    /**
     * 도착 임박 알림 내용 생성
     */
    private fun buildAlertContent(session: RideSession): String {
        return context.getString(
            R.string.notification_alert_content,
            session.arrivalStation.name,
            session.remainingStations
        )
    }

    /**
     * 모든 알림 취소
     */
    fun cancelAllNotifications() {
        notificationManager.cancel(TRACKING_NOTIFICATION_ID)
        notificationManager.cancel(ALERT_NOTIFICATION_ID)
    }

    /**
     * 추적 알림만 취소
     */
    fun cancelTrackingNotification() {
        notificationManager.cancel(TRACKING_NOTIFICATION_ID)
    }

    companion object {
        /** Foreground Service 추적 알림 ID */
        const val TRACKING_NOTIFICATION_ID = 1001

        /** 도착 임박 알림 ID */
        const val ALERT_NOTIFICATION_ID = 1002

        /** 도착 완료 알림 ID */
        const val ARRIVAL_COMPLETE_NOTIFICATION_ID = 1003

        /** 앱 열기 요청 코드 */
        private const val REQUEST_CODE_OPEN_APP = 100

        /** 추적 중지 요청 코드 */
        private const val REQUEST_CODE_STOP = 101

        /** 앱 열기 액션 */
        const val ACTION_OPEN_APP = "com.ydinp.subwaymate.ACTION_OPEN_APP"
    }
}
