package com.ydinp.subwaymate.presentation.tracking.components

import androidx.compose.animation.core.InfiniteRepeatableSpec
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ydinp.subwaymate.domain.model.Station
import com.ydinp.subwaymate.presentation.common.theme.LineColors
import com.ydinp.subwaymate.presentation.common.theme.SubwayMateTheme

/**
 * 노선도 시각화 컴포넌트
 *
 * 출발역부터 도착역까지의 경로를 세로로 시각화하여 표시합니다.
 * 현재 위치를 하이라이트하고, 도착역에는 알림 아이콘을 표시합니다.
 *
 * @param stations 경로 상의 역 목록
 * @param currentStationIndex 현재 위치한 역의 인덱스
 * @param alertStationIndex 알림이 설정된 역의 인덱스 (도착역 기준 N역 전)
 * @param lineColor 노선 색상
 * @param modifier Modifier
 */
@Composable
fun RouteVisualization(
    stations: List<Station>,
    currentStationIndex: Int,
    alertStationIndex: Int,
    lineColor: Color,
    modifier: Modifier = Modifier
) {
    val scrollState = rememberScrollState()

    // 펄스 애니메이션
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.5f,
        animationSpec = InfiniteRepeatableSpec(
            animation = tween(durationMillis = 1000),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseScale"
    )
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 0.3f,
        animationSpec = InfiniteRepeatableSpec(
            animation = tween(durationMillis = 1000),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseAlpha"
    )

    val passedColor = Color.Gray.copy(alpha = 0.5f)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(scrollState)
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        stations.forEachIndexed { index, station ->
            val isPassed = index < currentStationIndex
            val isCurrent = index == currentStationIndex
            val isArrival = index == stations.lastIndex
            val isAlertStation = index == alertStationIndex

            val stationColor = when {
                isPassed -> passedColor
                else -> lineColor
            }

            StationItem(
                station = station,
                stationColor = stationColor,
                lineColor = if (isPassed) passedColor else lineColor,
                isCurrent = isCurrent,
                isArrival = isArrival,
                isAlertStation = isAlertStation,
                isLastStation = index == stations.lastIndex,
                pulseScale = pulseScale,
                pulseAlpha = pulseAlpha
            )
        }
    }
}

/**
 * 개별 역 아이템 컴포넌트
 */
@Composable
private fun StationItem(
    station: Station,
    stationColor: Color,
    lineColor: Color,
    isCurrent: Boolean,
    isArrival: Boolean,
    isAlertStation: Boolean,
    isLastStation: Boolean,
    pulseScale: Float,
    pulseAlpha: Float
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 노선 라인 및 역 표시
        Box(
            modifier = Modifier
                .width(60.dp)
                .height(if (isLastStation) 40.dp else 56.dp),
            contentAlignment = Alignment.TopCenter
        ) {
            Canvas(
                modifier = Modifier
                    .width(60.dp)
                    .height(if (isLastStation) 40.dp else 56.dp)
            ) {
                val centerX = size.width / 2
                val stationRadius = if (isCurrent) 16.dp.toPx() else 10.dp.toPx()
                val stationY = 20.dp.toPx()

                // 노선 라인 (마지막 역이 아니면 아래로 연장)
                if (!isLastStation) {
                    drawLine(
                        color = lineColor,
                        start = Offset(centerX, stationY + stationRadius),
                        end = Offset(centerX, size.height),
                        strokeWidth = 4.dp.toPx()
                    )
                }

                // 현재 역 펄스 효과
                if (isCurrent) {
                    drawCircle(
                        color = stationColor.copy(alpha = pulseAlpha),
                        radius = stationRadius * pulseScale,
                        center = Offset(centerX, stationY)
                    )
                }

                // 역 원
                drawCircle(
                    color = stationColor,
                    radius = stationRadius,
                    center = Offset(centerX, stationY)
                )

                // 현재 역 내부 흰색 원
                if (isCurrent) {
                    drawCircle(
                        color = Color.White,
                        radius = stationRadius * 0.5f,
                        center = Offset(centerX, stationY)
                    )
                }

                // 환승역 표시 (테두리)
                if (station.isTransferStation()) {
                    drawCircle(
                        color = Color.White,
                        radius = stationRadius,
                        center = Offset(centerX, stationY),
                        style = Stroke(width = 2.dp.toPx())
                    )
                }
            }
        }

        Spacer(modifier = Modifier.width(12.dp))

        // 역 이름
        Column(
            modifier = Modifier.weight(1f)
        ) {
            Text(
                text = station.name,
                style = MaterialTheme.typography.bodyLarge.copy(
                    fontWeight = if (isCurrent || isArrival) FontWeight.Bold else FontWeight.Normal,
                    fontSize = if (isCurrent) 18.sp else 16.sp
                ),
                color = if (isCurrent) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurface
                }
            )

            // 현재 역 표시
            if (isCurrent) {
                Text(
                    text = "현재 위치",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }

            // 도착역 표시
            if (isArrival) {
                Text(
                    text = "도착역",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.secondary
                )
            }

            // 환승역 표시
            if (station.isTransferStation() && !isCurrent && !isArrival) {
                Text(
                    text = "환승역",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.tertiary
                )
            }
        }

        // 알림 아이콘 (도착역 또는 알림 설정 역)
        if (isArrival || isAlertStation) {
            Icon(
                imageVector = Icons.Default.NotificationsActive,
                contentDescription = "도착 알림",
                modifier = Modifier.size(24.dp),
                tint = if (isArrival) {
                    MaterialTheme.colorScheme.error
                } else {
                    MaterialTheme.colorScheme.primary
                }
            )
        }
    }
}

