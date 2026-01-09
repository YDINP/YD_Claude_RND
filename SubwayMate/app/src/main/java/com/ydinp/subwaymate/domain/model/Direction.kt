package com.ydinp.subwaymate.domain.model

/**
 * 열차 운행 방향을 나타내는 enum 클래스
 *
 * 수도권 지하철은 노선 유형에 따라 다른 방향 표기 방식을 사용합니다:
 * - 직선 노선 (1~9호선, 경의중앙선 등): 상행(UP) / 하행(DOWN)
 * - 순환 노선 (2호선 본선): 내선순환(INNER) / 외선순환(OUTER)
 */
enum class Direction(
    /** 방향의 한글 표시명 */
    val displayName: String,
    /** API 응답에서 사용되는 코드 값 */
    val code: String
) {
    /**
     * 상행: 서울역, 시청 방면으로 올라가는 방향
     * 일반적으로 역 번호가 감소하는 방향
     */
    UP(displayName = "상행", code = "0"),

    /**
     * 하행: 외곽 방면으로 내려가는 방향
     * 일반적으로 역 번호가 증가하는 방향
     */
    DOWN(displayName = "하행", code = "1"),

    /**
     * 내선순환: 2호선 시계 방향 운행
     * 시청 → 을지로입구 → 을지로3가 방향
     */
    INNER(displayName = "내선순환", code = "0"),

    /**
     * 외선순환: 2호선 반시계 방향 운행
     * 시청 → 충정로 → 아현 방향
     */
    OUTER(displayName = "외선순환", code = "1");

    companion object {
        /**
         * API 코드 값과 노선 유형을 기반으로 Direction을 반환
         *
         * @param code API 응답의 방향 코드 ("0" 또는 "1")
         * @param isCircularLine 순환 노선 여부 (2호선 본선의 경우 true)
         * @return 해당하는 Direction enum 값
         */
        fun fromCode(code: String, isCircularLine: Boolean = false): Direction {
            return if (isCircularLine) {
                when (code) {
                    "0" -> INNER
                    "1" -> OUTER
                    else -> INNER
                }
            } else {
                when (code) {
                    "0" -> UP
                    "1" -> DOWN
                    else -> UP
                }
            }
        }
    }
}
