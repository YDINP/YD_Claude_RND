/**
 * drawUtils.js - Phaser graphics drawing utilities
 */

import { COLORS } from '../config/gameConfig.js';
import { DESIGN, getMoodColor, getHPColor } from '../config/designSystem.js';

// ============================================
// Basic Shapes
// ============================================

/**
 * Draw rounded rectangle
 * @param {Phaser.GameObjects.Graphics} graphics - Graphics object
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Width
 * @param {number} height - Height
 * @param {number} radius - Corner radius
 * @param {number} fillColor - Fill color (hex number)
 * @param {number|null} strokeColor - Stroke color (hex number) or null
 * @param {number} strokeWidth - Stroke width
 */
export function drawRoundedRect(graphics, x, y, width, height, radius, fillColor, strokeColor = null, strokeWidth = 0) {
  graphics.fillStyle(fillColor);
  graphics.fillRoundedRect(x, y, width, height, radius);

  if (strokeColor !== null && strokeWidth > 0) {
    graphics.lineStyle(strokeWidth, strokeColor);
    graphics.strokeRoundedRect(x, y, width, height, radius);
  }
}

/**
 * Linear interpolation between two colors
 * @param {number} color1 - Start color (hex number)
 * @param {number} color2 - End color (hex number)
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated color
 */
function lerpColor(color1, color2, t) {
  const r1 = (color1 >> 16) & 0xff;
  const g1 = (color1 >> 8) & 0xff;
  const b1 = color1 & 0xff;

  const r2 = (color2 >> 16) & 0xff;
  const g2 = (color2 >> 8) & 0xff;
  const b2 = color2 & 0xff;

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return (r << 16) | (g << 8) | b;
}

/**
 * Draw gradient rectangle (vertical gradient)
 * @param {Phaser.GameObjects.Graphics} graphics - Graphics object
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Width
 * @param {number} height - Height
 * @param {number} colorTop - Top color (hex number)
 * @param {number} colorBottom - Bottom color (hex number)
 * @param {number} radius - Corner radius (optional)
 */
export function drawGradientRect(graphics, x, y, width, height, colorTop, colorBottom, radius = 0) {
  const steps = 10;
  const stepHeight = height / steps;

  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const color = lerpColor(colorTop, colorBottom, t);
    graphics.fillStyle(color);

    if (i === 0 && radius > 0) {
      // Top rounded
      graphics.fillRoundedRect(x, y, width, stepHeight + 1, { tl: radius, tr: radius, bl: 0, br: 0 });
    } else if (i === steps - 1 && radius > 0) {
      // Bottom rounded
      graphics.fillRoundedRect(x, y + i * stepHeight, width, stepHeight, { tl: 0, tr: 0, bl: radius, br: radius });
    } else {
      graphics.fillRect(x, y + i * stepHeight, width, stepHeight + 1);
    }
  }
}

/**
 * Draw star shape
 * @param {Phaser.GameObjects.Graphics} graphics - Graphics object
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} points - Number of points
 * @param {number} outerRadius - Outer radius
 * @param {number} innerRadius - Inner radius
 * @param {number} fillColor - Fill color
 */
export function drawStar(graphics, x, y, points, outerRadius, innerRadius, fillColor) {
  graphics.fillStyle(fillColor);
  graphics.beginPath();

  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;

    if (i === 0) {
      graphics.moveTo(px, py);
    } else {
      graphics.lineTo(px, py);
    }
  }

  graphics.closePath();
  graphics.fillPath();
}

/**
 * Draw circle with glow effect
 * @param {Phaser.GameObjects.Graphics} graphics - Graphics object
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} radius - Circle radius
 * @param {number} color - Circle color
 * @param {number} glowRadius - Glow radius
 */
export function drawGlowCircle(graphics, x, y, radius, color, glowRadius = 10) {
  // Draw glow layers
  for (let i = glowRadius; i > 0; i--) {
    const alpha = 0.1 * (1 - i / glowRadius);
    graphics.fillStyle(color, alpha);
    graphics.fillCircle(x, y, radius + i);
  }

  // Draw main circle
  graphics.fillStyle(color);
  graphics.fillCircle(x, y, radius);
}

