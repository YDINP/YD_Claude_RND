package com.ydinp.subwaymate.data.remote.api

import com.ydinp.subwaymate.data.remote.dto.RealtimeArrivalResponse
import com.ydinp.subwaymate.data.remote.dto.RealtimePositionResponse
import retrofit2.http.GET
import retrofit2.http.Path

/**
 * 서울 열린데이터광장 지하철 API 인터페이스
 *
 * Base URL: http://swopenapi.seoul.go.kr/api/subway/
 *
 * API 호출 형식:
 * - 실시간 열차 위치: /{KEY}/json/realtimePosition/{startIndex}/{endIndex}/{호선명}
 * - 실시간 도착 정보: /{KEY}/json/realtimeStationArrival/{startIndex}/{endIndex}/{역명}
 */
interface SeoulOpenApi {

    /**
     * 실시간 열차 위치 정보 조회
     *
     * 서울시 교통정보과[TOPIS]에서 제공하는 지하철 실시간 열차위치 정보를 조회합니다.
     *
     * @param apiKey 서울 열린데이터광장 인증키
     * @param startIndex 요청 시작 위치 (0부터 시작)
     * @param endIndex 요청 종료 위치
     * @param subwayLine 호선명 (예: "1호선", "2호선", "3호선" 등)
     * @return 실시간 열차 위치 응답
     */
    @GET("{apiKey}/json/realtimePosition/{startIndex}/{endIndex}/{subwayLine}")
    suspend fun getRealtimePosition(
        @Path("apiKey") apiKey: String,
        @Path("startIndex") startIndex: Int = 0,
        @Path("endIndex") endIndex: Int = 100,
        @Path("subwayLine") subwayLine: String
    ): RealtimePositionResponse

    /**
     * 실시간 역 도착 정보 조회
     *
     * 서울시 교통정보과[TOPIS]에서 제공하는 지하철 실시간 도착정보를 조회합니다.
     *
     * @param apiKey 서울 열린데이터광장 인증키
     * @param startIndex 요청 시작 위치 (0부터 시작)
     * @param endIndex 요청 종료 위치
     * @param stationName 역명 (예: "서울역", "강남", "홍대입구" 등)
     * @return 실시간 도착 정보 응답
     */
    @GET("{apiKey}/json/realtimeStationArrival/{startIndex}/{endIndex}/{stationName}")
    suspend fun getRealtimeStationArrival(
        @Path("apiKey") apiKey: String,
        @Path("startIndex") startIndex: Int = 0,
        @Path("endIndex") endIndex: Int = 5,
        @Path("stationName") stationName: String
    ): RealtimeArrivalResponse
}
