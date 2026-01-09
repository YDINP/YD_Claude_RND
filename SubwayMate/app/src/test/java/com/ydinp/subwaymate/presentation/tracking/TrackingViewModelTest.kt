package com.ydinp.subwaymate.presentation.tracking

import androidx.lifecycle.SavedStateHandle
import app.cash.turbine.test
import com.ydinp.subwaymate.domain.common.Result
import com.ydinp.subwaymate.domain.model.AlertSetting
import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.model.RideStatus
import com.ydinp.subwaymate.domain.usecase.GetStationsUseCase
import com.ydinp.subwaymate.domain.usecase.GetTrainLocationUseCase
import com.ydinp.subwaymate.domain.usecase.ManageFavoritesUseCase
import com.ydinp.subwaymate.domain.usecase.StartTrackingUseCase
import com.ydinp.subwaymate.util.TestData
import com.ydinp.subwaymate.util.TestDispatcherRule
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test

/**
 * TrackingViewModel 테스트
 *
 * 테스트 항목:
 * - 추적 시작/중지 테스트
 * - 위치 업데이트 테스트
 * - 도착 알림 조건 테스트
 * - 열차 선택 테스트
 * - 알림 설정 변경 테스트
 */
@OptIn(ExperimentalCoroutinesApi::class)
class TrackingViewModelTest {

    @get:Rule
    val testDispatcherRule = TestDispatcherRule()

    // Mocked dependencies
    private lateinit var savedStateHandle: SavedStateHandle
    private lateinit var startTrackingUseCase: StartTrackingUseCase
    private lateinit var getStationsUseCase: GetStationsUseCase
    private lateinit var getTrainLocationUseCase: GetTrainLocationUseCase
    private lateinit var manageFavoritesUseCase: ManageFavoritesUseCase

    // Subject under test
    private lateinit var viewModel: TrackingViewModel

    @Before
    fun setUp() {
        savedStateHandle = SavedStateHandle()
        startTrackingUseCase = mockk(relaxed = true)
        getStationsUseCase = mockk(relaxed = true)
        getTrainLocationUseCase = mockk(relaxed = true)
        manageFavoritesUseCase = mockk(relaxed = true)

        setupDefaultMocks()
    }

    private fun setupDefaultMocks() {
        // SavedStateHandle 기본 값 설정
        savedStateHandle[TrackingViewModel.ARG_DEPARTURE_ID] = TestData.stationSeoul.id
        savedStateHandle[TrackingViewModel.ARG_ARRIVAL_ID] = TestData.stationDongDaeMun.id
        savedStateHandle[TrackingViewModel.ARG_LINE_ID] = TestData.line1.id
        savedStateHandle[TrackingViewModel.ARG_DIRECTION] = Direction.DOWN.code

        // GetStationsUseCase
        coEvery { getStationsUseCase.getStationById(TestData.stationSeoul.id) } returns
            Result.success(TestData.stationSeoul)
        coEvery { getStationsUseCase.getStationById(TestData.stationDongDaeMun.id) } returns
            Result.success(TestData.stationDongDaeMun)
        coEvery { getStationsUseCase.getLineById(TestData.line1.id) } returns
            Result.success(TestData.line1)
        coEvery {
            getStationsUseCase.getStationsBetween(
                TestData.stationSeoul.id,
                TestData.stationDongDaeMun.id,
                TestData.line1.id
            )
        } returns Result.success(TestData.line1Stations)
        coEvery {
            getStationsUseCase.getStationCountBetween(
                TestData.stationSeoul.id,
                TestData.stationDongDaeMun.id,
                TestData.line1.id
            )
        } returns Result.success(5)

        // StartTrackingUseCase
        coEvery { startTrackingUseCase.startTracking(any()) } returns
            Result.success(TestData.rideSession1)
        coEvery { startTrackingUseCase.stopTracking(any()) } returns Result.success(Unit)
        coEvery { startTrackingUseCase.completeSession(any()) } returns
            Result.success(TestData.rideSessionArrived)
        coEvery { startTrackingUseCase.markAlertSent(any()) } returns
            Result.success(TestData.rideSession1.markAlertSent())
        every { startTrackingUseCase.observeTrackingState() } returns flowOf(
            StartTrackingUseCase.TrackingState(TestData.rideSession1, TestData.trainLocation1)
        )

        // GetTrainLocationUseCase
        coEvery { getTrainLocationUseCase.getApproachingTrains(any(), any()) } returns
            listOf(TestData.trainLocation1, TestData.trainLocation2)
        every { getTrainLocationUseCase.getTrainLocations(any()) } returns
            flowOf(listOf(TestData.trainLocation1))
        coEvery { getTrainLocationUseCase.getTrainLocation(any()) } returns TestData.trainLocation1
        coEvery { getTrainLocationUseCase.calculateRemainingStations(any(), any()) } returns
            Result.success(3)

        // ManageFavoritesUseCase
        coEvery { manageFavoritesUseCase.addFavoriteRoute(any(), any(), any(), any(), any(), any()) } returns
            Result.success(Unit)
    }

