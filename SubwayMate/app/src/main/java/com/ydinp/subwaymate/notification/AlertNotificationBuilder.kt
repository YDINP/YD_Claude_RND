package com.ydinp.subwaymate.notification

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import androidx.core.app.NotificationCompat
import com.ydinp.subwaymate.R
import com.ydinp.subwaymate.SubwayMateApp
import com.ydinp.subwaymate.domain.model.Line
import com.ydinp.subwaymate.domain.model.RideSession
import com.ydinp.subwaymate.domain.model.Station
import com.ydinp.subwaymate.presentation.MainActivity
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 도착 알림 전용 Notification 빌더
 *
 * 도착 임박, 도착 완료, 환승 등 다양한 상황에 맞는 알림을 생성합니다.
 * 알림 스타일, 액션, PendingIntent 등을 관리합니다.
 */
@Singleton
class AlertNotificationBuilder @Inject constructor(
    @ApplicationContext private val context: Context
) {
    /**
     * 도착 임박 알림 생성 (N역 전)
     *
     * 사용자가 설정한 도착 전 알림 조건을 충족했을 때 표시되는 알림입니다.
     *
     * @param session 현재 탑승 세션 정보
     * @param stationsRemaining 남은 역 수
     * @return 도착 임박 알림 Notification
     */
    fun buildApproachingAlert(
        session: RideSession,
        stationsRemaining: Int
    ): Notification {
        val title = context.getString(R.string.notification_alert_title)
        val content = context.getString(
            R.string.notification_alert_content,
            session.arrivalStation.name,
            stationsRemaining
        )

        val bigText = buildApproachingBigText(session, stationsRemaining)

        return NotificationCompat.Builder(context, SubwayMateApp.CHANNEL_ALERT)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(content)
            .setStyle(
                createBigTextStyle(
                    title = title,
                    bigText = bigText,
                    summaryText = "${session.line.name} ${session.arrivalStation.name}행"
                )
            )
            .setContentIntent(createContentIntent(ACTION_OPEN_TRACKING))
            .setDeleteIntent(createDismissIntent())
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setColor(getLineColor(session.line))
            .setColorized(true)
            .addAction(createDismissAction())
            .addAction(createStopTrackingAction())
            .setOngoing(false)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
            .build()
    }

    /**
     * 긴급 도착 알림 생성 (1역 전)
     *
     * 도착 1역 전 긴급 알림으로, 더 강조된 스타일을 사용합니다.
     *
     * @param session 현재 탑승 세션 정보
     * @return 긴급 도착 임박 알림 Notification
     */
    fun buildUrgentAlert(session: RideSession): Notification {
        val title = "지금 내릴 준비하세요!"
        val content = "${session.arrivalStation.name}역 1역 전입니다"

        val bigText = """
            |$content
            |
            |노선: ${session.line.name}
            |도착역: ${session.arrivalStation.name}
            |
            |다음 역이 하차역입니다. 내릴 준비를 해주세요.
        """.trimMargin()

        return NotificationCompat.Builder(context, SubwayMateApp.CHANNEL_ALERT)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(content)
            .setStyle(
                createBigTextStyle(
                    title = title,
                    bigText = bigText,
                    summaryText = "긴급 알림"
                )
            )
            .setContentIntent(createContentIntent(ACTION_OPEN_TRACKING))
            .setDeleteIntent(createDismissIntent())
            .setAutoCancel(false)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setColor(Color.RED)
            .setColorized(true)
            .setOngoing(true)
            .setFullScreenIntent(createContentIntent(ACTION_OPEN_TRACKING), true)
            .addAction(createDismissAction())
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
            .build()
    }

    /**
     * 도착 완료 알림 생성
     *
     * 목적지에 도착했을 때 표시되는 알림입니다.
     *
     * @param station 도착한 역 정보
     * @return 도착 완료 알림 Notification
     */
    fun buildArrivalComplete(station: Station): Notification {
        val title = context.getString(R.string.notification_arrived_title)
        val content = context.getString(R.string.notification_arrived_content, station.name)

        val bigText = """
            |$content
            |
            |안전하게 하차해 주세요.
            |좋은 하루 되세요!
        """.trimMargin()

        return NotificationCompat.Builder(context, SubwayMateApp.CHANNEL_ALERT)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(content)
            .setStyle(
                createBigTextStyle(
                    title = title,
                    bigText = bigText,
                    summaryText = "도착 완료"
                )
            )
            .setContentIntent(createContentIntent(ACTION_OPEN_APP))
            .setDeleteIntent(createDismissIntent())
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_SOUND or NotificationCompat.DEFAULT_VIBRATE)
            .setColor(Color.GREEN)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
            .build()
    }

    /**
     * 환승 알림 생성 (Phase 2)
     *
     * 환승역에 도착했을 때 다음 노선으로의 환승을 안내하는 알림입니다.
     *
     * @param currentStation 현재 역 (환승역)
     * @param nextLine 다음 탑승할 노선
     * @return 환승 알림 Notification
     */
    fun buildTransferAlert(
        currentStation: Station,
        nextLine: Line
    ): Notification {
        val title = "환승역 도착"
        val content = "${currentStation.name}역에서 ${nextLine.name}으로 환승하세요"

        val bigText = """
            |${currentStation.name}역에 도착했습니다.
            |
            |환승 노선: ${nextLine.name}
            |
            |환승 안내를 따라 이동해 주세요.
        """.trimMargin()

        return NotificationCompat.Builder(context, SubwayMateApp.CHANNEL_ALERT)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(content)
            .setStyle(
                createBigTextStyle(
                    title = title,
                    bigText = bigText,
                    summaryText = "환승 안내"
                )
            )
            .setContentIntent(createContentIntent(ACTION_OPEN_TRACKING))
            .setDeleteIntent(createDismissIntent())
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setColor(nextLine.colorAsInt())
            .setColorized(true)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
            .build()
    }

    /**
     * BigTextStyle 생성
     *
     * @param title 알림 제목
     * @param bigText 확장 시 표시할 큰 텍스트
     * @param summaryText 요약 텍스트
     * @return NotificationCompat.BigTextStyle 객체
     */
    private fun createBigTextStyle(
        title: String,
        bigText: String,
        summaryText: String
    ): NotificationCompat.BigTextStyle {
        return NotificationCompat.BigTextStyle()
            .setBigContentTitle(title)
            .bigText(bigText)
            .setSummaryText(summaryText)
    }

    /**
     * 도착 임박 알림의 확장 텍스트 생성
     */
    private fun buildApproachingBigText(session: RideSession, stationsRemaining: Int): String {
        val remainingMinutes = session.getEstimatedRemainingMinutes()
        val timeInfo = remainingMinutes?.let { "약 ${it}분 후 도착 예정" } ?: ""

        return """
            |${session.arrivalStation.name}역까지 ${stationsRemaining}역 남았습니다.
            |$timeInfo
            |
            |노선: ${session.line.name}
            |현재역: ${session.currentStation?.name ?: session.departureStation.name}
            |도착역: ${session.arrivalStation.name}
        """.trimMargin()
    }

    /**
     * 앱 또는 화면으로 이동하는 ContentIntent 생성
     *
     * @param action 수행할 액션
     * @return PendingIntent
     */
    private fun createContentIntent(action: String): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            this.action = action
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        return PendingIntent.getActivity(
            context,
            REQUEST_CODE_CONTENT,
            intent,
            flags
        )
    }

    /**
     * 알림 스와이프 삭제 시 호출되는 DismissIntent 생성
     *
     * @return PendingIntent
     */
    private fun createDismissIntent(): PendingIntent {
        val intent = Intent(context, AlertDismissReceiver::class.java).apply {
            action = ACTION_DISMISS_ALERT
        }

        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        return PendingIntent.getBroadcast(
            context,
            REQUEST_CODE_DISMISS,
            intent,
            flags
        )
    }

    /**
     * 추적 중지 액션 Intent 생성
     */
    private fun createStopTrackingIntent(): PendingIntent {
        val intent = Intent(context, AlertActionReceiver::class.java).apply {
            action = ACTION_STOP_TRACKING
        }

        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        return PendingIntent.getBroadcast(
            context,
            REQUEST_CODE_STOP,
            intent,
            flags
        )
    }

    /**
     * 확인 (닫기) 액션 생성
     */
    private fun createDismissAction(): NotificationCompat.Action {
        return NotificationCompat.Action.Builder(
            R.drawable.ic_launcher_foreground,
            "확인",
            createDismissIntent()
        ).build()
    }

    /**
     * 추적 중지 액션 생성
     */
    private fun createStopTrackingAction(): NotificationCompat.Action {
        return NotificationCompat.Action.Builder(
            R.drawable.ic_launcher_foreground,
            context.getString(R.string.notification_action_stop),
            createStopTrackingIntent()
        ).build()
    }

    /**
     * 노선 색상 가져오기
     */
    private fun getLineColor(line: Line): Int {
        return try {
            line.colorAsInt()
        } catch (e: Exception) {
            Color.BLUE
        }
    }

    companion object {
        /** 알림 ID: 도착 임박 */
        const val NOTIFICATION_ID_APPROACHING = 2001

        /** 알림 ID: 긴급 알림 (1역 전) */
        const val NOTIFICATION_ID_URGENT = 2002

        /** 알림 ID: 도착 완료 */
        const val NOTIFICATION_ID_ARRIVAL_COMPLETE = 2003

        /** 알림 ID: 환승 안내 */
        const val NOTIFICATION_ID_TRANSFER = 2004

        /** 앱 열기 액션 */
        const val ACTION_OPEN_APP = "com.ydinp.subwaymate.ACTION_OPEN_APP"

        /** 추적 화면 열기 액션 */
        const val ACTION_OPEN_TRACKING = "com.ydinp.subwaymate.ACTION_OPEN_TRACKING"

        /** 알림 닫기 액션 */
        const val ACTION_DISMISS_ALERT = "com.ydinp.subwaymate.ACTION_DISMISS_ALERT"

        /** 추적 중지 액션 */
        const val ACTION_STOP_TRACKING = "com.ydinp.subwaymate.ACTION_STOP_TRACKING"

        /** ContentIntent 요청 코드 */
        private const val REQUEST_CODE_CONTENT = 200

        /** DismissIntent 요청 코드 */
        private const val REQUEST_CODE_DISMISS = 201

        /** StopIntent 요청 코드 */
        private const val REQUEST_CODE_STOP = 202
    }
}
