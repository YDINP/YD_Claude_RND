# Popup System 사용 가이드

ArcaneCollectors의 씬을 팝업으로 전환하는 시스템입니다.

## 생성된 팝업 목록

### 1. HeroListPopup
- **경로**: `src/components/popups/HeroListPopup.js`
- **기능**: 영웅 목록 표시, 정렬, 필터링, 영웅 클릭 시 HeroInfoPopup 표시
- **원본**: `HeroListScene.js`

### 2. InventoryPopup
- **경로**: `src/components/popups/InventoryPopup.js`
- **기능**: 인벤토리 관리 (장비/소비/재료 탭)
- **원본**: `InventoryScene.js`

### 3. 기존 팝업들
- `QuestPopup.js` - 퀘스트 관리
- `SettingsPopup.js` - 설정
- `TowerPopup.js` - 타워 도전

## 사용 방법

### 기본 사용 예시

```javascript
import { HeroListPopup } from './components/popups/HeroListPopup.js';

// MainMenuScene에서 사용
class MainMenuScene extends Phaser.Scene {
  create() {
    // 영웅 목록 버튼
    const heroBtn = this.add.text(360, 500, '영웅', { fontSize: '20px' })
      .setInteractive()
      .on('pointerdown', () => {
        const popup = new HeroListPopup(this);
        popup.show();
      });
  }
}
```

### InventoryPopup 사용 예시

```javascript
import { InventoryPopup } from './components/popups/InventoryPopup.js';

// 인벤토리 버튼
const invBtn = this.add.text(360, 600, '인벤토리', { fontSize: '20px' })
  .setInteractive()
  .on('pointerdown', () => {
    const popup = new InventoryPopup(this);
    popup.show();
  });
```

## PopupBase API

모든 팝업은 `PopupBase`를 상속합니다.

### 생성자 옵션

```javascript
new PopupBase(scene, {
  title: '제목',           // 팝업 제목
  width: 680,             // 팝업 너비
  height: 1100,           // 팝업 높이
  onClose: () => {},      // 닫힐 때 콜백
  showCloseButton: true   // 닫기 버튼 표시 여부
});
```

### 주요 메서드

- `show()` - 팝업 표시
- `hide()` - 팝업 숨김 (페이드아웃 애니메이션)
- `destroy()` - 팝업 제거
- `buildContent()` - 콘텐츠 빌드 (서브클래스에서 오버라이드)

### 헬퍼 메서드

```javascript
// 텍스트 추가
this.addText(x, y, '텍스트', { fontSize: '16px', color: '#FFFFFF' });

// 버튼 추가
this.addButton(x, y, width, height, '버튼', 0x3B82F6, () => {
  console.log('클릭!');
});
```

### contentBounds

팝업 콘텐츠 영역의 좌표 정보를 제공합니다.

```javascript
this.contentBounds = {
  left: 50,      // 왼쪽 경계
  top: 70,       // 위쪽 경계
  right: 670,    // 오른쪽 경계
  bottom: 1085,  // 아래쪽 경계
  width: 620,    // 너비
  height: 1015,  // 높이
  centerX: 360   // 중앙 X 좌표
};
```

## HeroListPopup 세부 기능

### 정렬 기능
- 등급순 (기본)
- 레벨순
- 전투력순
- 분위기순
- 교단순

오름차순/내림차순 토글 가능

### 필터링 기능
- **등급 필터**: N, R, SR, SSR
- **교단 필터**: 9개 교단 색상 도트로 표시

### 스크롤 기능
- 마우스 휠 스크롤
- 터치 드래그 스크롤
- 가상 스크롤링 (성능 최적화)

### 영웅 카드
- 2열 그리드 레이아웃
- 등급별 색상 테두리
- 아바타, 이름, 레벨, 별 표시
- 호버 효과
- 클릭 시 `HeroInfoPopup` 자동 오픈

## InventoryPopup 세부 기능

### 탭 구조
1. **장비 탭**: 무기, 방어구, 악세서리, 유물
2. **소비 탭**: 물약, 스크롤 등
3. **재료 탭**: 강화 재료, 진화 재료 등

### 아이템 표시
- 등급별 색상 아이콘
- 슬롯 타입 이모지
- 강화 레벨 표시 (장비)
- 수량 표시 (소비/재료)
- 스탯 요약 (우측)

### 데이터 소스
- SaveManager에서 저장된 인벤토리 로드
- `getItemsByType()` 함수로 타입별 아이템 목록 조회
- 보유 수량 매칭

## 주의사항

### 1. 씬 전환 vs 팝업
- **팝업 방식**: 현재 씬 위에 오버레이 표시, BottomNav 유지 가능
- **씬 전환 방식**: `scene.start()`, BottomNav 재생성 필요

### 2. 메모리 관리
- 팝업 닫을 때 `destroy()` 자동 호출
- 하위 팝업(HeroInfoPopup 등)도 함께 정리

### 3. Z-Index
- 팝업 기본 depth: `2000` (PopupBase)
- HeroInfoPopup depth: `Z_INDEX.MODAL + 10` (410)
- 중첩 팝업 가능

### 4. 스크롤 이벤트
- 팝업이 열린 동안만 스크롤 이벤트 처리
- `this.isOpen` 플래그로 제어
- 팝업 영역 밖 클릭 시 무시

## 확장 예시

새로운 팝업 추가하기:

```javascript
import { PopupBase } from '../PopupBase.js';
import { COLORS } from '../../config/gameConfig.js';

export class CustomPopup extends PopupBase {
  constructor(scene) {
    super(scene, {
      title: '커스텀 팝업',
      width: 600,
      height: 800
    });
  }

  buildContent() {
    const { centerX, top } = this.contentBounds;

    // 텍스트 추가
    this.addText(centerX, top + 50, '안녕하세요!', {
      fontSize: '20px',
      color: '#FFFFFF'
    });

    // 버튼 추가
    this.addButton(
      centerX - 100,
      top + 120,
      200,
      50,
      '확인',
      COLORS.primary,
      () => {
        console.log('확인 클릭');
        this.hide();
      }
    );
  }
}
```

## TypeScript 지원

모든 팝업은 TypeScript 타입 체크를 통과합니다.

```bash
npx tsc --noEmit
```

## 테스트

```bash
npx vitest run
```

모든 기존 테스트가 통과하며, 팝업 시스템은 기존 로직을 그대로 유지합니다.

## 참고 자료

- `src/components/PopupBase.js` - 기본 팝업 클래스
- `src/components/HeroInfoPopup.js` - 영웅 상세 정보 팝업
- `src/config/layoutConfig.js` - 레이아웃 상수 및 Z-Index
- `src/config/gameConfig.js` - 색상, 등급, 교단 정보
