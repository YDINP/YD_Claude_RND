package com.ydinp.subwaymate.presentation.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.ydinp.subwaymate.presentation.main.MainScreen
import com.ydinp.subwaymate.presentation.main.MainViewModel
import com.ydinp.subwaymate.presentation.station.StationSelectScreen
import com.ydinp.subwaymate.presentation.tracking.TrackingScreen
import com.ydinp.subwaymate.presentation.tracking.TrackingViewModel

/**
 * 네비게이션 경로 정의
 */
sealed class Screen(val route: String) {
    data object Main : Screen("main")

    data object StationSelect : Screen("station_select/{type}") {
        const val ARG_TYPE = "type"
        fun createRoute(type: String) = "station_select/$type"
    }

    data object Tracking : Screen("tracking?sessionId={sessionId}&departureId={departureId}&arrivalId={arrivalId}&lineId={lineId}&direction={direction}") {
        const val ARG_SESSION_ID = "sessionId"
        const val ARG_DEPARTURE_ID = "departureId"
        const val ARG_ARRIVAL_ID = "arrivalId"
        const val ARG_LINE_ID = "lineId"
        const val ARG_DIRECTION = "direction"

        fun createRoute(
            sessionId: String? = null,
            departureId: String? = null,
            arrivalId: String? = null,
            lineId: String? = null,
            direction: String? = null
        ): String {
            return buildString {
                append("tracking")
                val params = mutableListOf<String>()
                sessionId?.let { params.add("sessionId=$it") }
                departureId?.let { params.add("departureId=$it") }
                arrivalId?.let { params.add("arrivalId=$it") }
                lineId?.let { params.add("lineId=$it") }
                direction?.let { params.add("direction=$it") }
                if (params.isNotEmpty()) {
                    append("?${params.joinToString("&")}")
                }
            }
        }
    }

    data object Settings : Screen("settings")
}

/**
 * SavedStateHandle 키 (역 선택 결과 전달용)
 */
object NavKeys {
    const val SELECTED_DEPARTURE_STATION_ID = "selected_station_departure"
    const val SELECTED_ARRIVAL_STATION_ID = "selected_station_arrival"
    const val SELECTED_DEPARTURE_STATION_NAME = "selected_station_departure_name"
    const val SELECTED_ARRIVAL_STATION_NAME = "selected_station_arrival_name"
    const val SELECTED_LINE_ID = "selected_line_id"
}

/**
 * SubwayMate 앱의 메인 네비게이션 호스트
 *
 * @param modifier Modifier
 * @param navController NavHostController
 * @param startDestination 시작 화면 경로
 */
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
        // 메인 화면
        composable(Screen.Main.route) { backStackEntry ->
            val mainViewModel: MainViewModel = hiltViewModel()

            // 역 선택 결과 수신
            val savedStateHandle = backStackEntry.savedStateHandle

            // 출발역 선택 결과 확인
            val selectedDepartureId by savedStateHandle
                .getStateFlow<String?>(NavKeys.SELECTED_DEPARTURE_STATION_ID, null)
                .collectAsStateWithLifecycle()

            val selectedDepartureName by savedStateHandle
                .getStateFlow<String?>(NavKeys.SELECTED_DEPARTURE_STATION_NAME, null)
                .collectAsStateWithLifecycle()

            // 도착역 선택 결과 확인
            val selectedArrivalId by savedStateHandle
                .getStateFlow<String?>(NavKeys.SELECTED_ARRIVAL_STATION_ID, null)
                .collectAsStateWithLifecycle()

            val selectedArrivalName by savedStateHandle
                .getStateFlow<String?>(NavKeys.SELECTED_ARRIVAL_STATION_NAME, null)
                .collectAsStateWithLifecycle()

            // 선택된 노선 ID
            val selectedLineId by savedStateHandle
                .getStateFlow<String?>(NavKeys.SELECTED_LINE_ID, null)
                .collectAsStateWithLifecycle()

            MainScreen(
                viewModel = mainViewModel,
                selectedDepartureStationId = selectedDepartureId,
                selectedDepartureStationName = selectedDepartureName,
                selectedArrivalStationId = selectedArrivalId,
                selectedArrivalStationName = selectedArrivalName,
                selectedLineId = selectedLineId,
                onNavigateToStationSelect = { type ->
                    navController.navigate(Screen.StationSelect.createRoute(type))
                },
                onNavigateToTracking = { departureId, arrivalId, lineId, direction ->
                    val route = Screen.Tracking.createRoute(
                        departureId = departureId,
                        arrivalId = arrivalId,
                        lineId = lineId,
                        direction = direction
                    )
                    navController.navigate(route)
                },
                onNavigateToSettings = {
                    navController.navigate(Screen.Settings.route)
                },
                onClearDepartureSelection = {
                    savedStateHandle[NavKeys.SELECTED_DEPARTURE_STATION_ID] = null
                    savedStateHandle[NavKeys.SELECTED_DEPARTURE_STATION_NAME] = null
                },
                onClearArrivalSelection = {
                    savedStateHandle[NavKeys.SELECTED_ARRIVAL_STATION_ID] = null
                    savedStateHandle[NavKeys.SELECTED_ARRIVAL_STATION_NAME] = null
                }
            )
        }

        // 역 선택 화면
        composable(
            route = Screen.StationSelect.route,
            arguments = listOf(
                navArgument(Screen.StationSelect.ARG_TYPE) {
                    type = NavType.StringType
                    defaultValue = "departure"
                }
            )
        ) { backStackEntry ->
            val type = backStackEntry.arguments?.getString(Screen.StationSelect.ARG_TYPE) ?: "departure"

            StationSelectScreen(
                selectionType = type,
                onStationSelected = { station ->
                    // 역 선택 후 이전 화면(Main)의 SavedStateHandle에 결과 저장
                    navController.previousBackStackEntry?.savedStateHandle?.apply {
                        if (type == "departure") {
                            set(NavKeys.SELECTED_DEPARTURE_STATION_ID, station.id)
                            set(NavKeys.SELECTED_DEPARTURE_STATION_NAME, station.name)
                            set(NavKeys.SELECTED_LINE_ID, station.lineId)
                        } else {
                            set(NavKeys.SELECTED_ARRIVAL_STATION_ID, station.id)
                            set(NavKeys.SELECTED_ARRIVAL_STATION_NAME, station.name)
                        }
                    }
                    navController.popBackStack()
                },
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }

        // 추적 화면
        composable(
            route = Screen.Tracking.route,
            arguments = listOf(
                navArgument(Screen.Tracking.ARG_SESSION_ID) {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument(Screen.Tracking.ARG_DEPARTURE_ID) {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument(Screen.Tracking.ARG_ARRIVAL_ID) {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument(Screen.Tracking.ARG_LINE_ID) {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument(Screen.Tracking.ARG_DIRECTION) {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                }
            )
        ) {
            TrackingScreen(
                onNavigateBack = {
                    navController.popBackStack()
                },
                onStopTracking = {
                    // 추적 종료 후 메인 화면으로 돌아가기
                    navController.popBackStack(Screen.Main.route, inclusive = false)
                }
            )
        }

        // 설정 화면
        composable(Screen.Settings.route) {
            // TODO: SettingsScreen 구현
            PlaceholderScreen("설정 화면\n\n알림 설정, 앱 정보 등을\n관리합니다")
        }
    }
}

/**
 * 미구현 화면용 플레이스홀더
 */
@Composable
private fun PlaceholderScreen(text: String) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Text(text = text)
    }
}
