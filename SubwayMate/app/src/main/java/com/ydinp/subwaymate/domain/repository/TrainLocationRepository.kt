package com.ydinp.subwaymate.domain.repository

import com.ydinp.subwaymate.domain.common.Result
import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.model.TrainLocation
import kotlinx.coroutines.flow.Flow

/**
 * 실시간 열차 위치 정보를 제공하는 Repository 인터페이스
 *
 * 서울 열린데이터광장 API를 통해 실시간 열차 위치 및 도착 정보를 조회합니다.
 */
interface TrainLocationRepository {

    // ============== 실시간 위치 조회 ==============

    /**
     * 특정 노선의 모든 열차 위치 정보를 조회
     *
     * @param lineId 노선 ID
     * @return 해당 노선의 열차 위치 목록
     */
    suspend fun getTrainLocationsByLine(lineId: String): Result<List<TrainLocation>>

    /**
     * 특정 노선의 열차 위치를 Flow로 관찰 (주기적 갱신)
     *
     * @param lineId 노선 ID
     * @param refreshIntervalMs 갱신 주기 (밀리초, 기본값 10초)
     * @return 열차 위치 목록 Flow
     */
    fun observeTrainLocationsByLine(
        lineId: String,
        refreshIntervalMs: Long = 10_000L
    ): Flow<Result<List<TrainLocation>>>

    /**
     * 특정 역에 도착 예정인 열차 정보를 조회
     *
     * @param stationName 역명
     * @return 해당 역 도착 예정 열차 목록
     */
    suspend fun getArrivingTrains(stationName: String): Result<List<TrainLocation>>

    /**
     * 특정 역의 도착 예정 열차를 Flow로 관찰
     *
     * @param stationName 역명
     * @param refreshIntervalMs 갱신 주기 (밀리초, 기본값 15초)
     * @return 도착 예정 열차 목록 Flow
     */
    fun observeArrivingTrains(
        stationName: String,
        refreshIntervalMs: Long = 15_000L
    ): Flow<Result<List<TrainLocation>>>

    // ============== 특정 열차 추적 ==============

    /**
     * 특정 열차의 현재 위치를 조회
     *
     * @param trainNo 열차 번호
     * @param lineId 노선 ID
     * @return 해당 열차의 위치 정보
     */
    suspend fun getTrainLocation(
        trainNo: String,
        lineId: String
    ): Result<TrainLocation>

    /**
     * 특정 열차의 위치를 실시간으로 추적
     *
     * @param trainNo 열차 번호
     * @param lineId 노선 ID
     * @param refreshIntervalMs 갱신 주기 (밀리초, 기본값 5초)
     * @return 열차 위치 Flow
     */
    fun trackTrain(
        trainNo: String,
        lineId: String,
        refreshIntervalMs: Long = 5_000L
    ): Flow<Result<TrainLocation>>

    // ============== 필터링된 조회 ==============

    /**
     * 특정 역을 지나는 열차 목록 조회
     *
     * @param stationId 역 ID
     * @param lineId 노선 ID
     * @param direction 방향 (null이면 양방향 모두)
     * @return 해당 역을 지나는 열차 목록
     */
    suspend fun getTrainsAtStation(
        stationId: String,
        lineId: String,
        direction: Direction? = null
    ): Result<List<TrainLocation>>

    /**
     * 특정 방향으로 운행 중인 열차 목록 조회
     *
     * @param lineId 노선 ID
     * @param direction 운행 방향
     * @return 해당 방향 열차 목록
     */
    suspend fun getTrainsByDirection(
        lineId: String,
        direction: Direction
    ): Result<List<TrainLocation>>

    /**
     * 특정 역과 방향의 열차 위치를 Flow로 관찰
     *
     * @param stationId 역 ID
     * @param lineId 노선 ID
     * @param direction 방향
     * @param refreshIntervalMs 갱신 주기
     * @return 열차 위치 목록 Flow
     */
    fun observeTrainsAtStation(
        stationId: String,
        lineId: String,
        direction: Direction,
        refreshIntervalMs: Long = 10_000L
    ): Flow<Result<List<TrainLocation>>>

    // ============== 도착 예측 ==============

    /**
     * 특정 열차의 목적지까지 예상 소요 시간 계산
     *
     * @param trainNo 열차 번호
     * @param lineId 노선 ID
     * @param destinationStationId 목적지 역 ID
     * @return 예상 소요 시간 (초 단위)
     */
    suspend fun getEstimatedArrivalTime(
        trainNo: String,
        lineId: String,
        destinationStationId: String
    ): Result<Int>

    /**
     * 특정 역에 도착 예정인 가장 가까운 열차 조회
     *
     * @param stationId 역 ID
     * @param lineId 노선 ID
     * @param direction 방향
     * @return 가장 빠른 도착 예정 열차
     */
    suspend fun getNextTrain(
        stationId: String,
        lineId: String,
        direction: Direction
    ): Result<TrainLocation?>

    // ============== 캐시 관련 ==============

    /**
     * 캐시된 열차 위치 정보 삭제
     */
    suspend fun clearCache()

    /**
     * 마지막 갱신 시각 조회
     *
     * @param lineId 노선 ID
     * @return 마지막 갱신 시각 (밀리초)
     */
    suspend fun getLastUpdateTime(lineId: String): Long?
}
