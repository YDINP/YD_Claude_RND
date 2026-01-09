package com.ydinp.subwaymate.di

import android.content.Context
import androidx.work.WorkManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * WorkManager 관련 의존성 주입 모듈
 *
 * WorkManager 인스턴스 및 관련 의존성을 제공합니다.
 * Hilt Worker 지원을 위해 WorkManager Configuration은 Application에서 설정됩니다.
 */
@Module
@InstallIn(SingletonComponent::class)
object WorkerModule {

    /**
     * WorkManager 인스턴스 제공
     *
     * Application에서 초기화된 WorkManager 인스턴스를 반환합니다.
     *
     * @param context Application Context
     * @return WorkManager 인스턴스
     */
    @Provides
    @Singleton
    fun provideWorkManager(
        @ApplicationContext context: Context
    ): WorkManager {
        return WorkManager.getInstance(context)
    }
}
