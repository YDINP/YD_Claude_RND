/**
 * AwakeningCutscene.js
 * AWAKE-4: 교단 각성 컷신 연출 시스템
 *
 * Phaser 3 기반 풀스크린 컷신 (8~12초 총 재생시간)
 * a) 페이드인 + 배경 암전 (1초)
 * b) 교단별 고유 컬러 파티클 폭발 이펙트 (2초)
 * c) 캐릭터 실루엣 - 각성 후 이미지 전환 트윈 (2초)
 * d) 교단 이름 텍스트 빌드업 (글자 하나씩, 1.5초)
 * e) 각성 완료! 플래시 이펙트 + 사운드 트리거 (1초)
 * f) 스탯 업 수치 표시 (1초)
 * g) 페이드아웃 + 콜백 호출 (1.5초)
 */

export const AWAKENING_SOUND_KEY = "awakening_sfx";

export const AWAKENING_PARTICLE_COLORS = {
  prism_stars:     0xFF6EB4,
  neon_crow:       0x00F5FF,
  ink_cyclone:     0xFF4500,
  stella_club:     0xE8E8FF,
  card_cartel:     0x2D2D5B,
  buddy_garden:    0x3DDC84,
  glitch_paradise: 0xFF00FF,
  cafe_encore:     0xC8602A,
  lunatic_circus:  0x8B2BE2,
  iron_beat:       0xE63946
};
const CULT_NAMES_KR = {
  prism_stars: "프리즘 스타즈",
  neon_crow: "네온 크로우",
  ink_cyclone: "잉크 사이클론",
  stella_club: "스텔라 클럽",
  card_cartel: "카드 카르텔",
  buddy_garden: "버디 가든",
  glitch_paradise: "글리치 파라다이스",
  cafe_encore: "카페 앙코르",
  lunatic_circus: "루나틱 서커스",
  iron_beat: "아이언 비트",
};

export class AwakeningCutscene {
  /**
   * 각성 컷신 재생 정적 메서드
   * @param {object} scene - Phaser Scene 인스턴스
   * @param {object} character - 캐릭터 데이터 { name, stats }
   * @param {string} targetCult - 교단 ID
   * @param {Function} [onComplete] - 컷신 완료 후 콜백
   */
  static play(scene, character, targetCult, onComplete) {
    if (!scene || !targetCult) {
      if (typeof onComplete === "function") onComplete();
      return;
    }
    if (scene.input) scene.input.enabled = false;
    const cx = (scene.scale && scene.scale.width)  ? scene.scale.width  / 2 : 400;
    const cy = (scene.scale && scene.scale.height) ? scene.scale.height / 2 : 300;
    const cultColor = (AWAKENING_PARTICLE_COLORS[targetCult] !== undefined)
      ? AWAKENING_PARTICLE_COLORS[targetCult] : 0xFFFFFF;
    const objects = [];
    let skipped = false;
    const skipHandler = () => {
      if (skipped) return;
      skipped = true;
      AwakeningCutscene._cleanup(scene, objects);
      scene.input.enabled = true;
      if (typeof onComplete === "function") onComplete();
    };
    if (scene.input && scene.input.once) scene.input.once("pointerdown", skipHandler);
    AwakeningCutscene._runSequence(scene, cx, cy, cultColor, targetCult, character, objects,
      function() {
        if (skipped) return;
        skipped = true;
        if (scene.input.off) scene.input.off("pointerdown", skipHandler);
        AwakeningCutscene._cleanup(scene, objects);
        scene.input.enabled = true;
        if (typeof onComplete === "function") onComplete();
      }
    );
  }

