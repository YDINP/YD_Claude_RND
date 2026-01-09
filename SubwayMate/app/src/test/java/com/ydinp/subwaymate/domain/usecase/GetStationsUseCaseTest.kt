package com.ydinp.subwaymate.domain.usecase

import app.cash.turbine.test
import com.ydinp.subwaymate.domain.common.Result
import com.ydinp.subwaymate.doubles.FakeStationRepository
import com.ydinp.subwaymate.util.TestData
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * GetStationsUseCase 테스트
 *
 * 테스트 항목:
 * - 전체 역 목록 조회 테스트
 * - 노선별 역 목록 조회 테스트
 * - 역 검색 테스트
 * - 노선 조회 테스트
 * - 경로 관련 테스트
 */
@OptIn(ExperimentalCoroutinesApi::class)
class GetStationsUseCaseTest {

    // Fake repository
    private lateinit var fakeStationRepository: FakeStationRepository

    // Subject under test
    private lateinit var useCase: GetStationsUseCase

    @Before
    fun setUp() {
        fakeStationRepository = FakeStationRepository()
        useCase = GetStationsUseCase(fakeStationRepository)
    }

    // ============== 전체 역 목록 조회 테스트 ==============

    @Test
    fun `getAllStations는 모든 역 목록을 반환한다`() = runTest {
        // Given
        fakeStationRepository.setStations(TestData.allStations)

        // When
        val result = useCase.getAllStations()

        // Then
        assertTrue(result.isSuccess)
        assertEquals(TestData.allStations.size, result.getOrNull()?.size)
    }

    @Test
    fun `observeAllStations는 역 목록을 Flow로 반환한다`() = runTest {
        // Given
        fakeStationRepository.setStations(TestData.allStations)

        // When & Then
        useCase.observeAllStations().test {
            val result = awaitItem()
            assertTrue(result.isSuccess)
            assertEquals(TestData.allStations.size, result.getOrNull()?.size)
        }
    }

    @Test
    fun `역 목록 조회 실패 시 에러를 반환한다`() = runTest {
        // Given
        fakeStationRepository.shouldReturnError = true
        fakeStationRepository.errorMessage = "네트워크 오류"

        // When
        val result = useCase.getAllStations()

        // Then
        assertTrue(result.isError)
        assertTrue((result as Result.Error).message?.contains("네트워크") == true)
    }

    // ============== 노선별 역 목록 조회 테스트 ==============

    @Test
    fun `getStationsByLine은 해당 노선의 역만 반환한다`() = runTest {
        // Given
        fakeStationRepository.setStations(TestData.allStations)

        // When
        val result = useCase.getStationsByLine("1001")

        // Then
        assertTrue(result.isSuccess)
        val stations = result.getOrNull()
        assertNotNull(stations)
        assertTrue(stations!!.all { it.lineId == "1001" })
        assertEquals(TestData.line1Stations.size, stations.size)
    }

    @Test
    fun `observeStationsByLine은 해당 노선의 역을 Flow로 반환한다`() = runTest {
        // Given
        fakeStationRepository.setStations(TestData.allStations)

        // When & Then
        useCase.observeStationsByLine("1002").test {
            val result = awaitItem()
            assertTrue(result.isSuccess)
            val stations = result.getOrNull()
            assertNotNull(stations)
            assertTrue(stations!!.all { it.lineId == "1002" })
        }
    }

    @Test
    fun `존재하지 않는 노선 ID로 조회 시 빈 목록을 반환한다`() = runTest {
        // Given
        fakeStationRepository.setStations(TestData.allStations)

        // When
        val result = useCase.getStationsByLine("9999")

        // Then
        assertTrue(result.isSuccess)
        assertEquals(0, result.getOrNull()?.size)
    }

    // ============== 역 검색 테스트 ==============

    @Test
    fun `searchStations는 검색어를 포함하는 역만 반환한다`() = runTest {
        // Given
        fakeStationRepository.setStations(TestData.allStations)

        // When
        val result = useCase.searchStations("서울")

        // Then
        assertTrue(result.isSuccess)
        val stations = result.getOrNull()
        assertNotNull(stations)
        assertTrue(stations!!.all { it.name.contains("서울") })
    }

