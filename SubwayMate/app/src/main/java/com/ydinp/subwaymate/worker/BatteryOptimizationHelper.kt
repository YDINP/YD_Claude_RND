package com.ydinp.subwaymate.worker

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 배터리 최적화 예외 요청을 위한 헬퍼 클래스
 *
 * Android의 Doze 모드 및 배터리 최적화는 앱의 백그라운드 동작을 제한합니다.
 * 이 클래스는 사용자에게 배터리 최적화 예외 설정을 요청하는 기능을 제공합니다.
 *
 * 주요 기능:
 * - 배터리 최적화 예외 상태 확인
 * - 배터리 최적화 예외 요청 다이얼로그 표시
 * - 배터리 최적화 설정 화면으로 이동
 */
@Singleton
class BatteryOptimizationHelper @Inject constructor(
    @ApplicationContext private val context: Context
) {
    /**
     * 현재 배터리 최적화 예외 상태 확인
     *
     * @return 배터리 최적화 예외가 설정되어 있으면 true
     */
    fun isIgnoringBatteryOptimizations(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true // 6.0 미만에서는 배터리 최적화 기능이 없음
        }

        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return powerManager.isIgnoringBatteryOptimizations(context.packageName)
    }

    /**
     * 배터리 최적화 예외 요청 Intent 생성
     *
     * 사용자에게 직접 예외 설정을 요청하는 시스템 다이얼로그를 표시합니다.
     * Activity에서 startActivity()로 호출해야 합니다.
     *
     * @return 배터리 최적화 예외 요청 Intent, 지원하지 않는 버전이면 null
     */
    fun createBatteryOptimizationExemptionIntent(): Intent? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return null
        }

        return Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${context.packageName}")
        }
    }

    /**
     * 배터리 최적화 설정 화면 Intent 생성
     *
     * 전체 배터리 최적화 설정 화면을 열 때 사용합니다.
     *
     * @return 배터리 최적화 설정 화면 Intent
     */
    fun createBatteryOptimizationSettingsIntent(): Intent {
        return Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
    }

    /**
     * 앱 설정 화면 Intent 생성
     *
     * 특정 앱의 배터리 사용량 설정 화면을 열 때 사용합니다.
     *
     * @return 앱 설정 화면 Intent
     */
    fun createAppSettingsIntent(): Intent {
        return Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:${context.packageName}")
        }
    }

    /**
     * Activity에서 배터리 최적화 예외 요청
     *
     * @param activity 호출하는 Activity
     * @return 성공 여부
     */
    fun requestBatteryOptimizationExemption(activity: android.app.Activity): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true
        }

        return try {
            val intent = createBatteryOptimizationExemptionIntent()
            if (intent != null) {
                activity.startActivity(intent)
                Log.d(TAG, "Battery optimization exemption request sent from Activity")
                true
            } else {
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to request battery optimization exemption from Activity", e)
            false
        }
    }

    /**
     * 배터리 최적화 예외 요청을 Application Context에서 시작
     *
     * FLAG_ACTIVITY_NEW_TASK 플래그가 필요합니다.
     *
     * @return 성공 여부
     */
    fun requestBatteryOptimizationExemptionFromContext(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true
        }

        return try {
            val intent = createBatteryOptimizationExemptionIntent()?.apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            if (intent != null) {
                context.startActivity(intent)
                Log.d(TAG, "Battery optimization exemption request sent")
                true
            } else {
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to request battery optimization exemption", e)
            false
        }
    }

    /**
     * 배터리 최적화가 필요한지 확인
     *
     * 배터리 최적화가 활성화되어 있고, 예외 설정이 되어 있지 않은 경우 true를 반환합니다.
     *
     * @return 배터리 최적화 예외 설정이 필요하면 true
     */
    fun shouldRequestBatteryOptimization(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return false
        }

        return !isIgnoringBatteryOptimizations()
    }

    companion object {
        private const val TAG = "BatteryOptHelper"

        /**
         * 배터리 최적화 예외 설정이 왜 필요한지 설명하는 메시지
         */
        const val EXPLANATION_MESSAGE = """
앱이 백그라운드에서 정확한 타이밍에 도착 알림을 보내려면 배터리 최적화 예외 설정이 필요합니다.

이 설정을 하지 않으면:
- Doze 모드에서 알림이 지연될 수 있습니다
- 예상보다 늦게 알림을 받을 수 있습니다

배터리 최적화 예외를 설정하시겠습니까?
"""

        /**
         * 다이얼로그 타이틀
         */
        const val DIALOG_TITLE = "배터리 최적화 예외 설정"

        /**
         * 확인 버튼 텍스트
         */
        const val POSITIVE_BUTTON_TEXT = "설정하기"

        /**
         * 취소 버튼 텍스트
         */
        const val NEGATIVE_BUTTON_TEXT = "나중에"
    }
}
