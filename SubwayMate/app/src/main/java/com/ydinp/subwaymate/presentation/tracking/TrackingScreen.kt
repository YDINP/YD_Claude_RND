package com.ydinp.subwaymate.presentation.tracking

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.ydinp.subwaymate.domain.model.AlertSetting
import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.model.Line
import com.ydinp.subwaymate.domain.model.LineType
import com.ydinp.subwaymate.domain.model.RideSession
import com.ydinp.subwaymate.domain.model.RideStatus
import com.ydinp.subwaymate.domain.model.Station
import com.ydinp.subwaymate.presentation.common.theme.LineColors
import com.ydinp.subwaymate.presentation.common.theme.SubwayMateTheme
import com.ydinp.subwaymate.presentation.tracking.components.MiniRouteVisualization
import com.ydinp.subwaymate.presentation.tracking.components.RouteVisualization
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * 실시간 추적 화면
 *
 * 사용자의 현재 탑승 상태를 실시간으로 추적하고 시각화합니다.
 *
 * @param onNavigateBack 뒤로가기 콜백
 * @param onStopTracking 추적 중지 콜백
 * @param viewModel TrackingViewModel
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrackingScreen(
    onNavigateBack: () -> Unit,
    onStopTracking: () -> Unit,
    viewModel: TrackingViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    // 다이얼로그 상태
    var showStopConfirmDialog by remember { mutableStateOf(false) }
    var showAlertSettingSheet by remember { mutableStateOf(false) }
    var showCompletionDialog by remember { mutableStateOf(false) }
    var completionData by remember { mutableStateOf<Pair<Int, Int>?>(null) }

    // SideEffect 처리
    LaunchedEffect(Unit) {
        viewModel.sideEffect.collect { effect ->
            when (effect) {
                is TrackingSideEffect.NavigateToMain -> {
                    onStopTracking()
                }
                is TrackingSideEffect.NavigateBack -> {
                    onNavigateBack()
                }
                is TrackingSideEffect.ShowSnackbar -> {
                    snackbarHostState.showSnackbar(effect.message)
                }
                is TrackingSideEffect.ShowToast -> {
                    Toast.makeText(context, effect.message, Toast.LENGTH_SHORT).show()
                }
                is TrackingSideEffect.SendNotification -> {
                    // 실제 알림 발송은 NotificationManager를 통해 처리
                    Toast.makeText(context, effect.message, Toast.LENGTH_LONG).show()
                }
                is TrackingSideEffect.Vibrate -> {
                    // 진동 처리
                }
                is TrackingSideEffect.PlayAlertSound -> {
                    // 알림음 재생
                }
                is TrackingSideEffect.ShowAlertSettingDialog -> {
                    showAlertSettingSheet = true
                }
                is TrackingSideEffect.ShowStopConfirmDialog -> {
                    showStopConfirmDialog = true
                }
                is TrackingSideEffect.ShowCompletionDialog -> {
                    completionData = effect.totalStations to effect.totalTimeMinutes
                    showCompletionDialog = true
                }
            }
        }
    }

    // 30초 간격 자동 새로고침 (시뮬레이션)
    LaunchedEffect(uiState) {
        if (uiState is TrackingUiState.Tracking) {
            while (true) {
                delay(30_000L)
                viewModel.onEvent(TrackingUiEvent.Refresh)
            }
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TrackingTopAppBar(
                uiState = uiState,
                onCloseClick = { viewModel.onEvent(TrackingUiEvent.NavigateBack) }
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when (val state = uiState) {
                is TrackingUiState.Loading -> {
                    LoadingContent()
                }
                is TrackingUiState.Preparing -> {
                    PreparingContent(
                        state = state,
                        onSelectTrain = { trainNo ->
                            viewModel.onEvent(TrackingUiEvent.SelectTrain(trainNo))
                        },
                        onRefresh = { viewModel.onEvent(TrackingUiEvent.RefreshApproachingTrains) }
                    )
                }
                is TrackingUiState.Tracking -> {
                    TrackingContent(
                        state = state,
                        onSettingsClick = { showAlertSettingSheet = true },
                        onStopClick = { showStopConfirmDialog = true }
                    )
                }
                is TrackingUiState.Completed -> {
                    CompletedContent(
                        state = state,
                        onConfirm = { viewModel.onEvent(TrackingUiEvent.CompleteTracking) },
                        onAddToFavorites = { viewModel.onEvent(TrackingUiEvent.AddRouteToFavorites) }
                    )
                }
                is TrackingUiState.Error -> {
                    ErrorContent(
                        message = state.message,
                        onRetry = { viewModel.onEvent(TrackingUiEvent.Refresh) },
                        onDismiss = { viewModel.onEvent(TrackingUiEvent.DismissError) }
                    )
                }
            }
        }
    }

    // 추적 중지 확인 다이얼로그
    if (showStopConfirmDialog) {
        StopConfirmDialog(
            onConfirm = {
                showStopConfirmDialog = false
                viewModel.onEvent(TrackingUiEvent.CompleteTracking)
            },
            onDismiss = { showStopConfirmDialog = false }
        )
    }

    // 알림 설정 BottomSheet
    if (showAlertSettingSheet) {
        val currentState = uiState
        val currentSetting = if (currentState is TrackingUiState.Tracking) {
            currentState.alertSetting
        } else {
            AlertSetting.default()
        }

        AlertSettingBottomSheet(
            currentSetting = currentSetting,
            onDismiss = { showAlertSettingSheet = false },
            onSave = { newSetting ->
                viewModel.onEvent(TrackingUiEvent.UpdateAlertSetting(newSetting))
                showAlertSettingSheet = false
            }
        )
    }

    // 도착 완료 다이얼로그
    if (showCompletionDialog && completionData != null) {
        CompletionDialog(
            totalStations = completionData!!.first,
            totalTimeMinutes = completionData!!.second,
            onConfirm = {
                showCompletionDialog = false
                completionData = null
                viewModel.onEvent(TrackingUiEvent.CompleteTracking)
            }
        )
    }
}

/**
 * 상단 앱바
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TrackingTopAppBar(
    uiState: TrackingUiState,
    onCloseClick: () -> Unit
) {
    val title = when (uiState) {
        is TrackingUiState.Loading -> "로딩 중..."
        is TrackingUiState.Preparing -> {
            "${uiState.line.name} ${uiState.direction.displayName} 방향"
        }
        is TrackingUiState.Tracking -> {
            "${uiState.line.name} ${uiState.direction.displayName} 방향"
        }
        is TrackingUiState.Completed -> {
            "${uiState.line.name} 도착 완료"
        }
        is TrackingUiState.Error -> "오류 발생"
    }

    val lineColor = when (uiState) {
        is TrackingUiState.Preparing -> LineColors.getLineColor(uiState.line.id)
        is TrackingUiState.Tracking -> LineColors.getLineColor(uiState.line.id)
        is TrackingUiState.Completed -> LineColors.getLineColor(uiState.line.id)
        else -> MaterialTheme.colorScheme.primary
    }

    TopAppBar(
        title = {
            Text(
                text = title,
                fontWeight = FontWeight.Bold
            )
        },
        actions = {
            IconButton(onClick = onCloseClick) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = "닫기"
                )
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = lineColor,
            titleContentColor = Color.White,
            actionIconContentColor = Color.White
        )
    )
}

/**
 * 로딩 화면
 */
@Composable
private fun LoadingContent() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(48.dp)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "추적 준비 중...",
                style = MaterialTheme.typography.bodyLarge
            )
        }
    }
}

