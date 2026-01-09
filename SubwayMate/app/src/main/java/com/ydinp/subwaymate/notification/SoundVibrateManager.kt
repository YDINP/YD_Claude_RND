package com.ydinp.subwaymate.notification

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.annotation.RawRes
import com.ydinp.subwaymate.R
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 알림 소리 및 진동 관리 클래스
 *
 * 도착 알림 시 커스텀 사운드 재생, 진동 패턴 실행,
 * 반복 알림 등의 기능을 제공합니다.
 */
@Singleton
class SoundVibrateManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val vibrator: Vibrator by lazy {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vibratorManager.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
    }

    private val audioManager: AudioManager by lazy {
        context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    }

    private var mediaPlayer: MediaPlayer? = null
    private var alertVolume: Float = 1.0f
    private val handler = Handler(Looper.getMainLooper())
    private val isRepeating = AtomicBoolean(false)
    private var repeatRunnable: Runnable? = null

    /**
     * 커스텀 알림 소리 재생
     *
     * res/raw/arrival_alert.mp3 파일이 있으면 해당 파일을 재생하고,
     * 없으면 시스템 기본 알림음을 재생합니다.
     */
    fun playAlertSound() {
        try {
            releaseMediaPlayer()

            // 커스텀 사운드 파일 시도
            val customSoundResId = getCustomSoundResId()
            if (customSoundResId != 0) {
                playCustomSound(customSoundResId)
            } else {
                playDefaultNotificationSound()
            }
        } catch (e: Exception) {
            // 소리 재생 실패 시 기본 알림음 시도
            playDefaultNotificationSound()
        }
    }

    /**
     * 긴급 알림 소리 재생 (더 큰 소리)
     */
    fun playUrgentAlertSound() {
        val originalVolume = alertVolume
        alertVolume = 1.0f
        playAlertSound()
        alertVolume = originalVolume
    }

    /**
     * res/raw 폴더에서 커스텀 사운드 리소스 ID 가져오기
     */
    @RawRes
    private fun getCustomSoundResId(): Int {
        return try {
            context.resources.getIdentifier("arrival_alert", "raw", context.packageName)
        } catch (e: Exception) {
            0
        }
    }

    /**
     * 커스텀 사운드 파일 재생
     */
    private fun playCustomSound(@RawRes resId: Int) {
        mediaPlayer = MediaPlayer.create(context, resId)?.apply {
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            setVolume(alertVolume, alertVolume)
            setOnCompletionListener { mp ->
                mp.release()
                if (mediaPlayer == mp) {
                    mediaPlayer = null
                }
            }
            start()
        }
    }

    /**
     * 시스템 기본 알림음 재생
     */
    private fun playDefaultNotificationSound() {
        try {
            val defaultUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                setDataSource(context, defaultUri)
                setVolume(alertVolume, alertVolume)
                setOnCompletionListener { mp ->
                    mp.release()
                    if (mediaPlayer == mp) {
                        mediaPlayer = null
                    }
                }
                prepare()
                start()
            }
        } catch (e: Exception) {
            // 기본 알림음도 재생 실패하면 무시
        }
    }

    /**
     * 진동 패턴 실행
     *
     * @param pattern 진동 패턴 배열 (밀리초 단위)
     *                첫 번째 값은 대기 시간, 이후 진동과 대기가 번갈아 옴
     */
    fun vibrate(pattern: LongArray = DEFAULT_VIBRATE_PATTERN) {
        if (!hasVibrator()) return

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val effect = VibrationEffect.createWaveform(pattern, -1)
                vibrator.vibrate(effect)
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(pattern, -1)
            }
        } catch (e: Exception) {
            // 진동 실패 시 무시
        }
    }

    /**
     * 한 번 진동
     *
     * @param duration 진동 시간 (밀리초)
     */
    fun vibrateOnce(duration: Long = 500) {
        if (!hasVibrator()) return

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val effect = VibrationEffect.createOneShot(
                    duration,
                    VibrationEffect.DEFAULT_AMPLITUDE
                )
                vibrator.vibrate(effect)
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(duration)
            }
        } catch (e: Exception) {
            // 진동 실패 시 무시
        }
    }

    /**
     * 긴급 진동 패턴 실행
     */
    fun vibrateUrgent() {
        vibrate(URGENT_VIBRATE_PATTERN)
    }

    /**
     * 소리와 진동 동시 실행
     *
     * 사용자 설정에 따라 소리와 진동을 함께 실행합니다.
     *
     * @param playSound 소리 재생 여부
     * @param doVibrate 진동 실행 여부
     */
    fun alertWithSoundAndVibration(playSound: Boolean = true, doVibrate: Boolean = true) {
        if (playSound) {
            playAlertSound()
        }
        if (doVibrate) {
            vibrate()
        }
    }

    /**
     * 긴급 알림 (소리 + 진동)
     */
    fun alertUrgent(playSound: Boolean = true, doVibrate: Boolean = true) {
        if (playSound) {
            playUrgentAlertSound()
        }
        if (doVibrate) {
            vibrateUrgent()
        }
    }

    /**
     * 반복 알림 시작
     *
     * 지정된 간격으로 소리와 진동을 반복합니다.
     * 이미 반복 중이면 기존 반복을 중지하고 새로 시작합니다.
     *
     * @param intervalMs 반복 간격 (밀리초, 기본 30초)
     * @param playSound 소리 재생 여부
     * @param doVibrate 진동 실행 여부
     */
    fun startRepeatingAlert(
        intervalMs: Long = DEFAULT_REPEAT_INTERVAL,
        playSound: Boolean = true,
        doVibrate: Boolean = true
    ) {
        stopRepeatingAlert()

        isRepeating.set(true)

        repeatRunnable = object : Runnable {
            override fun run() {
                if (isRepeating.get()) {
                    alertWithSoundAndVibration(playSound, doVibrate)
                    handler.postDelayed(this, intervalMs)
                }
            }
        }

        // 첫 번째 알림 즉시 실행
        alertWithSoundAndVibration(playSound, doVibrate)
        // 이후 반복
        handler.postDelayed(repeatRunnable!!, intervalMs)
    }

    /**
     * 반복 알림 중지
     */
    fun stopRepeatingAlert() {
        isRepeating.set(false)
        repeatRunnable?.let { handler.removeCallbacks(it) }
        repeatRunnable = null
        stopCurrentSound()
        cancelVibration()
    }

    /**
     * 알림음 볼륨 설정
     *
     * @param volume 볼륨 값 (0.0 ~ 1.0)
     */
    fun setAlertVolume(volume: Float) {
        alertVolume = volume.coerceIn(0f, 1f)
        mediaPlayer?.setVolume(alertVolume, alertVolume)
    }

    /**
     * 현재 알림음 볼륨 가져오기
     */
    fun getAlertVolume(): Float = alertVolume

    /**
     * 현재 재생 중인 소리 중지
     */
    fun stopCurrentSound() {
        try {
            mediaPlayer?.stop()
        } catch (e: Exception) {
            // 무시
        }
        releaseMediaPlayer()
    }

    /**
     * 진동 취소
     */
    fun cancelVibration() {
        try {
            vibrator.cancel()
        } catch (e: Exception) {
            // 무시
        }
    }

    /**
     * 모든 알림(소리/진동) 중지
     */
    fun stopAll() {
        stopRepeatingAlert()
        stopCurrentSound()
        cancelVibration()
    }

    /**
     * 기기에 진동 기능이 있는지 확인
     */
    fun hasVibrator(): Boolean {
        return vibrator.hasVibrator()
    }

    /**
     * 기기에 진동 진폭 조절 기능이 있는지 확인 (Android O+)
     */
    fun hasAmplitudeControl(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.hasAmplitudeControl()
        } else {
            false
        }
    }

    /**
     * 현재 벨소리 모드 확인
     *
     * @return AudioManager.RINGER_MODE_* 값
     */
    fun getRingerMode(): Int {
        return audioManager.ringerMode
    }

    /**
     * 무음 모드인지 확인
     */
    fun isSilentMode(): Boolean {
        return audioManager.ringerMode == AudioManager.RINGER_MODE_SILENT
    }

    /**
     * 진동 모드인지 확인
     */
    fun isVibrateMode(): Boolean {
        return audioManager.ringerMode == AudioManager.RINGER_MODE_VIBRATE
    }

    /**
     * 일반 모드인지 확인
     */
    fun isNormalMode(): Boolean {
        return audioManager.ringerMode == AudioManager.RINGER_MODE_NORMAL
    }

    /**
     * 현재 모드에 맞게 알림 실행
     *
     * - 일반 모드: 소리 + 진동
     * - 진동 모드: 진동만
     * - 무음 모드: 아무것도 안 함
     */
    fun alertBasedOnRingerMode() {
        when (audioManager.ringerMode) {
            AudioManager.RINGER_MODE_NORMAL -> alertWithSoundAndVibration(true, true)
            AudioManager.RINGER_MODE_VIBRATE -> alertWithSoundAndVibration(false, true)
            AudioManager.RINGER_MODE_SILENT -> { /* 무음 - 아무것도 안 함 */ }
        }
    }

    /**
     * MediaPlayer 리소스 해제
     */
    private fun releaseMediaPlayer() {
        try {
            mediaPlayer?.release()
        } catch (e: Exception) {
            // 무시
        }
        mediaPlayer = null
    }

    /**
     * 리소스 정리 (앱 종료 시 호출)
     */
    fun release() {
        stopAll()
        releaseMediaPlayer()
    }

    companion object {
        /** 기본 진동 패턴: 대기 0ms -> 진동 500ms -> 대기 200ms -> 진동 500ms */
        val DEFAULT_VIBRATE_PATTERN = longArrayOf(0, 500, 200, 500)

        /** 긴급 진동 패턴: 더 길고 강한 진동 */
        val URGENT_VIBRATE_PATTERN = longArrayOf(0, 1000, 500, 1000, 500, 1000)

        /** 짧은 진동 패턴 */
        val SHORT_VIBRATE_PATTERN = longArrayOf(0, 300)

        /** 기본 반복 간격: 30초 */
        const val DEFAULT_REPEAT_INTERVAL = 30_000L

        /** 긴급 반복 간격: 15초 */
        const val URGENT_REPEAT_INTERVAL = 15_000L
    }
}
