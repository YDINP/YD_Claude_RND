package com.ydinp.subwaymate.domain.model

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

/**
 * 지하철 노선 정보를 나타내는 data class
 *
 * 수도권 지하철의 각 노선에 대한 기본 정보를 담고 있습니다.
 * 1~9호선, 경의중앙선, 분당선, 신분당선 등 다양한 노선을 표현할 수 있습니다.
 *
 * @property id 노선 고유 식별자 (API에서 사용하는 노선 코드)
 * @property name 노선명 (예: "1호선", "경의중앙선")
 * @property color 노선 대표 색상 (HEX 형식, 예: "#0052A4")
 * @property type 노선 유형 (일반, 순환, 지선 등)
 */
@Parcelize
data class Line(
    val id: String,
    val name: String,
    val color: String,
    val type: LineType
) : Parcelable {
    /**
     * 순환 노선인지 확인
     *
     * @return 순환 노선이면 true (2호선 본선)
     */
    fun isCircular(): Boolean = type == LineType.CIRCULAR

    /**
     * 노선 색상을 Int 값으로 변환
     *
     * @return ARGB 형식의 색상 Int 값
     */
    fun colorAsInt(): Int {
        return android.graphics.Color.parseColor(color)
    }
}

/**
 * 노선 유형을 나타내는 enum 클래스
 */
enum class LineType(
    /** 유형의 한글 표시명 */
    val displayName: String
) {
    /**
     * 일반 노선: 상행/하행 운행 (1호선, 3~9호선, 경의중앙선 등)
     */
    STANDARD(displayName = "일반"),

    /**
     * 순환 노선: 내선/외선 순환 운행 (2호선 본선)
     */
    CIRCULAR(displayName = "순환"),

    /**
     * 지선: 본선에서 분기하는 노선 (2호선 성수지선, 신정지선)
     */
    BRANCH(displayName = "지선"),

    /**
     * 경전철: 경량 전철 노선 (우이신설선, 신림선 등)
     */
    LIGHT_RAIL(displayName = "경전철"),

    /**
     * 급행: 급행 운행 노선 (신분당선, GTX 등)
     */
    EXPRESS(displayName = "급행")
}