/**
 * 탑승 준비 화면
 */
@Composable
private fun PreparingContent(
    state: TrackingUiState.Preparing,
    onSelectTrain: (String) -> Unit,
    onRefresh: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        // 경로 정보 카드
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
                    text = "탑승 경로",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = state.departureStation.name,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                        contentDescription = null,
                        modifier = Modifier.padding(horizontal = 8.dp)
                    )
                    Text(
                        text = state.arrivalStation.name,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // 접근 열차 목록
        Card(
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "접근 중인 열차",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    TextButton(onClick = onRefresh) {
                        Text("새로고침")
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                if (state.approachingTrains.isEmpty()) {
                    Text(
                        text = "접근 중인 열차가 없습니다",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = 16.dp)
                    )
                } else {
                    state.approachingTrains.forEach { train ->
                        ApproachingTrainItem(
                            trainNo = train.trainNo,
                            currentStation = train.currentStationId,
                            status = train.trainStatus.displayName,
                            onClick = { onSelectTrain(train.trainNo) }
                        )
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

/**
 * 접근 열차 아이템
 */
@Composable
private fun ApproachingTrainItem(
    trainNo: String,
    currentStation: String,
    status: String,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "열차 $trainNo",
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium
            )
            Text(
                text = "$currentStation - $status",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Button(onClick = onClick) {
            Text("탑승")
        }
    }
}

/**
 * 추적 중 화면
 */
@Composable
private fun TrackingContent(
    state: TrackingUiState.Tracking,
    onSettingsClick: () -> Unit,
    onStopClick: () -> Unit
) {
    val lineColor = LineColors.getLineColor(state.line.id)
    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
    ) {
        // 정보 카드 섹션
        InfoCardsSection(
            state = state,
            lineColor = lineColor
        )

        Spacer(modifier = Modifier.height(8.dp))

        // 현재 상태 카드
        CurrentStatusCard(
            currentStation = state.currentStation,
            nextStation = if (state.currentStationIndex < state.routeStations.lastIndex) {
                state.routeStations.getOrNull(state.currentStationIndex + 1)
            } else null,
            isApproaching = state.isApproaching,
            lineColor = lineColor
        )

        Spacer(modifier = Modifier.height(8.dp))

        // 노선도 시각화
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Text(
                    text = "경로",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))

                val alertStationIndex = (state.routeStations.size - 1 - state.alertSetting.stationsBefore)
                    .coerceAtLeast(0)

                RouteVisualization(
                    stations = state.routeStations,
                    currentStationIndex = state.currentStationIndex,
                    alertStationIndex = alertStationIndex,
                    lineColor = lineColor,
                    modifier = Modifier.height(400.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // 알림 설정 섹션
        AlertSettingSection(
            alertSetting = state.alertSetting,
            onSettingsClick = onSettingsClick
        )

        Spacer(modifier = Modifier.height(16.dp))

        // 추적 중지 버튼
        Button(
            onClick = onStopClick,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.error
            )
        ) {
            Text(
                text = "추적 중지",
                modifier = Modifier.padding(vertical = 8.dp)
            )
        }

        Spacer(modifier = Modifier.height(32.dp))
    }
}

/**
 * 정보 카드 섹션
 */
@Composable
private fun InfoCardsSection(
    state: TrackingUiState.Tracking,
    lineColor: Color
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // 남은 역 수 카드
        InfoCard(
            title = "남은 역",
            value = "${state.remainingStations}역 남음",
            icon = Icons.Default.Place,
            color = lineColor,
            modifier = Modifier.weight(1f)
        )

        // 예상 도착 시간 카드
        InfoCard(
            title = "예상 시간",
            value = state.estimatedRemainingMinutes?.let { "약 ${it}분" } ?: "계산 중...",
            icon = Icons.Default.Timer,
            color = lineColor,
            modifier = Modifier.weight(1f)
        )
    }

    // 미니 노선도
    MiniRouteVisualization(
        totalStations = state.routeStations.size,
        currentStationIndex = state.currentStationIndex,
        lineColor = lineColor,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
    )
}

/**
 * 정보 카드
 */
@Composable
private fun InfoCard(
    title: String,
    value: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    color: Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = color.copy(alpha = 0.1f)
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(28.dp)
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = color
            )
        }
    }
}

