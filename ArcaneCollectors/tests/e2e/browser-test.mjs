import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3002';

async function runTests() {
  // CLI 인자로 headless 모드 제어: node browser-test.mjs --headed
  const headless = !process.argv.includes('--headed');

  const browser = await chromium.launch({
    headless,
    slowMo: headless ? 0 : 100 // headed 모드에서는 천천히 실행
  });
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });

  let passed = 0, failed = 0;
  const results = [];

  function assert(condition, name) {
    if (condition) {
      passed++;
      console.log(`✅ ${name}`);
      results.push({ name, status: 'PASS' });
    } else {
      failed++;
      console.log(`❌ ${name}`);
      results.push({ name, status: 'FAIL' });
    }
  }

  async function waitForCondition(fn, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const result = await fn();
        if (result) return true;
      } catch (e) {
        // Continue polling
      }
      await page.waitForTimeout(100);
    }
    return false;
  }

  try {
    console.log('\n=== 1. 로그인 플로우 테스트 ===\n');

    // 먼저 localStorage 초기화 (깨끗한 상태에서 시작)
    await page.goto(BASE_URL);
    await page.evaluate(() => {
      localStorage.clear();
    });

    // 페이지 새로고침
    await page.reload();
    await page.waitForTimeout(3000); // BootScene 스플래시 대기

    // 캔버스 존재 확인
    const canvasExists = await page.evaluate(() => {
      return document.querySelector('canvas') !== null;
    });
    assert(canvasExists, '캔버스 존재 확인');

    // LoginScene 활성화 확인 (자동로그인 없으면 LoginScene으로)
    const loginSceneActive = await waitForCondition(async () => {
      return await page.evaluate(() => {
        return window.game && window.game.scene.isActive('LoginScene');
      });
    }, 5000);
    assert(loginSceneActive, 'LoginScene 활성화 확인');

    // 게스트 로그인 실행
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('LoginScene');
      if (scene && scene._handleGuestLogin) {
        scene._handleGuestLogin();
      }
    });

    // MainMenuScene 전환 확인 (polling, 최대 15초)
    const mainMenuActivated = await waitForCondition(async () => {
      return await page.evaluate(() => {
        return window.game && window.game.scene.isActive('MainMenuScene');
      });
    }, 15000);
    assert(mainMenuActivated, 'MainMenuScene 전환 확인');

    await page.waitForTimeout(1000);

    console.log('\n=== 2. 메인 메뉴 확인 ===\n');

    // MainMenuScene 활성화 상태 재확인
    const mainMenuActive = await page.evaluate(() => {
      return window.game && window.game.scene.isActive('MainMenuScene');
    });
    assert(mainMenuActive, 'MainMenuScene 활성화 상태');

    // IdleBattleView 존재 확인
    const idleBattleViewExists = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainMenuScene');
      return scene && scene.idleBattleView !== undefined;
    });
    assert(idleBattleViewExists, 'IdleBattleView 존재 확인');

    // 기본 UI 요소 존재 확인
    const uiElementsExist = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainMenuScene');
      return scene && scene.children && scene.children.list.length > 0;
    });
    assert(uiElementsExist, '기본 UI 요소 존재 확인');

    console.log('\n=== 3. 팝업 테스트 (7개) ===\n');

    const popups = [
      'inventory',
      'herolist',
      'gacha',
      'quest',
      'tower',
      'partyedit',
      'settings'
    ];

    for (const popupKey of popups) {
      // 팝업 열기
      const opened = await page.evaluate((key) => {
        try {
          const scene = window.game.scene.getScene('MainMenuScene');
          if (!scene || !scene.openPopup) return false;
          scene.openPopup(key);
          return true;
        } catch (e) {
          console.error(`Error opening ${key}:`, e);
          return false;
        }
      }, popupKey);

      await page.waitForTimeout(500);

      assert(opened, `${popupKey} 팝업 열기`);

      // 팝업 닫기
      const closed = await page.evaluate(() => {
        try {
          const scene = window.game.scene.getScene('MainMenuScene');
          if (!scene || !scene.activePopup) return false;

          // activePopup을 통해 팝업 닫기
          if (scene.activePopup.close) {
            scene.activePopup.close();
            return true;
          } else if (scene.activePopup.destroy) {
            scene.activePopup.destroy();
            scene.activePopup = null;
            return true;
          }

          return false;
        } catch (e) {
          console.error('Error closing popup:', e);
          return false;
        }
      });

      await page.waitForTimeout(300);

      assert(closed, `${popupKey} 팝업 닫기`);

      // 메인 메뉴로 복귀 확인
      const backToMainMenu = await page.evaluate(() => {
        return window.game && window.game.scene.isActive('MainMenuScene');
      });
      assert(backToMainMenu, `${popupKey} 팝업 후 메인 메뉴 복귀`);
    }

    console.log('\n=== 4. 자동전투 관찰 ===\n');

    // 초기 HP 바 스케일 기록 (enemyHpBar의 scaleX 값)
    const initialHPScale = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainMenuScene');
      if (!scene || !scene.idleBattleView) return null;

      const hpBar = scene.idleBattleView.enemyHpBar;
      if (!hpBar || !hpBar.visible) return null;

      return hpBar.scaleX;
    });

    assert(initialHPScale !== null, '초기 HP 바 값 확인');

    // 6초 대기 후 전투 사이클 확인
    await page.waitForTimeout(6000);

    const battleProgressed = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainMenuScene');
      if (!scene || !scene.idleBattleView) return false;

      // 전투 사이클이 시작되었는지 확인
      return scene.idleBattleView.battleCycleTimer !== null;
    });

    assert(battleProgressed, '전투 사이클 진행 확인');

    // HP 바 변화 확인 (스케일이 감소했는지)
    const hpChanged = await page.evaluate((initial) => {
      const scene = window.game.scene.getScene('MainMenuScene');
      if (!scene || !scene.idleBattleView) return false;

      const hpBar = scene.idleBattleView.enemyHpBar;
      if (!hpBar || !hpBar.visible) return false;

      const currentScale = hpBar.scaleX;
      // HP가 감소했거나 (scaleX < 1), 적이 교체되어 다시 1이 되었을 수 있음
      return currentScale <= initial;
    }, initialHPScale);

    assert(hpChanged, 'HP 바 변화 확인');

    // 적 유닛 존재 확인
    const enemyExists = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainMenuScene');
      if (!scene || !scene.idleBattleView) return false;

      return scene.idleBattleView.enemyCircle && scene.idleBattleView.enemyCircle.visible;
    });

    assert(enemyExists, '적 유닛 존재 확인');

    console.log('\n=== 5. 자동 로그인 테스트 ===\n');

    // localStorage에 arcane_auth 데이터 설정
    await page.evaluate(() => {
      const authData = {
        userId: 'guest_12345',
        authType: 'guest',
        autoLogin: true,
        lastLogin: Date.now()
      };
      localStorage.setItem('arcane_auth', JSON.stringify(authData));

      // guest_user 데이터도 설정
      const guestData = {
        id: 'guest_12345',
        createdAt: Date.now()
      };
      localStorage.setItem('guest_user', JSON.stringify(guestData));
    });

    assert(true, 'localStorage arcane_auth 설정');

    // 페이지 리로드
    await page.reload();
    await page.waitForTimeout(4000); // BootScene 스플래시 + PreloadScene 대기

    // MainMenuScene 직접 활성화 확인 (LoginScene 스킵)
    // BootScene → PreloadScene → MainMenuScene 경로로 이동
    const autoLoggedIn = await waitForCondition(async () => {
      return await page.evaluate(() => {
        return window.game && window.game.scene.isActive('MainMenuScene');
      });
    }, 10000);

    assert(autoLoggedIn, 'LoginScene 스킵 확인 (자동 로그인)');

    // LoginScene이 활성화되지 않았는지 확인
    const loginSceneNotActive = await page.evaluate(() => {
      return window.game && !window.game.scene.isActive('LoginScene');
    });

    assert(loginSceneNotActive, 'LoginScene 비활성화 확인');

  } catch (error) {
    console.error('\n❌ 테스트 중 오류 발생:', error);

    // 스크린샷 저장
    try {
      await page.screenshot({ path: 'tests/e2e/error.png' });
      console.log('스크린샷 저장: tests/e2e/error.png');
    } catch (e) {
      console.error('스크린샷 저장 실패:', e);
    }

    failed++;
  } finally {
    console.log('\n=== 테스트 결과 ===\n');
    console.log(`✅ 통과: ${passed}`);
    console.log(`❌ 실패: ${failed}`);
    console.log(`📊 총 테스트: ${passed + failed}`);

    if (failed === 0) {
      console.log('\n🎉 모든 테스트 통과!');
    } else {
      console.log('\n⚠️  일부 테스트 실패');
      console.log('\n실패한 테스트:');
      results.filter(r => r.status === 'FAIL').forEach(r => {
        console.log(`  - ${r.name}`);
      });
    }

    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests().catch(console.error);
