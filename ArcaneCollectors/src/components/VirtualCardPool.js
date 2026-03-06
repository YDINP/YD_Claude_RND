import Phaser from 'phaser';

/**
 * VirtualCardPool - Object pool pattern for hero cards
 * 화면 밖 카드를 재사용하여 메모리 효율성과 스크롤 성능 향상
 */
export class VirtualCardPool {
  /**
   * @param {Phaser.Scene} scene
   * @param {Function} cardFactory - (scene, x, y, hero) => GameObjects.Container
   * @param {number} poolSize - 풀에 유지할 최대 카드 수
   */
  constructor(scene, cardFactory, poolSize = 20) {
    this.scene = scene;
    this.cardFactory = cardFactory;
    this.poolSize = poolSize;
    this.pool = [];
    this.activeCards = new Map(); // heroId -> card
  }

  /**
   * Get a card from pool or create new one
   * @param {number} x
   * @param {number} y
   * @param {Object} hero
   * @returns {Phaser.GameObjects.Container}
   */
  acquire(x, y, hero) {
    let card;

    if (this.pool.length > 0) {
      card = this.pool.pop();
      card.setPosition(x, y);
      card.setVisible(true);
      card.setActive(true);
      // Update card data
      if (card.setHeroData) {
        card.setHeroData(hero);
      }
    } else {
      card = this.cardFactory(this.scene, x, y, hero);
    }

    this.activeCards.set(hero.id, card);
    return card;
  }

  /**
   * Release card back to pool
   * @param {string} heroId
   */
  release(heroId) {
    const card = this.activeCards.get(heroId);
    if (!card) return;

    this.activeCards.delete(heroId);
    card.setVisible(false);
    card.setActive(false);

    if (this.pool.length < this.poolSize) {
      this.pool.push(card);
    } else {
      card.destroy();
    }
  }

  /**
   * Release all active cards
   */
  releaseAll() {
    const heroIds = Array.from(this.activeCards.keys());
    heroIds.forEach(id => this.release(id));
  }

  /**
   * Clear pool and destroy all cards
   */
  destroy() {
    this.releaseAll();
    this.pool.forEach(card => card.destroy());
    this.pool = [];
    this.activeCards.clear();
  }

  /**
   * Get active card count
   * @returns {number}
   */
  getActiveCount() {
    return this.activeCards.size;
  }

  /**
   * Get pool size
   * @returns {number}
   */
  getPoolCount() {
    return this.pool.length;
  }
}
