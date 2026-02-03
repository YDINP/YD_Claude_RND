import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig.js';

// Initialize the game
const game = new Phaser.Game(gameConfig);

// Global game reference
window.game = game;
