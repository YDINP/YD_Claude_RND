package com.ydinp.subwaymate.data.repository

import com.ydinp.subwaymate.domain.model.RideSession
import com.ydinp.subwaymate.domain.repository.RideSessionRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/**
 * RideSessionRepository 구현체
 *
 * 메모리 기반으로 탑승 세션을 관리합니다.
 * TODO: Room DB 연동으로 영구 저장 구현
 */
@Singleton
class RideSessionRepositoryImpl @Inject constructor() : RideSessionRepository {

    // 메모리 기반 세션 저장소
    private val sessionsFlow = MutableStateFlow<Map<String, RideSession>>(emptyMap())
    private val activeSessionId = MutableStateFlow<String?>(null)

    override fun getActiveSession(): Flow<RideSession?> {
        return activeSessionId.map { id ->
            id?.let { sessionsFlow.value[it] }
        }
    }

    override suspend fun startSession(session: RideSession): RideSession {
        // 기존 활성 세션 종료
        activeSessionId.value?.let { endSession(it) }

        // 새 세션 저장
        sessionsFlow.value = sessionsFlow.value + (session.id to session)
        activeSessionId.value = session.id

        return session
    }

    override suspend fun updateSession(session: RideSession) {
        sessionsFlow.value = sessionsFlow.value + (session.id to session)
    }

    override suspend fun endSession(sessionId: String) {
        val session = sessionsFlow.value[sessionId]
        if (session != null) {
            // 완료 상태로 업데이트
            val completedSession = session.complete()
            sessionsFlow.value = sessionsFlow.value + (sessionId to completedSession)

            // 활성 세션 해제
            if (activeSessionId.value == sessionId) {
                activeSessionId.value = null
            }
        }
    }

    override suspend fun getSessionById(sessionId: String): RideSession? {
        return sessionsFlow.value[sessionId]
    }

    override fun getRecentSessions(limit: Int): Flow<List<RideSession>> {
        return sessionsFlow.map { sessions ->
            sessions.values
                .sortedByDescending { it.startTime }
                .take(limit)
        }
    }

    override suspend fun clearAllSessions() {
        sessionsFlow.value = emptyMap()
        activeSessionId.value = null
    }
}
