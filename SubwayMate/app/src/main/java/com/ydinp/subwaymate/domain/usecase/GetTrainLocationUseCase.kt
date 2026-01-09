package com.ydinp.subwaymate.domain.usecase

import com.ydinp.subwaymate.domain.common.Result
import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.model.Station
import com.ydinp.subwaymate.domain.model.TrainLocation
import com.ydinp.subwaymate.domain.repository.StationRepository
import com.ydinp.subwaymate.domain.repository.TrainRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject

/**
 * 실시간 열차 위치 정보를 조회하는 UseCase
 *
 * 특정 노선의 열차 위치, 특정 역에 접근 중인 열차 정보 등을 제공합니다.
 */
class GetTrainLocationUseCase @Inject constructor(
    private val trainRepository: TrainRepository,
    private val stationRepository: StationRepository
) {
    /**
     * 특정 노선의 모든 열차 위치를 실시간으로 조회
     *
     * @param lineId 노선 ID
     * @return 열차 위치 목록 Flow (최신 데이터만 필터링)
     */
    fun getTrainLocations(lineId: String): Flow<List<TrainLocation>> {
        return trainRepository.getTrainLocations(lineId)
            .map { trains -> trains.filter { it.isRecent() } }
    }

    /**
     * 특정 역에 접근 중인 열차 목록을 조회
     *
     * @param stationId 역 ID
     * @param direction 운행 방향 (선택적)
     * @return 접근 중인 열차 목록 (최신 데이터만)
     */
    suspend fun getApproachingTrains(
        stationId: String,
        direction: Direction? = null
    ): List<TrainLocation> {
        return trainRepository.getApproachingTrains(stationId, direction)
            .filter { it.isRecent() }
    }

    /**
     * 특정 열차의 실시간 위치를 조회
     *
     * @param trainNo 열차 번호
     * @return TrainLocation 또는 null
     */
    suspend fun getTrainLocation(trainNo: String): TrainLocation? {
        return trainRepository.getTrainLocation(trainNo)
    }

    /**
     * 특정 열차의 위치를 실시간으로 추적
     *
     * @param trainNo 열차 번호
     * @param intervalMillis 갱신 간격 (밀리초)
     * @return 열차 위치 Flow
     */
    fun trackTrain(
        trainNo: String,
        intervalMillis: Long = 10_000L
    ): Flow<TrainLocation?> {
        return trainRepository.trackTrain(trainNo, intervalMillis)
    }

    /**
     * 특정 역에 대한 도착 예정 열차 정보를 조회
     *
     * @param stationName 역명
     * @param direction 운행 방향 (선택적)
     * @return 도착 예정 열차 목록
     */
    suspend fun getArrivalInfo(
        stationName: String,
        direction: Direction? = null
    ): List<TrainLocation> {
        return trainRepository.getArrivalInfo(stationName, direction)
    }

    /**
     * 특정 역에서 특정 방향으로 운행하는 다음 열차를 조회
     *
     * @param stationId 역 ID
     * @param direction 운행 방향
     * @return 다음 열차 정보 또는 null
     */
    suspend fun getNextTrain(
        stationId: String,
        direction: Direction
    ): TrainLocation? {
        return trainRepository.getApproachingTrains(stationId, direction)
            .filter { it.isRecent() }
            .minByOrNull { it.estimatedArrivalTime ?: java.time.LocalDateTime.MAX }
    }

    /**
     * 열차가 특정 역에서 몇 정거장 떨어져 있는지 계산
     *
     * @param train 열차 위치 정보
     * @param targetStationId 목표 역 ID
     * @return 남은 역 수 Result
     */
    suspend fun calculateRemainingStations(
        train: TrainLocation,
        targetStationId: String
    ): Result<Int> {
        return stationRepository.getStationCount(
            fromStationId = train.currentStationId,
            toStationId = targetStationId,
            lineId = train.lineId
        )
    }

    /**
     * 특정 열차의 현재 위치 역 정보를 조회
     *
     * @param train 열차 위치 정보
     * @return 현재 역 정보 Result
     */
    suspend fun getCurrentStation(train: TrainLocation): Result<Station> {
        return stationRepository.getStationById(train.currentStationId)
    }

    /**
     * 특정 열차의 다음 역 정보를 조회
     *
     * @param train 열차 위치 정보
     * @return 다음 역 정보 Result
     */
    suspend fun getNextStation(train: TrainLocation): Result<Station> {
        return stationRepository.getStationById(train.nextStationId)
    }

    /**
     * 특정 열차의 종착역 정보를 조회
     *
     * @param train 열차 위치 정보
     * @return 종착역 정보 Result
     */
    suspend fun getDestinationStation(train: TrainLocation): Result<Station> {
        return stationRepository.getStationById(train.destinationStationId)
    }

    /**
     * 실시간 열차 데이터를 새로고침
     *
     * @param lineId 노선 ID
     */
    suspend fun refreshTrainData(lineId: String) {
        trainRepository.refreshTrainLocations(lineId)
    }

    /**
     * 여러 열차의 위치 정보에 역 정보를 포함하여 반환
     *
     * @param trains 열차 위치 목록
     * @return 열차와 현재 역 정보 Pair 목록
     */
    suspend fun getTrainsWithStationInfo(
        trains: List<TrainLocation>
    ): List<Pair<TrainLocation, Station?>> {
        return trains.map { train ->
            val station = stationRepository.getStationById(train.currentStationId).getOrNull()
            train to station
        }
    }
}
