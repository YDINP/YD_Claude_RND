/**
 * onboardingConfig.test.js
 * ISS-01 확정 고정 — 오프라인 보상 상한이 실제 지급 경로와 갈라지지 않게 잠근다.
 *
 * SSOT: docs/story/UX_ONBOARDING_FLOW.md §7 UXI-03 / docs/story/SYSTEM_ONBOARDING_ECONOMY.md §4-3
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  OFFLINE_REWARD_CAP_HOURS,
  OFFLINE_REWARD_CAP_MINUTES,
} from '../../src/config/onboardingConfig.js';
import { IdleProgressSystem } from '../../src/systems/IdleProgressSystem.js';

describe('ISS-01 오프라인 보상 상한 SSOT', () => {
  it('정본은 실제 지급 경로(SaveManager)의 24시간이다', () => {
    expect(OFFLINE_REWARD_CAP_HOURS).toBe(24);
    expect(OFFLINE_REWARD_CAP_MINUTES).toBe(1440);
  });

  it('SaveManager.calculateOfflineRewards 의 분 단위 상한과 값이 일치한다', () => {
    // SaveManager.js 는 수정 금지 파일이라 상수를 주입할 수 없다.
    // 대신 그쪽 리터럴이 바뀌면 이 테스트가 깨지도록 소스에서 직접 읽어 비교한다.
    const source = readFileSync(
      new URL('../../src/systems/SaveManager.js', import.meta.url), 'utf-8'
    );
    const match = /minutesAway\s*=\s*Math\.min\(minutesAway,\s*(\d+)\)/.exec(source);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBe(OFFLINE_REWARD_CAP_MINUTES);
  });

  it('IdleProgressSystem 이 같은 상한을 참조한다 (12h/24h 이중 구현 해소)', () => {
    expect(IdleProgressSystem.MAX_OFFLINE_HOURS).toBe(OFFLINE_REWARD_CAP_HOURS);
  });

  it('tutorial.json T-12 안내 문구의 상한이 코드와 같다', () => {
    const tutorial = JSON.parse(
      readFileSync(new URL('../../src/data/tutorial.json', import.meta.url), 'utf-8')
    );
    const t12 = tutorial.steps.find((step) => step.id === 'T-12');
    expect(t12.offlineCapHours).toBe(OFFLINE_REWARD_CAP_HOURS);
  });
});
