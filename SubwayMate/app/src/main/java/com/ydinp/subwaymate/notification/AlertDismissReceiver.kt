package com.ydinp.subwaymate.notification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * 알림 스와이프 삭제 시 호출되는 BroadcastReceiver
 *
 * 사용자가 알림을 스와이프하여 닫을 때 반복 알림을 중지하고
 * 필요한 정리 작업을 수행합니다.
 */
@AndroidEntryPoint
class AlertDismissReceiver : BroadcastReceiver() {

    @Inject
    lateinit var soundVibrateManager: SoundVibrateManager

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            AlertNotificationBuilder.ACTION_DISMISS_ALERT -> {
                // 반복 알림 중지
                soundVibrateManager.stopRepeatingAlert()
            }
        }
    }
}
