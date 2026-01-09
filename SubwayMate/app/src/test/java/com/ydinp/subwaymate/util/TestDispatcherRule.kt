package com.ydinp.subwaymate.util

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.rules.TestWatcher
import org.junit.runner.Description

/**
 * Coroutines 테스트를 위한 TestDispatcher 설정 Rule
 *
 * ViewModel 테스트 시 Main dispatcher를 TestDispatcher로 교체하여
 * viewModelScope에서 실행되는 코루틴을 테스트할 수 있게 합니다.
 *
 * 사용 예:
 * ```
 * @get:Rule
 * val testDispatcherRule = TestDispatcherRule()
 *
 * @Test
 * fun myTest() = runTest {
 *     // 테스트 코드
 * }
 * ```
 *
 * @param testDispatcher 사용할 TestDispatcher (기본값: StandardTestDispatcher)
 */
@OptIn(ExperimentalCoroutinesApi::class)
class TestDispatcherRule(
    val testDispatcher: TestDispatcher = StandardTestDispatcher()
) : TestWatcher() {

    override fun starting(description: Description) {
        Dispatchers.setMain(testDispatcher)
    }

    override fun finished(description: Description) {
        Dispatchers.resetMain()
    }
}
