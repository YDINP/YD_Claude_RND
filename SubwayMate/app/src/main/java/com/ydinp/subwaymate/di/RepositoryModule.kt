package com.ydinp.subwaymate.di

import com.ydinp.subwaymate.data.repository.FavoriteRepositoryImpl
import com.ydinp.subwaymate.data.repository.RideSessionRepositoryImpl
import com.ydinp.subwaymate.data.repository.StationRepositoryImpl
import com.ydinp.subwaymate.data.repository.TrainLocationRepositoryImpl
import com.ydinp.subwaymate.data.repository.TrainRepositoryImpl
import com.ydinp.subwaymate.domain.repository.FavoriteRepository
import com.ydinp.subwaymate.domain.repository.RideSessionRepository
import com.ydinp.subwaymate.domain.repository.StationRepository
import com.ydinp.subwaymate.domain.repository.TrainLocationRepository
import com.ydinp.subwaymate.domain.repository.TrainRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import javax.inject.Qualifier
import javax.inject.Singleton

/**
 * IO Dispatcher Qualifier
 */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class IoDispatcher

/**
 * Default Dispatcher Qualifier
 */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class DefaultDispatcher

/**
 * Main Dispatcher Qualifier
 */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class MainDispatcher

/**
 * Coroutine Dispatcher 제공 모듈
 */
@Module
@InstallIn(SingletonComponent::class)
object DispatcherModule {

    @Provides
    @IoDispatcher
    fun provideIoDispatcher(): CoroutineDispatcher = Dispatchers.IO

    @Provides
    @DefaultDispatcher
    fun provideDefaultDispatcher(): CoroutineDispatcher = Dispatchers.Default

    @Provides
    @MainDispatcher
    fun provideMainDispatcher(): CoroutineDispatcher = Dispatchers.Main
}

/**
 * Repository 의존성 주입 모듈
 *
 * Repository 인터페이스와 구현체를 바인딩합니다.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    /**
     * StationRepository 바인딩
     *
     * @param impl StationRepositoryImpl 구현체
     * @return StationRepository 인터페이스
     */
    @Binds
    @Singleton
    abstract fun bindStationRepository(
        impl: StationRepositoryImpl
    ): StationRepository

    /**
     * TrainLocationRepository 바인딩
     *
     * @param impl TrainLocationRepositoryImpl 구현체
     * @return TrainLocationRepository 인터페이스
     */
    @Binds
    @Singleton
    abstract fun bindTrainLocationRepository(
        impl: TrainLocationRepositoryImpl
    ): TrainLocationRepository

    /**
     * FavoriteRepository 바인딩
     *
     * @param impl FavoriteRepositoryImpl 구현체
     * @return FavoriteRepository 인터페이스
     */
    @Binds
    @Singleton
    abstract fun bindFavoriteRepository(
        impl: FavoriteRepositoryImpl
    ): FavoriteRepository

    /**
     * RideSessionRepository 바인딩
     *
     * @param impl RideSessionRepositoryImpl 구현체
     * @return RideSessionRepository 인터페이스
     */
    @Binds
    @Singleton
    abstract fun bindRideSessionRepository(
        impl: RideSessionRepositoryImpl
    ): RideSessionRepository

    /**
     * TrainRepository 바인딩
     *
     * @param impl TrainRepositoryImpl 구현체
     * @return TrainRepository 인터페이스
     */
    @Binds
    @Singleton
    abstract fun bindTrainRepository(
        impl: TrainRepositoryImpl
    ): TrainRepository
}
