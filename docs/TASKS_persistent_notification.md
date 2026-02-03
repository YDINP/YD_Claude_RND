# Tasks: 탑승 중 상단 고정 알림 기능

## Task 1: 알림 채널 설정
**상태**: pending
**우선순위**: high
**예상 복잡도**: low

### 설명
탑승 추적용 알림 채널을 생성합니다.

### 구현 내용
- `SubwayMateApp.kt`에 새 알림 채널 추가
- 채널 ID: `tracking_status`
- 채널명: "탑승 추적 상태"
- 중요도: IMPORTANCE_LOW (무음)

### 파일
- `SubwayMateApp.kt`

---

## Task 2: TrackingService Foreground Service 구현
**상태**: pending
**우선순위**: high
**예상 복잡도**: medium

### 설명
탑승 추적을 위한 Foreground Service를 구현합니다.

### 구현 내용
- `TrackingService.kt` 생성
- Foreground Service로 동작
- 세션 정보를 받아 알림 표시
- ViewModel과 연동하여 위치 업데이트

### 파일
- `service/TrackingService.kt` (신규)
- `AndroidManifest.xml` (서비스 등록)

---

## Task 3: 고정 알림 UI 구현
**상태**: pending
**우선순위**: high
**예상 복잡도**: medium

### 설명
상단에 표시될 고정 알림의 UI를 구현합니다.

### 구현 내용
- NotificationCompat.Builder 사용
- 현재 역, 도착역, 남은 역 수 표시
- setOngoing(true)로 고정
- 진행률 바 표시 (선택)

### 파일
- `notification/TrackingNotificationBuilder.kt` (신규 또는 기존 수정)

---

## Task 4: 알림 실시간 업데이트
**상태**: pending
**우선순위**: high
**예상 복잡도**: medium

### 설명
열차 위치 변경 시 알림 내용을 실시간으로 업데이트합니다.

### 구현 내용
- TrackingService에서 위치 업데이트 수신
- 동일 알림 ID로 notify() 호출
- 최소 업데이트 간격 제한 (5초)

### 파일
- `service/TrackingService.kt`
- `notification/TrackingNotificationBuilder.kt`

---

## Task 5: TrackingViewModel과 Service 연동
**상태**: pending
**우선순위**: high
**예상 복잡도**: medium

### 설명
TrackingViewModel에서 서비스를 시작/종료하고 상태를 전달합니다.

### 구현 내용
- 열차 선택 시 서비스 시작
- 추적 종료 시 서비스 종료
- 위치 업데이트를 서비스로 전달

### 파일
- `TrackingViewModel.kt`
- `TrackingService.kt`

---

## Task 6: 알림 액션 버튼 구현
**상태**: pending
**우선순위**: medium
**예상 복잡도**: low

### 설명
알림에서 바로 추적을 종료할 수 있는 액션 버튼을 추가합니다.

### 구현 내용
- "추적 중단" 액션 버튼 추가
- PendingIntent로 서비스에 종료 명령 전달
- BroadcastReceiver로 액션 처리

### 파일
- `notification/TrackingNotificationBuilder.kt`
- `receiver/TrackingActionReceiver.kt` (신규)

---

## 구현 순서

```
Task 1 (채널 설정)
    ↓
Task 2 (Service 구현)
    ↓
Task 3 (알림 UI)
    ↓
Task 4 (실시간 업데이트)
    ↓
Task 5 (ViewModel 연동)
    ↓
Task 6 (액션 버튼)
```

## 예상 총 작업 시간
- Phase 1 (Task 1-5): 핵심 기능 구현
- Phase 2 (Task 6): UX 개선
