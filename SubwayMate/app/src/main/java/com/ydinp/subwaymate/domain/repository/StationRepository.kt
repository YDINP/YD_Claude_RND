package com.ydinp.subwaymate.domain.repository

import com.ydinp.subwaymate.domain.common.Result
import com.ydinp.subwaymate.domain.model.Line
import com.ydinp.subwaymate.domain.model.Station
import kotlinx.coroutines.flow.Flow

/**
 * 역 및 노선 정보에 대한 Repository 인터페이스
 *
 * 지하철 역과 노선에 대한 데이터 접근을 추상화합니다.
 * assets의 JSON 파일에서 정적 데이터를 로드하고,
 * Room DB를 통해 캐시합니다.
 */
interface StationRepository {

    // ============== 노선 관련 ==============

    /**
     * 모든 노선 목록을 조회
     *
     * @return 노선 목록을 Result로 래핑하여 반환
     */
    suspend fun getAllLines(): Result<List<Line>>

    /**
     * 모든 노선 목록을 Flow로 관찰
     *
     * @return 노선 목록을 Flow로 반환
     */
    fun observeAllLines(): Flow<Result<List<Line>>>

    /**
     * 특정 노선의 정보를 조회
     *
     * @param lineId 노선 ID
     * @return Line 객체를 Result로 래핑하여 반환
     */
    suspend fun getLineById(lineId: String): Result<Line>

    /**
     * 노선명으로 노선 검색
     *
     * @param query 검색어 (부분 일치)
     * @return 검색 결과 노선 목록
     */
    suspend fun searchLines(query: String): Result<List<Line>>

    // ============== 역 관련 ==============

    /**
     * 특정 노선의 역 목록을 조회
     *
     * @param lineId 노선 ID
     * @return 해당 노선의 역 목록을 Result로 반환
     */
    suspend fun getStationsByLine(lineId: String): Result<List<Station>>

    /**
     * 특정 노선의 역 목록을 Flow로 관찰
     *
     * @param lineId 노선 ID
     * @return 해당 노선의 역 목록 Flow
     */
    fun observeStationsByLine(lineId: String): Flow<Result<List<Station>>>

    /**
     * 모든 역 목록을 조회
     *
     * @return 전체 역 목록을 Result로 반환
     */
    suspend fun getAllStations(): Result<List<Station>>

    /**
     * 모든 역 목록을 Flow로 관찰
     *
     * @return 전체 역 목록 Flow
     */
    fun observeAllStations(): Flow<Result<List<Station>>>

    /**
     * 역 이름으로 검색
     *
     * @param query 검색어 (부분 일치)
     * @return 검색 결과 역 목록을 Result로 반환
     */
    suspend fun searchStations(query: String): Result<List<Station>>

    /**
     * 역 이름으로 검색 (Flow)
     *
     * @param query 검색어 (부분 일치)
     * @return 검색 결과 역 목록 Flow
     */
    fun observeSearchStations(query: String): Flow<Result<List<Station>>>

    /**
     * 특정 역의 상세 정보를 조회
     *
     * @param stationId 역 ID
     * @return Station 객체를 Result로 래핑하여 반환
     */
    suspend fun getStationById(stationId: String): Result<Station>

    /**
     * 역명으로 특정 역 조회
     *
     * @param name 역명 (정확히 일치)
     * @param lineId 노선 ID (같은 역명이 여러 노선에 있을 수 있음)
     * @return Station 객체를 Result로 래핑하여 반환
     */
    suspend fun getStationByName(name: String, lineId: String): Result<Station>

    /**
     * 환승역 목록 조회
     *
     * @return 환승 가능한 역 목록
     */
    suspend fun getTransferStations(): Result<List<Station>>

    // ============== 위치 기반 ==============

    /**
     * 주변 역 목록을 조회 (위치 기반)
     *
     * @param latitude 위도
     * @param longitude 경도
     * @param radiusMeters 검색 반경 (미터, 기본값 500m)
     * @param limit 최대 반환 개수 (기본값 5)
     * @return 주변 역 목록 (거리순 정렬)
     */
    suspend fun getNearbyStations(
        latitude: Double,
        longitude: Double,
        radiusMeters: Int = 500,
        limit: Int = 5
    ): Result<List<Station>>

    /**
     * 가까운 역 정보를 Flow로 관찰
     *
     * @param latitude 현재 위도
     * @param longitude 현재 경도
     * @param limit 반환할 역 개수
     * @return 가까운 역 목록 Flow
     */
    fun observeNearbyStations(
        latitude: Double,
        longitude: Double,
        limit: Int = 5
    ): Flow<Result<List<Station>>>

    // ============== 경로 관련 ==============

    /**
     * 두 역 사이의 역 목록을 조회 (경로 상의 역들)
     *
     * @param fromStationId 출발역 ID
     * @param toStationId 도착역 ID
     * @param lineId 노선 ID
     * @return 경로 상의 역 목록 (출발역 포함, 도착역 포함)
     */
    suspend fun getStationsBetween(
        fromStationId: String,
        toStationId: String,
        lineId: String
    ): Result<List<Station>>

    /**
     * 두 역 사이의 역 개수를 계산
     *
     * @param fromStationId 출발역 ID
     * @param toStationId 도착역 ID
     * @param lineId 노선 ID
     * @return 역 개수 (출발역 제외, 도착역 포함)
     */
    suspend fun getStationCount(
        fromStationId: String,
        toStationId: String,
        lineId: String
    ): Result<Int>

    /**
     * 두 역 사이의 예상 소요 시간 계산
     *
     * @param fromStationId 출발역 ID
     * @param toStationId 도착역 ID
     * @param lineId 노선 ID
     * @return 예상 소요 시간 (분 단위)
     */
    suspend fun getEstimatedTravelTime(
        fromStationId: String,
        toStationId: String,
        lineId: String
    ): Result<Int>

    // ============== 데이터 관리 ==============

    /**
     * 역/노선 데이터를 초기화 (assets에서 다시 로드)
     */
    suspend fun refreshStationData(): Result<Unit>

    /**
     * 데이터가 로드되어 있는지 확인
     *
     * @return 데이터가 로드되어 있으면 true
     */
    suspend fun isDataLoaded(): Boolean

    /**
     * 데이터 로드 (앱 시작 시 호출)
     */
    suspend fun loadInitialData(): Result<Unit>
}