/**
 * Draw hexagon shape
 * @param {Phaser.GameObjects.Graphics} graphics - Graphics object
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} radius - Radius
 * @param {number} fillColor - Fill color
 * @param {number|null} strokeColor - Stroke color
 * @param {number} strokeWidth - Stroke width
 */
export function drawHexagon(graphics, x, y, radius, fillColor, strokeColor = null, strokeWidth = 0) {
  graphics.fillStyle(fillColor);
  graphics.beginPath();

  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;

    if (i === 0) {
      graphics.moveTo(px, py);
    } else {
      graphics.lineTo(px, py);
    }
  }

  graphics.closePath();
  graphics.fillPath();

  if (strokeColor !== null && strokeWidth > 0) {
    graphics.lineStyle(strokeWidth, strokeColor);
    graphics.strokePath();
  }
}

// ============================================
// UI Elements
// ============================================

/**
 * Draw mood icon
 * @param {Phaser.Scene} scene - Current scene
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {string} mood - Mood name (brave, cunning, calm, wild, mystic)
 * @param {number} size - Icon size
 * @returns {Phaser.GameObjects.Graphics} The graphics object
 */
export function drawMoodIcon(scene, x, y, mood, size = 24) {
  const graphics = scene.add.graphics();
  const color = getMoodColor(mood);

  // Simple circle with mood color
  graphics.fillStyle(color);
  graphics.fillCircle(x, y, size / 2);

  // Border
  graphics.lineStyle(2, 0xffffff, 0.5);
  graphics.strokeCircle(x, y, size / 2);

  return graphics;
}

/**
 * Draw HP bar
 * @param {Phaser.GameObjects.Graphics} graphics - Graphics object
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Bar width
 * @param {number} height - Bar height
 * @param {number} percent - Fill percentage (0-1)
 * @param {boolean} showBackground - Whether to show background
 */
export function drawHPBar(graphics, x, y, width, height, percent, showBackground = true) {
  if (showBackground) {
    graphics.fillStyle(0x1e293b);
    graphics.fillRoundedRect(x, y, width, height, height / 2);
  }

  // Determine color based on percent
  let color;
  if (percent > 0.5) color = 0x22c55e;      // Green
  else if (percent > 0.25) color = 0xf59e0b; // Yellow
  else color = 0xef4444;                      // Red

  // Fill
  const fillWidth = Math.max(0, width * Math.max(0, Math.min(1, percent)));
  if (fillWidth > 0) {
    graphics.fillStyle(color);
    graphics.fillRoundedRect(x, y, fillWidth, height, height / 2);
  }
}

/**
 * Draw skill bar (blue themed)
 * @param {Phaser.GameObjects.Graphics} graphics - Graphics object
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Bar width
 * @param {number} height - Bar height
 * @param {number} percent - Fill percentage (0-1)
 */
export function drawSkillBar(graphics, x, y, width, height, percent) {
  // Background
  graphics.fillStyle(0x1e293b);
  graphics.fillRoundedRect(x, y, width, height, height / 2);

  // Fill
  const fillWidth = Math.max(0, width * Math.max(0, Math.min(1, percent)));
  if (fillWidth > 0) {
    graphics.fillStyle(0x3b82f6);
    graphics.fillRoundedRect(x, y, fillWidth, height, height / 2);
  }
}

/**
 * Draw experience bar (purple themed)
 * @param {Phaser.GameObjects.Graphics} graphics - Graphics object
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Bar width
 * @param {number} height - Bar height
 * @param {number} percent - Fill percentage (0-1)
 */
export function drawExpBar(graphics, x, y, width, height, percent) {
  // Background
  graphics.fillStyle(0x1e293b);
  graphics.fillRoundedRect(x, y, width, height, height / 2);

  // Fill
  const fillWidth = Math.max(0, width * Math.max(0, Math.min(1, percent)));
  if (fillWidth > 0) {
    graphics.fillStyle(0xa855f7);
    graphics.fillRoundedRect(x, y, fillWidth, height, height / 2);
  }
}

/**
 * Draw progress ring
 * @param {Phaser.GameObjects.Graphics} graphics - Graphics object
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} radius - Ring radius
 * @param {number} thickness - Ring thickness
 * @param {number} percent - Fill percentage (0-1)
 * @param {number} fillColor - Fill color
 * @param {number} bgColor - Background color
 */
