package com.ydinp.subwaymate.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.ydinp.subwaymate.domain.model.Station

/**
 * 지하철 역 정보를 저장하는 Room Entity
 *
 * 수도권 지하철 각 역의 정보를 로컬 데이터베이스에 캐싱합니다.
 * 역명과 노선 ID로 인덱스를 설정하여 검색 성능을 최적화합니다.
 *
 * @property id 역 고유 식별자 (노선-역 조합의 고유 코드)
 * @property name 역명 (예: "서울역", "강남")
 * @property lineId 해당 역이 속한 노선의 ID
 * @property latitude 역의 위도 좌표
 * @property longitude 역의 경도 좌표
 * @property transferLines 환승 가능한 다른 노선 ID 목록 (쉼표로 구분된 문자열)
 */
@Entity(
    tableName = "stations",
    indices = [
        Index(value = ["name"]),
        Index(value = ["line_id"]),
        Index(value = ["name", "line_id"])
    ]
)
data class StationEntity(
    @PrimaryKey
    @ColumnInfo(name = "id")
    val id: String,

    @ColumnInfo(name = "name")
    val name: String,

    @ColumnInfo(name = "line_id")
    val lineId: String,

    @ColumnInfo(name = "latitude")
    val latitude: Double,

    @ColumnInfo(name = "longitude")
    val longitude: Double,

    @ColumnInfo(name = "transfer_lines")
    val transferLines: String = ""
) {
    /**
     * Entity를 Domain Model로 변환
     *
     * @return 도메인 모델 Station 객체
     */
    fun toDomain(): Station {
        return Station(
            id = id,
            name = name,
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
        /**
         * Domain Model을 Entity로 변환
         *
         * @param station 도메인 모델 Station 객체
         * @return StationEntity 객체
         */
        fun fromDomain(station: Station): StationEntity {
            return StationEntity(
                id = station.id,
                name = station.name,
                lineId = station.lineId,
                latitude = station.latitude,
                longitude = station.longitude,
                transferLines = station.transferLines.joinToString(",")
            )
        }
    }
}
