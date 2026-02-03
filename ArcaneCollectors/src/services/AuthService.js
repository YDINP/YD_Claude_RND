/**
 * AuthService - 인증 서비스
 *
 * 회원가입, 로그인, 로그아웃, 세션 관리
 * Supabase Auth 사용 또는 로컬 스토리지 폴백
 */

import {
  supabase,
  isSupabaseConfigured,
  getLocalData,
  setLocalData,
  removeLocalData
} from '../api/supabaseClient';

const COLLECTION = 'auth';
const GUEST_USER_KEY = 'guest_user';

/**
 * 게스트 사용자 ID 생성/조회
 */
export const getGuestUserId = () => {
  let guestUser = getLocalData(GUEST_USER_KEY);
  if (!guestUser) {
    guestUser = {
      id: `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      nickname: 'Guest',
      isGuest: true,
      createdAt: new Date().toISOString()
    };
    setLocalData(GUEST_USER_KEY, guestUser);
  }
  return guestUser;
};

/**
 * 이메일/비밀번호로 회원가입
 */
export const signUp = async (email, password, nickname = '') => {
  if (!isSupabaseConfigured || !supabase) {
    // 로컬 모드: 게스트로 처리
    const guestUser = getGuestUserId();
    guestUser.email = email;
    guestUser.nickname = nickname || 'Player';
    setLocalData(GUEST_USER_KEY, guestUser);
    return { user: guestUser, error: null };
  }

  try {
    // Supabase Auth로 회원가입
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nickname: nickname || email.split('@')[0]
        }
      }
    });

    if (error) {
      return { user: null, error: error.message };
    }

    // users 테이블에 추가 정보 저장
    if (data.user) {
      await supabase.from('users').upsert({
        id: data.user.id,
        email: data.user.email,
        nickname: nickname || email.split('@')[0],
        created_at: new Date().toISOString()
      });
    }

    return { user: data.user, error: null };
  } catch (error) {
    return { user: null, error: error.message };
  }
};

/**
 * 이메일/비밀번호로 로그인
 */
export const signIn = async (email, password) => {
  if (!isSupabaseConfigured || !supabase) {
    // 로컬 모드: 게스트로 처리
    const guestUser = getGuestUserId();
    guestUser.email = email;
    setLocalData(GUEST_USER_KEY, guestUser);
    return { user: guestUser, session: null, error: null };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return { user: null, session: null, error: error.message };
    }

    // last_login 업데이트
    if (data.user) {
      await supabase.from('users').update({
        last_login: new Date().toISOString()
      }).eq('id', data.user.id);
    }

    return { user: data.user, session: data.session, error: null };
  } catch (error) {
    return { user: null, session: null, error: error.message };
  }
};

/**
 * 소셜 로그인 (Google, Apple 등)
 */
export const signInWithProvider = async (provider) => {
  if (!isSupabaseConfigured || !supabase) {
    return { user: null, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) {
      return { user: null, error: error.message };
    }

    return { user: data.user, url: data.url, error: null };
  } catch (error) {
    return { user: null, error: error.message };
  }
};

/**
 * 로그아웃
 */
export const signOut = async () => {
  if (!isSupabaseConfigured || !supabase) {
    // 로컬 모드: 게스트 정보 유지 (데이터는 보존)
    return { error: null };
  }

  try {
    const { error } = await supabase.auth.signOut();
    return { error: error?.message || null };
  } catch (error) {
    return { error: error.message };
  }
};

/**
 * 현재 세션 조회
 */
export const getSession = async () => {
  if (!isSupabaseConfigured || !supabase) {
    const guestUser = getGuestUserId();
    return { session: null, user: guestUser };
  }

  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Session error:', error);
      return { session: null, user: getGuestUserId() };
    }
    return { session, user: session?.user || getGuestUserId() };
  } catch (error) {
    return { session: null, user: getGuestUserId() };
  }
};

/**
 * 현재 사용자 조회
 */
export const getCurrentUser = async () => {
  if (!isSupabaseConfigured || !supabase) {
    return getGuestUserId();
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return getGuestUserId();
    }
    return user;
  } catch (error) {
    return getGuestUserId();
  }
};

/**
 * 사용자 ID 조회 (동기)
 */
export const getUserId = async () => {
  const user = await getCurrentUser();
  return user?.id || getGuestUserId().id;
};

/**
 * 인증 상태 변경 리스너
 */
export const onAuthStateChange = (callback) => {
  if (!isSupabaseConfigured || !supabase) {
    // 로컬 모드: 즉시 게스트 사용자 콜백
    setTimeout(() => {
      callback('SIGNED_IN', { user: getGuestUserId() });
    }, 0);
    return { unsubscribe: () => {} };
  }

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });

  return subscription;
};

/**
 * 비밀번호 재설정 이메일 발송
 */
export const resetPassword = async (email) => {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`
    });
    return { error: error?.message || null };
  } catch (error) {
    return { error: error.message };
  }
};

/**
 * 비밀번호 업데이트
 */
export const updatePassword = async (newPassword) => {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });
    return { error: error?.message || null };
  } catch (error) {
    return { error: error.message };
  }
};

/**
 * 사용자 프로필 업데이트
 */
export const updateProfile = async (updates) => {
  const userId = await getUserId();

  if (!isSupabaseConfigured || !supabase) {
    // 로컬 모드
    const guestUser = getGuestUserId();
    Object.assign(guestUser, updates);
    setLocalData(GUEST_USER_KEY, guestUser);
    return { user: guestUser, error: null };
  }

  try {
    // Auth 메타데이터 업데이트
    await supabase.auth.updateUser({
      data: updates
    });

    // users 테이블 업데이트
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      return { user: null, error: error.message };
    }

    return { user: data, error: null };
  } catch (error) {
    return { user: null, error: error.message };
  }
};

/**
 * 게스트 계정을 정식 계정으로 전환
 */
export const convertGuestToUser = async (email, password, nickname) => {
  const guestUser = getGuestUserId();

  if (!isSupabaseConfigured || !supabase) {
    return { user: null, error: 'Supabase not configured for account conversion' };
  }

  try {
    // 새 계정 생성
    const { user, error } = await signUp(email, password, nickname);

    if (error) {
      return { user: null, error };
    }

    // 게스트 데이터를 새 계정으로 마이그레이션하는 로직은
    // 각 서비스에서 별도로 처리해야 함

    return { user, guestId: guestUser.id, error: null };
  } catch (error) {
    return { user: null, error: error.message };
  }
};

// 서비스 객체로 내보내기
const AuthService = {
  getGuestUserId,
  signUp,
  signIn,
  signInWithProvider,
  signOut,
  getSession,
  getCurrentUser,
  getUserId,
  onAuthStateChange,
  resetPassword,
  updatePassword,
  updateProfile,
  convertGuestToUser
};

export default AuthService;