/**
 * 현재 상태 카드
 */
@Composable
private fun CurrentStatusCard(
    currentStation: Station?,
    nextStation: Station?,
    isApproaching: Boolean,
    lineColor: Color
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = if (isApproaching) {
            CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.errorContainer
            )
        } else {
            CardDefaults.cardColors()
        }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Text(
                text = "현재 상태",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(8.dp))

            if (currentStation != null && nextStation != null) {
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = currentStation.name,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = lineColor
                    )
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                        contentDescription = null,
                        modifier = Modifier.padding(horizontal = 12.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = nextStation.name,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "이동 중",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else if (currentStation != null) {
                Text(
                    text = "${currentStation.name} 도착",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = lineColor
                )
            } else {
                Text(
                    text = "위치 확인 중...",
                    style = MaterialTheme.typography.titleLarge
                )
            }

            // 도착 임박 경고
            AnimatedVisibility(
                visible = isApproaching,
                enter = fadeIn(),
                exit = fadeOut()
            ) {
                Column {
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                MaterialTheme.colorScheme.error.copy(alpha = 0.1f),
                                RoundedCornerShape(8.dp)
                            )
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Notifications,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "곧 도착합니다! 하차 준비를 해주세요.",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                }
            }
        }
    }
}

/**
 * 알림 설정 섹션
 */
