package com.ydinp.subwaymate.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.ydinp.subwaymate.domain.model.Station

/**
 * 최근 이용역 정보를 저장하는 Room Entity
 *
 * 사용자가 최근에 검색하거나 이용한 역 정보를 저장합니다.
 * 역 ID에 유니크 제약을 설정하여 동일한 역이 중복 저장되지 않도록 합니다.
 * 접근 시간순으로 정렬하여 최근 이용역을 빠르게 조회할 수 있습니다.
 *
 * @property stationId 역 고유 식별자 (Primary Key)
 * @property stationName 역명
 * @property lineId 노선 ID
 * @property latitude 위도
 * @property longitude 경도
 * @property transferLines 환승 가능 노선 (쉼표 구분 문자열)
 * @property accessedAt 최근 접근 시간 (Unix timestamp milliseconds)
 * @property accessCount 접근 횟수
 */
@Entity(
    tableName = "recent_stations",
    indices = [
        Index(value = ["accessed_at"]),
        Index(value = ["access_count"]),
        Index(value = ["station_name"])
    ]
)
data class RecentStationEntity(
    @PrimaryKey
    @ColumnInfo(name = "station_id")
    val stationId: String,

    @ColumnInfo(name = "station_name")
    val stationName: String,

    @ColumnInfo(name = "line_id")
    val lineId: String,

    @ColumnInfo(name = "latitude")
    val latitude: Double,

    @ColumnInfo(name = "longitude")
    val longitude: Double,

    @ColumnInfo(name = "transfer_lines")
    val transferLines: String = "",

    @ColumnInfo(name = "accessed_at")
    val accessedAt: Long = System.currentTimeMillis(),

    @ColumnInfo(name = "access_count")
    val accessCount: Int = 1
) {
    /**
     * Entity를 Domain Model Station으로 변환
     *
     * @return 도메인 모델 Station 객체
     */
    fun toStation(): Station {
        return Station(
            id = stationId,
            name = stationName,
            lineId = lineId,
            latitude = latitude,
            longitude = longitude,
            transferLines = if (transferLines.isBlank()) {
                emptyList()
            } else {
                transferLines.split(",").map { it.trim() }
            }
        )
    }

    companion object {
        /** 최대 저장 개수 (초과 시 오래된 항목 삭제) */
        const val MAX_RECENT_STATIONS = 20

        /**
         * Domain Model Station을 Entity로 변환
         *
         * @param station 도메인 모델 Station 객체
         * @return RecentStationEntity 객체
         */
        fun fromStation(station: Station): RecentStationEntity {
            return RecentStationEntity(
                stationId = station.id,
                stationName = station.name,
                lineId = station.lineId,
                latitude = station.latitude,
                longitude = station.longitude,
                transferLines = station.transferLines.joinToString(",")
            )
        }
    }
}

/**
 * 최근 이용역 도메인 모델
 *
 * 프레젠테이션 레이어에서 사용하는 최근 이용역 정보
 * Station 정보에 접근 시간과 횟수 정보가 추가됨
 */
data class RecentStation(
    val station: Station,
    val accessedAt: Long,
    val accessCount: Int
)

/**
 * Entity를 RecentStation 도메인 모델로 변환하는 확장 함수
 */
fun RecentStationEntity.toDomain(): RecentStation {
    return RecentStation(
        station = toStation(),
        accessedAt = accessedAt,
        accessCount = accessCount
    )
}

/**
 * RecentStation 도메인 모델을 Entity로 변환하는 확장 함수
 */
fun RecentStation.toEntity(): RecentStationEntity {
    return RecentStationEntity(
        stationId = station.id,
        stationName = station.name,
        lineId = station.lineId,
        latitude = station.latitude,
        longitude = station.longitude,
        transferLines = station.transferLines.joinToString(","),
        accessedAt = accessedAt,
        accessCount = accessCount
    )
}
