/**
 * ArcaneCollectors - Bottom Navigation Component
 * 5개 탭 하단 네비게이션 UI 컴포넌트
 */

import { LAYOUT, BOTTOM_NAV, UI_STYLES, Z_INDEX } from '../config/layoutConfig.js';

export default class BottomNav {
    /**
     * BottomNav 생성자
     * @param {Phaser.Scene} scene - Phaser 씬 인스턴스
     */
    constructor(scene) {
        this.scene = scene;
        this.container = null;
        this.tabs = [];
        this.activeIndex = 0;

        // 탭 정보 정의
        this.tabInfo = [
            { key: 'home', label: '홈', icon: '🏠' },
            { key: 'adventure', label: '모험', icon: '⚔️' },
            { key: 'inventory', label: '가방', icon: '🎒' },
            { key: 'gacha', label: '소환', icon: '✨' },
            { key: 'more', label: '더보기', icon: '⋯' }
        ];

        // 씬 매핑
        this.sceneMap = {
            home: 'HomeScene',
            adventure: 'AdventureScene',
            inventory: 'InventoryScene',
            gacha: 'GachaScene',
            more: 'MoreScene'
        };
    }

    /**
     * 네비게이션 바 생성
     * @param {number} x - X 좌표 (기본값: 화면 중앙)
     * @param {number} y - Y 좌표 (기본값: 화면 하단)
     * @returns {Phaser.GameObjects.Container} 생성된 컨테이너
     */
    create(x = LAYOUT.WIDTH / 2, y = LAYOUT.HEIGHT - BOTTOM_NAV.HEIGHT / 2) {
        this.container = this.scene.add.container(x, y);
        this.container.setDepth(Z_INDEX.BOTTOM_NAV);

        // 배경 생성
        this.createBackground();

        // 탭 버튼들 생성
        this.createTabs();

        // 초기 활성 탭 설정
        this.setActiveTab(this.activeIndex);

        return this.container;
    }

    /**
     * 배경 생성
     */
    createBackground() {
        const bg = this.scene.add.rectangle(
            0,
            0,
            LAYOUT.WIDTH,
            BOTTOM_NAV.HEIGHT,
            UI_STYLES.BACKGROUND.SECONDARY
        );
        bg.setStrokeStyle(1, UI_STYLES.BACKGROUND.ACCENT);
        this.container.add(bg);

        // 상단 구분선
        const topLine = this.scene.add.rectangle(
            0,
            -BOTTOM_NAV.HEIGHT / 2 + 1,
            LAYOUT.WIDTH,
            2,
            UI_STYLES.BUTTON.PRIMARY
        );
        this.container.add(topLine);
    }

    /**
     * 탭 버튼들 생성
     */
    createTabs() {
        const tabWidth = LAYOUT.WIDTH / this.tabInfo.length;
        const startX = -LAYOUT.WIDTH / 2 + tabWidth / 2;

        this.tabInfo.forEach((tab, index) => {
            const tabX = startX + index * tabWidth;
            const tabContainer = this.createTab(tab, tabX, index);
            this.tabs.push(tabContainer);
            this.container.add(tabContainer);
        });
    }

