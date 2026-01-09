package com.ydinp.subwaymate.data.remote.dto

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/**
 * 실시간 열차 위치 정보 API 응답
 *
 * API: /{KEY}/json/realtimePosition/{startIndex}/{endIndex}/{호선명}
 */
@JsonClass(generateAdapter = true)
data class RealtimePositionResponse(
    @Json(name = "errorMessage")
    val errorMessage: ErrorMessage?,

    @Json(name = "realtimePositionList")
    val realtimePositionList: List<RealtimePosition>?
)

/**
 * API 에러 메시지
 */
@JsonClass(generateAdapter = true)
data class ErrorMessage(
    @Json(name = "status")
    val status: Int?,

    @Json(name = "code")
    val code: String?,

    @Json(name = "message")
    val message: String?,

    @Json(name = "link")
    val link: String?,

    @Json(name = "developerMessage")
    val developerMessage: String?,

    @Json(name = "total")
    val total: Int?
)

/**
 * 실시간 열차 위치 정보
 *
 * 서울시 교통정보과[TOPIS]에서 제공하는 지하철 실시간 열차위치 정보
 */
@JsonClass(generateAdapter = true)
data class RealtimePosition(
    /**
     * 지하철 호선 ID
     * 예: "1001" (1호선), "1002" (2호선), "1003" (3호선) 등
     */
    @Json(name = "subwayId")
    val subwayId: String?,

    /**
     * 지하철 호선명
     * 예: "1호선", "2호선", "3호선" 등
     */
    @Json(name = "subwayNm")
    val subwayNm: String?,

    /**
     * 현재 역 ID (10자리)
     * 상위 4자리: 노선번호, 하위 6자리: 역번호
     */
    @Json(name = "statnId")
    val statnId: String?,

    /**
     * 현재 역명
     * 예: "서울역", "강남", "홍대입구" 등
     */
    @Json(name = "statnNm")
    val statnNm: String?,

    /**
     * 열차 번호
     * 예: "2191", "3052" 등
     */
    @Json(name = "trainNo")
    val trainNo: String?,

    /**
     * 최종 수신 일시
     * 형식: "yyyy-MM-dd HH:mm:ss"
     * 예: "2023-06-11 14:05:56"
     */
    @Json(name = "lastRecptnDt")
    val lastRecptnDt: String?,

    /**
     * 수신 일시
     * 형식: "yyyy-MM-dd HH:mm:ss"
     */
    @Json(name = "recptnDt")
    val recptnDt: String?,

    /**
     * 상하행선 구분
     * 0: 상행/내선, 1: 하행/외선
     */
    @Json(name = "updnLine")
    val updnLine: String?,

    /**
     * 종착역 ID
     */
    @Json(name = "statnTid")
    val statnTid: String?,

    /**
     * 종착역명
     * 예: "신도림", "성수종착" 등
     */
    @Json(name = "statnTnm")
    val statnTnm: String?,

    /**
     * 열차 상태 코드
     * 0: 진입, 1: 도착, 2: 출발, 3: 전역출발
     */
    @Json(name = "trainSttus")
    val trainSttus: String?,

    /**
     * 급행 여부
     * 0: 일반, 1: 급행
     */
    @Json(name = "directAt")
    val directAt: String?,

    /**
     * 막차 여부
     * 0: 일반, 1: 막차
     */
    @Json(name = "lstcarAt")
    val lstcarAt: String?
) {
    /**
     * 상행선 여부
     */
    val isUpLine: Boolean
        get() = updnLine == "0"

    /**
     * 급행 여부 (Boolean)
     */
    val isExpress: Boolean
        get() = directAt == "1"

    /**
     * 막차 여부 (Boolean)
     */
    val isLastTrain: Boolean
        get() = lstcarAt == "1"

    /**
     * 열차 상태 enum 변환
     */
    val trainStatus: TrainStatus
        get() = when (trainSttus) {
            "0" -> TrainStatus.APPROACHING
            "1" -> TrainStatus.ARRIVED
            "2" -> TrainStatus.DEPARTED
            "3" -> TrainStatus.DEPARTED_PREVIOUS
            else -> TrainStatus.UNKNOWN
        }
}

/**
 * 열차 상태
 */
enum class TrainStatus(val description: String) {
    APPROACHING("진입"),
    ARRIVED("도착"),
    DEPARTED("출발"),
    DEPARTED_PREVIOUS("전역출발"),
    UNKNOWN("알 수 없음")
}
