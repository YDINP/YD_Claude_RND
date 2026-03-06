# 자동로그인 및 계정관리 시스템

## 개요

사용자가 매번 로그인을 반복하지 않도록 자동로그인 기능을 제공하며, 설정 화면에서 계정을 안전하게 변경할 수 있는 시스템입니다.

## 구현 범위

### AUTH-1.1: BootScene 자동로그인

**파일**: `src/scenes/BootScene.js`

#### 기능
- `localStorage`의 `arcane_auth` 키에서 자동로그인 정보 확인
- 유효한 경우 LoginScene을 스킵하고 바로 PreloadScene으로 이동
- 게스트/이메일 계정 모두 지원
- 7일 만료 정책 적용

#### 저장 구조
```javascript
{
  userId: string,          // 사용자 ID (guest_xxx 또는 Supabase user.id)
  authType: 'guest' | 'email',
  email?: string,          // 이메일 계정인 경우
  lastLogin: timestamp,    // 마지막 로그인 시각
  autoLogin: boolean       // 자동로그인 활성화 여부
}
```

#### 검증 로직
1. `arcane_auth` 데이터 파싱
2. `userId`, `authType` 필수 필드 확인
3. `lastLogin`이 7일 이내인지 확인
4. 게스트: `guest_user` localStorage 키와 userId 일치 확인
5. 이메일: Supabase 세션과 userId 일치 확인

#### 만료 처리
- 7일 이상 지난 자동로그인 정보는 자동 삭제
- 검증 실패 시 `arcane_auth` 삭제 후 LoginScene으로 이동

---

### AUTH-1.2: SettingsPopup 계정 관리

**파일**: `src/components/popups/SettingsPopup.js`

#### 기능
- 현재 로그인 계정 정보 표시
  - 게스트: "게스트: guest_xxx..."
  - 이메일: "이메일: user@example.com"
  - 자동로그인 미설정: "자동 로그인 미설정"
- "🔄 계정 변경" 버튼 (빨간색)
- 확인 모달 팝업

#### UI 구성
```
┌─────────────────────────────┐
│ 계정 관리                    │
├─────────────────────────────┤
│ 현재 계정:                  │
│ 이메일: user@example.com    │
├─────────────────────────────┤
│   [ 🔄 계정 변경 ]          │
└─────────────────────────────┘
```

#### 계정 변경 프로세스
1. "계정 변경" 버튼 클릭
2. 확인 모달 표시:
   - "계정을 변경하시겠습니까?"
   - "로그인 화면으로 이동하며, 현재 데이터는 저장됩니다."
3. "변경" 클릭 시:
   - `localStorage.removeItem('arcane_auth')` - 자동로그인 정보 삭제
   - `registry.destroy()` - 게임 레지스트리 초기화
   - `scene.start('LoginScene')` - 로그인 화면으로 전환

---

### AUTH-1.3: LoginScene 자동로그인 체크박스

**파일**: `src/scenes/LoginScene.js`

#### 기능
- "자동 로그인" 체크박스 UI (기본값: ON)
- 게스트/이메일 로그인 모두 지원
- 체크 시 `arcane_auth`에 로그인 정보 저장

#### UI 구성
```
┌───────────────────────────┐
│  [ ✓ ] 자동 로그인        │
└───────────────────────────┘
```

위치: 화면 하단 (버전 정보 위)

#### 저장 타이밍
- 게스트 로그인 성공 시 (`_handleGuestLogin`)
- 이메일 로그인 성공 시 (`_handleEmailAuth`)

#### 저장 메서드
```javascript
_saveAutoLoginData({
  userId: userId,
  authType: 'guest' | 'email',
  email?: email,
  autoLogin: true,
  lastLogin: Date.now()
});
```

---

## 보안 고려사항

### 1. 만료 정책
- 7일 후 자동로그인 정보 자동 삭제
- 재로그인 필요

### 2. 데이터 검증
- `userId`, `authType` 필수 필드 검증
- 게스트: localStorage `guest_user` 일치 확인
- 이메일: Supabase 세션 일치 확인

### 3. 민감정보 보호
- 비밀번호는 저장하지 않음
- 이메일 주소만 저장 (표시용)
- Supabase 세션은 자체 보안 메커니즘 사용

---

## 테스트 결과

### TypeScript
```bash
npx tsc --noEmit
```
✅ 에러 0건

### 단위 테스트
```bash
npx vitest run
```
✅ 337/337 테스트 통과

---

## 사용 시나리오

### 시나리오 1: 첫 로그인
1. 사용자가 LoginScene에서 "게스트로 시작" 클릭
2. "자동 로그인" 체크박스 ON 상태
3. 로그인 성공 → `arcane_auth` 저장
4. 다음 앱 실행 시 BootScene이 자동로그인 적용 → PreloadScene으로 바로 이동

### 시나리오 2: 계정 변경
1. 사용자가 메인 메뉴에서 "설정" 클릭
2. "계정 관리" 섹션에서 현재 계정 확인
3. "🔄 계정 변경" 버튼 클릭
4. 확인 모달에서 "변경" 클릭
5. LoginScene으로 이동 → 다른 계정으로 로그인 가능

### 시나리오 3: 만료된 자동로그인
1. 7일 이상 앱 미접속
2. BootScene이 `arcane_auth` 검증
3. 만료 확인 → 자동로그인 정보 삭제
4. LoginScene으로 이동 → 재로그인 필요

---

## 향후 개선 사항

### 1. 생체인증 연동
- Face ID / Touch ID 지원
- Capacitor Biometric Plugin 사용

### 2. 계정 전환
- 다중 계정 저장
- 빠른 계정 전환 UI

### 3. 클라우드 동기화
- 자동로그인 정보 Supabase 동기화
- 여러 기기에서 동일 경험

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `src/scenes/BootScene.js` | 자동로그인 검증 및 세션 복원 |
| `src/scenes/LoginScene.js` | 자동로그인 체크박스 UI 및 저장 |
| `src/components/popups/SettingsPopup.js` | 계정 관리 UI 및 변경 로직 |
| `src/systems/SaveManager.js` | 게임 데이터 저장 (변경 없음) |
| `src/services/AuthService.js` | 인증 서비스 (변경 없음) |

---

## 버전 히스토리

- **v1.0.0** (2025-02-14)
  - AUTH-1.1: BootScene 자동로그인
  - AUTH-1.2: SettingsPopup 계정 관리
  - AUTH-1.3: LoginScene 자동로그인 체크박스
