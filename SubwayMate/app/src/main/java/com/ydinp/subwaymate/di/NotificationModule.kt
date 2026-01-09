package com.ydinp.subwaymate.di

import android.app.NotificationManager
import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * 알림 관련 의존성 주입 모듈
 *
 * NotificationHelper, AlertNotificationBuilder, SoundVibrateManager는
 * @Singleton @Inject constructor를 사용하므로 자동 주입됩니다.
 * 이 모듈은 시스템 서비스 등 추가 의존성을 제공합니다.
 */
@Module
@InstallIn(SingletonComponent::class)
object NotificationModule {

    @Provides
    @Singleton
    fun provideNotificationManager(
        @ApplicationContext context: Context
    ): NotificationManager {
        return context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    }
}
