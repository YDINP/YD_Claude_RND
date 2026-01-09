package com.ydinp.subwaymate.presentation.station

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ydinp.subwaymate.domain.model.Line
import com.ydinp.subwaymate.domain.model.Station
import com.ydinp.subwaymate.presentation.common.theme.LineColors

/**
 * 역 선택 화면
 *
 * @param selectionType 선택 타입 ("departure" 또는 "arrival")
 * @param onStationSelected 역 선택 완료 시 콜백
 * @param onNavigateBack 뒤로가기 콜백
 * @param viewModel ViewModel
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StationSelectScreen(
    selectionType: String,
    onStationSelected: (Station) -> Unit,
    onNavigateBack: () -> Unit,
    viewModel: StationSelectViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    // 선택 모드 초기화
    LaunchedEffect(selectionType) {
        val mode = if (selectionType == "departure") {
            SelectionMode.DEPARTURE
        } else {
            SelectionMode.ARRIVAL
        }
        viewModel.onEvent(StationSelectUiEvent.ChangeSelectionMode(mode))
    }

    // Side Effect 처리
    LaunchedEffect(Unit) {
        viewModel.sideEffect.collect { effect ->
            when (effect) {
                is StationSelectSideEffect.NavigateBack -> onNavigateBack()
                is StationSelectSideEffect.ShowSnackbar -> {
                    snackbarHostState.showSnackbar(effect.message)
                }
                is StationSelectSideEffect.ShowToast -> {
                    snackbarHostState.showSnackbar(effect.message)
                }
                else -> { /* 다른 effect는 무시 */ }
            }
        }
    }

    val title = if (selectionType == "departure") "출발역 선택" else "도착역 선택"

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(text = title) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "뒤로가기"
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { innerPadding ->
        when (val state = uiState) {
            is StationSelectUiState.Loading -> {
                LoadingContent(modifier = Modifier.padding(innerPadding))
            }
            is StationSelectUiState.Error -> {
                ErrorContent(
                    message = state.message,
                    onRetry = { viewModel.onEvent(StationSelectUiEvent.Refresh) },
                    modifier = Modifier.padding(innerPadding)
                )
            }
            is StationSelectUiState.Success -> {
                SuccessContent(
                    state = state,
                    onSearchQueryChanged = { query ->
                        viewModel.onEvent(StationSelectUiEvent.SearchQueryChanged(query))
                    },
                    onClearSearch = {
                        viewModel.onEvent(StationSelectUiEvent.ClearSearch)
                    },
                    onLineSelected = { line ->
                        viewModel.onEvent(StationSelectUiEvent.SelectLine(line))
                    },
                    onStationClicked = { station ->
                        viewModel.onEvent(StationSelectUiEvent.SelectStation(station))
                        onStationSelected(station)
                    },
                    modifier = Modifier.padding(innerPadding)
                )
            }
        }
    }
}

/**
 * 로딩 상태 컨텐츠
 */
@Composable
private fun LoadingContent(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            CircularProgressIndicator()
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "역 정보를 불러오는 중...",
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
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(32.dp)
        ) {
            Text(
                text = "오류가 발생했습니다",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.error
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(24.dp))
            Button(onClick = onRetry) {
                Text(text = "다시 시도")
            }
        }
    }
}

/**
 * 성공 상태 컨텐츠
 */
@Composable
private fun SuccessContent(
    state: StationSelectUiState.Success,
    onSearchQueryChanged: (String) -> Unit,
    onClearSearch: () -> Unit,
    onLineSelected: (Line) -> Unit,
    onStationClicked: (Station) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxSize()) {
        // 검색 TextField
        SearchTextField(
            query = state.searchQuery,
            onQueryChanged = onSearchQueryChanged,
            onClearQuery = onClearSearch,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
        )

        // 노선 필터 탭
        LineFilterRow(
            lines = state.lines,
            selectedLine = state.selectedLine,
            onLineSelected = onLineSelected,
            modifier = Modifier.fillMaxWidth()
        )

        HorizontalDivider()

        // 검색 중이 아니고 최근 이용역이 있으면 표시
        if (!state.isSearching && state.recentStations.isNotEmpty()) {
            RecentStationsSection(
                recentStations = state.recentStations.take(5),
                onStationClicked = onStationClicked
            )
            HorizontalDivider()
        }

        // 역 목록
        if (state.displayStations.isEmpty()) {
            EmptyContent(
                isSearching = state.isSearching,
                searchQuery = state.searchQuery
            )
        } else {
            StationList(
                stations = state.displayStations,
                lines = state.lines,
                onStationClicked = onStationClicked
            )
        }
    }
}

/**
 * 검색 TextField
 */
