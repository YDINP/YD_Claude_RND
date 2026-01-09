package com.ydinp.subwaymate.domain.common

/**
 * 비동기 작업의 결과를 나타내는 sealed class
 *
 * Repository 계층에서 데이터 로딩 결과를 안전하게 처리하기 위해 사용합니다.
 * 성공, 실패, 로딩 상태를 명시적으로 표현합니다.
 *
 * @param T 성공 시 반환되는 데이터 타입
 */
sealed class Result<out T> {

    /**
     * 작업 성공
     *
     * @property data 성공적으로 로드된 데이터
     */
    data class Success<out T>(val data: T) : Result<T>()

    /**
     * 작업 실패
     *
     * @property exception 발생한 예외
     * @property message 에러 메시지 (null이면 exception.message 사용)
     */
    data class Error(
        val exception: Throwable,
        val message: String? = null
    ) : Result<Nothing>() {
        /**
         * 표시용 에러 메시지를 반환
         *
         * @return 에러 메시지 (message가 null이면 exception.message 사용)
         */
        fun getDisplayMessage(): String {
            return message ?: exception.message ?: "알 수 없는 오류가 발생했습니다"
        }
    }

    /**
     * 로딩 중 상태
     */
    data object Loading : Result<Nothing>()

    /**
     * 성공 여부 확인
     */
    val isSuccess: Boolean
        get() = this is Success

    /**
     * 실패 여부 확인
     */
    val isError: Boolean
        get() = this is Error

    /**
     * 로딩 중 여부 확인
     */
    val isLoading: Boolean
        get() = this is Loading

    /**
     * 성공 시 데이터를 반환하고, 실패 시 null 반환
     *
     * @return 성공 시 데이터, 그 외 null
     */
    fun getOrNull(): T? = when (this) {
        is Success -> data
        else -> null
    }

    /**
     * 성공 시 데이터를 반환하고, 실패 시 기본값 반환
     *
     * @param default 실패 시 반환할 기본값
     * @return 성공 시 데이터, 실패 시 기본값
     */
    fun getOrDefault(default: @UnsafeVariance T): T = when (this) {
        is Success -> data
        else -> default
    }

    /**
     * 성공 시 데이터를 반환하고, 실패 시 예외 발생
     *
     * @return 성공 시 데이터
     * @throws Throwable 실패 시 저장된 예외
     */
    fun getOrThrow(): T = when (this) {
        is Success -> data
        is Error -> throw exception
        is Loading -> throw IllegalStateException("데이터가 아직 로딩 중입니다")
    }

    /**
     * 성공 시 데이터를 변환
     *
     * @param transform 데이터 변환 함수
     * @return 변환된 Result
     */
    inline fun <R> map(transform: (T) -> R): Result<R> = when (this) {
        is Success -> Success(transform(data))
        is Error -> this
        is Loading -> this
    }

    /**
     * 성공 시 함수 실행
     *
     * @param action 성공 시 실행할 함수
     * @return 원본 Result
     */
    inline fun onSuccess(action: (T) -> Unit): Result<T> {
        if (this is Success) {
            action(data)
        }
        return this
    }

    /**
     * 실패 시 함수 실행
     *
     * @param action 실패 시 실행할 함수
     * @return 원본 Result
     */
    inline fun onError(action: (Throwable, String?) -> Unit): Result<T> {
        if (this is Error) {
            action(exception, message)
        }
        return this
    }

    /**
     * 로딩 중 함수 실행
     *
     * @param action 로딩 중 실행할 함수
     * @return 원본 Result
     */
    inline fun onLoading(action: () -> Unit): Result<T> {
        if (this is Loading) {
            action()
        }
        return this
    }

    companion object {
        /**
         * 성공 결과 생성
         *
         * @param data 성공 데이터
         * @return Success Result
         */
        fun <T> success(data: T): Result<T> = Success(data)

        /**
         * 실패 결과 생성
         *
         * @param exception 발생한 예외
         * @param message 에러 메시지
         * @return Error Result
         */
        fun error(exception: Throwable, message: String? = null): Result<Nothing> =
            Error(exception, message)

        /**
         * 로딩 결과 생성
         *
         * @return Loading Result
         */
        fun loading(): Result<Nothing> = Loading
    }
}