/**
 * 미니 노선도 시각화 (정보 카드용)
 */
@Composable
fun MiniRouteVisualization(
    totalStations: Int,
    currentStationIndex: Int,
    lineColor: Color,
    modifier: Modifier = Modifier
) {
    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(40.dp)
    ) {
        val stationSpacing = size.width / (totalStations - 1).coerceAtLeast(1)
        val centerY = size.height / 2
        val stationRadius = 6.dp.toPx()
        val currentRadius = 10.dp.toPx()

        // 노선 라인 (지나간 구간)
        if (currentStationIndex > 0) {
            drawLine(
                color = Color.Gray.copy(alpha = 0.5f),
                start = Offset(0f, centerY),
                end = Offset(stationSpacing * currentStationIndex, centerY),
                strokeWidth = 4.dp.toPx()
            )
        }

        // 노선 라인 (남은 구간)
        if (currentStationIndex < totalStations - 1) {
            drawLine(
                color = lineColor,
                start = Offset(stationSpacing * currentStationIndex, centerY),
                end = Offset(size.width, centerY),
                strokeWidth = 4.dp.toPx()
            )
        }

        // 역 표시
        for (i in 0 until totalStations) {
            val x = stationSpacing * i
            val isPassed = i < currentStationIndex
            val isCurrent = i == currentStationIndex
            val isLast = i == totalStations - 1

            val color = when {
                isPassed -> Color.Gray.copy(alpha = 0.5f)
                else -> lineColor
            }

            val radius = when {
                isCurrent -> currentRadius
                isLast -> stationRadius * 1.2f
                else -> stationRadius
            }

            drawCircle(
                color = color,
                radius = radius,
                center = Offset(x, centerY)
            )

            // 현재 역 내부 흰색
            if (isCurrent) {
                drawCircle(
                    color = Color.White,
                    radius = radius * 0.5f,
                    center = Offset(x, centerY)
                )
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun RouteVisualizationPreview() {
    val sampleStations = listOf(
        Station("1", "강남", "2", 37.4979, 127.0276),
        Station("2", "역삼", "2", 37.5007, 127.0365),
        Station("3", "선릉", "2", 37.5046, 127.0486, listOf("K")),
        Station("4", "삼성", "2", 37.5088, 127.0631),
        Station("5", "종합운동장", "2", 37.5109, 127.0735)
    )

    SubwayMateTheme {
        RouteVisualization(
            stations = sampleStations,
            currentStationIndex = 1,
            alertStationIndex = 3,
            lineColor = LineColors.Line2
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun MiniRouteVisualizationPreview() {
    SubwayMateTheme {
        MiniRouteVisualization(
            totalStations = 5,
            currentStationIndex = 2,
            lineColor = LineColors.Line2,
            modifier = Modifier.padding(16.dp)
        )
    }
}
