package com.ydinp.subwaymate.domain.repository

import com.ydinp.subwaymate.domain.model.RideSession
import kotlinx.coroutines.flow.Flow

/**
 * 탑승 세션 관리에 대한 Repository 인터페이스
 *
 * 사용자의 탑승 세션을 로컬에 저장하고 관리합니다.
 */
interface RideSessionRepository {

    /**
     * 현재 활성화된 탑승 세션을 조회
     *
     * @return 활성 세션을 Flow로 반환 (없으면 null)
     */
    fun getActiveSession(): Flow<RideSession?>

    /**
     * 새로운 탑승 세션을 시작
     *
     * @param session 시작할 탑승 세션
     * @return 저장된 세션
     */
    suspend fun startSession(session: RideSession): RideSession

    /**
     * 탑승 세션을 업데이트
     *
     * @param session 업데이트할 세션
     */
    suspend fun updateSession(session: RideSession)

    /**
     * 탑승 세션을 종료
     *
     * @param sessionId 종료할 세션 ID
     */
    suspend fun endSession(sessionId: String)

    /**
     * 특정 세션을 조회
     *
     * @param sessionId 세션 ID
     * @return RideSession 또는 null
     */
    suspend fun getSessionById(sessionId: String): RideSession?

    /**
     * 최근 탑승 기록을 조회
     *
     * @param limit 조회할 개수
     * @return 최근 탑승 기록 목록
     */
    fun getRecentSessions(limit: Int = 10): Flow<List<RideSession>>

    /**
     * 모든 탑승 기록을 삭제
     */
    suspend fun clearAllSessions()
}
