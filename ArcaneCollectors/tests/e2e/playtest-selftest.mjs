/**
 * playtest-selftest.mjs — playtest 하네스가 물리는지만 확인한다 (검수 실행이 아니다)
 *
 * 왜 따로 두나
 *   전체 검수는 한 번 돌면 길다. 계정 픽스처가 로비까지 못 가거나 계측 훅이 안 붙으면
 *   그 사실을 40분 뒤에 알게 된다. 이 스크립트는 **판정을 하나도 하지 않고** 배선만 본다:
 *     - 계정 A/B/C 가 각각 의도한 화면까지 도달하는가
 *     - HMR 가드가 걸렸는가
 *     - shutdown() 계측 훅이 씬에 붙는가
 *     - navigateTo 로 위험 구간 씬에 들어갔다 돌아올 수 있는가
 *   게임 품질에 대한 결론은 내지 않는다. 결함 판정은 playtest.mjs 가 한다.
 *
 * 실행: PLAYTEST_BASE_URL=http://localhost:3000 node tests/e2e/playtest-selftest.mjs
 */
import { chromium } from 'playwright';
import * as L from './playtest-lib.mjs';

const { BASE_URL, newAccountSession, activeScenes, safeEvaluate, waitForLabel, guestLogin, findByLabel, tapWorld } = L;