    /**
     * 개별 탭 생성
     * @param {Object} tab - 탭 정보
     * @param {number} x - X 좌표
     * @param {number} index - 탭 인덱스
     * @returns {Phaser.GameObjects.Container} 탭 컨테이너
     */
    createTab(tab, x, index) {
        const tabContainer = this.scene.add.container(x, 0);

        // 터치 영역 (투명)
        const hitArea = this.scene.add.rectangle(
            0,
            0,
            LAYOUT.WIDTH / this.tabInfo.length,
            BOTTOM_NAV.HEIGHT,
            0x000000,
            0
        );
        hitArea.setInteractive({ useHandCursor: true });
        hitArea.on('pointerdown', () => this.onTabClick(index));
        hitArea.on('pointerover', () => {
            if (index !== this.activeIndex) {
                icon.setAlpha(0.8);
            }
        });
        hitArea.on('pointerout', () => {
            if (index !== this.activeIndex) {
                icon.setAlpha(0.5);
            }
        });
        tabContainer.add(hitArea);

        // 아이콘
        const icon = this.scene.add.text(0, -12, tab.icon, {
            fontSize: `${BOTTOM_NAV.ICON_SIZE}px`
        });
        icon.setOrigin(0.5);
        icon.setAlpha(0.5);
        tabContainer.add(icon);
        tabContainer.icon = icon;

        // 레이블
        const label = this.scene.add.text(0, 28, tab.label, {
            fontSize: `${UI_STYLES.FONT_SIZE.SMALL}px`,
            fontFamily: 'Arial, sans-serif',
            color: UI_STYLES.TEXT.SECONDARY
        });
        label.setOrigin(0.5);
        tabContainer.add(label);
        tabContainer.label = label;

        // 활성화 인디케이터
        const indicator = this.scene.add.rectangle(
            0,
            -BOTTOM_NAV.HEIGHT / 2 + 4,
            40,
            4,
            UI_STYLES.BUTTON.PRIMARY
        );
        indicator.setVisible(false);
        tabContainer.add(indicator);
        tabContainer.indicator = indicator;

        return tabContainer;
    }

    /**
     * 탭 클릭 핸들러
     * @param {number} index - 클릭된 탭 인덱스
     */
    onTabClick(index) {
        if (index === this.activeIndex) return;

        // 활성 탭 변경
        this.setActiveTab(index);

        // 씬 전환
        const tabKey = this.tabInfo[index].key;
        const targetScene = this.sceneMap[tabKey];

        if (targetScene && this.scene.scene.get(targetScene)) {
            this.scene.scene.start(targetScene);
        } else {
            console.log(`[BottomNav] Scene not found: ${targetScene}`);
        }

        // 이벤트 발생
        this.scene.events.emit('bottomnav:tabchange', {
            index,
            key: tabKey,
            scene: targetScene
        });
    }

    /**
     * 활성 탭 설정
     * @param {number} index - 활성화할 탭 인덱스
     */
    setActiveTab(index) {
        if (index < 0 || index >= this.tabs.length) return;

        // 이전 활성 탭 비활성화
        if (this.activeIndex < this.tabs.length) {
            const prevTab = this.tabs[this.activeIndex];
            if (prevTab) {
                prevTab.icon.setAlpha(0.5);
                prevTab.label.setColor(UI_STYLES.TEXT.SECONDARY);
                prevTab.indicator.setVisible(false);
            }
        }

        // 새 탭 활성화
        this.activeIndex = index;
        const activeTab = this.tabs[index];
        if (activeTab) {
            activeTab.icon.setAlpha(1);
            activeTab.label.setColor(UI_STYLES.TEXT.PRIMARY);
            activeTab.indicator.setVisible(true);

            // 활성화 애니메이션
            this.scene.tweens.add({
                targets: activeTab.icon,
                scaleX: 1.2,
                scaleY: 1.2,
                duration: 100,
                yoyo: true,
                ease: 'Power2'
            });
        }
    }

    /**
     * 탭 인덱스로 키 가져오기
     * @param {number} index - 탭 인덱스
     * @returns {string} 탭 키
     */
    getTabKey(index) {
        return this.tabInfo[index]?.key || null;
    }

    /**
     * 키로 탭 인덱스 가져오기
     * @param {string} key - 탭 키
     * @returns {number} 탭 인덱스
     */
    getTabIndex(key) {
        return this.tabInfo.findIndex(tab => tab.key === key);
    }

    /**
     * 특정 탭 활성화 (키로)
     * @param {string} key - 탭 키
     */
    activateByKey(key) {
        const index = this.getTabIndex(key);
        if (index >= 0) {
            this.setActiveTab(index);
        }
    }

    /**
     * 탭 표시/숨김
     * @param {boolean} visible - 표시 여부
     */
    setVisible(visible) {
        if (this.container) {
            this.container.setVisible(visible);
        }
    }

    /**
     * 컴포넌트 제거
     */
    destroy() {
        if (this.container) {
            this.container.destroy(true);
            this.container = null;
        }
        this.tabs = [];
    }
}
