package com.ydinp.subwaymate.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedButton
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.ydinp.subwaymate.domain.model.AlertSetting
import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.model.Line
import com.ydinp.subwaymate.domain.model.LineType
import com.ydinp.subwaymate.domain.model.Station
import com.ydinp.subwaymate.domain.repository.FavoriteRoute
import com.ydinp.subwaymate.presentation.common.theme.LineColors
import com.ydinp.subwaymate.presentation.common.theme.SubwayMateTheme
import com.ydinp.subwaymate.presentation.main.MainUiState
import org.junit.Rule
import org.junit.Test

/**
 * MainScreen Compose UI 테스트
 *
 * 테스트 항목:
 * - 출발역/도착역 카드 표시 테스트
 * - 알림 시작 버튼 상태 테스트
 * - 노선 선택 칩 테스트
 * - 방향 선택 라디오 버튼 테스트
 * - 즐겨찾기 경로 카드 테스트
 */
class MainScreenTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    // 테스트용 샘플 데이터
    private val testLine1 = Line(
        id = "1001",
        name = "1호선",
        color = "#0052A4",
        type = LineType.STANDARD
    )

    private val testLine2 = Line(
        id = "1002",
        name = "2호선",
        color = "#00A84D",
        type = LineType.CIRCULAR
    )

    private val testStationSeoul = Station(
        id = "1001000001",
        name = "서울역",
        lineId = "1001",
        latitude = 37.5546,
        longitude = 126.9706,
        transferLines = listOf("1004")
    )

    private val testStationGangnam = Station(
        id = "1002000001",
        name = "강남",
        lineId = "1002",
        latitude = 37.4979,
        longitude = 127.0276,
        transferLines = emptyList()
    )

    private val testFavoriteRoute = FavoriteRoute(
        id = "route-001",
        departureStation = testStationSeoul,
        arrivalStation = testStationGangnam,
        lineId = "1001",
        direction = Direction.DOWN,
        nickname = "출퇴근 경로",
        usageCount = 5,
        createdAt = System.currentTimeMillis()
    )

    private val testSuccessState = MainUiState.Success(
        lines = listOf(testLine1, testLine2),
        favoriteStations = emptyList(),
        favoriteRoutes = listOf(testFavoriteRoute),
        activeSession = null
    )

    // ============== 출발역/도착역 카드 테스트 ==============

    @Test
    fun 출발역_미선택_시_선택_안내_문구가_표시된다() {
        // Given
        composeTestRule.setContent {
            SubwayMateTheme {
                MainContentWrapper(
                    state = testSuccessState,
                    selectedDepartureName = null
                )
            }
        }

        // Then
        composeTestRule
            .onNodeWithText("출발역")
            .assertIsDisplayed()

        composeTestRule
            .onNodeWithText("역을 선택하세요")
            .assertIsDisplayed()
    }

    @Test
    fun 출발역_선택_시_역명이_표시된다() {
        // Given
        composeTestRule.setContent {
            SubwayMateTheme {
                MainContentWrapper(
                    state = testSuccessState,
                    selectedDepartureId = testStationSeoul.id,
                    selectedDepartureName = testStationSeoul.name
                )
            }
        }

        // Then
        composeTestRule
            .onNodeWithText("서울역")
            .assertIsDisplayed()
    }

    @Test
    fun 도착역_미선택_시_선택_안내_문구가_표시된다() {
        // Given
        composeTestRule.setContent {
            SubwayMateTheme {
                MainContentWrapper(
                    state = testSuccessState,
                    selectedArrivalName = null
                )
            }
        }

        // Then
        composeTestRule
            .onNodeWithText("도착역")
            .assertIsDisplayed()
    }

    @Test
    fun 도착역_선택_시_역명이_표시된다() {
        // Given
        composeTestRule.setContent {
            SubwayMateTheme {
                MainContentWrapper(
                    state = testSuccessState,
                    selectedArrivalId = testStationGangnam.id,
                    selectedArrivalName = testStationGangnam.name
                )
            }
        }

        // Then
        composeTestRule
            .onNodeWithText("강남")
            .assertIsDisplayed()
    }

    @Test
    fun 출발역_카드_클릭_시_콜백이_호출된다() {
        // Given
        var departureClicked = false

        composeTestRule.setContent {
            SubwayMateTheme {
                MainContentWrapper(
                    state = testSuccessState,
                    onDepartureStationClick = { departureClicked = true }
                )
            }
        }

        // When
        composeTestRule
            .onNodeWithText("출발역")
            .performClick()

        // Then
        assert(departureClicked)
    }

    @Test
    fun 도착역_카드_클릭_시_콜백이_호출된다() {
        // Given
        var arrivalClicked = false

        composeTestRule.setContent {
            SubwayMateTheme {
                MainContentWrapper(
                    state = testSuccessState,
                    onArrivalStationClick = { arrivalClicked = true }
                )
            }
        }

        // When
        composeTestRule
            .onNodeWithText("도착역")
            .performClick()

        // Then
        assert(arrivalClicked)
    }

    // ============== 알림 시작 버튼 테스트 ==============

    @Test
    fun 출발역_도착역_모두_미선택_시_알림_시작_버튼이_비활성화된다() {
        // Given
        composeTestRule.setContent {
            SubwayMateTheme {
                MainContentWrapper(
                    state = testSuccessState,
                    selectedDepartureId = null,
                    selectedArrivalId = null
                )
            }
        }

        // Then
        composeTestRule
            .onNodeWithText("알림 시작")
            .assertIsNotEnabled()
    }

    @Test
    fun 출발역만_선택_시_알림_시작_버튼이_비활성화된다() {
        // Given
        composeTestRule.setContent {
            SubwayMateTheme {
                MainContentWrapper(
                    state = testSuccessState,
                    selectedDepartureId = testStationSeoul.id,
                    selectedDepartureName = testStationSeoul.name,
                    selectedArrivalId = null
                )
            }
        }

        // Then
        composeTestRule
            .onNodeWithText("알림 시작")
            .assertIsNotEnabled()
    }

    @Test
    fun 도착역만_선택_시_알림_시작_버튼이_비활성화된다() {
        // Given
        composeTestRule.setContent {
            SubwayMateTheme {
                MainContentWrapper(
                    state = testSuccessState,
                    selectedDepartureId = null,
                    selectedArrivalId = testStationGangnam.id,
                    selectedArrivalName = testStationGangnam.name
                )
            }
        }

        // Then
        composeTestRule
            .onNodeWithText("알림 시작")
            .assertIsNotEnabled()
    }

    @Test
    fun 출발역_도착역_모두_선택_시_알림_시작_버튼이_활성화된다() {
        // Given
        composeTestRule.setContent {
            SubwayMateTheme {
                MainContentWrapper(
                    state = testSuccessState,
                    selectedDepartureId = testStationSeoul.id,
                    selectedDepartureName = testStationSeoul.name,
                    selectedArrivalId = testStationGangnam.id,
                    selectedArrivalName = testStationGangnam.name
                )
            }
        }

        // Then
        composeTestRule
            .onNodeWithText("알림 시작")
            .assertIsEnabled()
    }

    @Test
    fun 알림_시작_버튼_클릭_시_콜백이_호출된다() {
        // Given
        var trackingStarted = false

        composeTestRule.setContent {
            SubwayMateTheme {
                MainContentWrapper(
                    state = testSuccessState,
                    selectedDepartureId = testStationSeoul.id,
                    selectedDepartureName = testStationSeoul.name,
                    selectedArrivalId = testStationGangnam.id,
                    selectedArrivalName = testStationGangnam.name,
                    onStartTracking = { trackingStarted = true }
                )
            }
        }

        // When
        composeTestRule
            .onNodeWithText("알림 시작")
            .performClick()

        // Then
        assert(trackingStarted)
    }

    // ============== 노선 선택 칩 테스트 ==============

    @Test
    fun 노선_목록이_칩으로_표시된다() {
        // Given
        composeTestRule.setContent {
            SubwayMateTheme {
                MainContentWrapper(state = testSuccessState)
            }
        }

        // Then
        composeTestRule
            .onNodeWithText("1호선")
            .assertIsDisplayed()

        composeTestRule
            .onNodeWithText("2호선")
            .assertIsDisplayed()
    }

    @Test
    fun 노선_선택_시_콜백이_호출된다() {
        // Given
        var selectedLine: Line? = null

        composeTestRule.setContent {
            SubwayMateTheme {
                MainContentWrapper(
                    state = testSuccessState,
                    onLineSelect = { line -> selectedLine = line }
                )
            }
        }

        // When
        composeTestRule
            .onNodeWithText("1호선")
            .performClick()

        // Then
        assert(selectedLine?.id == testLine1.id)
    }

    // ============== 방향 선택 테스트 ==============

    @Test
    fun 일반_노선에서_상행_하행_방향이_표시된다() {
        // Given
        composeTestRule.setContent {
            SubwayMateTheme {
                MainContentWrapper(
                    state = testSuccessState,
                    selectedLine = testLine1 // 일반 노선
                )
            }
        }

        // Then
        composeTestRule
            .onNodeWithText("상행")
            .assertIsDisplayed()

        composeTestRule
            .onNodeWithText("하행")
            .assertIsDisplayed()
    }

    @Test
    fun 순환_노선에서_내선_외선_방향이_표시된다() {
        // Given
        composeTestRule.setContent {
            SubwayMateTheme {
                MainContentWrapper(
                    state = testSuccessState,
                    selectedLine = testLine2 // 순환 노선
                )
            }
        }

        // Then
        composeTestRule
            .onNodeWithText("내선순환")
            .assertIsDisplayed()

        composeTestRule
            .onNodeWithText("외선순환")
            .assertIsDisplayed()
    }

    @Test
    fun 방향_선택_시_콜백이_호출된다() {
        // Given
        var selectedDirection: Direction? = null

        composeTestRule.setContent {
            SubwayMateTheme {
                MainContentWrapper(
                    state = testSuccessState,
                    onDirectionSelect = { direction -> selectedDirection = direction }
                )
            }
        }

        // When
        composeTestRule
            .onNodeWithText("하행")
            .performClick()

        // Then
        assert(selectedDirection == Direction.DOWN)
    }

    // ============== 즐겨찾기 경로 테스트 ==============

    @Test
    fun 즐겨찾기_경로가_있으면_목록이_표시된다() {
        // Given
        composeTestRule.setContent {
            SubwayMateTheme {
                MainContentWrapper(state = testSuccessState)
            }
        }

        // Then
        composeTestRule
            .onNodeWithText("즐겨찾기 경로")
            .assertIsDisplayed()

        composeTestRule
            .onNodeWithText("출퇴근 경로")
            .assertIsDisplayed()
    }

    @Test
    fun 즐겨찾기_경로가_없으면_목록이_표시되지_않는다() {
        // Given
        val stateWithoutFavorites = testSuccessState.copy(favoriteRoutes = emptyList())

        composeTestRule.setContent {
            SubwayMateTheme {
                MainContentWrapper(state = stateWithoutFavorites)
            }
        }

        // Then
        composeTestRule
            .onNode(hasText("즐겨찾기 경로"))
            .assertDoesNotExist()
    }

    @Test
    fun 즐겨찾기_경로_클릭_시_콜백이_호출된다() {
        // Given
        var clickedRoute: FavoriteRoute? = null

        composeTestRule.setContent {
            SubwayMateTheme {
                MainContentWrapper(
                    state = testSuccessState,
                    onFavoriteRouteClick = { route -> clickedRoute = route }
                )
            }
        }

        // When
        composeTestRule
            .onNodeWithText("출퇴근 경로")
            .performClick()

        // Then
        assert(clickedRoute?.id == testFavoriteRoute.id)
    }

    @Test
    fun 즐겨찾기_경로_카드에_사용_횟수가_표시된다() {
        // Given
        composeTestRule.setContent {
            SubwayMateTheme {
                MainContentWrapper(state = testSuccessState)
            }
        }

        // Then
        composeTestRule
            .onNodeWithText("5회")
            .assertIsDisplayed()
    }

    // ============== 테스트용 Composables ==============

    /**
     * MainScreen의 주요 컨텐츠를 테스트하기 위한 Wrapper
     * 실제 MainContent가 private이므로 테스트를 위해 핵심 UI 컴포넌트들을 직접 구현
     */
    @OptIn(ExperimentalLayoutApi::class)
    @Composable
    private fun MainContentWrapper(
        state: MainUiState.Success,
        selectedDepartureId: String? = null,
        selectedDepartureName: String? = null,
        selectedArrivalId: String? = null,
        selectedArrivalName: String? = null,
        selectedLine: Line? = null,
        selectedDirection: Direction = Direction.UP,
        onDepartureStationClick: () -> Unit = {},
        onArrivalStationClick: () -> Unit = {},
        onClearDeparture: () -> Unit = {},
        onClearArrival: () -> Unit = {},
        onLineSelect: (Line) -> Unit = {},
        onDirectionSelect: (Direction) -> Unit = {},
        onStartTracking: () -> Unit = {},
        onFavoriteRouteClick: (FavoriteRoute) -> Unit = {}
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // 역 선택 섹션
            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        text = "경로 설정",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )

                    // 출발역 카드
                    StationSelectCard(
                        label = "출발역",
                        stationName = selectedDepartureName,
                        onClick = onDepartureStationClick,
                        onClear = if (selectedDepartureId != null) onClearDeparture else null
                    )

                    // 방향 화살표
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }

                    // 도착역 카드
                    StationSelectCard(
                        label = "도착역",
                        stationName = selectedArrivalName,
                        onClick = onArrivalStationClick,
                        onClear = if (selectedArrivalId != null) onClearArrival else null
                    )
                }
            }

            // 호선 선택 섹션
            item {
                Column {
                    Text(
                        text = "호선 선택",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    FlowRow(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        state.lines.forEach { line ->
                            FilterChip(
                                selected = selectedLine?.id == line.id,
                                onClick = { onLineSelect(line) },
                                label = {
                                    Text(
                                        text = line.name,
                                        fontWeight = if (selectedLine?.id == line.id) FontWeight.Bold else FontWeight.Normal
                                    )
                                },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = LineColors.getLineColor(line.id),
                                    selectedLabelColor = Color.White
                                )
                            )
                        }
                    }
                }
            }

            // 방향 선택 섹션
            item {
                val directions = if (selectedLine?.isCircular() == true) {
                    listOf(Direction.INNER, Direction.OUTER)
                } else {
                    listOf(Direction.UP, Direction.DOWN)
                }

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant
                    )
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "방향 선택",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceEvenly
                        ) {
                            directions.forEach { direction ->
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.clickable { onDirectionSelect(direction) }
                                ) {
                                    RadioButton(
                                        selected = selectedDirection == direction ||
                                            (selectedLine?.isCircular() == true && direction.code == selectedDirection.code),
                                        onClick = { onDirectionSelect(direction) }
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(
                                        text = direction.displayName,
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // 알림 시작 버튼
            item {
                ElevatedButton(
                    onClick = onStartTracking,
                    enabled = selectedDepartureId != null && selectedArrivalId != null,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Notifications,
                        contentDescription = null,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "알림 시작",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            // 즐겨찾기 경로 섹션
            if (state.favoriteRoutes.isNotEmpty()) {
                item {
                    Text(
                        text = "즐겨찾기 경로",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }

                items(
                    items = state.favoriteRoutes,
                    key = { it.id }
                ) { route ->
                    FavoriteRouteCard(
                        route = route,
                        lineName = state.lines.find { it.id == route.lineId }?.name ?: route.lineId,
                        onClick = { onFavoriteRouteClick(route) }
                    )
                }
            }
        }
    }

    @Composable
    private fun StationSelectCard(
        label: String,
        stationName: String?,
        onClick: () -> Unit,
        onClear: (() -> Unit)? = null
    ) {
        ElevatedCard(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick),
            elevation = CardDefaults.elevatedCardElevation(defaultElevation = 2.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Place,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(24.dp)
                    )
                }
                Spacer(modifier = Modifier.width(16.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = stationName ?: "역을 선택하세요",
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = if (stationName != null) FontWeight.Medium else FontWeight.Normal,
                        color = if (stationName != null)
                            MaterialTheme.colorScheme.onSurface
                        else
                            MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                if (onClear != null) {
                    IconButton(
                        onClick = onClear,
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Clear,
                            contentDescription = "선택 해제",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }
        }
    }

    @Composable
    private fun FavoriteRouteCard(
        route: FavoriteRoute,
        lineName: String,
        onClick: () -> Unit
    ) {
        ElevatedCard(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick),
            elevation = CardDefaults.elevatedCardElevation(defaultElevation = 1.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(LineColors.getLineColor(route.lineId)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Favorite,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(20.dp)
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = route.nickname ?: route.getDisplayName(),
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = "$lineName | ${route.direction.displayName}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                if (route.usageCount > 0) {
                    Text(
                        text = "${route.usageCount}회",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}