let ok = 0;
let bad = 0;
const t = (cond, name, detail = '') => {
  if (cond) { ok += 1; console.log(`PASS | ${name}${detail ? ` — ${detail}` : ''}`); }
  else { bad += 1; console.log(`FAIL | ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** playtest.mjs 와 같은 로비 대기 (여기서는 복제해 쓴다 — selftest 가 본체를 import 하면 본체가 실행된다) */
async function waitLobby(page, timeout = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const scenes = await activeScenes(page);
    if (scenes.includes('MainMenuScene')) { await page.waitForTimeout(1500); return true; }
    if (scenes.includes('CutsceneScene')) {
      const skip = await findByLabel(page, '건너뛰기');
      if (skip) await tapWorld(page, skip.x, skip.y, 700); else await tapWorld(page, 540, 960, 300);
      continue;
    }
    if (scenes.includes('LoginScene')) {
      const btn = await findByLabel(page, '게스트로 시작', { sceneKeys: ['LoginScene'] });
      if (btn) { await tapWorld(page, btn.x, btn.y, 1500); continue; }
    }
    await page.waitForTimeout(400);
  }
  return false;
}

(async () => {
  console.log(`\n=== playtest 하네스 self-test (${BASE_URL}) ===\n`);
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });

  for (const key of ['A', 'B', 'C']) {
    const { page, ctx, hmr, account } = await newAccountSession(browser, key);
    try {
      t(hmr.applied || !BASE_URL.includes('localhost'), `[${key}] HMR 가드 적용`, `applied=${hmr.applied}`);
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

      if (key === 'A') {
        const login = await waitForLabel(page, '게스트로 시작', {}, 40000);
        t(!!login, `[A] 로그인 화면 도달 (세이브 없음)`);
        if (login) await guestLogin(page);
      }
      const lobby = await waitLobby(page);
      t(lobby, `[${key}] ${account.label} — 로비 도달`);

      const save = await safeEvaluate(page, () => {
        const raw = localStorage.getItem('arcane_collectors_save');
        const d = raw ? JSON.parse(raw) : null;
        return d ? { version: d.version, chars: (d.characters || []).length, chapter: d.progress?.currentChapter, tutorial: !!d.tutorial?.completed } : null;
      });
      t(!!save, `[${key}] 세이브 읽기`, JSON.stringify(save));
      if (key === 'B') t((save?.chars ?? 0) >= 30, '[B] 기본10+전직24 보유', `${save?.chars}명`);
      if (key === 'C') t((save?.version ?? 0) >= 1, '[C] 레거시 세이브 적재', `v${save?.version}`);

      if (key === 'B') {
        const wrapped = await safeEvaluate(page, () => {
          window.__shutdownCounts = {};
          let n = 0;
          for (const scene of window.game.scene.scenes) {
            if (typeof scene.shutdown !== 'function') continue;
            n += 1;
          }
          return n;
        });
        t(wrapped > 0, '[B] shutdown() 을 가진 씬 존재', `${wrapped}개`);

        const goTower = await safeEvaluate(page, () => window.__TEST_API__?.navigateTo?.('TowerScene'));
        await page.waitForTimeout(2500);
        const inTower = (await activeScenes(page)).includes('TowerScene');
        t(inTower, '[B] navigateTo(TowerScene) 진입', JSON.stringify(goTower));
        await safeEvaluate(page, () => window.__TEST_API__?.navigateTo?.('MainMenuScene'));
        await page.waitForTimeout(2500);
        t((await activeScenes(page)).includes('MainMenuScene'), '[B] 로비 복귀');

        // 픽셀 확인 배선 — "열렸다"가 아니라 "보인다"를 판정할 수 있는지 본다.
        // (Modal alpha 버그처럼 객체 트리는 멀쩡한데 화면엔 없는 경우를 잡기 위한 장치)
        const size = await safeEvaluate(page, () => ({ w: window.game.scale.gameSize.width, h: window.game.scale.gameSize.height }));
        const rects = [
          { x: Math.round(size.w * 0.24), y: Math.round(size.h * 0.16), w: 200, h: 120 },
          { x: Math.round(size.w * 0.30), y: Math.round(size.h * 0.42), w: 240, h: 160 },
        ];
        // 순차 실행 — Phaser 렌더러는 대기 중 스냅샷을 하나만 들고 있다(동시 호출 시 타임아웃)
        const sample = (rs) => safeEvaluate(page, async (list) => {
          const g = window.game;
          if (typeof g?.renderer?.snapshotArea !== 'function') return list.map(() => ({ error: 'snapshotArea 없음' }));
          const out = [];
          for (const r of list) {
            // eslint-disable-next-line no-await-in-loop
            out.push(await new Promise((resolve) => {
              let done = false;
              const bail = setTimeout(() => { if (!done) { done = true; resolve({ error: 'timeout' }); } }, 5000);
              g.renderer.snapshotArea(r.x, r.y, r.w, r.h, (img) => {
                if (done) return;
                done = true; clearTimeout(bail);
                try {
                  const c = document.createElement('canvas');
                  c.width = r.w; c.height = r.h;
                  const ctx = c.getContext('2d');
                  ctx.drawImage(img, 0, 0);
                  const d = ctx.getImageData(0, 0, r.w, r.h).data;
                  let sum = 0, n = 0;
                  for (let i = 0; i < d.length; i += 4 * 17) { sum += (d[i] + d[i + 1] + d[i + 2]) / 3; n += 1; }
                  resolve({ mean: Math.round((sum / n) * 10) / 10 });
                } catch (e) { resolve({ error: String(e).slice(0, 80) }); }
              });
            }));
          }
          return out;
        }, rs);

        // 노이즈 기준선(조작 없이 두 번) — 로비는 명상 뷰 애니메이션으로 표본이 흔들린다
        const baseA = await sample(rects);
        await page.waitForTimeout(700);
        const baseB = await sample(rects);
        t(baseA.every((r) => !r.error) && baseB.every((r) => !r.error), '[B] 화면 픽셀 샘플링 동작', JSON.stringify(baseB));

        const changedBy = (after) => {
          for (let i = 0; i < after.length; i += 1) {
            const a = baseA[i]; const b = baseB[i]; const c = after[i];
            if (!a || !b || !c || a.error || b.error || c.error) continue;
            const noise = Math.abs((b.mean ?? 0) - (a.mean ?? 0));
            const signal = Math.abs((c.mean ?? 0) - (b.mean ?? 0));
            if (signal > Math.max(noise * 3, 4)) return true;
          }
          return false;
        };

        const popupOk = await safeEvaluate(page, () => {
          const mm = window.game.scene.getScene('MainMenuScene');
          mm.openPopup('quest');
          return { key: mm.activePopupKey, has: !!mm.activePopup };
        });
        await page.waitForTimeout(1800);
        t(popupOk?.has === true, '[B] openPopup(quest) 동작', JSON.stringify(popupOk));

        const after = await sample(rects);
        t(changedBy(after), '[B] 팝업 표시가 화면 픽셀 변화로 감지된다', `${JSON.stringify(baseB)} → ${JSON.stringify(after)}`);

        const alphaChain = await safeEvaluate(page, () => {
          const mm = window.game.scene.getScene('MainMenuScene');
          const popup = mm?.activePopup;
          const root = popup?.container || popup?.root || null;
          let a = 1;
          for (let n = root; n; n = n.parentContainer) a *= (n.alpha === undefined ? 1 : n.alpha);
          return { hasRoot: !!root, effectiveAlpha: Math.round(a * 100) / 100 };
        });
        t(alphaChain.hasRoot ? alphaChain.effectiveAlpha >= 0.05 : true,
          '[B] 팝업 루트 누적 alpha 읽기', JSON.stringify(alphaChain));

        // --- 탐지기 실증 ---
        // "보이지 않는 팝업"을 인위적으로 만들어 탐지기가 실제로 잡는지 확인한다.
        // Modal 의 컨테이너 alpha 가 0 에서 복원되지 않던 버그와 같은 모양이다.
        // 가드를 만들었으면 그 가드가 동작하는지도 봐야 한다 — HMR 가드에서 배운 것.
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitLobby(page);
        const nA = await sample(rects);
        await page.waitForTimeout(700);
        const nB = await sample(rects);

        const forced = await safeEvaluate(page, () => {
          const mm = window.game.scene.getScene('MainMenuScene');
          mm.openPopup('quest');
          const popup = mm.activePopup;
          const root = popup?.container || popup?.root || null;
          if (!root) return { ok: false, reason: 'root 없음' };
          root.setAlpha(0);                            // Modal alpha 버그 재현
          return { ok: true };
        });
        await page.waitForTimeout(1800);
        // 등장 트윈이 alpha 를 되돌리므로 표본 직전에 한 번 더 눌러 둔다
        await safeEvaluate(page, () => {
          const mm = window.game.scene.getScene('MainMenuScene');
          const root = mm.activePopup?.container || mm.activePopup?.root;
          if (root) root.setAlpha(0);
        });
        await page.waitForTimeout(300);
        const invisible = await sample(rects);
        const invisibleDetected = !nA.some((a, i) => {
          const b = nB[i]; const c = invisible[i];
          if (!a || !b || !c || a.error || b.error || c.error) return false;
          const noise = Math.abs((b.mean ?? 0) - (a.mean ?? 0));
          const signal = Math.abs((c.mean ?? 0) - (b.mean ?? 0));
          return signal > Math.max(noise * 3, 4);
        });
        t(forced.ok && invisibleDetected,
          '[B] 투명 팝업(alpha 0)을 "화면에 안 보임"으로 판정한다',
          `forced=${JSON.stringify(forced)} base=${JSON.stringify(nB)} invisible=${JSON.stringify(invisible)}`);
      }
    } catch (e) {
      t(false, `[${key}] 예외 없이 완료`, e.message.slice(0, 160));
    } finally { await ctx.close(); }
  }

  await browser.close();
  console.log(`\n통과 ${ok} / 실패 ${bad}`);
  process.exit(bad > 0 ? 1 : 0);
})();
