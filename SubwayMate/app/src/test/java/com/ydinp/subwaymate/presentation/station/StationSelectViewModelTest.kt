package com.ydinp.subwaymate.presentation.station

import androidx.lifecycle.SavedStateHandle
import app.cash.turbine.test
import com.ydinp.subwaymate.domain.common.Result
import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.usecase.GetStationsUseCase
import com.ydinp.subwaymate.domain.usecase.ManageFavoritesUseCase
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test

/**
 * StationSelectViewModel 테스트
 *
 * 테스트 항목:
 * - 역 목록 로드 테스트
 * - 검색어 필터링 테스트
 * - 노선 필터 테스트
 * - 출발역/도착역 선택 테스트
 * - 방향 선택 테스트
 * - 역 교환 테스트
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StationSelectViewModelTest {

    @get:Rule
    val testDispatcherRule = TestDispatcherRule()

    // Mocked dependencies
    private lateinit var savedStateHandle: SavedStateHandle
    private lateinit var getStationsUseCase: GetStationsUseCase
    private lateinit var manageFavoritesUseCase: ManageFavoritesUseCase

    // Subject under test
    private lateinit var viewModel: StationSelectViewModel

    @Before
    fun setUp() {
        savedStateHandle = SavedStateHandle()
        getStationsUseCase = mockk(relaxed = true)
        manageFavoritesUseCase = mockk(relaxed = true)

        setupDefaultMocks()
    }

    private fun setupDefaultMocks() {
        // GetStationsUseCase
        every { getStationsUseCase.observeAllLines() } returns flowOf(
            Result.success(TestData.allLines)
        )
        every { getStationsUseCase.observeStationsByLine(any()) } returns flowOf(
            Result.success(TestData.line1Stations)
        )
        every { getStationsUseCase.observeSearchStations(any()) } returns flowOf(
            Result.success(emptyList())
        )
        coEvery { getStationsUseCase.getLineById(any()) } returns Result.success(TestData.line1)
        coEvery { getStationsUseCase.loadInitialData() } returns Result.success(Unit)

        // ManageFavoritesUseCase
        every { manageFavoritesUseCase.observeRecentSearchStations(any()) } returns flowOf(
            Result.success(emptyList())
        )
        coEvery { manageFavoritesUseCase.addRecentSearchStation(any()) } returns Result.success(Unit)
        coEvery { manageFavoritesUseCase.toggleFavoriteStation(any()) } returns Result.success(true)
    }

    private fun createViewModel(lineId: String? = null): StationSelectViewModel {
        if (lineId != null) {
            savedStateHandle[StationSelectViewModel.ARG_LINE_ID] = lineId
        }
        return StationSelectViewModel(
            savedStateHandle = savedStateHandle,
            getStationsUseCase = getStationsUseCase,
            manageFavoritesUseCase = manageFavoritesUseCase
        )
    }

    // ============== 역 목록 로드 테스트 ==============

    @Test
    fun `초기 상태는 Loading이다`() = runTest {
        // When
        viewModel = createViewModel()

        // Then
        assertTrue(viewModel.uiState.value is StationSelectUiState.Loading)
    }

    @Test
    fun `노선 선택 시 해당 노선의 역 목록이 로드된다`() = runTest {
        // Given
        every { getStationsUseCase.observeStationsByLine("1001") } returns flowOf(
            Result.success(TestData.line1Stations)
        )

        // When
        viewModel = createViewModel(lineId = "1001")
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem() as? StationSelectUiState.Success
            assertNotNull(state)
            assertEquals(TestData.line1Stations.size, state!!.stations.size)
        }
    }

    @Test
    fun `노선 목록이 정상적으로 로드된다`() = runTest {
        // When
        viewModel = createViewModel()
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem() as? StationSelectUiState.Success
            assertNotNull(state)
            assertEquals(TestData.allLines.size, state!!.lines.size)
        }
    }

    @Test
    fun `노선 선택 이벤트 처리 시 해당 노선이 선택된다`() = runTest {
        // Given
        viewModel = createViewModel()
        advanceUntilIdle()

        // When
        viewModel.onEvent(StationSelectUiEvent.SelectLine(TestData.line2))
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem() as? StationSelectUiState.Success
            assertNotNull(state)
            assertEquals(TestData.line2.id, state!!.selectedLine?.id)
        }
    }

    // ============== 검색어 필터링 테스트 ==============

    @Test
    fun `검색어 입력 시 역 목록이 필터링된다`() = runTest {
        // Given
        val searchResults = listOf(TestData.stationSeoul, TestData.stationSiCheong)
        every { getStationsUseCase.observeSearchStations("서") } returns flowOf(
            Result.success(searchResults)
        )

        viewModel = createViewModel()
        advanceUntilIdle()

        // When
        viewModel.onEvent(StationSelectUiEvent.SearchQueryChanged("서"))
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem() as? StationSelectUiState.Success
            assertNotNull(state)
            assertEquals("서", state!!.searchQuery)
        }
    }

    @Test
    fun `검색어가 2글자 미만이면 필터링되지 않는다`() = runTest {
        // Given
        every { getStationsUseCase.observeSearchStations("강") } returns flowOf(
            Result.success(emptyList())
        )

        viewModel = createViewModel()
        advanceUntilIdle()

        // When
        viewModel.onEvent(StationSelectUiEvent.SearchQueryChanged("강"))
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem() as? StationSelectUiState.Success
            assertNotNull(state)
            // 2글자 미만이라 빈 결과
            assertTrue(state!!.filteredStations.isEmpty())
        }
    }

    @Test
    fun `검색어 초기화 시 검색어가 비워진다`() = runTest {
        // Given
        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.onEvent(StationSelectUiEvent.SearchQueryChanged("강남"))
        advanceUntilIdle()

        // When
        viewModel.onEvent(StationSelectUiEvent.ClearSearch)
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem() as? StationSelectUiState.Success
            assertNotNull(state)
            assertEquals("", state!!.searchQuery)
        }
    }

    // ============== 출발역/도착역 선택 테스트 ==============

    @Test
    fun `출발역 선택 모드에서 역 선택 시 출발역이 설정된다`() = runTest {
        // Given
        viewModel = createViewModel(lineId = "1001")
        advanceUntilIdle()

        // When
        viewModel.onEvent(StationSelectUiEvent.SelectStation(TestData.stationSeoul))
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem() as? StationSelectUiState.Success
            assertNotNull(state)
            assertEquals(TestData.stationSeoul.id, state!!.departureStation?.id)
            // 자동으로 도착역 선택 모드로 전환
            assertEquals(SelectionMode.ARRIVAL, state.selectionMode)
        }
    }

    @Test
    fun `도착역 선택 모드에서 역 선택 시 도착역이 설정된다`() = runTest {
        // Given
        viewModel = createViewModel(lineId = "1001")
        advanceUntilIdle()

        // 먼저 출발역 선택
        viewModel.onEvent(StationSelectUiEvent.SelectStation(TestData.stationSeoul))
        advanceUntilIdle()

        // When: 도착역 선택
        viewModel.onEvent(StationSelectUiEvent.SelectStation(TestData.stationJongGak))
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem() as? StationSelectUiState.Success
            assertNotNull(state)
            assertEquals(TestData.stationSeoul.id, state!!.departureStation?.id)
            assertEquals(TestData.stationJongGak.id, state.arrivalStation?.id)
        }
    }

    @Test
    fun `출발역과 같은 역을 도착역으로 선택할 수 없다`() = runTest {
        // Given
        viewModel = createViewModel(lineId = "1001")
        advanceUntilIdle()

        // 출발역 선택
        viewModel.onEvent(StationSelectUiEvent.SelectStation(TestData.stationSeoul))
        advanceUntilIdle()

        // When & Then: 같은 역을 도착역으로 선택 시도
        viewModel.sideEffect.test {
            viewModel.onEvent(StationSelectUiEvent.SelectStation(TestData.stationSeoul))
            advanceUntilIdle()

            val effect = awaitItem()
            assertTrue(effect is StationSelectSideEffect.ShowSnackbar)
            assertTrue((effect as StationSelectSideEffect.ShowSnackbar).message.contains("다른 역"))
        }
    }

    @Test
    fun `최근 검색 기록에 역이 추가된다`() = runTest {
        // Given
        viewModel = createViewModel(lineId = "1001")
        advanceUntilIdle()

        // When
        viewModel.onEvent(StationSelectUiEvent.SelectStation(TestData.stationSeoul))
        advanceUntilIdle()

        // Then
        coVerify { manageFavoritesUseCase.addRecentSearchStation(TestData.stationSeoul) }
    }

    // ============== 방향 선택 테스트 ==============

    @Test
    fun `방향 선택 이벤트 처리`() = runTest {
        // Given
        viewModel = createViewModel(lineId = "1001")
        advanceUntilIdle()

        // When
        viewModel.onEvent(StationSelectUiEvent.SelectDirection(Direction.UP))
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem() as? StationSelectUiState.Success
            assertNotNull(state)
            assertEquals(Direction.UP, state!!.selectedDirection)
        }
    }

    @Test
    fun `일반 노선에서 역 순서에 따라 방향이 자동 결정된다`() = runTest {
        // Given: 비순환 노선
        every { getStationsUseCase.observeStationsByLine("1001") } returns flowOf(
            Result.success(TestData.line1Stations)
        )

        viewModel = createViewModel(lineId = "1001")
        advanceUntilIdle()

        // 출발역 선택 (서울역 - index 0)
        viewModel.onEvent(StationSelectUiEvent.SelectStation(TestData.stationSeoul))
        advanceUntilIdle()

        // When: 도착역 선택 (종각 - index 2, 더 높은 인덱스)
        viewModel.onEvent(StationSelectUiEvent.SelectStation(TestData.stationJongGak))
        advanceUntilIdle()

        // Then: 하행 방향이 자동 설정됨
        viewModel.uiState.test {
            val state = awaitItem() as? StationSelectUiState.Success
            assertNotNull(state)
            assertEquals(Direction.DOWN, state!!.selectedDirection)
        }
    }

    // ============== 역 교환 테스트 ==============

    @Test
    fun `출발역과 도착역 교환 시 두 역이 바뀐다`() = runTest {
        // Given
        viewModel = createViewModel(lineId = "1001")
        advanceUntilIdle()

        // 출발역, 도착역 설정
        viewModel.onEvent(StationSelectUiEvent.SelectStation(TestData.stationSeoul))
        advanceUntilIdle()
        viewModel.onEvent(StationSelectUiEvent.SelectStation(TestData.stationJongGak))
        advanceUntilIdle()

        // When
        viewModel.onEvent(StationSelectUiEvent.SwapStations)
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem() as? StationSelectUiState.Success
            assertNotNull(state)
            assertEquals(TestData.stationJongGak.id, state!!.departureStation?.id)
            assertEquals(TestData.stationSeoul.id, state.arrivalStation?.id)
        }
    }

    @Test
    fun `역 교환 시 방향도 반전된다`() = runTest {
        // Given
        viewModel = createViewModel(lineId = "1001")
        advanceUntilIdle()

        // 출발역, 도착역, 방향 설정
        viewModel.onEvent(StationSelectUiEvent.SelectStation(TestData.stationSeoul))
        advanceUntilIdle()
        viewModel.onEvent(StationSelectUiEvent.SelectStation(TestData.stationJongGak))
        advanceUntilIdle()
        viewModel.onEvent(StationSelectUiEvent.SelectDirection(Direction.DOWN))
        advanceUntilIdle()

        // When
        viewModel.onEvent(StationSelectUiEvent.SwapStations)
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem() as? StationSelectUiState.Success
            assertNotNull(state)
            assertEquals(Direction.UP, state!!.selectedDirection)
        }
    }

    // ============== 선택 초기화 테스트 ==============

    @Test
    fun `출발역 초기화 시 출발역이 null이 되고 선택 모드가 DEPARTURE로 변경된다`() = runTest {
        // Given
        viewModel = createViewModel(lineId = "1001")
        advanceUntilIdle()

        viewModel.onEvent(StationSelectUiEvent.SelectStation(TestData.stationSeoul))
        advanceUntilIdle()

        // When
        viewModel.onEvent(StationSelectUiEvent.ClearDepartureStation)
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem() as? StationSelectUiState.Success
            assertNotNull(state)
            assertNull(state!!.departureStation)
            assertEquals(SelectionMode.DEPARTURE, state.selectionMode)
        }
    }

    @Test
    fun `도착역 초기화 시 도착역이 null이 되고 선택 모드가 ARRIVAL로 변경된다`() = runTest {
        // Given
        viewModel = createViewModel(lineId = "1001")
        advanceUntilIdle()

        viewModel.onEvent(StationSelectUiEvent.SelectStation(TestData.stationSeoul))
        advanceUntilIdle()
        viewModel.onEvent(StationSelectUiEvent.SelectStation(TestData.stationJongGak))
        advanceUntilIdle()

        // When
        viewModel.onEvent(StationSelectUiEvent.ClearArrivalStation)
        advanceUntilIdle()

        // Then
        viewModel.uiState.test {
            val state = awaitItem() as? StationSelectUiState.Success
            assertNotNull(state)
            assertNull(state!!.arrivalStation)
            assertEquals(SelectionMode.ARRIVAL, state.selectionMode)
        }
    }

    // ============== 선택 확정 테스트 ==============

    @Test
    fun `선택 확정 시 모든 필수 항목이 선택되어야 한다`() = runTest {
        // Given: 출발역만 선택된 상태
        viewModel = createViewModel(lineId = "1001")
        advanceUntilIdle()

        viewModel.onEvent(StationSelectUiEvent.SelectStation(TestData.stationSeoul))
        advanceUntilIdle()

        // When & Then
        viewModel.sideEffect.test {
            viewModel.onEvent(StationSelectUiEvent.ConfirmSelection)
            advanceUntilIdle()

            val effect = awaitItem()
            assertTrue(effect is StationSelectSideEffect.ShowSnackbar)
            assertTrue((effect as StationSelectSideEffect.ShowSnackbar).message.contains("선택"))
        }
    }

    @Test
    fun `선택 확정 성공 시 추적 화면으로 이동한다`() = runTest {
        // Given: 모든 항목 선택
        every { getStationsUseCase.observeStationsByLine("1001") } returns flowOf(
            Result.success(TestData.line1Stations)
        )
        coEvery { getStationsUseCase.getLineById("1001") } returns Result.success(TestData.line1)

        viewModel = createViewModel(lineId = "1001")
        advanceUntilIdle()

        viewModel.onEvent(StationSelectUiEvent.SelectStation(TestData.stationSeoul))
        advanceUntilIdle()
        viewModel.onEvent(StationSelectUiEvent.SelectStation(TestData.stationJongGak))
        advanceUntilIdle()

        // When & Then
        viewModel.sideEffect.test {
            viewModel.onEvent(StationSelectUiEvent.ConfirmSelection)
            advanceUntilIdle()

            val effect = awaitItem()
            assertTrue(effect is StationSelectSideEffect.NavigateToTracking)

            val navEffect = effect as StationSelectSideEffect.NavigateToTracking
            assertEquals(TestData.stationSeoul.id, navEffect.departureStationId)
            assertEquals(TestData.stationJongGak.id, navEffect.arrivalStationId)
            assertEquals(TestData.line1.id, navEffect.lineId)
        }
    }

    // ============== 즐겨찾기 토글 테스트 ==============

    @Test
    fun `즐겨찾기 토글 성공 시 토스트 메시지가 표시된다`() = runTest {
        // Given
        coEvery { manageFavoritesUseCase.toggleFavoriteStation(TestData.stationSeoul) } returns Result.success(true)

        viewModel = createViewModel()
        advanceUntilIdle()

        // When & Then
        viewModel.sideEffect.test {
            viewModel.onEvent(StationSelectUiEvent.ToggleFavorite(TestData.stationSeoul))
            advanceUntilIdle()

            val effect = awaitItem()
            assertTrue(effect is StationSelectSideEffect.ShowToast)
            assertTrue((effect as StationSelectSideEffect.ShowToast).message.contains("추가"))
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
            viewModel.onEvent(StationSelectUiEvent.NavigateBack)
            advanceUntilIdle()

            val effect = awaitItem()
            assertTrue(effect is StationSelectSideEffect.NavigateBack)
        }
    }
}
