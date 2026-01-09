package com.ydinp.subwaymate.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * 즐겨찾기 경로를 저장하는 Room Entity
 *
 * 사용자가 자주 이용하는 출발역-도착역 경로를 저장합니다.
 * 출발역과 도착역의 조합에 대해 유니크 인덱스를 설정하여 중복 등록을 방지합니다.
 *
 * @property id 자동 생성되는 고유 ID
 * @property departureStationId 출발역 ID
 * @property departureStationName 출발역명
 * @property departureLineId 출발역 노선 ID
 * @property arrivalStationId 도착역 ID
 * @property arrivalStationName 도착역명
 * @property arrivalLineId 도착역 노선 ID
 * @property alias 사용자 지정 별칭 (예: "출근길", "퇴근길")
 * @property createdAt 등록 시간 (Unix timestamp milliseconds)
 * @property usageCount 사용 횟수 (정렬용)
 */
@Entity(
    tableName = "favorite_routes",
    indices = [
        Index(
            value = ["departure_station_id", "arrival_station_id"],
            unique = true,
            name = "idx_favorite_route_unique"
        ),
        Index(value = ["usage_count"]),
        Index(value = ["created_at"])
    ]
)
data class FavoriteRouteEntity(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "id")
    val id: Long = 0,

    @ColumnInfo(name = "departure_station_id")
    val departureStationId: String,

    @ColumnInfo(name = "departure_station_name")
    val departureStationName: String,

    @ColumnInfo(name = "departure_line_id")
    val departureLineId: String,

    @ColumnInfo(name = "arrival_station_id")
    val arrivalStationId: String,

    @ColumnInfo(name = "arrival_station_name")
    val arrivalStationName: String,

    @ColumnInfo(name = "arrival_line_id")
    val arrivalLineId: String,

    @ColumnInfo(name = "alias")
    val alias: String? = null,

    @ColumnInfo(name = "created_at")
    val createdAt: Long = System.currentTimeMillis(),

    @ColumnInfo(name = "usage_count")
    val usageCount: Int = 0
) {
    /**
     * 즐겨찾기 경로의 표시명을 반환
     *
     * @return 별칭이 있으면 별칭, 없으면 "출발역 -> 도착역" 형식
     */
    fun getDisplayName(): String {
        return alias ?: "$departureStationName -> $arrivalStationName"
    }

    companion object {
        /**
         * 출발역과 도착역 정보로 FavoriteRouteEntity 생성
         *
         * @param departureStation 출발역 Station 도메인 모델
         * @param arrivalStation 도착역 Station 도메인 모델
         * @param alias 사용자 지정 별칭 (선택)
         * @return FavoriteRouteEntity 객체
         */
        fun create(
            departureStation: com.ydinp.subwaymate.domain.model.Station,
            arrivalStation: com.ydinp.subwaymate.domain.model.Station,
            alias: String? = null
        ): FavoriteRouteEntity {
            return FavoriteRouteEntity(
                departureStationId = departureStation.id,
                departureStationName = departureStation.name,
                departureLineId = departureStation.lineId,
                arrivalStationId = arrivalStation.id,
                arrivalStationName = arrivalStation.name,
                arrivalLineId = arrivalStation.lineId,
                alias = alias
            )
        }
    }
}

/**
 * 즐겨찾기 경로 도메인 모델
 *
 * 프레젠테이션 레이어에서 사용하는 즐겨찾기 경로 정보
 */
data class FavoriteRoute(
    val id: Long,
    val departureStationId: String,
    val departureStationName: String,
    val departureLineId: String,
    val arrivalStationId: String,
    val arrivalStationName: String,
    val arrivalLineId: String,
    val alias: String?,
    val createdAt: Long,
    val usageCount: Int
) {
    /**
     * 표시명을 반환
     */
    fun getDisplayName(): String {
        return alias ?: "$departureStationName -> $arrivalStationName"
    }
}

/**
 * Entity를 Domain Model로 변환하는 확장 함수
 */
fun FavoriteRouteEntity.toDomain(): FavoriteRoute {
    return FavoriteRoute(
        id = id,
        departureStationId = departureStationId,
        departureStationName = departureStationName,
        departureLineId = departureLineId,
        arrivalStationId = arrivalStationId,
        arrivalStationName = arrivalStationName,
        arrivalLineId = arrivalLineId,
        alias = alias,
        createdAt = createdAt,
        usageCount = usageCount
    )
}

/**
 * Domain Model을 Entity로 변환하는 확장 함수
 */
fun FavoriteRoute.toEntity(): FavoriteRouteEntity {
    return FavoriteRouteEntity(
        id = id,
        departureStationId = departureStationId,
        departureStationName = departureStationName,
        departureLineId = departureLineId,
        arrivalStationId = arrivalStationId,
        arrivalStationName = arrivalStationName,
        arrivalLineId = arrivalLineId,
        alias = alias,
        createdAt = createdAt,
        usageCount = usageCount
    )
}
