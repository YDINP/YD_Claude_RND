package com.ydinp.subwaymate.presentation

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.navigation.compose.rememberNavController
import com.ydinp.subwaymate.notification.AlertNotificationBuilder
import com.ydinp.subwaymate.presentation.common.theme.SubwayMateTheme
import com.ydinp.subwaymate.presentation.navigation.Screen
import com.ydinp.subwaymate.presentation.navigation.SubwayMateNavHost
import com.ydinp.subwaymate.service.ServiceNotificationManager
import com.ydinp.subwaymate.worker.BatteryOptimizationHelper
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * SubwayMate 앱의 메인 액티비티
 *
 * 앱의 진입점으로, 네비게이션 호스트를 설정하고
 * 필요한 권한 요청 및 시스템 설정을 관리합니다.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var batteryOptimizationHelper: BatteryOptimizationHelper

    /**
     * 알림 클릭으로 인한 시작 화면 경로
     * null이면 기본 화면(Main)으로 이동
     */
    private var startDestination by mutableStateOf<String?>(null)

    /**
     * 알림 권한 요청 완료 여부
     */
    private var notificationPermissionChecked by mutableStateOf(false)

    /**
     * 배터리 최적화 다이얼로그 표시 여부
     */
    private var showBatteryOptimizationDialog by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Edge-to-edge 디스플레이 설정
        enableEdgeToEdge()
        WindowCompat.setDecorFitsSystemWindows(window, false)

        // 알림에서 앱을 시작한 경우 시작 화면 결정
        handleNotificationIntent(intent)

        setContent {
            SubwayMateTheme {
                val navController = rememberNavController()
                val snackbarHostState = remember { SnackbarHostState() }
                val scope = rememberCoroutineScope()

                // 알림 권한 요청 런처 (Android 13+)
                val notificationPermissionLauncher = rememberLauncherForActivityResult(
                    contract = ActivityResultContracts.RequestPermission()
                ) { isGranted ->
                    notificationPermissionChecked = true
                    if (!isGranted) {
                        scope.launch {
                            val result = snackbarHostState.showSnackbar(
                                message = "알림 권한이 거부되었습니다. 도착 알림을 받으려면 설정에서 권한을 허용해주세요.",
                                actionLabel = "설정"
                            )
                            if (result == SnackbarResult.ActionPerformed) {
                                openAppSettings()
                            }
                        }
                    } else {
                        // 알림 권한 허용 후 배터리 최적화 확인
                        checkBatteryOptimization()
                    }
                }

                // 초기 권한 확인
                LaunchedEffect(Unit) {
                    checkAndRequestNotificationPermission(
                        onPermissionNeeded = {
                            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        },
                        onPermissionGranted = {
                            notificationPermissionChecked = true
                            checkBatteryOptimization()
                        }
                    )
                }

                // 배터리 최적화 예외 다이얼로그
                if (showBatteryOptimizationDialog) {
                    BatteryOptimizationAlertDialog(
                        onConfirm = {
                            showBatteryOptimizationDialog = false
                            batteryOptimizationHelper.requestBatteryOptimizationExemption(this)
                        },
                        onDismiss = {
                            showBatteryOptimizationDialog = false
                        }
                    )
                }

                Scaffold(
                    snackbarHost = {
                        SnackbarHost(hostState = snackbarHostState)
                    }
                ) { paddingValues ->
                    Surface(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(paddingValues),
                        color = MaterialTheme.colorScheme.background
                    ) {
                        SubwayMateNavHost(
                            navController = navController,
                            startDestination = startDestination ?: Screen.Main.route
                        )
                    }
                }

                // Intent 처리에 따른 네비게이션
                LaunchedEffect(startDestination) {
                    startDestination?.let { destination ->
                        if (destination != Screen.Main.route) {
                            navController.navigate(destination) {
                                popUpTo(Screen.Main.route) { inclusive = false }
                            }
                        }
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleNotificationIntent(intent)
    }

    /**
     * 알림 클릭 Intent 처리
     *
     * 알림에서 앱을 시작하거나 이미 실행 중인 앱으로 이동할 때
     * 적절한 화면으로 네비게이션합니다.
     */
    private fun handleNotificationIntent(intent: Intent?) {
        Log.d(TAG, "handleNotificationIntent: action=${intent?.action}")

        when (intent?.action) {
            // 추적 화면 열기 (도착 알림 클릭 시)
            AlertNotificationBuilder.ACTION_OPEN_TRACKING,
            ServiceNotificationManager.ACTION_OPEN_APP -> {
                // 세션 ID가 있으면 해당 세션의 추적 화면으로
                val sessionId = intent.getStringExtra(EXTRA_SESSION_ID)
                startDestination = if (sessionId != null) {
                    Screen.Tracking.createRoute(sessionId = sessionId)
                } else {
                    Screen.Tracking.createRoute()
                }
            }
            // 일반 앱 열기 (기타 알림 클릭 시)
            AlertNotificationBuilder.ACTION_OPEN_APP -> {
                // 기본 화면으로 이동 (또는 현재 화면 유지)
                startDestination = null
            }
        }
    }

    /**
     * 알림 권한 확인 및 요청 (Android 13+)
     */
    private fun checkAndRequestNotificationPermission(
        onPermissionNeeded: () -> Unit,
        onPermissionGranted: () -> Unit
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            when {
                ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED -> {
                    onPermissionGranted()
                }
                shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS) -> {
                    // 이전에 거부했지만 "다시 묻지 않음"을 선택하지 않은 경우
                    onPermissionNeeded()
                }
                else -> {
                    onPermissionNeeded()
                }
            }
        } else {
            // Android 12 이하에서는 알림 권한이 자동 허용
            onPermissionGranted()
        }
    }

    /**
     * 배터리 최적화 예외 확인 및 다이얼로그 표시
     */
    private fun checkBatteryOptimization() {
        if (!batteryOptimizationHelper.isIgnoringBatteryOptimizations()) {
            showBatteryOptimizationDialog = true
        }
    }

    /**
     * 앱 설정 화면 열기
     */
    private fun openAppSettings() {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", packageName, null)
        }
        startActivity(intent)
    }

    companion object {
        private const val TAG = "MainActivity"
        const val EXTRA_SESSION_ID = "extra_session_id"
    }
}

/**
 * 배터리 최적화 예외 요청 다이얼로그
 */
@Composable
private fun BatteryOptimizationAlertDialog(
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(text = "배터리 최적화 예외 필요")
        },
        text = {
            Text(
                text = "SubwayMate가 백그라운드에서 안정적으로 도착 알림을 제공하려면 " +
                        "배터리 최적화에서 제외되어야 합니다.\n\n" +
                        "배터리 사용량에는 큰 영향이 없습니다."
            )
        },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text("허용하기")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("나중에")
            }
        }
    )
}
