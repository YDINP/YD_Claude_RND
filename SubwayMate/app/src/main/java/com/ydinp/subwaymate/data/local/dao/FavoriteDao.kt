package com.ydinp.subwaymate.data.local.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import com.ydinp.subwaymate.data.local.entity.FavoriteRouteEntity
import kotlinx.coroutines.flow.Flow

/**
 * 즐겨찾기 관련 데이터베이스 접근 객체 (DAO)
 *
 * 즐겨찾기 경로의 CRUD 및 사용 통계 관리 기능을 제공합니다.
 */
@Dao
interface FavoriteDao {

    // ========== 조회 (Read) ==========

    /**
     * 모든 즐겨찾기 경로 조회 (생성일 기준 내림차순)
     *
     * @return 즐겨찾기 경로 리스트를 방출하는 Flow
     */
    @Query("SELECT * FROM favorite_routes ORDER BY created_at DESC")
    fun getAllFavoriteRoutes(): Flow<List<FavoriteRouteEntity>>

    /**
     * 모든 즐겨찾기 경로 조회 (일회성)
     *
     * @return 즐겨찾기 경로 리스트
     */
    @Query("SELECT * FROM favorite_routes ORDER BY created_at DESC")
    suspend fun getAllFavoriteRoutesOnce(): List<FavoriteRouteEntity>

    /**
     * 자주 사용하는 즐겨찾기 경로 조회 (사용 횟수 기준 내림차순)
     *
     * @param limit 조회할 최대 개수
     * @return 즐겨찾기 경로 리스트를 방출하는 Flow
     */
    @Query("SELECT * FROM favorite_routes ORDER BY usage_count DESC LIMIT :limit")
    fun getFrequentlyUsedRoutes(limit: Int = 10): Flow<List<FavoriteRouteEntity>>

    /**
     * ID로 즐겨찾기 경로 조회
     *
     * @param id 즐겨찾기 ID
     * @return 즐겨찾기 경로 (없으면 null)
     */
    @Query("SELECT * FROM favorite_routes WHERE id = :id")
    suspend fun getFavoriteRouteById(id: Long): FavoriteRouteEntity?

    /**
     * ID로 즐겨찾기 경로 조회 (Flow)
     *
     * @param id 즐겨찾기 ID
     * @return 즐겨찾기 경로를 방출하는 Flow
     */
    @Query("SELECT * FROM favorite_routes WHERE id = :id")
    fun getFavoriteRouteByIdFlow(id: Long): Flow<FavoriteRouteEntity?>

    /**
     * 출발역과 도착역으로 즐겨찾기 경로 조회
     *
     * @param departureStationId 출발역 ID
     * @param arrivalStationId 도착역 ID
     * @return 즐겨찾기 경로 (없으면 null)
     */
    @Query("""
        SELECT * FROM favorite_routes
        WHERE departure_station_id = :departureStationId
        AND arrival_station_id = :arrivalStationId
    """)
    suspend fun getFavoriteRouteByStations(
        departureStationId: String,
        arrivalStationId: String
    ): FavoriteRouteEntity?

    /**
     * 특정 역을 출발역으로 하는 즐겨찾기 경로 조회
     *
     * @param stationId 출발역 ID
     * @return 즐겨찾기 경로 리스트를 방출하는 Flow
     */
    @Query("SELECT * FROM favorite_routes WHERE departure_station_id = :stationId ORDER BY usage_count DESC")
    fun getFavoriteRoutesByDepartureStation(stationId: String): Flow<List<FavoriteRouteEntity>>

    /**
     * 특정 역을 도착역으로 하는 즐겨찾기 경로 조회
     *
     * @param stationId 도착역 ID
     * @return 즐겨찾기 경로 리스트를 방출하는 Flow
     */
    @Query("SELECT * FROM favorite_routes WHERE arrival_station_id = :stationId ORDER BY usage_count DESC")
    fun getFavoriteRoutesByArrivalStation(stationId: String): Flow<List<FavoriteRouteEntity>>

    /**
     * 특정 역이 포함된 모든 즐겨찾기 경로 조회 (출발 또는 도착)
     *
     * @param stationId 역 ID
     * @return 즐겨찾기 경로 리스트를 방출하는 Flow
     */
    @Query("""
        SELECT * FROM favorite_routes
        WHERE departure_station_id = :stationId OR arrival_station_id = :stationId
        ORDER BY usage_count DESC
    """)
    fun getFavoriteRoutesContainingStation(stationId: String): Flow<List<FavoriteRouteEntity>>

    /**
     * 즐겨찾기 경로 존재 여부 확인
     *
     * @param departureStationId 출발역 ID
     * @param arrivalStationId 도착역 ID
     * @return 존재하면 true
     */
    @Query("""
        SELECT EXISTS(
            SELECT 1 FROM favorite_routes
            WHERE departure_station_id = :departureStationId
            AND arrival_station_id = :arrivalStationId
        )
    """)
    suspend fun isFavoriteRouteExists(
        departureStationId: String,
        arrivalStationId: String
    ): Boolean

