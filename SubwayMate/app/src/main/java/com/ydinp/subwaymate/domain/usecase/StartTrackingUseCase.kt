package com.ydinp.subwaymate.domain.usecase

import com.ydinp.subwaymate.domain.common.Result
import com.ydinp.subwaymate.domain.model.AlertSetting
import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.model.Line
import com.ydinp.subwaymate.domain.model.RideSession
import com.ydinp.subwaymate.domain.model.Station
import com.ydinp.subwaymate.domain.model.TrainLocation
import com.ydinp.subwaymate.domain.repository.RideSessionRepository
import com.ydinp.subwaymate.domain.repository.StationRepository
import com.ydinp.subwaymate.domain.repository.TrainRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.time.LocalDateTime
import javax.inject.Inject

/**
 * 탑승 추적 시작 및 관리 UseCase
 *
 * 출발역에서 도착역까지의 탑승 세션을 생성하고 관리합니다.
 * 실시간 열차 위치를 추적하여 도착 알림을 제공합니다.
 */
class StartTrackingUseCase @Inject constructor(
    private val rideSessionRepository: RideSessionRepository,
    private val stationRepository: StationRepository,
    private val trainRepository: TrainRepository
) {
    /**
     * 탑승 추적 시작을 위한 파라미터
     */
    data class TrackingParams(
        val departureStationId: String,
        val arrivalStationId: String,
        val lineId: String,
        val direction: Direction,
        val alertSetting: AlertSetting = AlertSetting.default()
    )

    /**
     * 새로운 탑승 추적을 시작
     *
     * @param params 추적 파라미터
     * @return 생성된 RideSession을 Result로 반환
     */
    suspend fun startTracking(params: TrackingParams): Result<RideSession> {
        // 출발역 조회
        val departureResult = stationRepository.getStationById(params.departureStationId)
        if (departureResult is Result.Error) {
            return Result.error(departureResult.exception, "출발역을 찾을 수 없습니다")
        }
        val departureStation = departureResult.getOrNull()
            ?: return Result.error(IllegalArgumentException("출발역을 찾을 수 없습니다"))

        // 도착역 조회
        val arrivalResult = stationRepository.getStationById(params.arrivalStationId)
        if (arrivalResult is Result.Error) {
            return Result.error(arrivalResult.exception, "도착역을 찾을 수 없습니다")
        }
        val arrivalStation = arrivalResult.getOrNull()
            ?: return Result.error(IllegalArgumentException("도착역을 찾을 수 없습니다"))

        // 노선 조회
        val lineResult = stationRepository.getLineById(params.lineId)
        if (lineResult is Result.Error) {
            return Result.error(lineResult.exception, "노선을 찾을 수 없습니다")
        }
        val line = lineResult.getOrNull()
            ?: return Result.error(IllegalArgumentException("노선을 찾을 수 없습니다"))

        // 두 역 사이의 역 수 계산
        val stationCountResult = stationRepository.getStationCount(
            fromStationId = params.departureStationId,
            toStationId = params.arrivalStationId,
            lineId = params.lineId
        )
        val remainingStations = stationCountResult.getOrDefault(0)

        // 탑승 세션 생성
        val session = RideSession.create(
            departure = departureStation,
            arrival = arrivalStation,
            line = line,
            direction = params.direction,
            alertSetting = params.alertSetting
        ).copy(remainingStations = remainingStations)

        // 세션 저장
        return try {
            val savedSession = rideSessionRepository.startSession(session)
            Result.success(savedSession)
        } catch (e: Exception) {
            Result.error(e, "세션 저장에 실패했습니다")
        }
    }

    /**
     * 현재 활성 세션을 조회
     *
     * @return 활성 세션 Flow (없으면 null)
     */
    fun getActiveSession(): Flow<RideSession?> {
        return rideSessionRepository.getActiveSession()
    }

    /**
     * 열차를 세션에 할당 (탑승 시작)
     *
     * @param sessionId 세션 ID
     * @param trainNo 열차 번호
     * @return 업데이트된 세션을 Result로 반환
     */
    suspend fun assignTrain(sessionId: String, trainNo: String): Result<RideSession> {
        val session = rideSessionRepository.getSessionById(sessionId)
            ?: return Result.error(IllegalArgumentException("세션을 찾을 수 없습니다"))

        val updatedSession = session.assignTrain(trainNo)

        return try {
            rideSessionRepository.updateSession(updatedSession)
            Result.success(updatedSession)
        } catch (e: Exception) {
            Result.error(e, "열차 할당에 실패했습니다")
        }
    }

    /**
     * 세션 위치를 업데이트
     *
     * @param sessionId 세션 ID
     * @param currentStationId 현재 역 ID
     * @param remainingStations 남은 역 수
     * @param estimatedArrivalTime 예상 도착 시각
     * @return 업데이트된 세션을 Result로 반환
     */
    suspend fun updateSessionLocation(
        sessionId: String,
        currentStationId: String,
        remainingStations: Int,
        estimatedArrivalTime: LocalDateTime? = null
    ): Result<RideSession> {
        val session = rideSessionRepository.getSessionById(sessionId)
            ?: return Result.error(IllegalArgumentException("세션을 찾을 수 없습니다"))

        val currentStationResult = stationRepository.getStationById(currentStationId)
        if (currentStationResult is Result.Error) {
            return Result.error(currentStationResult.exception, "현재 역을 찾을 수 없습니다")
        }
        val currentStation = currentStationResult.getOrNull()
            ?: return Result.error(IllegalArgumentException("현재 역을 찾을 수 없습니다"))

        val updatedSession = session.updateLocation(
            newCurrentStation = currentStation,
            newRemainingStations = remainingStations,
            newEstimatedArrivalTime = estimatedArrivalTime
        )

        return try {
            rideSessionRepository.updateSession(updatedSession)
            Result.success(updatedSession)
        } catch (e: Exception) {
            Result.error(e, "위치 업데이트에 실패했습니다")
        }
    }

    /**
     * 알림 전송 완료를 표시
     *
     * @param sessionId 세션 ID
     * @return 업데이트된 세션을 Result로 반환
     */
    suspend fun markAlertSent(sessionId: String): Result<RideSession> {
        val session = rideSessionRepository.getSessionById(sessionId)
            ?: return Result.error(IllegalArgumentException("세션을 찾을 수 없습니다"))

        val updatedSession = session.markAlertSent()

        return try {
            rideSessionRepository.updateSession(updatedSession)
            Result.success(updatedSession)
        } catch (e: Exception) {
            Result.error(e, "알림 상태 업데이트에 실패했습니다")
        }
    }

    /**
     * 탑승 추적을 종료
     *
     * @param sessionId 세션 ID
     * @return 성공 여부 Result
     */
    suspend fun stopTracking(sessionId: String): Result<Unit> {
        return try {
            rideSessionRepository.endSession(sessionId)
            Result.success(Unit)
        } catch (e: Exception) {
            Result.error(e, "추적 종료에 실패했습니다")
        }
    }

    /**
     * 세션을 완료 상태로 변경
     *
     * @param sessionId 세션 ID
     * @return 완료된 세션을 Result로 반환
     */
    suspend fun completeSession(sessionId: String): Result<RideSession> {
        val session = rideSessionRepository.getSessionById(sessionId)
            ?: return Result.error(IllegalArgumentException("세션을 찾을 수 없습니다"))

        val completedSession = session.complete()

        return try {
            rideSessionRepository.updateSession(completedSession)
            Result.success(completedSession)
        } catch (e: Exception) {
            Result.error(e, "세션 완료에 실패했습니다")
        }
    }

    /**
     * 실시간 추적 상태를 Flow로 제공
     * 세션 정보와 열차 위치를 결합하여 반환
     *
     * @return 세션과 열차 위치 정보 Flow
     */
    fun observeTrackingState(): Flow<TrackingState?> {
        return rideSessionRepository.getActiveSession().map { session ->
            if (session == null) {
                null
            } else if (session.trackedTrainNo == null) {
                TrackingState(session, null)
            } else {
                val trainLocation = trainRepository.getTrainLocation(session.trackedTrainNo)
                TrackingState(session, trainLocation)
            }
        }
    }

    /**
     * 최근 탑승 기록을 조회
     *
     * @param limit 조회할 개수
     * @return 최근 탑승 기록 Flow
     */
    fun getRecentSessions(limit: Int = 10): Flow<List<RideSession>> {
        return rideSessionRepository.getRecentSessions(limit)
    }

    /**
     * 모든 탑승 기록을 삭제
     *
     * @return 성공 여부 Result
     */
    suspend fun clearAllSessions(): Result<Unit> {
        return try {
            rideSessionRepository.clearAllSessions()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.error(e, "기록 삭제에 실패했습니다")
        }
    }

    /**
     * 추적 상태 데이터 클래스
     */
    data class TrackingState(
        val session: RideSession,
        val trainLocation: TrainLocation?
    ) {
        /**
         * 알림을 보내야 하는지 확인
         */
        fun shouldSendAlert(): Boolean = session.shouldSendAlert()

        /**
         * 세션이 활성 상태인지 확인
         */
        fun isActive(): Boolean = session.isActive()

        /**
         * 탑승 진행률 계산 (0.0 ~ 1.0)
         */
        fun getProgress(totalStations: Int): Float = session.calculateProgress(totalStations)

        /**
         * 예상 남은 시간 (분)
         */
        fun getRemainingMinutes(): Int? = session.getEstimatedRemainingMinutes()
    }
}
