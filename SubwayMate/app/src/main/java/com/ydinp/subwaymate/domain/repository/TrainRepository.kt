package com.ydinp.subwaymate.domain.repository

import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.model.TrainLocation
import kotlinx.coroutines.flow.Flow

/**
 * 실시간 열차 위치 정보에 대한 Repository 인터페이스
 *
 * 서울 열린데이터 광장 API를 통해 실시간 열차 위치를 조회합니다.
 */
interface TrainRepository {

    /**
     * 특정 노선의 모든 열차 위치를 실시간으로 조회
     *
     * @param lineId 노선 ID
     * @return 열차 위치 목록을 Flow로 반환
     */
    fun getTrainLocations(lineId: String): Flow<List<TrainLocation>>

    /**
     * 특정 역에 접근 중인 열차 목록을 조회
     *
     * @param stationId 역 ID
     * @param direction 운행 방향 (선택적)
     * @return 접근 중인 열차 위치 목록
     */
    suspend fun getApproachingTrains(
        stationId: String,
        direction: Direction? = null
    ): List<TrainLocation>

    /**
     * 특정 열차의 실시간 위치를 조회
     *
     * @param trainNo 열차 번호
     * @return TrainLocation 또는 null
     */
    suspend fun getTrainLocation(trainNo: String): TrainLocation?

    /**
     * 특정 열차의 위치를 실시간으로 추적
     *
     * @param trainNo 열차 번호
     * @param intervalMillis 갱신 간격 (밀리초, 기본 10초)
     * @return 열차 위치를 Flow로 반환 (주기적 갱신)
     */
    fun trackTrain(
        trainNo: String,
        intervalMillis: Long = 10_000L
    ): Flow<TrainLocation?>

    /**
     * 특정 역, 특정 방향의 열차 도착 정보를 조회
     *
     * @param stationName 역명
     * @param direction 운행 방향
     * @return 열차 위치 목록
     */
    suspend fun getArrivalInfo(
        stationName: String,
        direction: Direction? = null
    ): List<TrainLocation>

    /**
     * 실시간 열차 위치 데이터를 강제로 새로고침
     *
     * @param lineId 노선 ID
     */
    suspend fun refreshTrainLocations(lineId: String)
}
