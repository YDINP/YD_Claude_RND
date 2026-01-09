package com.ydinp.subwaymate.domain.model

/**
 * 지하철 역 정보를 나타내는 data class
 *
 * 수도권 지하철 각 역의 위치 정보와 환승 가능 노선 정보를 포함합니다.
 * 동일한 역명이라도 노선별로 다른 Station 인스턴스를 가집니다.
 *
 * @property id 역 고유 식별자 (노선-역 조합의 고유 코드)
 * @property name 역명 (예: "서울역", "강남")
 * @property lineId 해당 역이 속한 노선의 ID
 * @property latitude 역의 위도 좌표
 * @property longitude 역의 경도 좌표
 * @property transferLines 환승 가능한 다른 노선 ID 목록
 */
data class Station(
    val id: String,
    val name: String,
    val lineId: String,
    val latitude: Double,
    val longitude: Double,
    val transferLines: List<String> = emptyList()
) {
    /**
     * 환승역인지 확인
     *
     * @return 다른 노선으로 환승 가능하면 true
     */
    fun isTransferStation(): Boolean = transferLines.isNotEmpty()

    /**
     * 특정 노선으로 환승 가능한지 확인
     *
     * @param lineId 확인할 노선 ID
     * @return 해당 노선으로 환승 가능하면 true
     */
    fun canTransferTo(lineId: String): Boolean = transferLines.contains(lineId)

    /**
     * 다른 역과의 거리를 계산 (Haversine 공식 사용)
     *
     * @param other 거리를 계산할 다른 역
     * @return 두 역 사이의 거리 (미터 단위)
     */
    fun distanceTo(other: Station): Double {
        return calculateHaversineDistance(
            lat1 = this.latitude,
            lon1 = this.longitude,
            lat2 = other.latitude,
            lon2 = other.longitude
        )
    }

    /**
     * 좌표와의 거리를 계산
     *
     * @param latitude 대상 위도
     * @param longitude 대상 경도
     * @return 거리 (미터 단위)
     */
    fun distanceTo(latitude: Double, longitude: Double): Double {
        return calculateHaversineDistance(
            lat1 = this.latitude,
            lon1 = this.longitude,
            lat2 = latitude,
            lon2 = longitude
        )
    }

    companion object {
        private const val EARTH_RADIUS_METERS = 6_371_000.0

        /**
         * Haversine 공식을 사용하여 두 좌표 간의 거리를 계산
         *
         * @param lat1 첫 번째 지점의 위도
         * @param lon1 첫 번째 지점의 경도
         * @param lat2 두 번째 지점의 위도
         * @param lon2 두 번째 지점의 경도
         * @return 두 지점 사이의 거리 (미터 단위)
         */
        private fun calculateHaversineDistance(
            lat1: Double,
            lon1: Double,
            lat2: Double,
            lon2: Double
        ): Double {
            val dLat = Math.toRadians(lat2 - lat1)
            val dLon = Math.toRadians(lon2 - lon1)

            val a = kotlin.math.sin(dLat / 2) * kotlin.math.sin(dLat / 2) +
                    kotlin.math.cos(Math.toRadians(lat1)) *
                    kotlin.math.cos(Math.toRadians(lat2)) *
                    kotlin.math.sin(dLon / 2) * kotlin.math.sin(dLon / 2)

            val c = 2 * kotlin.math.atan2(kotlin.math.sqrt(a), kotlin.math.sqrt(1 - a))

            return EARTH_RADIUS_METERS * c
        }
    }
}