export function drawProgressRing(graphics, x, y, radius, thickness, percent, fillColor = 0x3b82f6, bgColor = 0x1e293b) {
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + Math.PI * 2 * Math.max(0, Math.min(1, percent));

  // Background ring
  graphics.lineStyle(thickness, bgColor);
  graphics.beginPath();
  graphics.arc(x, y, radius, 0, Math.PI * 2);
  graphics.strokePath();

  // Progress ring
  if (percent > 0) {
    graphics.lineStyle(thickness, fillColor);
    graphics.beginPath();
    graphics.arc(x, y, radius, startAngle, endAngle);
    graphics.strokePath();
  }
}

// ============================================
// Rarity Frames
// ============================================

/**
 * Draw rarity frame for hero card
 * @param {Phaser.GameObjects.Graphics} graphics - Graphics object
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Frame width
 * @param {number} height - Frame height
 * @param {string} rarity - Rarity (N, R, SR, SSR)
 */
export function drawRarityFrame(graphics, x, y, width, height, rarity) {
  const rarityColors = {
    N: { border: 0x6b7280, bg: 0x374151 },
    R: { border: 0x3b82f6, bg: 0x1e3a5f },
    SR: { border: 0xa855f7, bg: 0x4c1d95 },
    SSR: { border: 0xf59e0b, bg: 0x78350f }
  };

  const colors = rarityColors[rarity] || rarityColors.N;
  const radius = 8;

  // Background
  graphics.fillStyle(colors.bg);
  graphics.fillRoundedRect(x, y, width, height, radius);

  // Border
  graphics.lineStyle(2, colors.border);
  graphics.strokeRoundedRect(x, y, width, height, radius);

  // Add glow for SSR
  if (rarity === 'SSR') {
    graphics.lineStyle(4, colors.border, 0.3);
    graphics.strokeRoundedRect(x - 2, y - 2, width + 4, height + 4, radius + 2);
  }
}

// ============================================
// Panel Backgrounds
// ============================================

/**
 * Draw panel background
 * @param {Phaser.GameObjects.Graphics} graphics - Graphics object
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Panel width
 * @param {number} height - Panel height
 * @param {number} radius - Corner radius
 */
export function drawPanel(graphics, x, y, width, height, radius = 12) {
  // Semi-transparent dark background
  graphics.fillStyle(0x0f172a, 0.9);
  graphics.fillRoundedRect(x, y, width, height, radius);

  // Subtle border
  graphics.lineStyle(1, 0x334155);
  graphics.strokeRoundedRect(x, y, width, height, radius);
}

/**
 * Draw card background
 * @param {Phaser.GameObjects.Graphics} graphics - Graphics object
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Card width
 * @param {number} height - Card height
 * @param {boolean} interactive - Add hover highlight
 */
export function drawCard(graphics, x, y, width, height, interactive = false) {
  const radius = 8;

  // Background
  graphics.fillStyle(0x1e293b);
  graphics.fillRoundedRect(x, y, width, height, radius);

  // Border
  graphics.lineStyle(1, 0x334155);
  graphics.strokeRoundedRect(x, y, width, height, radius);

  if (interactive) {
    // Subtle highlight at top
    graphics.fillStyle(0x475569, 0.3);
    graphics.fillRoundedRect(x, y, width, 2, { tl: radius, tr: radius, bl: 0, br: 0 });
  }
}

/**
 * Draw button background
 * @param {Phaser.GameObjects.Graphics} graphics - Graphics object
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Button width
 * @param {number} height - Button height
 * @param {number} color - Button color
 * @param {boolean} pressed - Is button pressed
 */
export function drawButton(graphics, x, y, width, height, color = 0x3b82f6, pressed = false) {
  const radius = 8;

  // Shadow (only if not pressed)
  if (!pressed) {
    graphics.fillStyle(0x000000, 0.3);
    graphics.fillRoundedRect(x, y + 2, width, height, radius);
  }

  // Button body
  const actualY = pressed ? y + 2 : y;
  graphics.fillStyle(color);
  graphics.fillRoundedRect(x, actualY, width, height - 2, radius);

  // Highlight at top
  graphics.fillStyle(0xffffff, 0.2);
  graphics.fillRoundedRect(x + 2, actualY + 2, width - 4, height / 3, { tl: radius - 2, tr: radius - 2, bl: 0, br: 0 });
}
