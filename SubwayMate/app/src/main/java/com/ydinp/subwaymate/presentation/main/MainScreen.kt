package com.ydinp.subwaymate.presentation.main

import android.widget.Toast
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
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedButton
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.model.Line
import com.ydinp.subwaymate.domain.model.Station
import com.ydinp.subwaymate.domain.repository.FavoriteRoute
import com.ydinp.subwaymate.presentation.common.theme.LineColors

/**
 * 메인 화면 Composable
 *
 * @param viewModel MainViewModel 인스턴스
 * @param onNavigateToStationSelect 역 선택 화면으로 이동하는 콜백 (type: "departure" 또는 "arrival")
 * @param onNavigateToTracking 추적 화면으로 이동하는 콜백
 * @param onNavigateToSettings 설정 화면으로 이동하는 콜백
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    viewModel: MainViewModel = hiltViewModel(),
    onNavigateToStationSelect: (type: String) -> Unit = {},
    onNavigateToTracking: () -> Unit = {},
    onNavigateToSettings: () -> Unit = {}
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val isRefreshing by viewModel.isRefreshing.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }

    // 선택된 출발역/도착역 상태 (임시 - 추후 ViewModel로 이동 가능)
    var selectedDepartureStation by rememberSaveable { mutableStateOf<Station?>(null) }
    var selectedArrivalStation by rememberSaveable { mutableStateOf<Station?>(null) }
    var selectedLine by rememberSaveable { mutableStateOf<Line?>(null) }
    var selectedDirection by rememberSaveable { mutableStateOf(Direction.UP) }

    // Side Effect 처리
    LaunchedEffect(Unit) {
        viewModel.sideEffect.collect { effect ->
            when (effect) {
                is MainSideEffect.NavigateToStationSelect -> {
                    onNavigateToStationSelect(effect.lineId ?: "departure")
                }
                is MainSideEffect.NavigateToTracking -> {
                    onNavigateToTracking()
                }
                is MainSideEffect.NavigateToSettings -> {
                    onNavigateToSettings()
                }
                is MainSideEffect.ShowSnackbar -> {
                    snackbarHostState.showSnackbar(effect.message)
                }
                is MainSideEffect.ShowToast -> {
                    Toast.makeText(context, effect.message, Toast.LENGTH_SHORT).show()
                }
                is MainSideEffect.StartTrackingWithRoute -> {
                    // 경로 정보 설정 후 추적 화면으로 이동
                    selectedDepartureStation = effect.route.departureStation
                    selectedArrivalStation = effect.route.arrivalStation
                    selectedDirection = effect.route.direction
                    onNavigateToTracking()
                }
                is MainSideEffect.RequestLocationPermission -> {
                    // 위치 권한 요청 처리
                }
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "SubwayMate",
                        fontWeight = FontWeight.Bold
                    )
                },
                actions = {
                    IconButton(onClick = { viewModel.onEvent(MainUiEvent.NavigateToSettings) }) {
                        Icon(
                            imageVector = Icons.Default.Settings,
                            contentDescription = "설정"
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = Color.White,
                    actionIconContentColor = Color.White
                )
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { paddingValues ->
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            color = MaterialTheme.colorScheme.background
        ) {
            when (val state = uiState) {
                is MainUiState.Loading -> {
                    LoadingContent()
                }
                is MainUiState.Error -> {
                    ErrorContent(
                        message = state.message,
                        onRetry = { viewModel.onEvent(MainUiEvent.Refresh) }
                    )
                }
                is MainUiState.Success -> {
                    MainContent(
                        state = state,
                        selectedDepartureStation = selectedDepartureStation,
                        selectedArrivalStation = selectedArrivalStation,
                        selectedLine = selectedLine,
                        selectedDirection = selectedDirection,
                        isRefreshing = isRefreshing,
                        onDepartureStationClick = { onNavigateToStationSelect("departure") },
                        onArrivalStationClick = { onNavigateToStationSelect("arrival") },
                        onLineSelect = { line -> selectedLine = line },
                        onDirectionSelect = { direction -> selectedDirection = direction },
                        onStartTracking = { onNavigateToTracking() },
                        onFavoriteRouteClick = { route ->
                            viewModel.onEvent(MainUiEvent.SelectRoute(route))
                        }
                    )
                }
            }
        }
    }
}

/**
 * 로딩 상태 컨텐츠
 */
@Composable
private fun LoadingContent() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            CircularProgressIndicator()
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "데이터를 불러오는 중...",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/**
 * 에러 상태 컨텐츠
 */
@Composable
private fun ErrorContent(
    message: String,
    onRetry: () -> Unit
) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(24.dp)
        ) {
            Text(
                text = "오류가 발생했습니다",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(16.dp))
            OutlinedButton(onClick = onRetry) {
                Text("다시 시도")
            }
        }
    }
}

/**
 * 메인 컨텐츠
 */
