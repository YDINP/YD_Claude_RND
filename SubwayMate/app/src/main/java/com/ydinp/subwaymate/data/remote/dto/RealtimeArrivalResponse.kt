package com.ydinp.subwaymate.data.remote.dto

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/**
 * 실시간 도착 정보 API 응답
 *
 * API: /{KEY}/json/realtimeStationArrival/{startIndex}/{endIndex}/{역명}
 */
@JsonClass(generateAdapter = true)
data class RealtimeArrivalResponse(
    @Json(name = "errorMessage")
    val errorMessage: ErrorMessage?,

    @Json(name = "realtimeArrivalList")
    val realtimeArrivalList: List<RealtimeArrival>?
)

/**
 * 실시간 도착 정보
 *
 * 서울시 교통정보과[TOPIS]에서 제공하는 지하철 실시간 도착정보
 */
@JsonClass(generateAdapter = true)
data class RealtimeArrival(
    /**
     * 지하철 호선 ID
     * 예: "1001" (1호선), "1002" (2호선) 등
     */
    @Json(name = "subwayId")
    val subwayId: String?,

    /**
     * 상하행선 구분
     * "상행", "하행", "내선", "외선" 등
     */
    @Json(name = "updnLine")
    val updnLine: String?,

    /**
     * 열차 종류 (급행/일반)
     * "일반", "급행", "ITX" 등
     */
    @Json(name = "btrainSttus")
    val btrainSttus: String?,

    /**
     * 종착역명
     * 예: "신도림", "당고개" 등
     */
    @Json(name = "bstatnNm")
    val bstatnNm: String?,

    /**
     * 수신 일시
     * 형식: "yyyy-MM-dd HH:mm:ss"
     */
    @Json(name = "recptnDt")
    val recptnDt: String?,

    /**
     * 도착 메시지 (첫번째)
     * 예: "전역 출발", "전역 도착" 등
     */
    @Json(name = "arvlMsg2")
    val arvlMsg2: String?,

    /**
     * 도착 메시지 (두번째)
     * 예: "[3]번째 전역 (신도림)" 등
     */
    @Json(name = "arvlMsg3")
    val arvlMsg3: String?,

    /**
     * 도착 코드
     * 0: 진입, 1: 도착, 2: 출발, 3: 전역출발, 4: 전역진입, 5: 전역도착, 99: 운행중
     */
    @Json(name = "arvlCd")
    val arvlCd: String?,

    /**
     * 열차 번호
     */
    @Json(name = "btrainNo")
    val btrainNo: String?,

    /**
     * 도착 예정 시간 (초 단위)
     */
    @Json(name = "barvlDt")
    val barvlDt: String?,

    /**
     * 현재 역 ID
     */
    @Json(name = "statnId")
    val statnId: String?,

    /**
     * 현재 역명
     */
    @Json(name = "statnNm")
    val statnNm: String?,

    /**
     * 현재 역 순번
     */
    @Json(name = "ordkey")
    val ordkey: String?,

    /**
     * 지하철 호선명
     * 예: "1호선", "2호선" 등
     */
    @Json(name = "subwayList")
    val subwayList: String?,

    /**
     * 첫차 도착 예정 시간
     */
    @Json(name = "statnFid")
    val statnFid: String?,

    /**
     * 막차 도착 예정 시간
     */
    @Json(name = "statnTid")
    val statnTid: String?,

    /**
     * 첫차 출발역명
     */
    @Json(name = "statnFnm")
    val statnFnm: String?,

    /**
     * 막차 종착역명
     */
    @Json(name = "statnTnm")
    val statnTnm: String?,

    /**
     * 도착 예정 열차 순번 (1: 첫번째, 2: 두번째)
     */
    @Json(name = "trainLineNm")
    val trainLineNm: String?,

    /**
     * 열차 출발역명
     */
    @Json(name = "bstatnId")
    val bstatnId: String?
) {
    /**
     * 도착 예정 시간 (초 단위, Int 변환)
     */
    val arrivalTimeInSeconds: Int?
        get() = barvlDt?.toIntOrNull()

    /**
     * 도착 예정 시간 (분 단위)
     */
    val arrivalTimeInMinutes: Int?
        get() = arrivalTimeInSeconds?.let { it / 60 }

    /**
     * 급행 여부
     */
    val isExpress: Boolean
        get() = btrainSttus == "급행" || btrainSttus == "ITX"

    /**
     * 상행선 여부
     */
    val isUpLine: Boolean
        get() = updnLine == "상행" || updnLine == "내선"

    /**
     * 도착 상태 enum 변환
     */
    val arrivalStatus: ArrivalStatus
        get() = when (arvlCd) {
            "0" -> ArrivalStatus.APPROACHING
            "1" -> ArrivalStatus.ARRIVED
            "2" -> ArrivalStatus.DEPARTED
            "3" -> ArrivalStatus.DEPARTED_PREVIOUS
            "4" -> ArrivalStatus.APPROACHING_PREVIOUS
            "5" -> ArrivalStatus.ARRIVED_PREVIOUS
            "99" -> ArrivalStatus.RUNNING
            else -> ArrivalStatus.UNKNOWN
        }
}

/**
 * 도착 상태
 */
enum class ArrivalStatus(val description: String) {
    APPROACHING("진입"),
    ARRIVED("도착"),
    DEPARTED("출발"),
    DEPARTED_PREVIOUS("전역출발"),
    APPROACHING_PREVIOUS("전역진입"),
    ARRIVED_PREVIOUS("전역도착"),
    RUNNING("운행중"),
    UNKNOWN("알 수 없음")
}