@Composable
private fun AlertSettingSection(
    alertSetting: AlertSetting,
    onSettingsClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Notifications,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "알림 설정",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                }
                IconButton(onClick = onSettingsClick) {
                    Icon(
                        imageVector = Icons.Default.Settings,
                        contentDescription = "설정"
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // 현재 설정 표시
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "알림 시점",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = "${alertSetting.stationsBefore}역 전",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "알림 방식",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = buildString {
                        if (alertSetting.soundEnabled) append("소리")
                        if (alertSetting.soundEnabled && alertSetting.vibrationEnabled) append(", ")
                        if (alertSetting.vibrationEnabled) append("진동")
                        if (!alertSetting.soundEnabled && !alertSetting.vibrationEnabled) append("없음")
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

/**
 * 도착 완료 화면
 */
@Composable
private fun CompletedContent(
    state: TrackingUiState.Completed,
    onConfirm: () -> Unit,
    onAddToFavorites: () -> Unit
) {
    val lineColor = LineColors.getLineColor(state.line.id)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // 완료 아이콘
        Box(
            modifier = Modifier
                .size(100.dp)
                .background(lineColor.copy(alpha = 0.1f), RoundedCornerShape(50.dp)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.Check,
                contentDescription = null,
                modifier = Modifier.size(60.dp),
                tint = lineColor
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "도착했습니다!",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "${state.departureStation.name} -> ${state.arrivalStation.name}",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(modifier = Modifier.height(32.dp))

        // 통계 카드
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            )
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "${state.totalStations}",
                        style = MaterialTheme.typography.headlineLarge,
                        fontWeight = FontWeight.Bold,
                        color = lineColor
                    )
                    Text(
                        text = "정차역",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Column(
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "${state.totalTimeMinutes}",
                        style = MaterialTheme.typography.headlineLarge,
                        fontWeight = FontWeight.Bold,
                        color = lineColor
                    )
                    Text(
                        text = "소요시간(분)",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(32.dp))

        // 버튼
        Button(
            onClick = onConfirm,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = lineColor)
        ) {
            Text(
                text = "확인",
                modifier = Modifier.padding(vertical = 8.dp)
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        OutlinedButton(
            onClick = onAddToFavorites,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = "이 경로 즐겨찾기에 추가",
                modifier = Modifier.padding(vertical = 8.dp)
            )
        }
    }
}

/**
 * 에러 화면
 */
@Composable
private fun ErrorContent(
    message: String,
    onRetry: () -> Unit,
    onDismiss: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "오류가 발생했습니다",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.error,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(32.dp))

        Button(onClick = onRetry) {
            Text("다시 시도")
        }

        Spacer(modifier = Modifier.height(8.dp))

        TextButton(onClick = onDismiss) {
            Text("돌아가기")
        }
    }
}

/**
 * 추적 중지 확인 다이얼로그
 */
@Composable
private fun StopConfirmDialog(
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("추적 중지") },
        text = { Text("정말로 추적을 중지하시겠습니까?\n현재 탑승 정보가 저장되지 않습니다.") },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error
                )
            ) {
                Text("중지")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("취소")
            }
        }
    )
}

/**
 * 도착 완료 다이얼로그
 */
@Composable
private fun CompletionDialog(
    totalStations: Int,
    totalTimeMinutes: Int,
    onConfirm: () -> Unit
) {
    AlertDialog(
        onDismissRequest = { },
        title = { Text("도착 완료!") },
        text = {
            Column {
                Text("목적지에 도착했습니다.")
                Spacer(modifier = Modifier.height(8.dp))
                Text("총 ${totalStations}개 역, ${totalTimeMinutes}분 소요")
            }
        },
        confirmButton = {
            Button(onClick = onConfirm) {
                Text("확인")
            }
        }
    )
}

