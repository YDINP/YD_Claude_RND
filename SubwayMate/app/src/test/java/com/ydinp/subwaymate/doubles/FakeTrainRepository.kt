package com.ydinp.subwaymate.doubles

import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.model.TrainLocation
import com.ydinp.subwaymate.domain.repository.TrainRepository
import com.ydinp.subwaymate.util.TestData
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map

/**
 * 테스트용 FakeTrainRepository 구현
 *
 * TrainRepository 인터페이스를 구현하여 테스트에서 실제 API 호출 없이
 * 열차 위치 추적 기능을 시뮬레이션합니다.
 */
class FakeTrainRepository : TrainRepository {

    // 내부 데이터 저장소
    private val _trainLocations = MutableStateFlow<List<TrainLocation>>(TestData.allTrainLocations)

    // 에러 시뮬레이션 플래그
    var shouldReturnError = false
    var errorMessage = "테스트 에러"

    // 지연 시뮬레이션 (밀리초)
    var simulatedDelay = 0L

    /**
     * 테스트용 데이터 설정
     */
    fun setTrainLocations(locations: List<TrainLocation>) {
        _trainLocations.value = locations
    }

    /**
     * 특정 열차 위치 업데이트
     */
    fun updateTrainLocation(trainNo: String, newLocation: TrainLocation) {
        _trainLocations.value = _trainLocations.value.map { train ->
            if (train.trainNo == trainNo) newLocation else train
        }
    }

    /**
     * 열차 추가
     */
    fun addTrainLocation(location: TrainLocation) {
        _trainLocations.value = _trainLocations.value + location
    }

    /**
     * 열차 제거
     */
    fun removeTrainLocation(trainNo: String) {
        _trainLocations.value = _trainLocations.value.filter { it.trainNo != trainNo }
    }

    override fun getTrainLocations(lineId: String): Flow<List<TrainLocation>> {
        return _trainLocations.map { trains ->
            if (shouldReturnError) {
                throw Exception(errorMessage)
            }
            trains.filter { it.lineId == lineId }
        }
    }

    override suspend fun getApproachingTrains(
        stationId: String,
        direction: Direction?
    ): List<TrainLocation> {
        if (simulatedDelay > 0) {
            delay(simulatedDelay)
        }

        if (shouldReturnError) {
            throw Exception(errorMessage)
        }

        return _trainLocations.value.filter { train ->
            (train.nextStationId == stationId || train.currentStationId == stationId) &&
                (direction == null || train.direction == direction)
        }
    }

    override suspend fun getTrainLocation(trainNo: String): TrainLocation? {
        if (simulatedDelay > 0) {
            delay(simulatedDelay)
        }

        if (shouldReturnError) {
            throw Exception(errorMessage)
        }

        return _trainLocations.value.find { it.trainNo == trainNo }
    }

    override fun trackTrain(trainNo: String, intervalMillis: Long): Flow<TrainLocation?> {
        return flow {
            while (true) {
                if (shouldReturnError) {
                    throw Exception(errorMessage)
                }

                val location = _trainLocations.value.find { it.trainNo == trainNo }
                emit(location)

                delay(intervalMillis)
            }
        }
    }

    override suspend fun getArrivalInfo(
        stationName: String,
        direction: Direction?
    ): List<TrainLocation> {
        if (simulatedDelay > 0) {
            delay(simulatedDelay)
        }

        if (shouldReturnError) {
            throw Exception(errorMessage)
        }

        // 테스트에서는 간단히 stationName을 포함하는 열차를 반환
        // 실제 구현에서는 역명으로 검색해야 함
        return _trainLocations.value.filter { train ->
            direction == null || train.direction == direction
        }
    }

    override suspend fun refreshTrainLocations(lineId: String) {
        if (simulatedDelay > 0) {
            delay(simulatedDelay)
        }

        if (shouldReturnError) {
            throw Exception(errorMessage)
        }

        // 테스트에서는 단순히 현재 데이터를 유지
        // 필요시 테스트에서 setTrainLocations으로 데이터 변경 가능
    }
}
