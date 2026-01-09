package com.ydinp.subwaymate.domain.model

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

/**
 * 도착 알림 설정을 나타내는 data class
 *
 * 사용자가 설정한 알림 조건과 알림 방식을 저장합니다.
 * N역 전 또는 N분 전 조건에 따라 알림을 트리거합니다.
 *
 * @property stationsBefore 도착역 N역 전에 알림 (0이면 비활성화)
 * @property minutesBefore 도착 N분 전에 알림 (0이면 비활성화)
 * @property soundEnabled 알림 소리 활성화 여부
 * @property vibrationEnabled 진동 알림 활성화 여부
 * @property repeatCount 알림 반복 횟수 (1~5, 기본값 1)
 * @property repeatIntervalSeconds 반복 알림 간격 (초 단위)
 */
@Parcelize
data class AlertSetting(
    val stationsBefore: Int = DEFAULT_STATIONS_BEFORE,
    val minutesBefore: Int = DEFAULT_MINUTES_BEFORE,
    val soundEnabled: Boolean = true,
    val vibrationEnabled: Boolean = true,
    val repeatCount: Int = DEFAULT_REPEAT_COUNT,
    val repeatIntervalSeconds: Int = DEFAULT_REPEAT_INTERVAL_SECONDS
) : Parcelable {
    init {
        require(stationsBefore >= 0) { "stationsBefore must be non-negative" }
        require(minutesBefore >= 0) { "minutesBefore must be non-negative" }
        require(repeatCount in 1..MAX_REPEAT_COUNT) { "repeatCount must be between 1 and $MAX_REPEAT_COUNT" }
        require(repeatIntervalSeconds >= MIN_REPEAT_INTERVAL) { "repeatIntervalSeconds must be at least $MIN_REPEAT_INTERVAL" }
    }

    /**
     * 역 기반 알림이 활성화되어 있는지 확인
     *
     * @return N역 전 알림이 설정되어 있으면 true
     */
    fun isStationAlertEnabled(): Boolean = stationsBefore > 0

    /**
     * 시간 기반 알림이 활성화되어 있는지 확인
     *
     * @return N분 전 알림이 설정되어 있으면 true
     */
    fun isTimeAlertEnabled(): Boolean = minutesBefore > 0

    /**
     * 알림이 활성화되어 있는지 확인 (역 또는 시간 기반)
     *
     * @return 적어도 하나의 알림 조건이 설정되어 있으면 true
     */
    fun isAlertEnabled(): Boolean = isStationAlertEnabled() || isTimeAlertEnabled()

    /**
     * 알림을 받을 수 있는 상태인지 확인 (소리 또는 진동)
     *
     * @return 소리나 진동 중 하나라도 활성화되어 있으면 true
     */
    fun canReceiveAlert(): Boolean = soundEnabled || vibrationEnabled

    /**
     * 남은 역 수를 기반으로 알림을 보내야 하는지 확인
     *
     * @param remainingStations 도착역까지 남은 역 수
     * @return 알림 조건을 충족하면 true
     */
    fun shouldAlertByStations(remainingStations: Int): Boolean {
        return isStationAlertEnabled() && remainingStations <= stationsBefore
    }

    /**
     * 남은 시간을 기반으로 알림을 보내야 하는지 확인
     *
     * @param remainingMinutes 도착까지 남은 시간 (분)
     * @return 알림 조건을 충족하면 true
     */
    fun shouldAlertByTime(remainingMinutes: Int): Boolean {
        return isTimeAlertEnabled() && remainingMinutes <= minutesBefore
    }

    companion object {
        /** 기본 N역 전 알림 설정 */
        const val DEFAULT_STATIONS_BEFORE = 2

        /** 기본 N분 전 알림 설정 */
        const val DEFAULT_MINUTES_BEFORE = 0

        /** 기본 반복 횟수 */
        const val DEFAULT_REPEAT_COUNT = 1

        /** 기본 반복 간격 (초) */
        const val DEFAULT_REPEAT_INTERVAL_SECONDS = 30

        /** 최대 반복 횟수 */
        const val MAX_REPEAT_COUNT = 5

        /** 최소 반복 간격 (초) */
        const val MIN_REPEAT_INTERVAL = 10

        /**
         * 기본 알림 설정을 반환
         *
         * @return 기본값이 적용된 AlertSetting 인스턴스
         */
        fun default(): AlertSetting = AlertSetting()

        /**
         * 무음 알림 설정을 반환 (진동만 활성화)
         *
         * @return 진동만 활성화된 AlertSetting 인스턴스
         */
        fun silentWithVibration(): AlertSetting = AlertSetting(
            soundEnabled = false,
            vibrationEnabled = true
        )
    }
}
