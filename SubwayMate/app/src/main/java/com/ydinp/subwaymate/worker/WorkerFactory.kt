package com.ydinp.subwaymate.worker

import android.content.Context
import android.util.Log
import androidx.work.ListenableWorker
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import javax.inject.Inject
import javax.inject.Provider
import javax.inject.Singleton

/**
 * Hilt Worker Factory를 위한 Assisted Factory 인터페이스
 *
 * HiltWorker 어노테이션이 붙은 Worker들은 이 인터페이스를 구현하는
 * Factory를 통해 생성됩니다.
 */
interface AssistedWorkerFactory<T : ListenableWorker> {
    /**
     * Worker 인스턴스 생성
     *
     * @param appContext Application Context
     * @param workerParams Worker 파라미터
     * @return 생성된 Worker 인스턴스
     */
    fun create(appContext: Context, workerParams: WorkerParameters): T
}

/**
 * Hilt 의존성 주입을 지원하는 Custom WorkerFactory
 *
 * WorkManager가 Worker를 생성할 때 Hilt를 통해 의존성을 주입받을 수 있도록 합니다.
 * HiltWorker 어노테이션이 붙은 Worker들은 이 Factory를 통해 생성됩니다.
 *
 * 사용법:
 * 1. Application 클래스에서 WorkManager 초기화 시 이 Factory를 설정
 * 2. Worker 클래스에 @HiltWorker 어노테이션 추가
 * 3. Worker 생성자에 @AssistedInject 사용
 */
@Singleton
class SubwayWorkerFactory @Inject constructor(
    private val workerFactories: Map<Class<out ListenableWorker>, @JvmSuppressWildcards Provider<AssistedWorkerFactory<out ListenableWorker>>>
) : WorkerFactory() {

    /**
     * Worker 인스턴스 생성
     *
     * 등록된 Factory가 있으면 해당 Factory를 사용하고,
     * 없으면 null을 반환하여 기본 Factory가 처리하도록 합니다.
     *
     * @param appContext Application Context
     * @param workerClassName Worker 클래스 이름
     * @param workerParameters Worker 파라미터
     * @return 생성된 Worker 또는 null
     */
    override fun createWorker(
        appContext: Context,
        workerClassName: String,
        workerParameters: WorkerParameters
    ): ListenableWorker? {
        Log.d(TAG, "Creating worker: $workerClassName")

        // 클래스 이름으로 Worker 클래스 찾기
        val workerClass = try {
            Class.forName(workerClassName).asSubclass(ListenableWorker::class.java)
        } catch (e: ClassNotFoundException) {
            Log.e(TAG, "Worker class not found: $workerClassName", e)
            return null
        } catch (e: ClassCastException) {
            Log.e(TAG, "Class is not a ListenableWorker: $workerClassName", e)
            return null
        }

        // 등록된 Factory에서 해당 Worker 클래스의 Factory 찾기
        val factoryProvider = workerFactories[workerClass]

        return if (factoryProvider != null) {
            try {
                val factory = factoryProvider.get()
                val worker = factory.create(appContext, workerParameters)
                Log.d(TAG, "Worker created successfully: $workerClassName")
                worker
            } catch (e: Exception) {
                Log.e(TAG, "Failed to create worker: $workerClassName", e)
                null
            }
        } else {
            // 등록된 Factory가 없으면 null 반환
            // WorkManager가 기본 방식으로 Worker를 생성하려고 시도함
            Log.d(TAG, "No factory found for: $workerClassName, delegating to default")
            null
        }
    }

    companion object {
        private const val TAG = "SubwayWorkerFactory"
    }
}

/**
 * LocationPollingWorker를 위한 Assisted Factory
 *
 * Hilt가 자동 생성하는 Factory의 명시적 인터페이스입니다.
 * WorkerModule에서 바인딩됩니다.
 */
interface LocationPollingWorkerFactory : AssistedWorkerFactory<LocationPollingWorker>
