package com.ydinp.subwaymate.presentation.common.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.ydinp.subwaymate.presentation.common.theme.SubwayMateTheme

/**
 * 로딩 화면을 표시하는 공통 컴포넌트
 *
 * @param modifier Modifier
 * @param message 로딩 메시지 (선택적)
 * @param indicatorSize 로딩 인디케이터 크기
 * @param indicatorColor 로딩 인디케이터 색상
 * @param showBackground 배경 표시 여부
 */
@Composable
fun LoadingContent(
    modifier: Modifier = Modifier,
    message: String? = null,
    indicatorSize: Dp = 48.dp,
    indicatorColor: Color = MaterialTheme.colorScheme.primary,
    showBackground: Boolean = false
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .then(
                if (showBackground) {
                    Modifier.background(MaterialTheme.colorScheme.surface.copy(alpha = 0.9f))
                } else {
                    Modifier
                }
            ),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(indicatorSize),
                color = indicatorColor,
                strokeWidth = 4.dp
            )

            if (message != null) {
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 32.dp)
                )
            }
        }
    }
}

/**
 * 페이딩 애니메이션이 적용된 로딩 컴포넌트
 *
 * @param modifier Modifier
 * @param message 로딩 메시지
 */
@Composable
fun AnimatedLoadingContent(
    modifier: Modifier = Modifier,
    message: String = "로딩 중..."
) {
    val infiniteTransition = rememberInfiniteTransition(label = "loading")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(800, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "alpha"
    )

    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(48.dp),
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.alpha(alpha)
            )
        }
    }
}

/**
 * 오버레이 형태의 로딩 컴포넌트
 *
 * 기존 컨텐츠 위에 반투명 배경과 함께 로딩 인디케이터를 표시합니다.
 *
 * @param isLoading 로딩 상태
 * @param message 로딩 메시지 (선택적)
 * @param content 배경 컨텐츠
 */
@Composable
fun LoadingOverlay(
    isLoading: Boolean,
    message: String? = null,
    content: @Composable () -> Unit
) {
    Box(modifier = Modifier.fillMaxSize()) {
        content()

        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.7f)),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(48.dp),
                        color = MaterialTheme.colorScheme.primary
                    )

                    if (message != null) {
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = message,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
        }
    }
}

// ===== Preview =====

@Preview(showBackground = true)
@Composable
private fun LoadingContentPreview() {
    SubwayMateTheme {
        LoadingContent(message = "데이터를 불러오는 중...")
    }
}

@Preview(showBackground = true)
@Composable
private fun AnimatedLoadingContentPreview() {
    SubwayMateTheme {
        AnimatedLoadingContent(message = "잠시만 기다려주세요...")
    }
}

@Preview(showBackground = true)
@Composable
private fun LoadingOverlayPreview() {
    SubwayMateTheme {
        LoadingOverlay(
            isLoading = true,
            message = "저장 중..."
        ) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text("배경 컨텐츠")
            }
        }
    }
}
