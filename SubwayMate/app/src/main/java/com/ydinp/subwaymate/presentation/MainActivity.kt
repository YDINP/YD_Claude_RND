package com.ydinp.subwaymate.presentation

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.ydinp.subwaymate.notification.AlertNotificationBuilder
import com.ydinp.subwaymate.presentation.common.theme.SubwayMateTheme
import com.ydinp.subwaymate.presentation.navigation.Screen
import com.ydinp.subwaymate.presentation.navigation.SubwayMateNavHost
import com.ydinp.subwaymate.service.ServiceNotificationManager
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    /**
     * 알림 클릭으로 인한 시작 화면 경로
     * null이면 기본 화면(Main)으로 이동
     */
    private var startDestination by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // 알림에서 앱을 시작한 경우 시작 화면 결정
        handleNotificationIntent(intent)

        setContent {
            SubwayMateTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    SubwayMateNavHost(
                        startDestination = startDestination ?: Screen.Main.route
                    )
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
        when (intent?.action) {
            // 추적 화면 열기 (도착 알림 클릭 시)
            AlertNotificationBuilder.ACTION_OPEN_TRACKING,
            ServiceNotificationManager.ACTION_OPEN_APP -> {
                startDestination = Screen.Tracking.route
            }
            // 일반 앱 열기 (기타 알림 클릭 시)
            AlertNotificationBuilder.ACTION_OPEN_APP -> {
                // 기본 화면으로 이동 (또는 현재 화면 유지)
                startDestination = null
            }
        }
    }

    companion object {
        private const val TAG = "MainActivity"
    }
}