    @Test
    fun `searchStations에 2글자 미만 검색어 입력 시 빈 목록을 반환한다`() = runTest {
        // Given
        fakeStationRepository.setStations(TestData.allStations)

        // When
        val result = useCase.searchStations("역")

        // Then
        assertTrue(result.isSuccess)
        assertEquals(0, result.getOrNull()?.size)
    }

    @Test
    fun `observeSearchStations는 검색 결과를 Flow로 반환한다`() = runTest {
        // Given
        fakeStationRepository.setStations(TestData.allStations)

        // When & Then
        useCase.observeSearchStations("강남").test {
            val result = awaitItem()
            assertTrue(result.isSuccess)
            val stations = result.getOrNull()
            assertNotNull(stations)
            assertTrue(stations!!.all { it.name.contains("강남") })
        }
    }

    @Test
    fun `검색 결과가 없으면 빈 목록을 반환한다`() = runTest {
        // Given
        fakeStationRepository.setStations(TestData.allStations)

        // When
        val result = useCase.searchStations("존재하지않는역")

        // Then
        assertTrue(result.isSuccess)
        assertEquals(0, result.getOrNull()?.size)
    }

    // ============== 노선 조회 테스트 ==============

    @Test
    fun `getAllLines는 모든 노선 목록을 반환한다`() = runTest {
        // Given
        fakeStationRepository.setLines(TestData.allLines)

        // When
        val result = useCase.getAllLines()

        // Then
        assertTrue(result.isSuccess)
        assertEquals(TestData.allLines.size, result.getOrNull()?.size)
    }

    @Test
    fun `observeAllLines는 노선 목록을 Flow로 반환한다`() = runTest {
        // Given
        fakeStationRepository.setLines(TestData.allLines)

        // When & Then
        useCase.observeAllLines().test {
            val result = awaitItem()
            assertTrue(result.isSuccess)
            assertEquals(TestData.allLines.size, result.getOrNull()?.size)
        }
    }

    @Test
    fun `getLineById는 해당 노선을 반환한다`() = runTest {
        // Given
        fakeStationRepository.setLines(TestData.allLines)

        // When
        val result = useCase.getLineById("1001")

        // Then
        assertTrue(result.isSuccess)
        assertEquals("1호선", result.getOrNull()?.name)
    }

    @Test
    fun `존재하지 않는 노선 ID로 조회 시 에러를 반환한다`() = runTest {
        // Given
        fakeStationRepository.setLines(TestData.allLines)

        // When
        val result = useCase.getLineById("9999")

        // Then
        assertTrue(result.isError)
    }

    // ============== 역 상세 조회 테스트 ==============

    @Test
    fun `getStationById는 해당 역 정보를 반환한다`() = runTest {
        // Given
        fakeStationRepository.setStations(TestData.allStations)

        // When
        val result = useCase.getStationById(TestData.stationSeoul.id)

        // Then
        assertTrue(result.isSuccess)
        assertEquals("서울역", result.getOrNull()?.name)
    }

    @Test
    fun `존재하지 않는 역 ID로 조회 시 에러를 반환한다`() = runTest {
        // Given
        fakeStationRepository.setStations(TestData.allStations)

        // When
        val result = useCase.getStationById("nonexistent-id")

        // Then
        assertTrue(result.isError)
    }

    // ============== 경로 관련 테스트 ==============

    @Test
    fun `getStationCountBetween은 두 역 사이의 역 수를 반환한다`() = runTest {
        // Given
        fakeStationRepository.setStations(TestData.line1Stations)

        // When: 서울역(0) -> 종각(2)
        val result = useCase.getStationCountBetween(
            fromStationId = TestData.stationSeoul.id,
            toStationId = TestData.stationJongGak.id,
            lineId = "1001"
        )

        // Then: 2역 차이 (서울역 -> 시청 -> 종각)
        assertTrue(result.isSuccess)
        assertEquals(2, result.getOrNull())
    }