    private fun createViewModel(): TrackingViewModel {
        return TrackingViewModel(
            savedStateHandle = savedStateHandle,
            startTrackingUseCase = startTrackingUseCase,
            getStationsUseCase = getStationsUseCase,
            getTrainLocationUseCase = getTrainLocationUseCase,
            manageFavoritesUseCase = manageFavoritesUseCase
        )
    }

    // ============== 추적 시작 테스트 ==============

    @Test
    fun `초기 상태는 Loading이다`() = runTest {
        // When
        viewModel = createViewModel()

        // Then
        assertTrue(viewModel.uiState.value is TrackingUiState.Loading)
    }

    @Test
    fun `초기화 성공 시 Preparing 상태로 전환된다`() = runTest {
        // Given & When
        viewModel = createViewModel()
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem()
            assertTrue(state is TrackingUiState.Preparing)

            val preparingState = state as TrackingUiState.Preparing
            assertEquals(TestData.stationSeoul.id, preparingState.departureStation.id)
            assertEquals(TestData.stationDongDaeMun.id, preparingState.arrivalStation.id)
        }
    }

    @Test
    fun `접근 중인 열차 목록이 로드된다`() = runTest {
        // Given
        val approachingTrains = listOf(TestData.trainLocation1, TestData.trainLocation2)
        coEvery { getTrainLocationUseCase.getApproachingTrains(any(), any()) } returns approachingTrains

        // When
        viewModel = createViewModel()
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem() as? TrackingUiState.Preparing
            assertNotNull(state)
            assertEquals(2, state!!.approachingTrains.size)
        }
    }

    @Test
    fun `출발역 ID가 없으면 Error 상태가 된다`() = runTest {
        // Given
        savedStateHandle.remove<String>(TrackingViewModel.ARG_DEPARTURE_ID)

        // When
        viewModel = createViewModel()
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem()
            assertTrue(state is TrackingUiState.Error)
            assertTrue((state as TrackingUiState.Error).message.contains("출발역"))
        }
    }

    // ============== 열차 선택 테스트 ==============

    @Test
    fun `열차 선택 시 Tracking 상태로 전환된다`() = runTest {
        // Given
        viewModel = createViewModel()
        advanceUntilIdle()

        coEvery { startTrackingUseCase.assignTrain(any(), any()) } returns
            Result.success(TestData.rideSession1.assignTrain("1234"))

        // When
        viewModel.onEvent(TrackingUiEvent.SelectTrain("1234"))
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem()
            assertTrue(state is TrackingUiState.Tracking)
        }
    }

    @Test
    fun `열차 선택 시 startTracking이 호출된다`() = runTest {
        // Given
        viewModel = createViewModel()
        advanceUntilIdle()

        // When
        viewModel.onEvent(TrackingUiEvent.SelectTrain("1234"))
        advanceUntilIdle()

        // Then
        coVerify { startTrackingUseCase.startTracking(any()) }
    }

    // ============== 추적 중지 테스트 ==============

    @Test
    fun `추적 중지 시 메인 화면으로 이동한다`() = runTest {
        // Given
        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.onEvent(TrackingUiEvent.SelectTrain("1234"))
        advanceUntilIdle()

        // When & Then
        viewModel.sideEffect.test {
            viewModel.onEvent(TrackingUiEvent.StopTracking)
            advanceUntilIdle()

            val effect = awaitItem()
            assertTrue(effect is TrackingSideEffect.NavigateToMain)
        }

        coVerify { startTrackingUseCase.stopTracking(any()) }
    }

    @Test
    fun `추적 완료 시 Completed 상태로 전환된다`() = runTest {
        // Given
        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.onEvent(TrackingUiEvent.SelectTrain("1234"))
        advanceUntilIdle()

        // When
        viewModel.onEvent(TrackingUiEvent.CompleteTracking)
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem()
            assertTrue(state is TrackingUiState.Completed)
        }
    }

    // ============== 위치 업데이트 테스트 ==============

    @Test
    fun `위치 업데이트 시 remainingStations가 감소한다`() = runTest {
        // Given
        val updatedSession = TestData.rideSession1.copy(remainingStations = 2)
        every { startTrackingUseCase.observeTrackingState() } returns flowOf(
            StartTrackingUseCase.TrackingState(updatedSession, TestData.trainLocation1)
        )

        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.onEvent(TrackingUiEvent.SelectTrain("1234"))
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem() as? TrackingUiState.Tracking
            assertNotNull(state)
            assertEquals(2, state!!.remainingStations)
        }
    }

    @Test
    fun `열차 위치 정보가 업데이트된다`() = runTest {
        // Given
        every { startTrackingUseCase.observeTrackingState() } returns flowOf(
            StartTrackingUseCase.TrackingState(TestData.rideSession1, TestData.trainLocation1)
        )

        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.onEvent(TrackingUiEvent.SelectTrain("1234"))
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem() as? TrackingUiState.Tracking
            assertNotNull(state)
            assertEquals(TestData.trainLocation1.trainNo, state!!.trainLocation?.trainNo)
        }
    }

    // ============== 도착 알림 조건 테스트 ==============

    @Test
    fun `남은 역이 알림 설정값 이하면 shouldAlert가 true가 된다`() = runTest {
        // Given: 2역 전 알림 설정, 남은 역 2개
        val sessionWithAlert = TestData.rideSession1.copy(
            remainingStations = 2,
            status = RideStatus.APPROACHING,
            alertSetting = AlertSetting(stationsBefore = 2),
            alertSent = false
        )
        every { startTrackingUseCase.observeTrackingState() } returns flowOf(
            StartTrackingUseCase.TrackingState(sessionWithAlert, TestData.trainLocation1)
        )

        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.onEvent(TrackingUiEvent.SelectTrain("1234"))
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem() as? TrackingUiState.Tracking
            assertNotNull(state)
            assertTrue(state!!.shouldAlert)
        }
    }

    @Test
    fun `이미 알림이 전송된 경우 shouldAlert가 false가 된다`() = runTest {
        // Given: 알림이 이미 전송된 세션
        val sessionAlreadyAlerted = TestData.rideSession1.copy(
            remainingStations = 1,
            alertSent = true
        )
        every { startTrackingUseCase.observeTrackingState() } returns flowOf(
            StartTrackingUseCase.TrackingState(sessionAlreadyAlerted, TestData.trainLocation1)
        )

        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.onEvent(TrackingUiEvent.SelectTrain("1234"))
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem() as? TrackingUiState.Tracking
            assertNotNull(state)
            assertTrue(!state!!.shouldAlert)
        }
    }

    @Test
    fun `알림 조건 충족 시 알림 Side Effect가 발생한다`() = runTest {
        // Given
        val sessionWithAlert = TestData.rideSession1.copy(
            remainingStations = 2,
            status = RideStatus.APPROACHING,
            alertSetting = AlertSetting(stationsBefore = 2),
            alertSent = false
        )
        every { startTrackingUseCase.observeTrackingState() } returns flowOf(
            StartTrackingUseCase.TrackingState(sessionWithAlert, TestData.trainLocation1)
        )

        viewModel = createViewModel()
        advanceUntilIdle()

        // When
        viewModel.onEvent(TrackingUiEvent.SelectTrain("1234"))
        advanceUntilIdle()

        // Then
        viewModel.sideEffect.test {
            val effect = awaitItem()
            assertTrue(
                effect is TrackingSideEffect.SendNotification ||
                    effect is TrackingSideEffect.Vibrate
            )
        }
    }

    @Test
    fun `알림 확인 이벤트 처리 시 markAlertSent가 호출된다`() = runTest {
        // Given
        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.onEvent(TrackingUiEvent.SelectTrain("1234"))
        advanceUntilIdle()

        // When
        viewModel.onEvent(TrackingUiEvent.AcknowledgeAlert)
        advanceUntilIdle()

        // Then
        coVerify { startTrackingUseCase.markAlertSent(any()) }
    }

    // ============== 알림 설정 변경 테스트 ==============

    @Test
    fun `알림 설정 변경 이벤트 처리`() = runTest {
        // Given
        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.onEvent(TrackingUiEvent.SelectTrain("1234"))
        advanceUntilIdle()

        val newAlertSetting = AlertSetting(
            stationsBefore = 3,
            minutesBefore = 5,
            soundEnabled = true,
            vibrationEnabled = false
        )

        // When & Then
        viewModel.sideEffect.test {
            viewModel.onEvent(TrackingUiEvent.UpdateAlertSetting(newAlertSetting))
            advanceUntilIdle()

            val effect = awaitItem()
            assertTrue(effect is TrackingSideEffect.ShowSnackbar)
            assertTrue((effect as TrackingSideEffect.ShowSnackbar).message.contains("알림"))
        }
    }

    // ============== 새로고침 테스트 ==============

    @Test
    fun `새로고침 이벤트 처리 시 열차 위치가 갱신된다`() = runTest {
        // Given
        viewModel = createViewModel()
        advanceUntilIdle()

        // When
        viewModel.onEvent(TrackingUiEvent.Refresh)
        advanceUntilIdle()

        // Then: 접근 중인 열차 목록 재조회
        coVerify(atLeast = 2) { getTrainLocationUseCase.getApproachingTrains(any(), any()) }
    }

    @Test
    fun `접근 열차 새로고침 이벤트 처리`() = runTest {
        // Given
        viewModel = createViewModel()
        advanceUntilIdle()

        // When
        viewModel.onEvent(TrackingUiEvent.RefreshApproachingTrains)
        advanceUntilIdle()

        // Then
        coVerify(atLeast = 2) { getTrainLocationUseCase.getApproachingTrains(any(), any()) }
    }

    // ============== 즐겨찾기 추가 테스트 ==============

    @Test
    fun `경로 즐겨찾기 추가 이벤트 처리`() = runTest {
        // Given
        viewModel = createViewModel()
        advanceUntilIdle()

        // When & Then
        viewModel.sideEffect.test {
            viewModel.onEvent(TrackingUiEvent.AddRouteToFavorites)
            advanceUntilIdle()

            coVerify {
                manageFavoritesUseCase.addFavoriteRoute(
                    any(), any(), any(), any(), any(), any()
                )
            }

            val effect = awaitItem()
            assertTrue(effect is TrackingSideEffect.ShowSnackbar)
            assertTrue((effect as TrackingSideEffect.ShowSnackbar).message.contains("즐겨찾기"))
        }
    }

    // ============== 뒤로가기 테스트 ==============

    @Test
    fun `뒤로가기 이벤트 처리 시 NavigateBack 효과가 발생한다`() = runTest {
        // Given
        viewModel = createViewModel()
        advanceUntilIdle()

        // When & Then
        viewModel.sideEffect.test {
            viewModel.onEvent(TrackingUiEvent.NavigateBack)
            advanceUntilIdle()

            val effect = awaitItem()
            assertTrue(effect is TrackingSideEffect.NavigateBack)
        }
    }

    // ============== 에러 처리 테스트 ==============

    @Test
    fun `역 정보 조회 실패 시 Error 상태가 된다`() = runTest {
        // Given
        coEvery { getStationsUseCase.getStationById(TestData.stationSeoul.id) } returns
            Result.error(Exception("역 조회 실패"), "역 조회 실패")

        // When
        viewModel = createViewModel()
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem()
            assertTrue(state is TrackingUiState.Error)
        }
    }

    @Test
    fun `에러 해제 이벤트 처리`() = runTest {
        // Given
        coEvery { getStationsUseCase.getStationById(any()) } returns
            Result.error(Exception("오류"), "오류")

        viewModel = createViewModel()
        advanceUntilIdle()

        // When
        viewModel.onEvent(TrackingUiEvent.DismissError)
        advanceUntilIdle()

        // Then: NavigateBack 효과 발생
        viewModel.sideEffect.test {
            viewModel.onEvent(TrackingUiEvent.DismissError)
            advanceUntilIdle()

            val effect = awaitItem()
            assertTrue(effect is TrackingSideEffect.NavigateBack)
        }
    }

    // ============== 알림 테스트 이벤트 (디버그) ==============

    @Test
    fun `알림 테스트 이벤트 처리 시 알림 관련 효과가 발생한다`() = runTest {
        // Given
        viewModel = createViewModel()
        advanceUntilIdle()

        // When & Then
        viewModel.sideEffect.test {
            viewModel.onEvent(TrackingUiEvent.TestAlert)
            advanceUntilIdle()

            val effect = awaitItem()
            assertTrue(
                effect is TrackingSideEffect.SendNotification ||
                    effect is TrackingSideEffect.Vibrate ||
                    effect is TrackingSideEffect.PlayAlertSound
            )
        }
    }
}
