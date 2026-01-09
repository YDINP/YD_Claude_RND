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
import com.ydinp.subwaymate.presentation.main.MainScreen
import com.ydinp.subwaymate.presentation.station.StationSelectScreen

sealed class Screen(val route: String) {
    data object Main : Screen("main")
    data object StationSelect : Screen("station_select/{type}") {
        fun createRoute(type: String) = "station_select/$type"
    }
    data object Tracking : Screen("tracking")
    data object Settings : Screen("settings")
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
            MainScreen(
                onNavigateToStationSelect = { type ->
                    navController.navigate(Screen.StationSelect.createRoute(type))
                },
                onNavigateToTracking = {
                    navController.navigate(Screen.Tracking.route)
                },
                onNavigateToSettings = {
                    navController.navigate(Screen.Settings.route)
                }
            )
        }

        composable(Screen.StationSelect.route) { backStackEntry ->
            val type = backStackEntry.arguments?.getString("type") ?: "departure"
            StationSelectScreen(
                selectionType = type,
                onStationSelected = { station ->
                    // 역 선택 후 이전 화면으로 돌아가기
                    navController.previousBackStackEntry
                        ?.savedStateHandle
                        ?.set("selected_station_$type", station.id)
                    navController.popBackStack()
                },
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }

        composable(Screen.Tracking.route) {
            // TODO: TrackingScreen 구현 (Task 4.3)
            PlaceholderScreen("실시간 추적 화면\n\n현재 위치와\n남은 역을 표시합니다")
        }

        composable(Screen.Settings.route) {
            // TODO: SettingsScreen 구현
            PlaceholderScreen("설정 화면")
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
