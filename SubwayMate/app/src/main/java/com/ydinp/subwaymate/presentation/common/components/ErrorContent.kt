package com.ydinp.subwaymate.presentation.common.components

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.ydinp.subwaymate.presentation.common.theme.SubwayMateTheme

/**
 * 에러 상태를 표시하는 공통 컴포넌트
 *
 * @param modifier Modifier
 * @param title 에러 제목
 * @param message 에러 메시지
 * @param icon 표시할 아이콘
 * @param iconTint 아이콘 색상
 * @param onRetry 재시도 버튼 클릭 콜백 (null이면 버튼 숨김)
 * @param retryLabel 재시도 버튼 라벨
 * @param onDismiss 닫기 버튼 클릭 콜백 (null이면 버튼 숨김)
 * @param dismissLabel 닫기 버튼 라벨
 */
@Composable
fun ErrorContent(
    modifier: Modifier = Modifier,
    title: String = "오류가 발생했습니다",
    message: String,
    icon: ImageVector = Icons.Default.ErrorOutline,
    iconTint: Color = MaterialTheme.colorScheme.error,
    onRetry: (() -> Unit)? = null,
    retryLabel: String = "다시 시도",
    onDismiss: (() -> Unit)? = null,
    dismissLabel: String = "돌아가기"
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
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = iconTint
            )

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(12.dp))

            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 16.dp)
            )

            Spacer(modifier = Modifier.height(32.dp))

            // 버튼 영역
            Row(
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (onDismiss != null) {
                    OutlinedButton(onClick = onDismiss) {
                        Text(dismissLabel)
                    }
                    if (onRetry != null) {
                        Spacer(modifier = Modifier.width(12.dp))
                    }
                }

                if (onRetry != null) {
                    Button(onClick = onRetry) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(retryLabel)
                    }
                }
            }
        }
    }
}

/**
 * 네트워크 에러 전용 컴포넌트
 *
 * @param modifier Modifier
 * @param message 에러 메시지
 * @param onRetry 재시도 버튼 클릭 콜백
 */
@Composable
fun NetworkErrorContent(
    modifier: Modifier = Modifier,
    message: String = "네트워크 연결을 확인해주세요.",
    onRetry: (() -> Unit)? = null
) {
    ErrorContent(
        modifier = modifier,
        title = "연결 오류",
        message = message,
        icon = Icons.Default.WifiOff,
        iconTint = MaterialTheme.colorScheme.error,
        onRetry = onRetry
    )
}

/**
 * 경고 상태를 표시하는 컴포넌트
 *
 * @param modifier Modifier
 * @param title 경고 제목
 * @param message 경고 메시지
 * @param onAction 액션 버튼 클릭 콜백
 * @param actionLabel 액션 버튼 라벨
 */
@Composable
fun WarningContent(
    modifier: Modifier = Modifier,
    title: String = "주의",
    message: String,
    onAction: (() -> Unit)? = null,
    actionLabel: String = "확인"
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
            Icon(
                imageVector = Icons.Default.Warning,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.tertiary
            )

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(12.dp))

            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )

            if (onAction != null) {
                Spacer(modifier = Modifier.height(24.dp))

                Button(
                    onClick = onAction,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.tertiary
                    )
                ) {
                    Text(actionLabel)
                }
            }
        }
    }
}

/**
 * 카드 형태의 에러 표시 컴포넌트 (인라인용)
 *
 * @param modifier Modifier
 * @param message 에러 메시지
 * @param onRetry 재시도 버튼 클릭 콜백
 */
@Composable
fun ErrorCard(
    modifier: Modifier = Modifier,
    message: String,
    onRetry: (() -> Unit)? = null
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.ErrorOutline,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    modifier = Modifier.weight(1f)
                )
            }

            if (onRetry != null) {
                Spacer(modifier = Modifier.height(12.dp))
                TextButton(onClick = onRetry) {
                    Text(
                        text = "다시 시도",
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        }
    }
}

/**
 * 빈 상태를 표시하는 컴포넌트
 *
 * @param modifier Modifier
 * @param title 제목
 * @param message 메시지
 * @param icon 표시할 아이콘
 */
@Composable
fun EmptyContent(
    modifier: Modifier = Modifier,
    title: String = "데이터가 없습니다",
    message: String = "",
    icon: ImageVector? = null
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
            if (icon != null) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    modifier = Modifier.size(64.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                )
                Spacer(modifier = Modifier.height(24.dp))
            }

            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )

            if (message.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

// ===== Preview =====

@Preview(showBackground = true)
@Composable
private fun ErrorContentPreview() {
    SubwayMateTheme {
        ErrorContent(
            message = "데이터를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
            onRetry = {},
            onDismiss = {}
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun NetworkErrorContentPreview() {
    SubwayMateTheme {
        NetworkErrorContent(onRetry = {})
    }
}

@Preview(showBackground = true)
@Composable
private fun WarningContentPreview() {
    SubwayMateTheme {
        WarningContent(
            message = "이 작업은 취소할 수 없습니다.",
            onAction = {}
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun ErrorCardPreview() {
    SubwayMateTheme {
        ErrorCard(
            message = "데이터 로드 실패",
            onRetry = {},
            modifier = Modifier.padding(16.dp)
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun EmptyContentPreview() {
    SubwayMateTheme {
        EmptyContent(
            title = "검색 결과가 없습니다",
            message = "다른 검색어를 입력해보세요."
        )
    }
}