    /**
     * 즐겨찾기 경로 개수 조회
     *
     * @return 저장된 즐겨찾기 경로 개수
     */
    @Query("SELECT COUNT(*) FROM favorite_routes")
    suspend fun getFavoriteRouteCount(): Int

    /**
     * 즐겨찾기 경로 개수를 Flow로 조회
     *
     * @return 즐겨찾기 경로 개수를 방출하는 Flow
     */
    @Query("SELECT COUNT(*) FROM favorite_routes")
    fun getFavoriteRouteCountFlow(): Flow<Int>

    // ========== 생성 (Create) ==========

    /**
     * 즐겨찾기 경로 삽입
     *
     * @param favoriteRoute 삽입할 즐겨찾기 경로
     * @return 삽입된 행의 ID
     */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertFavoriteRoute(favoriteRoute: FavoriteRouteEntity): Long

    /**
     * 즐겨찾기 경로 삽입 또는 기존 경로 반환 (트랜잭션)
     *
     * 동일한 경로가 이미 존재하면 기존 ID를 반환하고,
     * 없으면 새로 삽입 후 ID를 반환합니다.
     *
     * @param favoriteRoute 삽입할 즐겨찾기 경로
     * @return 즐겨찾기 경로 ID
     */
    @Transaction
    suspend fun insertOrGetExisting(favoriteRoute: FavoriteRouteEntity): Long {
        val existing = getFavoriteRouteByStations(
            favoriteRoute.departureStationId,
            favoriteRoute.arrivalStationId
        )
        return existing?.id ?: insertFavoriteRoute(favoriteRoute)
    }

    // ========== 수정 (Update) ==========

    /**
     * 즐겨찾기 경로 업데이트
     *
     * @param favoriteRoute 업데이트할 즐겨찾기 경로
     */
    @Update
    suspend fun updateFavoriteRoute(favoriteRoute: FavoriteRouteEntity)

    /**
     * 즐겨찾기 경로 별칭 업데이트
     *
     * @param id 즐겨찾기 ID
     * @param alias 새 별칭 (null이면 별칭 제거)
     */
    @Query("UPDATE favorite_routes SET alias = :alias WHERE id = :id")
    suspend fun updateAlias(id: Long, alias: String?)

    /**
     * 즐겨찾기 경로 사용 횟수 증가
     *
     * @param id 즐겨찾기 ID
     */
    @Query("UPDATE favorite_routes SET usage_count = usage_count + 1 WHERE id = :id")
    suspend fun incrementUsageCount(id: Long)

    /**
     * 출발역/도착역 조합으로 사용 횟수 증가 (트랜잭션)
     *
     * @param departureStationId 출발역 ID
     * @param arrivalStationId 도착역 ID
     * @return 업데이트된 행의 수 (0이면 해당 경로 없음)
     */
    @Query("""
        UPDATE favorite_routes
        SET usage_count = usage_count + 1
        WHERE departure_station_id = :departureStationId
        AND arrival_station_id = :arrivalStationId
    """)
    suspend fun incrementUsageCountByStations(
        departureStationId: String,
        arrivalStationId: String
    ): Int

    // ========== 삭제 (Delete) ==========

    /**
     * 즐겨찾기 경로 삭제
     *
     * @param favoriteRoute 삭제할 즐겨찾기 경로
     */
    @Delete
    suspend fun deleteFavoriteRoute(favoriteRoute: FavoriteRouteEntity)

    /**
     * ID로 즐겨찾기 경로 삭제
     *
     * @param id 삭제할 즐겨찾기 ID
     */
    @Query("DELETE FROM favorite_routes WHERE id = :id")
    suspend fun deleteFavoriteRouteById(id: Long)

    /**
     * 출발역/도착역 조합으로 즐겨찾기 경로 삭제
     *
     * @param departureStationId 출발역 ID
     * @param arrivalStationId 도착역 ID
     */
    @Query("""
        DELETE FROM favorite_routes
        WHERE departure_station_id = :departureStationId
        AND arrival_station_id = :arrivalStationId
    """)
    suspend fun deleteFavoriteRouteByStations(
        departureStationId: String,
        arrivalStationId: String
    )

    /**
     * 모든 즐겨찾기 경로 삭제
     */
    @Query("DELETE FROM favorite_routes")
    suspend fun deleteAllFavoriteRoutes()

    /**
     * 사용하지 않는 즐겨찾기 경로 삭제 (사용 횟수가 0인 경로)
     */
    @Query("DELETE FROM favorite_routes WHERE usage_count = 0")
    suspend fun deleteUnusedFavoriteRoutes()
}
