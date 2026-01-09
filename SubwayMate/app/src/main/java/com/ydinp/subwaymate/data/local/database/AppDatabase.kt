package com.ydinp.subwaymate.data.local.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase
import com.ydinp.subwaymate.data.local.dao.FavoriteDao
import com.ydinp.subwaymate.data.local.dao.StationDao
import com.ydinp.subwaymate.data.local.entity.FavoriteRouteEntity
import com.ydinp.subwaymate.data.local.entity.RecentStationEntity
import com.ydinp.subwaymate.data.local.entity.StationEntity

/**
 * SubwayMate 앱의 Room Database
 *
 * 지하철 역 정보, 즐겨찾기 경로, 최근 이용역 정보를 저장하는 로컬 데이터베이스입니다.
 *
 * @see StationEntity 역 정보 엔티티
 * @see FavoriteRouteEntity 즐겨찾기 경로 엔티티
 * @see RecentStationEntity 최근 이용역 엔티티
 */
@Database(
    entities = [
        StationEntity::class,
        FavoriteRouteEntity::class,
        RecentStationEntity::class
    ],
    version = AppDatabase.DATABASE_VERSION,
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {

    /**
     * 역 정보 DAO
     */
    abstract fun stationDao(): StationDao

    /**
     * 즐겨찾기 DAO
     */
    abstract fun favoriteDao(): FavoriteDao

    companion object {
        /** 데이터베이스 이름 */
        const val DATABASE_NAME = "subwaymate.db"

        /** 데이터베이스 버전 */
        const val DATABASE_VERSION = 1

        @Volatile
        private var INSTANCE: AppDatabase? = null

        /**
         * 싱글톤 인스턴스를 반환합니다.
         *
         * Hilt를 사용하는 경우 DatabaseModule에서 직접 생성하므로
         * 이 메서드는 테스트나 특수한 상황에서만 사용합니다.
         *
         * @param context 애플리케이션 컨텍스트
         * @return AppDatabase 인스턴스
         */
        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: buildDatabase(context).also { INSTANCE = it }
            }
        }

        /**
         * 데이터베이스 인스턴스를 생성합니다.
         *
         * @param context 애플리케이션 컨텍스트
         * @return 새로 생성된 AppDatabase 인스턴스
         */
        private fun buildDatabase(context: Context): AppDatabase {
            return Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                DATABASE_NAME
            )
                .addCallback(DatabaseCallback())
                .fallbackToDestructiveMigration()
                .build()
        }

        /**
         * 테스트용 인메모리 데이터베이스를 생성합니다.
         *
         * @param context 컨텍스트
         * @return 인메모리 AppDatabase 인스턴스
         */
        fun createInMemoryDatabase(context: Context): AppDatabase {
            return Room.inMemoryDatabaseBuilder(
                context.applicationContext,
                AppDatabase::class.java
            )
                .allowMainThreadQueries() // 테스트에서만 사용
                .build()
        }
    }

    /**
     * 데이터베이스 생성/열기 시 호출되는 콜백
     */
    private class DatabaseCallback : RoomDatabase.Callback() {
        override fun onCreate(db: SupportSQLiteDatabase) {
            super.onCreate(db)
            // 데이터베이스가 처음 생성될 때 실행할 작업
            // 예: 초기 데이터 삽입, 인덱스 최적화 등
        }

        override fun onOpen(db: SupportSQLiteDatabase) {
            super.onOpen(db)
            // 데이터베이스가 열릴 때마다 실행할 작업
            // WAL 모드 활성화 (성능 향상)
            db.execSQL("PRAGMA journal_mode=WAL")
        }
    }
}
