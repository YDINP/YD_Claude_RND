package com.ydinp.subwaymate.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import androidx.room.Upsert
import com.ydinp.subwaymate.data.local.entity.RecentStationEntity
import com.ydinp.subwaymate.data.local.entity.StationEntity
import kotlinx.coroutines.flow.Flow

/**
 * 역 정보 관련 데이터베이스 접근 객체 (DAO)
 *
 * 역 정보 조회, 검색, 캐싱 및 최근 이용역 관리 기능을 제공합니다.
 */
@Dao
interface StationDao {

    // ========== Station (역 정보) 관련 메서드 ==========

    /**
     * 모든 역 정보를 Flow로 조회
     *
     * @return 모든 역 정보 리스트를 방출하는 Flow
     */
    @Query("SELECT * FROM stations ORDER BY name ASC")
    fun getAllStations(): Flow<List<StationEntity>>

    /**
     * 모든 역 정보를 일회성으로 조회
     *
     * @return 모든 역 정보 리스트
     */
    @Query("SELECT * FROM stations ORDER BY name ASC")
    suspend fun getAllStationsOnce(): List<StationEntity>

    /**
     * ID로 역 정보 조회
     *
     * @param id 역 ID
     * @return 역 정보 (없으면 null)
     */
    @Query("SELECT * FROM stations WHERE id = :id")
    suspend fun getStationById(id: String): StationEntity?

    /**
     * ID로 역 정보를 Flow로 조회
     *
     * @param id 역 ID
     * @return 역 정보를 방출하는 Flow
     */
    @Query("SELECT * FROM stations WHERE id = :id")
    fun getStationByIdFlow(id: String): Flow<StationEntity?>

    /**
     * 역명으로 역 검색 (부분 일치)
     *
     * @param name 검색할 역명
     * @return 역명이 일치하는 역 리스트를 방출하는 Flow
     */
    @Query("SELECT * FROM stations WHERE name LIKE '%' || :name || '%' ORDER BY name ASC")
    fun searchStationsByName(name: String): Flow<List<StationEntity>>

    /**
     * 역명으로 역 검색 (일회성)
     *
     * @param name 검색할 역명
     * @return 역명이 일치하는 역 리스트
     */
    @Query("SELECT * FROM stations WHERE name LIKE '%' || :name || '%' ORDER BY name ASC")
    suspend fun searchStationsByNameOnce(name: String): List<StationEntity>

    /**
     * 특정 노선의 모든 역 조회
     *
     * @param lineId 노선 ID
     * @return 해당 노선의 역 리스트를 방출하는 Flow
     */
    @Query("SELECT * FROM stations WHERE line_id = :lineId ORDER BY name ASC")
    fun getStationsByLine(lineId: String): Flow<List<StationEntity>>

    /**
     * 특정 노선의 모든 역 조회 (일회성)
     *
     * @param lineId 노선 ID
     * @return 해당 노선의 역 리스트
     */
    @Query("SELECT * FROM stations WHERE line_id = :lineId ORDER BY name ASC")
    suspend fun getStationsByLineOnce(lineId: String): List<StationEntity>

    /**
     * 환승역 목록 조회 (환승 가능 노선이 있는 역)
     *
     * @return 환승역 리스트를 방출하는 Flow
     */
    @Query("SELECT * FROM stations WHERE transfer_lines != '' ORDER BY name ASC")
    fun getTransferStations(): Flow<List<StationEntity>>

    /**
     * 역 정보 삽입 (충돌 시 교체)
     *
     * @param station 삽입할 역 정보
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertStation(station: StationEntity)

    /**
     * 여러 역 정보 삽입 (충돌 시 교체)
     *
     * @param stations 삽입할 역 정보 리스트
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertStations(stations: List<StationEntity>)

    /**
     * 역 정보 업데이트 또는 삽입 (Upsert)
     *
     * @param station 업데이트/삽입할 역 정보
     */
    @Upsert
    suspend fun upsertStation(station: StationEntity)

    /**
     * 여러 역 정보 업데이트 또는 삽입 (Upsert)
     *
     * @param stations 업데이트/삽입할 역 정보 리스트
     */
    @Upsert
    suspend fun upsertStations(stations: List<StationEntity>)

    /**
     * 역 정보 삭제
     *
     * @param id 삭제할 역 ID
     */
    @Query("DELETE FROM stations WHERE id = :id")
    suspend fun deleteStation(id: String)

