package com.ydinp.subwaymate.di

import android.content.Context
import androidx.room.Room
import com.ydinp.subwaymate.data.local.dao.FavoriteDao
import com.ydinp.subwaymate.data.local.dao.StationDao
import com.ydinp.subwaymate.data.local.database.AppDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Room Database 의존성 주입 모듈
 *
 * AppDatabase 및 관련 DAO들을 Hilt를 통해 제공합니다.
 * 모든 Database 관련 의존성은 SingletonComponent에 설치되어
 * 앱 전체에서 단일 인스턴스로 사용됩니다.
 */
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    /**
     * AppDatabase 싱글톤 인스턴스 제공
     *
     * Room 데이터베이스를 생성하고 애플리케이션 수명 주기 동안 유지합니다.
     * WAL 모드를 활성화하여 성능을 최적화합니다.
     *
     * @param context 애플리케이션 컨텍스트
     * @return AppDatabase 싱글톤 인스턴스
     */
    @Provides
    @Singleton
    fun provideAppDatabase(
        @ApplicationContext context: Context
    ): AppDatabase {
        return Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            AppDatabase.DATABASE_NAME
        )
            .fallbackToDestructiveMigration() // 스키마 변경 시 데이터 삭제 후 재생성
            .enableMultiInstanceInvalidation() // 멀티 프로세스 지원
            .build()
    }

    /**
     * StationDao 인스턴스 제공
     *
     * 역 정보 및 최근 이용역 데이터 접근을 위한 DAO를 제공합니다.
     *
     * @param database AppDatabase 인스턴스
     * @return StationDao 인스턴스
     */
    @Provides
    @Singleton
    fun provideStationDao(database: AppDatabase): StationDao {
        return database.stationDao()
    }

    /**
     * FavoriteDao 인스턴스 제공
     *
     * 즐겨찾기 경로 데이터 접근을 위한 DAO를 제공합니다.
     *
     * @param database AppDatabase 인스턴스
     * @return FavoriteDao 인스턴스
     */
    @Provides
    @Singleton
    fun provideFavoriteDao(database: AppDatabase): FavoriteDao {
        return database.favoriteDao()
    }
}
