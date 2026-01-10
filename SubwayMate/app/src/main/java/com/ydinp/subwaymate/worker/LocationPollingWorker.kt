package com.ydinp.subwaymate.worker

import android.app.NotificationManager
import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.ydinp.subwaymate.domain.common.Result
import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.repository.TrainLocationRepository
import com.ydinp.subwaymate.notification.AlertNotificationBuilder
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * Doze 모드에서도 동작하는 위치 폴링 Worker
 *
 * WorkManager를 통해 주기적으로 열차 위치를 조회하고,
 * 도착 알림 조건을 확인하여 필요 시 알림을 발송합니다.
 *
 * Doze 모드에서도 WorkManager의 제약에 따라 동작하며,
 * 배터리 최적화 예외 설정 시 더 정확한 타이밍에 실행됩니다.
 */
@HiltWorker
class LocationPollingWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted workerParams: WorkerParameters,
    private val trainLocationRepository: TrainLocationRepository,
    private val alertNotificationBuilder: AlertNotificationBuilder,
    private val notificationManager: NotificationManager
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result {
        Log.d(TAG, "LocationPollingWorker started - attempt: $runAttemptCount")

        return try {
            // 1. InputData에서 세션 정보 가져오기
            val sessionId = inputData.getString(KEY_SESSION_ID)
            val departureStation = inputData.getString(KEY_DEPARTURE_STATION)
            val arrivalStation = inputData.getString(KEY_ARRIVAL_STATION)
            val lineId = inputData.getString(KEY_LINE_ID)
            val directionCode = inputData.getString(KEY_DIRECTION)
            val alertStationsBefore = inputData.getInt(KEY_ALERT_STATIONS_BEFORE, DEFAULT_ALERT_STATIONS)
            val trackedTrainNo = inputData.getString(KEY_TRACKED_TRAIN_NO)

            // 필수 파라미터 검증
            if (sessionId.isNullOrEmpty() || lineId.isNullOrEmpty() ||
                departureStation.isNullOrEmpty() || arrivalStation.isNullOrEmpty()) {
                Log.e(TAG, "Missing required parameters - sessionId: $sessionId, lineId: $lineId")
                return Result.failure()
            }

            val direction = directionCode?.let { code ->
                Direction.fromCode(code)
            } ?: Direction.UP

            Log.d(TAG, "Polling session: $sessionId, line: $lineId, direction: ${direction.displayName}")

            // 2. 열차 위치 조회 API 호출
            val trainLocationResult = if (!trackedTrainNo.isNullOrEmpty()) {
                // 이미 추적 중인 열차가 있는 경우
                trainLocationRepository.getTrainLocation(trackedTrainNo, lineId)
            } else {
                // 출발역 근처의 다음 열차 찾기
                trainLocationRepository.getNextTrain(
                    stationId = departureStation,
                    lineId = lineId,
                    direction = direction
                ).let { result ->
                    when (result) {
                        is com.ydinp.subwaymate.domain.common.Result.Success -> {
                            result.data?.let { train ->
                                com.ydinp.subwaymate.domain.common.Result.Success(train)
                            } ?: com.ydinp.subwaymate.domain.common.Result.Error(
                                Exception("No train found")
                            )
                        }
                        is com.ydinp.subwaymate.domain.common.Result.Error -> result
                        is com.ydinp.subwaymate.domain.common.Result.Loading -> {
                            com.ydinp.subwaymate.domain.common.Result.Error(
                                Exception("Unexpected loading state")
                            )
                        }
                    }
                }
            }

            // 3. 결과 처리
            when (trainLocationResult) {
                is com.ydinp.subwaymate.domain.common.Result.Success -> {
                    val trainLocation = trainLocationResult.data
                    Log.d(TAG, "Train location: ${trainLocation.currentStationId}, " +
                            "next: ${trainLocation.nextStationId}")

                    // 4. 도착 알림 조건 체크 (간단한 역 기반 체크)
                    val shouldAlert = checkArrivalAlertCondition(
                        trainLocation = trainLocation,
                        arrivalStationId = arrivalStation,
                        alertStationsBefore = alertStationsBefore
                    )

                    // 5. 필요 시 알림 발송
                    if (shouldAlert) {
                        Log.d(TAG, "Sending arrival alert for session: $sessionId")
                        sendArrivalNotification(
                            arrivalStationName = arrivalStation,
                            remainingStations = alertStationsBefore,
                            lineId = lineId
                        )
                    }

                    // 6. 성공 반환
                    Log.d(TAG, "LocationPollingWorker completed successfully")
                    Result.success()
                }

                is com.ydinp.subwaymate.domain.common.Result.Error -> {
                    Log.e(TAG, "Failed to get train location: ${trainLocationResult.exception.message}")

                    // 네트워크 오류 등의 경우 재시도
                    if (runAttemptCount < MAX_RETRY_COUNT) {
                        Log.d(TAG, "Scheduling retry - attempt: ${runAttemptCount + 1}")
                        Result.retry()
                    } else {
                        Log.e(TAG, "Max retry count reached, failing")
                        Result.failure()
                    }
                }

                is com.ydinp.subwaymate.domain.common.Result.Loading -> {
                    // 로딩 상태는 예상치 않음
                    Result.success()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "LocationPollingWorker error", e)

            // 예외 발생 시 재시도 로직
            if (runAttemptCount < MAX_RETRY_COUNT) {
                Result.retry()
            } else {
                Result.failure()
            }
        }
    }

    /**
     * 도착 알림 조건 확인
     *
     * 열차의 현재 위치가 도착역에서 설정된 역 수 이내인지 확인합니다.
     *
     * @param trainLocation 현재 열차 위치 정보
     * @param arrivalStationId 도착역 ID
     * @param alertStationsBefore 알림 기준 역 수
     * @return 알림을 발송해야 하면 true
     */
    private fun checkArrivalAlertCondition(
        trainLocation: com.ydinp.subwaymate.domain.model.TrainLocation,
        arrivalStationId: String,
        alertStationsBefore: Int
    ): Boolean {
        // 현재 역이 도착역이면 알림 (0역 전)
        if (trainLocation.currentStationId == arrivalStationId) {
            return true
        }

        // 다음 역이 도착역이면 알림 (1역 전)
        if (trainLocation.nextStationId == arrivalStationId && alertStationsBefore >= 1) {
            return true
        }

        // TODO: 실제 구현에서는 노선의 역 순서 정보를 사용하여
        // 정확한 남은 역 수를 계산해야 합니다.
        // 현재는 간단한 조건만 체크합니다.

        return false
    }

    /**
     * 도착 알림 발송
     *
     * @param arrivalStationName 도착역 이름
     * @param remainingStations 남은 역 수
     * @param lineId 노선 ID
     */
    private fun sendArrivalNotification(
        arrivalStationName: String,
        remainingStations: Int,
        lineId: String
    ) {
        // 간단한 알림 발송 (실제로는 RideSession 객체를 사용해야 함)
        // AlertNotificationBuilder를 통해 알림 생성 시 RideSession이 필요하므로
        // 여기서는 기본 알림을 직접 생성합니다.

        val notification = androidx.core.app.NotificationCompat.Builder(
            applicationContext,
            com.ydinp.subwaymate.SubwayMateApp.CHANNEL_ALERT
        )
            .setSmallIcon(com.ydinp.subwaymate.R.drawable.ic_launcher_foreground)
            .setContentTitle("도착 알림")
            .setContentText("${arrivalStationName}역까지 ${remainingStations}역 남았습니다")
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(
            NOTIFICATION_ID_POLLING_ALERT,
            notification
        )
    }

    companion object {
        private const val TAG = "LocationPollingWorker"

        /** 최대 재시도 횟수 */
        private const val MAX_RETRY_COUNT = 3

        /** 기본 알림 역 수 */
        private const val DEFAULT_ALERT_STATIONS = 2

        /** 폴링 알림 ID */
        private const val NOTIFICATION_ID_POLLING_ALERT = 3001

        // ============== InputData 키 ==============

        /** 세션 ID */
        const val KEY_SESSION_ID = "session_id"

        /** 출발역 ID */
        const val KEY_DEPARTURE_STATION = "departure_station"

        /** 도착역 ID */
        const val KEY_ARRIVAL_STATION = "arrival_station"

        /** 노선 ID */
        const val KEY_LINE_ID = "line_id"

        /** 운행 방향 코드 */
        const val KEY_DIRECTION = "direction"

        /** 알림 기준 역 수 */
        const val KEY_ALERT_STATIONS_BEFORE = "alert_stations_before"

        /** 추적 중인 열차 번호 */
        const val KEY_TRACKED_TRAIN_NO = "tracked_train_no"
    }
}
