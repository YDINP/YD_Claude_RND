package com.ydinp.subwaymate.di

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import com.ydinp.subwaymate.BuildConfig
import com.ydinp.subwaymate.data.remote.api.SeoulOpenApi
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Qualifier
import javax.inject.Singleton

/**
 * 서울 열린데이터광장 API용 Qualifier
 */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class SeoulOpenApiRetrofit

/**
 * 네트워크 의존성 주입 모듈
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    private const val SEOUL_OPEN_API_BASE_URL = "http://swopenapi.seoul.go.kr/api/subway/"
    private const val CONNECT_TIMEOUT = 30L
    private const val READ_TIMEOUT = 30L
    private const val WRITE_TIMEOUT = 30L

    /**
     * HttpLoggingInterceptor 제공
     * Debug 빌드에서만 BODY 레벨 로깅, Release에서는 NONE
     */
    @Provides
    @Singleton
    fun provideLoggingInterceptor(): HttpLoggingInterceptor {
        return HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }
    }

    /**
     * OkHttpClient 제공
     */
    @Provides
    @Singleton
    fun provideOkHttpClient(
        loggingInterceptor: HttpLoggingInterceptor
    ): OkHttpClient {
        return OkHttpClient.Builder()
            .connectTimeout(CONNECT_TIMEOUT, TimeUnit.SECONDS)
            .readTimeout(READ_TIMEOUT, TimeUnit.SECONDS)
            .writeTimeout(WRITE_TIMEOUT, TimeUnit.SECONDS)
            .addInterceptor(loggingInterceptor)
            .build()
    }

    /**
     * Moshi 인스턴스 제공
     */
    @Provides
    @Singleton
    fun provideMoshi(): Moshi {
        return Moshi.Builder()
            .addLast(KotlinJsonAdapterFactory())
            .build()
    }

    /**
     * 서울 열린데이터광장 API용 Retrofit 인스턴스 제공
     */
    @Provides
    @Singleton
    @SeoulOpenApiRetrofit
    fun provideSeoulOpenApiRetrofit(
        okHttpClient: OkHttpClient,
        moshi: Moshi
    ): Retrofit {
        return Retrofit.Builder()
            .baseUrl(SEOUL_OPEN_API_BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
    }

    /**
     * SeoulOpenApi 인터페이스 제공
     */
    @Provides
    @Singleton
    fun provideSeoulOpenApi(
        @SeoulOpenApiRetrofit retrofit: Retrofit
    ): SeoulOpenApi {
        return retrofit.create(SeoulOpenApi::class.java)
    }
}