@Composable
private fun MainContent(
    state: MainUiState.Success,
    selectedDepartureStation: Station?,
    selectedArrivalStation: Station?,
    selectedLine: Line?,
    selectedDirection: Direction,
    isRefreshing: Boolean,
    onDepartureStationClick: () -> Unit,
    onArrivalStationClick: () -> Unit,
    onLineSelect: (Line) -> Unit,
    onDirectionSelect: (Direction) -> Unit,
    onStartTracking: () -> Unit,
    onFavoriteRouteClick: (FavoriteRoute) -> Unit
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // 역 선택 섹션
        item {
            StationSelectionSection(
                departureStation = selectedDepartureStation,
                arrivalStation = selectedArrivalStation,
                onDepartureClick = onDepartureStationClick,
                onArrivalClick = onArrivalStationClick
            )
        }

        // 호선 선택 섹션
        item {
            LineSelectionSection(
                lines = state.lines,
                selectedLine = selectedLine,
                onLineSelect = onLineSelect
            )
        }

        // 방향 선택 섹션
        item {
            DirectionSelectionSection(
                selectedDirection = selectedDirection,
                isCircularLine = selectedLine?.isCircular() == true,
                onDirectionSelect = onDirectionSelect
            )
        }

        // 알림 시작 버튼
        item {
            StartTrackingButton(
                enabled = selectedDepartureStation != null && selectedArrivalStation != null,
                onClick = onStartTracking
            )
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

/**
 * 역 선택 섹션
 */
@Composable
private fun StationSelectionSection(
    departureStation: Station?,
    arrivalStation: Station?,
    onDepartureClick: () -> Unit,
    onArrivalClick: () -> Unit
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = "경로 설정",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold
        )

        // 출발역 카드
        StationSelectCard(
            label = "출발역",
            stationName = departureStation?.name,
            lineId = departureStation?.lineId,
            onClick = onDepartureClick
        )

        // 방향 화살표
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .size(24.dp)
                    .background(
                        color = MaterialTheme.colorScheme.primaryContainer,
                        shape = CircleShape
                    )
                    .padding(4.dp)
            )
        }

        // 도착역 카드
        StationSelectCard(
            label = "도착역",
            stationName = arrivalStation?.name,
            lineId = arrivalStation?.lineId,
            onClick = onArrivalClick
        )
    }
}

/**
 * 역 선택 카드
 */
@Composable
private fun StationSelectCard(
    label: String,
    stationName: String?,
    lineId: String?,
    onClick: () -> Unit
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
            // 노선 색상 표시
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(
                        if (lineId != null) LineColors.getLineColor(lineId)
                        else MaterialTheme.colorScheme.surfaceVariant
                    ),
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
        }
    }
}

/**
 * 호선 선택 섹션
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LineSelectionSection(
    lines: List<Line>,
    selectedLine: Line?,
    onLineSelect: (Line) -> Unit
) {
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
            lines.forEach { line ->
                LineChip(
                    line = line,
                    isSelected = selectedLine?.id == line.id,
                    onClick = { onLineSelect(line) }
                )
            }
        }
    }
}

/**
 * 호선 칩
 */
@Composable
private fun LineChip(
    line: Line,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val lineColor = LineColors.getLineColor(line.id)

    FilterChip(
        selected = isSelected,
        onClick = onClick,
        label = {
            Text(
                text = line.name,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
            )
        },
        colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = lineColor,
            selectedLabelColor = Color.White
        )
    )
}

/**
 * 방향 선택 섹션
 */
@Composable
private fun DirectionSelectionSection(
    selectedDirection: Direction,
    isCircularLine: Boolean,
    onDirectionSelect: (Direction) -> Unit
) {
    val directions = if (isCircularLine) {
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
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
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
                    DirectionRadioOption(
                        direction = direction,
                        isSelected = selectedDirection == direction ||
                            (isCircularLine && direction.code == selectedDirection.code),
                        onClick = { onDirectionSelect(direction) }
                    )
                }
            }
        }
    }
}

/**
 * 방향 선택 라디오 옵션
 */
@Composable
private fun DirectionRadioOption(
    direction: Direction,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.clickable(onClick = onClick)
    ) {
        RadioButton(
            selected = isSelected,
            onClick = onClick
        )
        Spacer(modifier = Modifier.width(4.dp))
        Text(
            text = direction.displayName,
            style = MaterialTheme.typography.bodyMedium
        )
    }
}

/**
 * 알림 시작 버튼
 */
@Composable
private fun StartTrackingButton(
    enabled: Boolean,
    onClick: () -> Unit
) {
    ElevatedButton(
        onClick = onClick,
        enabled = enabled,
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

/**
 * 즐겨찾기 경로 카드
 */
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
            // 즐겨찾기 아이콘
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
                // 경로명 또는 별명
                Text(
                    text = route.nickname ?: route.getDisplayName(),
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                // 노선 및 방향 정보
                Text(
                    text = "$lineName | ${route.direction.displayName}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // 사용 횟수
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
