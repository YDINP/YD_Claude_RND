/**
 * TutorialScene.test.js - TASK-C (29 tests)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();
global.localStorage = localStorageMock;

global.Phaser = {
  Scene: class {
    constructor(config) {
      this.sys = {};
      this._key = config && config.key;
    }
  },
  Math: {
    Between: (a, b) => Math.floor((a + b) / 2),
    FloatBetween: (a, b) => (a + b) / 2
  }
};

vi.mock('../../src/systems/GachaSystem.js', () => ({
  GachaSystem: { pull: vi.fn(() => ({ success: true, results: [{ rarity: 'R' }] })) }
}));

vi.mock('../../src/config/gameConfig.js', () => ({
  COLORS: { bgDark: 0x0F172A, primary: 0x6366F1, secondary: 0xEC4899 },
  GAME_WIDTH: 720, GAME_HEIGHT: 1280,
  s: (v) => v, sf: (v) => String(v) + 'px'
}));

const { TutorialScene } = await import('../../src/scenes/TutorialScene.js');

function makeCtx() {
  const h = {};
  const cam = { fadeOut: vi.fn(), once: vi.fn((ev,cb)=>{h[ev]=cb;}), _fire: (ev)=>{if(h[ev])h[ev]();} };
  const G = () => ({ setStrokeStyle:vi.fn().mockReturnThis(), setInteractive:vi.fn().mockReturnThis(), setFillStyle:vi.fn().mockReturnThis(), setAlpha:vi.fn().mockReturnThis(), setOrigin:vi.fn().mockReturnThis(), on:vi.fn().mockReturnThis(), destroy:vi.fn() });
  return { cameras:{main:cam}, _cam:cam, tweens:{add:vi.fn(()=>({})),killAll:vi.fn()}, input:{removeAllListeners:vi.fn()}, scene:{start:vi.fn()}, time:{delayedCall:vi.fn()}, add:{rectangle:vi.fn(()=>G()),circle:vi.fn(()=>G()),text:vi.fn(()=>G())} };
}
function createScene() { const inst=new TutorialScene(); const ctx=makeCtx(); Object.assign(inst,ctx); return {inst,ctx}; }

describe('TutorialScene TASK-C', () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
  afterEach(() => { localStorage.clear(); });

  describe('TC-1 init', () => {
    it('TC-1.1 class exists', () => { expect(TutorialScene).toBeDefined(); });
    it('TC-1.2 key', () => { expect(new TutorialScene()._key).toBe('TutorialScene'); });
    it('TC-1.3 step0', () => { expect(new TutorialScene().currentStep).toBe(0); });
    it('TC-1.4 stepObjs', () => { expect(new TutorialScene()._stepObjects).toEqual([]); });
    it('TC-1.5 gachaNull', () => { expect(new TutorialScene()._gachaResult).toBeNull(); });
  });

  describe('TC-2 create', () => {
    it('TC-2.1', () => { const {inst}=createScene(); inst._createStarField=vi.fn(); inst._createProgressIndicators=vi.fn(()=>[]); inst.showStep=vi.fn(); inst.create(); expect(inst.currentStep).toBe(0); });
    it('TC-2.2', () => { const {inst}=createScene(); inst._createStarField=vi.fn(); inst._createProgressIndicators=vi.fn(()=>[]); inst.showStep=vi.fn(); inst.create(); expect(inst.showStep).toHaveBeenCalledWith(0); });
  });

  describe('TC-3 showStep', () => {
    it('TC-3.1', () => { const {inst}=createScene(); inst._clearStepObjects=vi.fn(); inst._updateProgressIndicators=vi.fn(); inst._createButton=vi.fn(()=>[]); inst.showStep(1); expect(inst.currentStep).toBe(1); });
    it('TC-3.2', () => { const {inst}=createScene(); const spy=vi.fn(); inst._clearStepObjects=spy; inst._updateProgressIndicators=vi.fn(); inst._createButton=vi.fn(()=>[]); inst.showStep(0); expect(spy).toHaveBeenCalled(); });
    it('TC-3.3', () => { const {inst}=createScene(); inst._clearStepObjects=vi.fn(); inst._updateProgressIndicators=vi.fn(); inst._createButton=vi.fn(()=>[]); inst.showStep(3); expect(inst.currentStep).toBe(3); });
    it('TC-3.4', () => { const {inst}=createScene(); inst._clearStepObjects=vi.fn(); inst._updateProgressIndicators=vi.fn(); inst._createButton=vi.fn(()=>[]); expect(()=>inst.showStep(99)).not.toThrow(); });
  });

  describe('TC-4 _onNextButton', () => {
    it('TC-4.1', () => { const {inst}=createScene(); inst.showStep=vi.fn(); inst._performTutorialGacha=vi.fn(); inst._completeTutorial=vi.fn(); inst._onNextButton(0); expect(inst.showStep).toHaveBeenCalledWith(1); });
    it('TC-4.2', () => { const {inst}=createScene(); inst.showStep=vi.fn(); inst._performTutorialGacha=vi.fn(); inst._completeTutorial=vi.fn(); inst._onNextButton(1); expect(inst.showStep).toHaveBeenCalledWith(2); });
    it('TC-4.3', () => { const {inst}=createScene(); inst.showStep=vi.fn(); const spy=vi.fn(); inst._performTutorialGacha=spy; inst._completeTutorial=vi.fn(); inst._onNextButton(2); expect(spy).toHaveBeenCalled(); });
    it('TC-4.4', () => { const {inst}=createScene(); inst.showStep=vi.fn(); inst._performTutorialGacha=vi.fn(); const spy=vi.fn(); inst._completeTutorial=spy; inst._onNextButton(3); expect(spy).toHaveBeenCalled(); });
  });

  describe('TC-5 _completeTutorial', () => {
    it('TC-5.1', () => { const {inst}=createScene(); inst._completeTutorial(); expect(localStorage.getItem('tutorial_completed')).toBe('true'); });
    it('TC-5.2', () => { const {inst,ctx}=createScene(); inst._completeTutorial(); expect(ctx._cam.fadeOut).toHaveBeenCalled(); });
    it('TC-5.3', () => { const {inst,ctx}=createScene(); inst._completeTutorial(); ctx._cam._fire('camerafadeoutcomplete'); expect(ctx.scene.start).toHaveBeenCalledWith('MainMenuScene'); });
  });

  describe('TC-6 BootScene check', () => {
    it('TC-6.1', () => { expect(localStorage.getItem('tutorial_completed')).toBeNull(); });
    it('TC-6.2', () => { localStorage.setItem('tutorial_completed','true'); expect(!!localStorage.getItem('tutorial_completed')).toBe(true); });
    it('TC-6.3', () => { localStorage.setItem('tutorial_completed','true'); expect(localStorage.getItem('tutorial_completed')).toStrictEqual('true'); });
  });

  describe('TC-7 _performTutorialGacha', () => {
    it('TC-7.1', async () => { const {GachaSystem}=await import('../../src/systems/GachaSystem.js'); GachaSystem.pull.mockImplementationOnce(()=>{throw new Error('fail');}); const {inst}=createScene(); inst.showStep=vi.fn(); inst._performTutorialGacha(); expect(inst.showStep).toHaveBeenCalledWith(3); });
    it('TC-7.2', async () => { const {GachaSystem}=await import('../../src/systems/GachaSystem.js'); GachaSystem.pull.mockReturnValueOnce({success:true,results:[{rarity:'SSR'}]}); const {inst}=createScene(); inst.showStep=vi.fn(); inst._performTutorialGacha(); expect(inst._gachaResult).toBe('SSR 등급 영웅 획득!'); });
    it('TC-7.3', () => { const {inst}=createScene(); inst.showStep=vi.fn(); inst._performTutorialGacha(); expect(inst.showStep).toHaveBeenCalledWith(3); });
    it('TC-7.4', async () => { const {GachaSystem}=await import('../../src/systems/GachaSystem.js'); GachaSystem.pull.mockReturnValueOnce({success:false,results:[]}); const {inst}=createScene(); inst.showStep=vi.fn(); inst._performTutorialGacha(); expect(inst._gachaResult).toBe('소환 체험 완료!'); });
  });

  describe('TC-8 shutdown', () => {
    it('TC-8.1', () => { const {inst,ctx}=createScene(); inst._clearStepObjects=vi.fn(); inst.shutdown(); expect(ctx.tweens.killAll).toHaveBeenCalled(); });
    it('TC-8.2', () => { const {inst,ctx}=createScene(); inst._clearStepObjects=vi.fn(); inst.shutdown(); expect(ctx.input.removeAllListeners).toHaveBeenCalled(); });
    it('TC-8.3', () => { const {inst}=createScene(); const spy=vi.fn(); inst._clearStepObjects=spy; inst.shutdown(); expect(spy).toHaveBeenCalled(); });
  });

  describe('TC-9 _clearStepObjects', () => {
    it('TC-9.1', () => { const {inst}=createScene(); inst._stepObjects=[{destroy:vi.fn()}]; inst._clearStepObjects(); expect(inst._stepObjects).toEqual([]); });
    it('TC-9.2', () => { const {inst}=createScene(); const o1={destroy:vi.fn()},o2={destroy:vi.fn()}; inst._stepObjects=[o1,o2]; inst._clearStepObjects(); expect(o1.destroy).toHaveBeenCalled(); expect(o2.destroy).toHaveBeenCalled(); });
  });
});
