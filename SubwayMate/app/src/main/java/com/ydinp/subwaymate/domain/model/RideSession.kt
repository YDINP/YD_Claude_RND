package com.ydinp.subwaymate.domain.model

import java.time.LocalDateTime
import java.util.UUID

/**
 * 사용자의 탑승 세션 정보를 나타내는 data class
 *
 * 사용자가 출발역에서 도착역까지 이동하는 하나의 탑승 여정을 나타냅니다.
 * 탑승 시작부터 도착까지의 상태를 추적하고, 알림 설정에 따라 도착 알림을 제공합니다.
 *
 * @property id 세션 고유 식별자
 * @property departureStation 출발역 정보
 * @property arrivalStation 도착역 정보
 * @property line 탑승 노선 정보
 * @property direction 열차 운행 방향
 * @property startTime 탑승 시작 시각
 * @property currentStation 현재 위치한 역 (null이면 출발 전 또는 이동 중)
 * @property status 현재 탑승 상태
 * @property alertSetting 알림 설정
 * @property remainingStations 도착역까지 남은 역 수
 * @property estimatedArrivalTime 예상 도착 시각
 * @property trackedTrainNo 추적 중인 열차 번호 (null이면 아직 열차 미지정)
 * @property alertSent 알림 발송 여부
 */
data class RideSession(
    val id: String = UUID.randomUUID().toString(),
    val departureStation: Station,
    val arrivalStation: Station,
    val line: Line,
    val direction: Direction,
    val startTime: LocalDateTime = LocalDateTime.now(),
    val currentStation: Station? = null,
    val status: RideStatus = RideStatus.BOARDING,
    val alertSetting: AlertSetting = AlertSetting.default(),
    val remainingStations: Int = 0,
    val estimatedArrivalTime: LocalDateTime? = null,
    val trackedTrainNo: String? = null,
    val alertSent: Boolean = false
) {
    /**
     * 세션이 활성 상태인지 확인
     *
     * @return 도착 완료되지 않았으면 true
     */
    fun isActive(): Boolean = status.isActive()

    /**
     * 알림을 보내야 하는지 확인
     *
     * @return 알림 조건 충족하고 아직 알림을 보내지 않았으면 true
     */
    fun shouldSendAlert(): Boolean {
        if (alertSent) return false

        val byStations = alertSetting.shouldAlertByStations(remainingStations)
        val byTime = estimatedArrivalTime?.let { eta ->
            val minutesRemaining = java.time.Duration.between(
                LocalDateTime.now(),
                eta
            ).toMinutes().toInt()
            alertSetting.shouldAlertByTime(minutesRemaining)
        } ?: false

        return byStations || byTime
    }

    /**
     * 현재 위치를 업데이트하고 상태를 갱신한 새 세션을 반환
     *
     * @param newCurrentStation 새로운 현재 역
     * @param newRemainingStations 새로운 남은 역 수
     * @param newEstimatedArrivalTime 새로운 예상 도착 시각
     * @return 업데이트된 RideSession
     */
    fun updateLocation(
        newCurrentStation: Station,
        newRemainingStations: Int,
        newEstimatedArrivalTime: LocalDateTime? = null
    ): RideSession {
        val newStatus = RideStatus.fromRemainingStations(
            remainingStations = newRemainingStations,
            alertStationsBefore = alertSetting.stationsBefore
        )

        return copy(
            currentStation = newCurrentStation,
            remainingStations = newRemainingStations,
            estimatedArrivalTime = newEstimatedArrivalTime,
            status = newStatus
        )
    }

    /**
     * 알림 발송 상태를 업데이트한 새 세션을 반환
     *
     * @return alertSent가 true로 설정된 RideSession
     */
    fun markAlertSent(): RideSession = copy(alertSent = true)

    /**
     * 추적할 열차를 지정한 새 세션을 반환
     *
     * @param trainNo 추적할 열차 번호
     * @return trackedTrainNo가 설정된 RideSession
     */
    fun assignTrain(trainNo: String): RideSession = copy(
        trackedTrainNo = trainNo,
        status = RideStatus.IN_TRANSIT
    )

    /**
     * 세션을 완료 상태로 변경한 새 세션을 반환
     *
     * @return 도착 상태로 변경된 RideSession
     */
    fun complete(): RideSession = copy(
        status = RideStatus.ARRIVED,
        currentStation = arrivalStation,
        remainingStations = 0
    )

    /**
     * 탑승 진행률을 계산 (0.0 ~ 1.0)
     *
     * @param totalStations 총 역 수 (출발역 → 도착역)
     * @return 진행률 (0.0: 출발, 1.0: 도착)
     */
    fun calculateProgress(totalStations: Int): Float {
        if (totalStations <= 0) return 0f
        return ((totalStations - remainingStations).toFloat() / totalStations).coerceIn(0f, 1f)
    }

    /**
     * 예상 남은 시간을 분 단위로 계산
     *
     * @return 남은 시간 (분), 계산 불가능하면 null
     */
    fun getEstimatedRemainingMinutes(): Int? {
        return estimatedArrivalTime?.let { eta ->
            java.time.Duration.between(LocalDateTime.now(), eta)
                .toMinutes()
                .toInt()
                .coerceAtLeast(0)
        }
    }

    companion object {
        /**
         * 새로운 탑승 세션을 생성
         *
         * @param departure 출발역
         * @param arrival 도착역
         * @param line 탑승 노선
         * @param direction 운행 방향
         * @param alertSetting 알림 설정 (기본값 사용 가능)
         * @return 새로 생성된 RideSession
         */
        fun create(
            departure: Station,
            arrival: Station,
            line: Line,
            direction: Direction,
            alertSetting: AlertSetting = AlertSetting.default()
        ): RideSession {
            return RideSession(
                departureStation = departure,
                arrivalStation = arrival,
                line = line,
                direction = direction,
                alertSetting = alertSetting
            )
        }
    }
}