  static _runSequence(scene, cx, cy, cultColor, targetCult, character, objects, done) {
    const cultName = CULT_NAMES_KR[targetCult] || targetCult;
    AwakeningCutscene._stepFadeIn(scene, cx, cy, objects, function() {
      AwakeningCutscene._stepParticles(scene, cx, cy, cultColor, objects, function() {
        AwakeningCutscene._stepCharacterReveal(scene, cx, cy, cultColor, character, objects, function() {
          AwakeningCutscene._stepTextBuildUp(scene, cx, cy, cultName, cultColor, objects, function() {
            AwakeningCutscene._stepFlash(scene, cx, cy, cultColor, objects, function() {
              AwakeningCutscene._stepStatDisplay(scene, cx, cy, character, objects, function() {
                AwakeningCutscene._stepFadeOut(scene, cx, cy, objects, done);
              });
            });
          });
        });
      });
    });
  }
  // a) 페이드인 + 배경 암전 (1000ms)
  static _stepFadeIn(scene, cx, cy, objects, next) {
    const w = (scene.scale && scene.scale.width)  ? scene.scale.width  : 800;
    const h = (scene.scale && scene.scale.height) ? scene.scale.height : 600;
    const overlay = scene.add.graphics();
    overlay.fillStyle(0x000000, 0.85);
    overlay.fillRect(0, 0, w, h);
    overlay.setAlpha(0);
    overlay.setDepth(9000);
    objects.push(overlay);
    if (scene.tweens && scene.tweens.add) {
      scene.tweens.add({ targets: overlay, alpha: 1, duration: 1000, ease: "Power2", onComplete: function() { next(); } });
    } else {
      next();
    }
  }

