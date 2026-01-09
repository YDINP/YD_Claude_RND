package com.ydinp.subwaymate.presentation.common.theme

import androidx.compose.ui.graphics.Color

// 기본 테마 색상
val Purple80 = Color(0xFFD0BCFF)
val PurpleGrey80 = Color(0xFFCCC2DC)
val Pink80 = Color(0xFFEFB8C8)

val Purple40 = Color(0xFF6650a4)
val PurpleGrey40 = Color(0xFF625b71)
val Pink40 = Color(0xFF7D5260)

// 지하철 노선 색상
object LineColors {
    val Line1 = Color(0xFF0052A4)  // 1호선 - 남색
    val Line2 = Color(0xFF00A84D)  // 2호선 - 초록
    val Line3 = Color(0xFFEF7C1C)  // 3호선 - 주황
    val Line4 = Color(0xFF00A5DE)  // 4호선 - 하늘
    val Line5 = Color(0xFF996CAC)  // 5호선 - 보라
    val Line6 = Color(0xFFCD7C2F)  // 6호선 - 황토
    val Line7 = Color(0xFF747F00)  // 7호선 - 올리브
    val Line8 = Color(0xFFE6186C)  // 8호선 - 분홍
    val Line9 = Color(0xFFBDB092)  // 9호선 - 금색
    val LineGyeongui = Color(0xFF77C4A3)  // 경의중앙선
    val LineGyeongchun = Color(0xFF0C8E72)  // 경춘선
    val LineSuin = Color(0xFFF5A200)  // 수인분당선
    val LineShinbundang = Color(0xFFD4003B)  // 신분당선
    val LineAirport = Color(0xFF0090D2)  // 공항철도
    val LineGtxA = Color(0xFF9A6292)  // GTX-A

    fun getLineColor(lineId: String): Color {
        return when (lineId) {
            "1" -> Line1
            "2" -> Line2
            "3" -> Line3
            "4" -> Line4
            "5" -> Line5
            "6" -> Line6
            "7" -> Line7
            "8" -> Line8
            "9" -> Line9
            "K" -> LineGyeongui  // 경의중앙선
            "G" -> LineGyeongchun  // 경춘선
            "S" -> LineSuin  // 수인분당선
            "D" -> LineShinbundang  // 신분당선
            "A" -> LineAirport  // 공항철도
            "GTX-A" -> LineGtxA
            else -> Line2  // 기본값
        }
    }
}
