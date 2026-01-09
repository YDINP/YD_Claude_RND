package com.ydinp.subwaymate.worker

import android.content.Intent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * 배터리 최적화 예외 설정 다이얼로그
 *
 * 사용자에게 배터리 최적화 예외 설정이 필요한 이유를 설명하고,
 * 시스템 설정 화면으로 이동할 수 있도록 합니다.
 *
 * @param helper BatteryOptimizationHelper 인스턴스
 * @param onDismiss 다이얼로그 닫기 콜백
 * @param onConfirm 설정하기 버튼 클릭 시 콜백 (설정 Intent 전달)
 */
@Composable
fun BatteryOptimizationDialog(
    helper: BatteryOptimizationHelper,
    onDismiss: () -> Unit,
    onConfirm: (Intent) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(text = BatteryOptimizationHelper.DIALOG_TITLE)
        },
        text = {
            Text(text = BatteryOptimizationHelper.EXPLANATION_MESSAGE.trimIndent())
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val intent = helper.createBatteryOptimizationExemptionIntent()
                    if (intent != null) {
                        onConfirm(intent)
                    }
                    onDismiss()
                }
            ) {
                Text(BatteryOptimizationHelper.POSITIVE_BUTTON_TEXT)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(BatteryOptimizationHelper.NEGATIVE_BUTTON_TEXT)
            }
        }
    )
}

/**
 * 배터리 최적화 예외 상태를 관리하는 Composable State Holder
 *
 * 배터리 최적화 예외가 필요한지 확인하고, 다이얼로그 표시 여부를 관리합니다.
 *
 * @param helper BatteryOptimizationHelper 인스턴스
 * @return BatteryOptimizationState
 */
@Composable
fun rememberBatteryOptimizationState(
    helper: BatteryOptimizationHelper
): BatteryOptimizationState {
    var shouldShowDialog by remember { mutableStateOf(false) }
    var isExempted by remember { mutableStateOf(false) }

    // 초기 상태 체크
    LaunchedEffect(Unit) {
        isExempted = helper.isIgnoringBatteryOptimizations()
    }

    return remember(shouldShowDialog, isExempted) {
        BatteryOptimizationState(
            shouldShowDialog = shouldShowDialog,
            isExempted = isExempted,
            showDialog = { shouldShowDialog = true },
            hideDialog = { shouldShowDialog = false },
            checkExemption = {
                isExempted = helper.isIgnoringBatteryOptimizations()
            }
        )
    }
}

/**
 * 배터리 최적화 예외 상태
 *
 * @property shouldShowDialog 다이얼로그를 표시해야 하는지 여부
 * @property isExempted 배터리 최적화 예외가 설정되어 있는지 여부
 * @property showDialog 다이얼로그 표시 함수
 * @property hideDialog 다이얼로그 숨기기 함수
 * @property checkExemption 예외 상태 다시 확인 함수
 */
data class BatteryOptimizationState(
    val shouldShowDialog: Boolean,
    val isExempted: Boolean,
    val showDialog: () -> Unit,
    val hideDialog: () -> Unit,
    val checkExemption: () -> Unit
)

/**
 * 배터리 최적화 예외 설정 안내 카드
 *
 * 배터리 최적화 예외가 설정되어 있지 않은 경우 표시되는 안내 카드입니다.
 *
 * @param helper BatteryOptimizationHelper 인스턴스
 * @param onSettingsClick 설정 버튼 클릭 시 콜백
 * @param modifier Modifier
 */
@Composable
fun BatteryOptimizationInfoCard(
    helper: BatteryOptimizationHelper,
    onSettingsClick: (Intent) -> Unit,
    modifier: Modifier = Modifier
) {
    val isExempted = remember { helper.isIgnoringBatteryOptimizations() }

    if (!isExempted) {
        Card(
            modifier = modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Text(
                    text = "알림 지연 방지",
                    style = MaterialTheme.typography.titleMedium
                )

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = "정확한 도착 알림을 위해 배터리 최적화 예외 설정을 권장합니다.",
                    style = MaterialTheme.typography.bodyMedium
                )

                Spacer(modifier = Modifier.height(12.dp))

                TextButton(
                    onClick = {
                        val intent = helper.createBatteryOptimizationExemptionIntent()
                        if (intent != null) {
                            onSettingsClick(intent)
                        }
                    }
                ) {
                    Text("설정하기")
                }
            }
        }
    }
}