  // b) 교단별 고유 컬러 파티클 폭발 이펙트 (2000ms)
  static _stepParticles(scene, cx, cy, cultColor, objects, next) {
    const PARTICLE_COUNT = 24;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
      const radius = 8 + (i % 3) * 3;
      if (scene.add && scene.add.circle) {
        const circle = scene.add.circle(cx, cy, radius, cultColor, 1);
        circle.setDepth(9100);
        objects.push(circle);
        const dist = 100 + (i % 5) * 24;
        if (scene.tweens && scene.tweens.add) {
          scene.tweens.add({
            targets: circle,
            x: cx + Math.cos(angle) * dist,
            y: cy + Math.sin(angle) * dist,
            alpha: 0, scaleX: 0.1, scaleY: 0.1,
            duration: 1800, ease: "Power2", delay: (i % 4) * 50
          });
        }
      }
    }
    if (scene.time && scene.time.delayedCall) {
      scene.time.delayedCall(2000, next);
    } else {
      next();
    }
  }

  // c) 캐릭터 실루엣 - 각성 후 전환 트윈 (2000ms)
  static _stepCharacterReveal(scene, cx, cy, cultColor, character, objects, next) {
    const charName = (character && character.name) ? character.name : "???";
    const silhouette = scene.add.text(cx, cy - 60, charName, {
      fontSize: "36px", fontStyle: "bold", color: "#333333", stroke: "#000000", strokeThickness: 4
    });
    silhouette.setOrigin(0.5, 0.5);
    silhouette.setDepth(9200);
    silhouette.setAlpha(0);
    objects.push(silhouette);
    if (scene.tweens && scene.tweens.add) {
      scene.tweens.add({
        targets: silhouette, alpha: 1, duration: 600, ease: "Power1",
        onComplete: function() {
          scene.tweens.add({
            targets: silhouette, scaleX: 1.3, scaleY: 1.3, duration: 800, ease: "Back.easeOut", yoyo: true,
            onComplete: function() {
              const colorHex = "#" + cultColor.toString(16).padStart(6, "0");
              if (silhouette.setStyle) silhouette.setStyle({ color: colorHex });
              next();
            }
          });
        }
      });
    } else {
      next();
    }
  }
  // d) 교단 이름 텍스트 빌드업 (1500ms)
  static _stepTextBuildUp(scene, cx, cy, cultName, cultColor, objects, next) {
    const colorHex = "#" + cultColor.toString(16).padStart(6, "0");
    const cultText = scene.add.text(cx, cy + 40, "", {
      fontSize: "28px", fontStyle: "bold", color: colorHex, stroke: "#000000", strokeThickness: 3
    });
    cultText.setOrigin(0.5, 0.5);
    cultText.setDepth(9300);
    objects.push(cultText);
    const chars = cultName.split("");
    const intervalMs = Math.min(1500 / Math.max(chars.length, 1), 200);
    let idx = 0;
    const addChar = function() {
      if (idx < chars.length) {
        if (cultText.setText) cultText.setText((cultText.text || '') + chars[idx]);
        idx++;
        if (scene.time && scene.time.delayedCall) {
          scene.time.delayedCall(intervalMs, addChar);
        } else {
          addChar();
        }
      } else {
        if (scene.time && scene.time.delayedCall) {
          scene.time.delayedCall(300, next);
        } else {
          next();
        }
      }
    };
    addChar();
  }

  static _stepFlash(scene, cx, cy, cultColor, objects, next) {
    const w = scene.scale ? scene.scale.width : 800;
    const h = scene.scale ? scene.scale.height : 600;
    const flash = scene.add.graphics();
    flash.fillStyle(0xFFFFFF, 0);
    flash.fillRect(0, 0, w, h);
    flash.setDepth(120);
    objects.push(flash);

    const completeText = scene.add.text(cx, cy - 40, "각성 완료!", {
      fontSize: "48px",
      fontStyle: "bold",
      color: "#FFFFFF",
      stroke: "#000000",
      strokeThickness: 4,
      shadow: { offsetX: 0, offsetY: 0, color: "#FFD700", blur: 20, fill: true }
    });
    completeText.setOrigin(0.5);
    completeText.setDepth(121);
    completeText.setAlpha(0);
    objects.push(completeText);

    if (scene.sound && scene.sound.add) {
      try {
        const sfx = scene.sound.add(AWAKENING_SOUND_KEY, { volume: 0.8 });
        sfx.play();
        objects.push(sfx);
      } catch (e) {}
    }

    if (scene.tweens) {
      scene.tweens.add({
        targets: flash,
        alpha: { from: 0, to: 0.8 },
        duration: 200,
        yoyo: true,
        repeat: 1,
        ease: "Power2",
        onComplete: () => {
          scene.tweens.add({
            targets: completeText,
            alpha: { from: 0, to: 1 },
            y: cy - 60,
            duration: 400,
            ease: "Back.easeOut",
            onComplete: () => {
              if (scene.time && scene.time.delayedCall) {
                scene.time.delayedCall(600, next);
              } else { next(); }
            }
          });
        }
      });
    } else {
      if (scene.time && scene.time.delayedCall) {
        scene.time.delayedCall(600, next);
      } else { next(); }
    }
  }
  static _stepStatDisplay(scene, cx, cy, character, objects, next) {
    const charName = character ? (character.name || "영웅") : "영웅";

    const panel = scene.add.graphics();
    panel.fillStyle(0x000000, 0.7);
    panel.fillRoundedRect(cx - 180, cy - 60, 360, 130, 12);
    panel.setDepth(115);
    panel.setAlpha(0);
    objects.push(panel);

    const nameText = scene.add.text(cx, cy - 30, charName, {
      fontSize: "24px",
      fontStyle: "bold",
      color: "#FFFFFF"
    });
    nameText.setOrigin(0.5);
    nameText.setDepth(116);
    nameText.setAlpha(0);
    objects.push(nameText);

    const labelText = scene.add.text(cx, cy + 44, "교단 각성 완료", {
      fontSize: "14px",
      color: "#94A3B8"
    });
    labelText.setOrigin(0.5);
    labelText.setDepth(116);
    labelText.setAlpha(0);
    objects.push(labelText);

    if (scene.tweens && scene.tweens.add) {
      scene.tweens.add({
        targets: [panel, nameText, labelText],
        alpha: { from: 0, to: 1 },
        duration: 500,
        ease: "Power2",
        onComplete: () => {
          if (scene.time && scene.time.delayedCall) {
            scene.time.delayedCall(1500, next);
          } else { next(); }
        }
      });
    } else {
      if (scene.time && scene.time.delayedCall) {
        scene.time.delayedCall(1500, next);
      } else { next(); }
    }
  }
  static _stepFadeOut(scene, cx, cy, objects, done) {
    const w = scene.scale ? scene.scale.width : 800;
    const h = scene.scale ? scene.scale.height : 600;
    const fadeOverlay = scene.add.graphics();
    fadeOverlay.fillStyle(0x000000, 1);
    fadeOverlay.fillRect(0, 0, w, h);
    fadeOverlay.setDepth(9999);
    fadeOverlay.setAlpha(0);
    objects.push(fadeOverlay);
    if (scene.tweens && scene.tweens.add) {
      scene.tweens.add({
        targets: fadeOverlay,
        alpha: 1,
        duration: 800,
        ease: "Power2",
        onComplete: () => {
          AwakeningCutscene._cleanup(scene, objects);
          if (typeof done === "function") done();
        }
      });
    } else {
      AwakeningCutscene._cleanup(scene, objects);
      if (typeof done === "function") done();
    }
  }

  static _cleanup(scene, objects) {
    for (const obj of objects) {
      try {
        if (obj && obj.destroy) { obj.destroy(); }
      } catch (e) {}
    }
    if (scene && scene.input) {
      scene.input.enabled = true;
    }
  }
}

export default AwakeningCutscene;