/**
 * 알림 설정 BottomSheet
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AlertSettingBottomSheet(
    currentSetting: AlertSetting,
    onDismiss: () -> Unit,
    onSave: (AlertSetting) -> Unit
) {
    val sheetState = rememberModalBottomSheetState()

    var stationsBefore by remember { mutableIntStateOf(currentSetting.stationsBefore) }
    var soundEnabled by remember { mutableStateOf(currentSetting.soundEnabled) }
    var vibrationEnabled by remember { mutableStateOf(currentSetting.vibrationEnabled) }
    var repeatEnabled by remember { mutableStateOf(currentSetting.repeatCount > 1) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 16.dp)
        ) {
            Text(
                text = "알림 설정",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )

            Spacer(modifier = Modifier.height(24.dp))

            // 알림 시점 설정
            Text(
                text = "알림 시점",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))

            // 역 전 선택 버튼들
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                listOf(1, 2, 3).forEach { stations ->
                    val isSelected = stationsBefore == stations
                    Button(
                        onClick = { stationsBefore = stations },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isSelected) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.surfaceVariant
                            },
                            contentColor = if (isSelected) {
                                MaterialTheme.colorScheme.onPrimary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            }
                        )
                    ) {
                        Text("${stations}역 전")
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // 알림 유형 설정
            Text(
                text = "알림 유형",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))

            // 소리 토글
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "소리",
                    style = MaterialTheme.typography.bodyLarge
                )
                Switch(
                    checked = soundEnabled,
                    onCheckedChange = { soundEnabled = it },
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = MaterialTheme.colorScheme.primary,
                        checkedTrackColor = MaterialTheme.colorScheme.primaryContainer
                    )
                )
            }

            // 진동 토글
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "진동",
                    style = MaterialTheme.typography.bodyLarge
                )
                Switch(
                    checked = vibrationEnabled,
                    onCheckedChange = { vibrationEnabled = it }
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // 반복 설정
            Text(
                text = "반복 알림",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "알림 반복 (30초 간격)",
                    style = MaterialTheme.typography.bodyLarge
                )
                Switch(
                    checked = repeatEnabled,
                    onCheckedChange = { repeatEnabled = it }
                )
            }

            Spacer(modifier = Modifier.height(32.dp))

            // 저장 버튼
            Button(
                onClick = {
                    val newSetting = AlertSetting(
                        stationsBefore = stationsBefore,
                        minutesBefore = currentSetting.minutesBefore,
                        soundEnabled = soundEnabled,
                        vibrationEnabled = vibrationEnabled,
                        repeatCount = if (repeatEnabled) 3 else 1,
                        repeatIntervalSeconds = 30
                    )
                    onSave(newSetting)
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = "저장",
                    modifier = Modifier.padding(vertical = 8.dp)
                )
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

// ===== Preview Functions =====

@Preview(showBackground = true)
@Composable
private fun TrackingContentPreview() {
    val sampleSession = RideSession(
        id = "1",
        departureStation = Station("1", "강남", "2", 37.4979, 127.0276),
        arrivalStation = Station("5", "종합운동장", "2", 37.5109, 127.0735),
        line = Line("2", "2호선", "#00A84D", LineType.CIRCULAR),
        direction = Direction.OUTER,
        status = RideStatus.IN_TRANSIT,
        remainingStations = 3,
        alertSetting = AlertSetting.default()
    )

    val sampleStations = listOf(
        Station("1", "강남", "2", 37.4979, 127.0276),
        Station("2", "역삼", "2", 37.5007, 127.0365),
        Station("3", "선릉", "2", 37.5046, 127.0486, listOf("K")),
        Station("4", "삼성", "2", 37.5088, 127.0631),
        Station("5", "종합운동장", "2", 37.5109, 127.0735)
    )

    val state = TrackingUiState.Tracking(
        session = sampleSession,
        routeStations = sampleStations,
        currentStationIndex = 1
    )

    SubwayMateTheme {
        TrackingContent(
            state = state,
            onSettingsClick = {},
            onStopClick = {}
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun CompletedContentPreview() {
    val sampleSession = RideSession(
        id = "1",
        departureStation = Station("1", "강남", "2", 37.4979, 127.0276),
        arrivalStation = Station("5", "종합운동장", "2", 37.5109, 127.0735),
        line = Line("2", "2호선", "#00A84D", LineType.CIRCULAR),
        direction = Direction.OUTER,
        status = RideStatus.ARRIVED
    )

    val state = TrackingUiState.Completed(
        session = sampleSession,
        totalStations = 5,
        totalTimeMinutes = 12
    )

    SubwayMateTheme {
        CompletedContent(
            state = state,
            onConfirm = {},
            onAddToFavorites = {}
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun AlertSettingBottomSheetPreview() {
    SubwayMateTheme {
        AlertSettingBottomSheet(
            currentSetting = AlertSetting.default(),
            onDismiss = {},
            onSave = {}
        )
    }
}
