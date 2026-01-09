package com.ydinp.subwaymate.domain.model

import java.time.LocalDateTime

/**
 * 실시간 열차 위치 정보를 나타내는 data class
 *
 * 서울 열린데이터 광장 API에서 제공하는 실시간 열차 위치 정보를 기반으로 합니다.
 * 열차의 현재 위치, 진행 방향, 예상 도착 시간 등의 정보를 포함합니다.
 *
 * @property trainNo 열차 번호 (고유 식별자)
 * @property lineId 운행 노선 ID
 * @property currentStationId 현재 위치한 역 ID (역에 정차 중이거나 가장 최근 출발한 역)
 * @property nextStationId 다음 도착 예정 역 ID
 * @property direction 열차 운행 방향
 * @property estimatedArrivalTime 다음 역 도착 예정 시간
 * @property trainStatus 열차 상태 (진입, 도착, 출발 등)
 * @property destinationStationId 종착역 ID
 * @property updatedAt 정보 갱신 시각
 */
data class TrainLocation(
    val trainNo: String,
    val lineId: String,
    val currentStationId: String,
    val nextStationId: String,
    val direction: Direction,
    val estimatedArrivalTime: LocalDateTime?,
    val trainStatus: TrainStatus,
    val destinationStationId: String,
    val updatedAt: LocalDateTime
) {
    /**
     * 특정 역에 정차 중인지 확인
     *
     * @param stationId 확인할 역 ID
     * @return 해당 역에 정차 중이면 true
     */
    fun isAtStation(stationId: String): Boolean {
        return currentStationId == stationId &&
                (trainStatus == TrainStatus.ARRIVED || trainStatus == TrainStatus.DEPARTING)
    }

    /**
     * 특정 역으로 진입 중인지 확인
     *
     * @param stationId 확인할 역 ID
     * @return 해당 역으로 진입 중이면 true
     */
    fun isApproaching(stationId: String): Boolean {
        return nextStationId == stationId && trainStatus == TrainStatus.APPROACHING
    }

    /**
     * 열차 정보가 최신인지 확인 (기준: 2분 이내)
     *
     * @return 최신 정보이면 true
     */
    fun isRecent(): Boolean {
        val now = LocalDateTime.now()
        return updatedAt.plusMinutes(2).isAfter(now)
    }
}

/**
 * 열차의 현재 상태를 나타내는 enum 클래스
 *
 * 서울 열린데이터 광장 API의 열차 상태 코드를 매핑합니다.
 */
enum class TrainStatus(
    /** 상태의 한글 표시명 */
    val displayName: String,
    /** API 응답의 상태 코드 */
    val code: String
) {
    /**
     * 역 진입 중: 열차가 역으로 들어오고 있음
     */
    APPROACHING(displayName = "진입", code = "0"),

    /**
     * 역 도착: 열차가 역에 정차함
     */
    ARRIVED(displayName = "도착", code = "1"),

    /**
     * 역 출발: 열차가 역을 출발함
     */
    DEPARTING(displayName = "출발", code = "2"),

    /**
     * 전역 출발: 이전 역을 출발하여 이동 중
     */
    IN_TRANSIT(displayName = "이동중", code = "3"),

    /**
     * 알 수 없음: 상태 정보 없음
     */
    UNKNOWN(displayName = "알수없음", code = "-1");

    companion object {
        /**
         * API 상태 코드로부터 TrainStatus를 반환
         *
         * @param code API 응답의 상태 코드
         * @return 해당하는 TrainStatus enum 값
         */
        fun fromCode(code: String): TrainStatus {
            return entries.find { it.code == code } ?: UNKNOWN
        }
    }
}