    @Test
    fun `getStationsBetween은 두 역 사이의 역 목록을 반환한다`() = runTest {
        // Given
        fakeStationRepository.setStations(TestData.line1Stations)

        // When
        val result = useCase.getStationsBetween(
            fromStationId = TestData.stationSeoul.id,
            toStationId = TestData.stationJongGak.id,
            lineId = "1001"
        )

        // Then
        assertTrue(result.isSuccess)
        val stations = result.getOrNull()
        assertNotNull(stations)
        assertEquals(3, stations!!.size) // 서울역, 시청, 종각
        assertEquals(TestData.stationSeoul.id, stations.first().id)
        assertEquals(TestData.stationJongGak.id, stations.last().id)
    }

    @Test
    fun `getEstimatedTravelTime은 예상 소요 시간을 반환한다`() = runTest {
        // Given
        fakeStationRepository.setStations(TestData.line1Stations)

        // When
        val result = useCase.getEstimatedTravelTime(
            fromStationId = TestData.stationSeoul.id,
            toStationId = TestData.stationJongGak.id,
            lineId = "1001"
        )

        // Then: 2역 * 2분 = 4분
        assertTrue(result.isSuccess)
        assertEquals(4, result.getOrNull())
    }

    // ============== 위치 기반 조회 테스트 ==============

    @Test
    fun `getNearbyStations는 가까운 역을 거리순으로 반환한다`() = runTest {
        // Given
        fakeStationRepository.setStations(TestData.allStations)

        // When: 서울역 좌표 근처에서 검색
        val result = useCase.getNearbyStations(
            latitude = 37.5546,
            longitude = 126.9706,
            radiusMeters = 1000,
            limit = 3
        )

        // Then
        assertTrue(result.isSuccess)
        val stations = result.getOrNull()
        assertNotNull(stations)
        assertTrue(stations!!.size <= 3)
        // 가장 가까운 역은 서울역이어야 함
        assertEquals(TestData.stationSeoul.id, stations.first().id)
    }

    @Test
    fun `observeNearbyStations는 주변 역을 Flow로 반환한다`() = runTest {
        // Given
        fakeStationRepository.setStations(TestData.allStations)

        // When & Then
        useCase.observeNearbyStations(
            latitude = 37.5546,
            longitude = 126.9706,
            limit = 5
        ).test {
            val result = awaitItem()
            assertTrue(result.isSuccess)
            assertTrue(result.getOrNull()!!.isNotEmpty())
        }
    }

    // ============== 환승역 조회 테스트 ==============

    @Test
    fun `getTransferStations는 환승역만 반환한다`() = runTest {
        // Given
        fakeStationRepository.setStations(TestData.allStations)

        // When
        val result = useCase.getTransferStations()

        // Then
        assertTrue(result.isSuccess)
        val stations = result.getOrNull()
        assertNotNull(stations)
        assertTrue(stations!!.all { it.isTransferStation() })
    }

    // ============== 데이터 로드 테스트 ==============

    @Test
    fun `isDataLoaded는 데이터 로드 여부를 반환한다`() = runTest {
        // Given
        fakeStationRepository.setDataLoaded(true)

        // When
        val result = useCase.isDataLoaded()

        // Then
        assertTrue(result)
    }

    @Test
    fun `loadInitialData 성공 시 Success를 반환한다`() = runTest {
        // When
        val result = useCase.loadInitialData()

        // Then
        assertTrue(result.isSuccess)
    }

    @Test
    fun `loadInitialData 실패 시 Error를 반환한다`() = runTest {
        // Given
        fakeStationRepository.shouldReturnError = true

        // When
        val result = useCase.loadInitialData()

        // Then
        assertTrue(result.isError)
    }

    // ============== 노선별 그룹화 테스트 ==============

    @Test
    fun `observeStationsGroupedByLine은 노선별로 그룹화된 역 정보를 반환한다`() = runTest {
        // Given
        fakeStationRepository.setLines(TestData.allLines)
        fakeStationRepository.setStations(TestData.allStations)

        // When & Then
        useCase.observeStationsGroupedByLine().test {
            val result = awaitItem()
            assertTrue(result.isSuccess)

            val grouped = result.getOrNull()
            assertNotNull(grouped)
            assertTrue(grouped!!.isNotEmpty())

            // 각 노선에 해당하는 역만 포함되어 있는지 확인
            grouped.forEach { (line, stations) ->
                assertTrue(stations.all { it.lineId == line.id })
            }
        }
    }
}