@Composable
private fun SearchTextField(
    query: String,
    onQueryChanged: (String) -> Unit,
    onClearQuery: () -> Unit,
    modifier: Modifier = Modifier
) {
    OutlinedTextField(
        value = query,
        onValueChange = onQueryChanged,
        modifier = modifier,
        placeholder = {
            Text(text = "역 이름 검색")
        },
        leadingIcon = {
            Icon(
                imageVector = Icons.Default.Search,
                contentDescription = "검색",
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        },
        trailingIcon = {
            if (query.isNotEmpty()) {
                IconButton(onClick = onClearQuery) {
                    Icon(
                        imageVector = Icons.Default.Clear,
                        contentDescription = "검색어 삭제"
                    )
                }
            }
        },
        singleLine = true,
        shape = RoundedCornerShape(12.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = MaterialTheme.colorScheme.primary,
            unfocusedBorderColor = MaterialTheme.colorScheme.outline
        )
    )
}

/**
 * 노선 필터 Row
 */
@Composable
private fun LineFilterRow(
    lines: List<Line>,
    selectedLine: Line?,
    onLineSelected: (Line) -> Unit,
    modifier: Modifier = Modifier
) {
    val scrollState = rememberScrollState()

    Row(
        modifier = modifier
            .horizontalScroll(scrollState)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        lines.forEach { line ->
            LineFilterChip(
                line = line,
                isSelected = selectedLine?.id == line.id,
                onClick = { onLineSelected(line) }
            )
        }
    }
}

/**
 * 노선 필터 칩
 */
@Composable
private fun LineFilterChip(
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
            selectedContainerColor = lineColor.copy(alpha = 0.2f),
            selectedLabelColor = lineColor
        ),
        border = FilterChipDefaults.filterChipBorder(
            enabled = true,
            selected = isSelected,
            borderColor = if (isSelected) lineColor else MaterialTheme.colorScheme.outline
        )
    )
}

/**
 * 최근 이용역 섹션
 */
@Composable
private fun RecentStationsSection(
    recentStations: List<Station>,
    onStationClicked: (Station) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
    ) {
        Text(
            text = "최근 이용역",
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            recentStations.forEach { station ->
                RecentStationChip(
                    station = station,
                    onClick = { onStationClicked(station) }
                )
            }
        }
    }
}

/**
 * 최근 이용역 칩
 */
@Composable
private fun RecentStationChip(
    station: Station,
    onClick: () -> Unit
) {
    val lineColor = LineColors.getLineColor(station.lineId)

    Surface(
        modifier = Modifier.clickable(onClick = onClick),
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surfaceVariant
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(lineColor)
            )
            Text(
                text = station.name,
                style = MaterialTheme.typography.bodyMedium
            )
        }
    }
}

/**
 * 빈 결과 컨텐츠
 */
@Composable
private fun EmptyContent(
    isSearching: Boolean,
    searchQuery: String
) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(32.dp)
        ) {
            if (isSearching) {
                Text(
                    text = "검색 결과가 없습니다",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "'$searchQuery'에 대한 검색 결과가 없습니다.\n다른 검색어를 입력해 주세요.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
            } else {
                Text(
                    text = "노선을 선택해 주세요",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "상단의 노선 탭을 선택하거나\n역 이름을 검색하세요.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

/**
 * 역 목록
 */
@Composable
private fun StationList(
    stations: List<Station>,
    lines: List<Line>,
    onStationClicked: (Station) -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(vertical = 8.dp)
    ) {
        items(
            items = stations,
            key = { it.id }
        ) { station ->
            StationListItem(
                station = station,
                lines = lines,
                onClick = { onStationClicked(station) }
            )
        }
    }
}

/**
 * 역 목록 아이템
 */
@Composable
private fun StationListItem(
    station: Station,
    lines: List<Line>,
    onClick: () -> Unit
) {
    val lineColor = LineColors.getLineColor(station.lineId)

    ListItem(
        modifier = Modifier.clickable(onClick = onClick),
        headlineContent = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = station.name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
            }
        },
        leadingContent = {
            // 노선 색상 태그
            LineColorTag(color = lineColor, lineId = station.lineId)
        },
        supportingContent = {
            if (station.isTransferStation()) {
                // 환승 노선 표시
                TransferLinesRow(
                    transferLineIds = station.transferLines,
                    lines = lines
                )
            }
        },
        colors = ListItemDefaults.colors(
            containerColor = Color.Transparent
        )
    )
}

/**
 * 노선 색상 태그
 */
@Composable
private fun LineColorTag(
    color: Color,
    lineId: String
) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(color),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = getLineDisplayText(lineId),
            style = MaterialTheme.typography.labelSmall,
            color = Color.White,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

/**
 * 노선 ID를 표시 텍스트로 변환
 */
private fun getLineDisplayText(lineId: String): String {
    return when (lineId) {
        "1", "2", "3", "4", "5", "6", "7", "8", "9" -> lineId
        "K" -> "경의"
        "G" -> "경춘"
        "S" -> "수인"
        "D" -> "신분"
        "A" -> "공항"
        "GTX-A" -> "GTX"
        else -> lineId.take(2)
    }
}

/**
 * 환승 노선 Row
 */
@Composable
private fun TransferLinesRow(
    transferLineIds: List<String>,
    lines: List<Line>
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(top = 4.dp)
    ) {
        Text(
            text = "환승:",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        transferLineIds.forEach { lineId ->
            val lineColor = LineColors.getLineColor(lineId)
            val lineName = lines.find { it.id == lineId }?.name ?: lineId

            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .background(lineColor.copy(alpha = 0.2f))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    text = lineName,
                    style = MaterialTheme.typography.labelSmall,
                    color = lineColor,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}
