package com.ydinp.subwaymate.presentation.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController

sealed class Screen(val route: String) {
    data object Main : Screen("main")
    data object StationSelect : Screen("station_select/{type}") {
        fun createRoute(type: String) = "station_select/$type"
    }
    data object Tracking : Screen("tracking")
}

@Composable
fun SubwayMateNavHost(
    modifier: Modifier = Modifier,
    navController: NavHostController = rememberNavController(),
    startDestination: String = Screen.Main.route
) {
    NavHost(
        navController = navController,
        startDestination = startDestination,
        modifier = modifier
    ) {
        composable(Screen.Main.route) {
            // TODO: MainScreen 구현 (Task 4.1)
            PlaceholderScreen("메인 화면\n\n출발역/도착역 선택 후\n알림을 시작하세요")
        }

        composable(Screen.StationSelect.route) { backStackEntry ->
            val type = backStackEntry.arguments?.getString("type") ?: "departure"
            // TODO: StationSelectScreen 구현 (Task 4.2)
            PlaceholderScreen("역 선택 화면\n\nType: $type")
        }

        composable(Screen.Tracking.route) {
            // TODO: TrackingScreen 구현 (Task 4.3)
            PlaceholderScreen("실시간 추적 화면\n\n현재 위치와\n남은 역을 표시합니다")
        }
    }
}

@Composable
private fun PlaceholderScreen(text: String) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Text(text = text)
    }
}
