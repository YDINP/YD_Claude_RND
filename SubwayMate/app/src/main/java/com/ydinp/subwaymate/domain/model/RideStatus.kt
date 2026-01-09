package com.ydinp.subwaymate.domain.model

/**
 * 사용자의 탑승 상태를 나타내는 enum 클래스
 *
 * 탑승 세션의 생명주기에 따른 상태 전이:
 * BOARDING → IN_TRANSIT → APPROACHING → ARRIVED
 */
enum class RideStatus(
    /** 상태의 한글 표시명 */
    val displayName: String,
    /** 상태에 대한 설명 */
    val description: String
) {
    /**
     * 탑승 대기 상태
     * 사용자가 출발역에서 열차를 기다리는 중
     */
    BOARDING(
        displayName = "탑승 대기",
        description = "열차를 기다리는 중입니다"
    ),

    /**
     * 이동 중 상태
     * 열차에 탑승하여 목적지를 향해 이동 중
     * 도착역까지 여러 역이 남아있는 상태
     */
    IN_TRANSIT(
        displayName = "이동 중",
        description = "목적지를 향해 이동 중입니다"
    ),

    /**
     * 도착 임박 상태
     * 도착역에 곧 도착할 예정
     * 알림 설정에 따라 이 상태에서 사용자에게 알림을 전송
     */
    APPROACHING(
        displayName = "도착 임박",
        description = "곧 도착역에 도착합니다"
    ),

    /**
     * 도착 완료 상태
     * 목적지 역에 도착함
     * 탑승 세션이 종료되는 최종 상태
     */
    ARRIVED(
        displayName = "도착",
        description = "도착역에 도착했습니다"
    );

    /**
     * 현재 상태가 활성 탑승 중인지 확인
     *
     * @return 탑승 대기, 이동 중, 도착 임박 상태이면 true
     */
    fun isActive(): Boolean = this != ARRIVED

    /**
     * 알림을 전송해야 하는 상태인지 확인
     *
     * @return 도착 임박 또는 도착 상태이면 true
     */
    fun shouldNotify(): Boolean = this == APPROACHING || this == ARRIVED

    companion object {
        /**
         * 남은 역 수를 기반으로 적절한 탑승 상태를 반환
         *
         * @param remainingStations 도착역까지 남은 역 수
         * @param alertStationsBefore 알림을 줄 역 수 설정 (N역 전)
         * @return 해당하는 RideStatus
         */
        fun fromRemainingStations(
            remainingStations: Int,
            alertStationsBefore: Int
        ): RideStatus {
            return when {
                remainingStations <= 0 -> ARRIVED
                remainingStations <= alertStationsBefore -> APPROACHING
                else -> IN_TRANSIT
            }
        }
    }
}
