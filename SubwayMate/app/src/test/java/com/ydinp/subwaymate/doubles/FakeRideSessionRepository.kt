package com.ydinp.subwaymate.doubles

import com.ydinp.subwaymate.domain.model.RideSession
import com.ydinp.subwaymate.domain.model.RideStatus
import com.ydinp.subwaymate.domain.repository.RideSessionRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map

/**
 * 테스트용 FakeRideSessionRepository 구현
 *
 * RideSessionRepository 인터페이스를 구현하여 테스트에서 실제 데이터베이스 없이
 * 탑승 세션 관리 기능을 시뮬레이션합니다.
 */
class FakeRideSessionRepository : RideSessionRepository {

    // 내부 데이터 저장소
    private val _sessions = MutableStateFlow<List<RideSession>>(emptyList())
    private val _activeSession = MutableStateFlow<RideSession?>(null)

    // 에러 시뮬레이션 플래그
    var shouldReturnError = false
    var errorMessage = "테스트 에러"

    /**
     * 테스트용 데이터 설정
     */
    fun setSessions(sessions: List<RideSession>) {
        _sessions.value = sessions
        // 활성 세션 업데이트
        _activeSession.value = sessions.find { it.isActive() }
    }

    fun setActiveSession(session: RideSession?) {
        _activeSession.value = session
        if (session != null) {
            // 세션 목록에도 추가/업데이트
            val updatedSessions = _sessions.value.toMutableList()
            val existingIndex = updatedSessions.indexOfFirst { it.id == session.id }
            if (existingIndex >= 0) {
                updatedSessions[existingIndex] = session
            } else {
                updatedSessions.add(0, session)
            }
            _sessions.value = updatedSessions
        }
    }

    /**
     * 모든 세션 데이터 초기화
     */
    fun clearSessions() {
        _sessions.value = emptyList()
        _activeSession.value = null
    }

    override fun getActiveSession(): Flow<RideSession?> {
        return _activeSession
    }

    override suspend fun startSession(session: RideSession): RideSession {
        if (shouldReturnError) {
            throw Exception(errorMessage)
        }

        // 기존 활성 세션이 있으면 종료 처리
        _activeSession.value?.let { existing ->
            val completed = existing.complete()
            updateSession(completed)
        }

        // 새 세션 저장
        _activeSession.value = session
        _sessions.value = listOf(session) + _sessions.value

        return session
    }

    override suspend fun updateSession(session: RideSession) {
        if (shouldReturnError) {
            throw Exception(errorMessage)
        }

        // 세션 목록 업데이트
        _sessions.value = _sessions.value.map { existing ->
            if (existing.id == session.id) session else existing
        }

        // 활성 세션이면 활성 세션도 업데이트
        if (_activeSession.value?.id == session.id) {
            _activeSession.value = session
        }
    }

    override suspend fun endSession(sessionId: String) {
        if (shouldReturnError) {
            throw Exception(errorMessage)
        }

        // 세션 상태를 ARRIVED로 변경
        _sessions.value = _sessions.value.map { session ->
            if (session.id == sessionId) {
                session.copy(status = RideStatus.ARRIVED)
            } else {
                session
            }
        }

        // 활성 세션 해제
        if (_activeSession.value?.id == sessionId) {
            _activeSession.value = null
        }
    }

    override suspend fun getSessionById(sessionId: String): RideSession? {
        if (shouldReturnError) {
            throw Exception(errorMessage)
        }

        return _sessions.value.find { it.id == sessionId }
    }

    override fun getRecentSessions(limit: Int): Flow<List<RideSession>> {
        return _sessions.map { sessions ->
            sessions.take(limit)
        }
    }

    override suspend fun clearAllSessions() {
        if (shouldReturnError) {
            throw Exception(errorMessage)
        }

        _sessions.value = emptyList()
        _activeSession.value = null
    }
}