    /**
     * 모든 역 정보 삭제
     */
    @Query("DELETE FROM stations")
    suspend fun deleteAllStations()

    /**
     * 저장된 역 개수 조회
     *
     * @return 저장된 역 개수
     */
    @Query("SELECT COUNT(*) FROM stations")
    suspend fun getStationCount(): Int

    // ========== RecentStation (최근 이용역) 관련 메서드 ==========

    /**
     * 최근 이용역 목록 조회 (접근 시간 기준 내림차순)
     *
     * @param limit 조회할 최대 개수 (기본값: 20)
     * @return 최근 이용역 리스트를 방출하는 Flow
     */
    @Query("SELECT * FROM recent_stations ORDER BY accessed_at DESC LIMIT :limit")
    fun getRecentStations(limit: Int = 20): Flow<List<RecentStationEntity>>

    /**
     * 최근 이용역 목록 조회 (일회성)
     *
     * @param limit 조회할 최대 개수
     * @return 최근 이용역 리스트
     */
    @Query("SELECT * FROM recent_stations ORDER BY accessed_at DESC LIMIT :limit")
    suspend fun getRecentStationsOnce(limit: Int = 20): List<RecentStationEntity>

    /**
     * 자주 이용하는 역 목록 조회 (접근 횟수 기준 내림차순)
     *
     * @param limit 조회할 최대 개수
     * @return 자주 이용하는 역 리스트를 방출하는 Flow
     */
    @Query("SELECT * FROM recent_stations ORDER BY access_count DESC LIMIT :limit")
    fun getFrequentStations(limit: Int = 10): Flow<List<RecentStationEntity>>

    /**
     * 최근 이용역 존재 여부 확인
     *
     * @param stationId 역 ID
     * @return 존재하면 해당 Entity, 없으면 null
     */
    @Query("SELECT * FROM recent_stations WHERE station_id = :stationId")
    suspend fun getRecentStation(stationId: String): RecentStationEntity?

    /**
     * 최근 이용역 삽입 (충돌 시 교체)
     *
     * @param recentStation 삽입할 최근 이용역 정보
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertRecentStation(recentStation: RecentStationEntity)

    /**
     * 최근 이용역 업데이트
     *
     * @param recentStation 업데이트할 최근 이용역 정보
     */
    @Update
    suspend fun updateRecentStation(recentStation: RecentStationEntity)

    /**
     * 최근 이용역 추가 또는 업데이트 (트랜잭션)
     *
     * 이미 존재하는 역이면 접근 시간과 횟수를 업데이트하고,
     * 새로운 역이면 삽입합니다. 최대 개수 초과 시 가장 오래된 항목을 삭제합니다.
     *
     * @param recentStation 추가/업데이트할 최근 이용역 정보
     */
    @Transaction
    suspend fun upsertRecentStation(recentStation: RecentStationEntity) {
        val existing = getRecentStation(recentStation.stationId)
        if (existing != null) {
            updateRecentStation(
                existing.copy(
                    accessedAt = System.currentTimeMillis(),
                    accessCount = existing.accessCount + 1
                )
            )
        } else {
            insertRecentStation(recentStation)
            // 최대 개수 초과 시 오래된 항목 삭제
            deleteOldRecentStations(RecentStationEntity.MAX_RECENT_STATIONS)
        }
    }

    /**
     * 최근 이용역 삭제
     *
     * @param stationId 삭제할 역 ID
     */
    @Query("DELETE FROM recent_stations WHERE station_id = :stationId")
    suspend fun deleteRecentStation(stationId: String)

    /**
     * 모든 최근 이용역 삭제
     */
    @Query("DELETE FROM recent_stations")
    suspend fun deleteAllRecentStations()

    /**
     * 오래된 최근 이용역 삭제 (최대 개수 유지)
     *
     * @param keepCount 유지할 최대 개수
     */
    @Query("""
        DELETE FROM recent_stations
        WHERE station_id NOT IN (
            SELECT station_id FROM recent_stations
            ORDER BY accessed_at DESC
            LIMIT :keepCount
        )
    """)
    suspend fun deleteOldRecentStations(keepCount: Int)

    /**
     * 최근 이용역 개수 조회
     *
     * @return 저장된 최근 이용역 개수
     */
    @Query("SELECT COUNT(*) FROM recent_stations")
    suspend fun getRecentStationCount(): Int
}
