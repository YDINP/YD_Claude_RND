package com.ydinp.subwaymate.presentation.common

/**
 * 공통 UI 이벤트 인터페이스
 *
 * 모든 화면에서 발생할 수 있는 일회성 이벤트(Side Effect)를 정의합니다.
 * 각 화면의 SideEffect sealed class가 이 인터페이스를 구현하거나
 * 공통 이벤트로 사용할 수 있습니다.
 */
sealed interface UiEvent {
    /**
     * 스낵바 메시지 표시 이벤트
     *
     * @property message 표시할 메시지
     * @property actionLabel 액션 버튼 라벨 (선택적)
     * @property duration 표시 시간 (기본: Short)
     */
    data class ShowSnackbar(
        val message: String,
        val actionLabel: String? = null,
        val duration: SnackbarDuration = SnackbarDuration.Short
    ) : UiEvent

    /**
     * 토스트 메시지 표시 이벤트
     *
     * @property message 표시할 메시지
     * @property duration 표시 시간
     */
    data class ShowToast(
        val message: String,
        val duration: ToastDuration = ToastDuration.Short
    ) : UiEvent

    /**
     * 뒤로가기 이벤트
     */
    data object NavigateBack : UiEvent

    /**
     * 특정 화면으로 이동 이벤트
     *
     * @property route 이동할 화면의 경로
     * @property popUpToRoute popUpTo 설정할 경로 (선택적)
     * @property inclusive popUpTo inclusive 여부
     */
    data class NavigateTo(
        val route: String,
        val popUpToRoute: String? = null,
        val inclusive: Boolean = false
    ) : UiEvent

    /**
     * 다이얼로그 표시 이벤트
     *
     * @property dialogType 다이얼로그 타입
     * @property data 다이얼로그에 전달할 데이터 (선택적)
     */
    data class ShowDialog(
        val dialogType: DialogType,
        val data: Any? = null
    ) : UiEvent

    /**
     * 다이얼로그 닫기 이벤트
     */
    data object DismissDialog : UiEvent

    /**
     * 로딩 표시 이벤트
     *
     * @property show 로딩 표시 여부
     * @property message 로딩 메시지 (선택적)
     */
    data class ShowLoading(
        val show: Boolean,
        val message: String? = null
    ) : UiEvent
}

/**
 * 스낵바 표시 시간
 */
enum class SnackbarDuration {
    /** 짧은 시간 (~4초) */
    Short,
    /** 긴 시간 (~10초) */
    Long,
    /** 무기한 (액션 또는 닫기 전까지) */
    Indefinite
}

/**
 * 토스트 표시 시간
 */
enum class ToastDuration {
    /** 짧은 시간 */
    Short,
    /** 긴 시간 */
    Long
}

/**
 * 다이얼로그 타입
 */
enum class DialogType {
    /** 확인 다이얼로그 */
    Confirm,
    /** 에러 다이얼로그 */
    Error,
    /** 경고 다이얼로그 */
    Warning,
    /** 정보 다이얼로그 */
    Info,
    /** 커스텀 다이얼로그 */
    Custom
}

/**
 * UiEvent를 Material3 SnackbarDuration으로 변환
 */
fun SnackbarDuration.toMaterial3Duration(): androidx.compose.material3.SnackbarDuration {
    return when (this) {
        SnackbarDuration.Short -> androidx.compose.material3.SnackbarDuration.Short
        SnackbarDuration.Long -> androidx.compose.material3.SnackbarDuration.Long
        SnackbarDuration.Indefinite -> androidx.compose.material3.SnackbarDuration.Indefinite
    }
}

/**
 * UiEvent를 Android Toast.LENGTH로 변환
 */
fun ToastDuration.toAndroidDuration(): Int {
    return when (this) {
        ToastDuration.Short -> android.widget.Toast.LENGTH_SHORT
        ToastDuration.Long -> android.widget.Toast.LENGTH_LONG
    }
}
