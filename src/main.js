import Phaser from 'phaser';
import { BootScene }    from './scenes/BootScene.js';
import { GameScene }    from './scenes/GameScene.js';
import { RestStopScene } from './scenes/RestStopScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { SCREEN_W, SCREEN_H } from './constants.js';

const config = {
  type: Phaser.AUTO,
  width:  SCREEN_W,
  height: SCREEN_H,
  backgroundColor: '#000000',
  scale: {
    mode:            Phaser.Scale.FIT,
    autoCenter:      Phaser.Scale.CENTER_BOTH,
    orientation:     Phaser.Scale.LANDSCAPE,
    // High-DPI canvas — render at the device's pixel ratio so the
    // 800×450 logical playfield isn't blown up to chunky scaled pixels
    // on retina / 1080p+ displays.  Falls back to 1.0 on low-DPI.
    zoom: window.devicePixelRatio || 1,
  },
  input: {
    activePointers: 3,
  },
  render: {
    antialias:        true,
    pixelArt:         false,
    roundPixels:      false,
    powerPreference: 'high-performance',
  },
  scene: [BootScene, GameScene, RestStopScene, GameOverScene],
};

window.addEventListener('load', () => {
  new Phaser.Game(config);

  // Prevent default touch scroll/zoom on iOS
  document.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove',  e => e.preventDefault(), { passive: false });
  document.addEventListener('touchend',   e => e.preventDefault(), { passive: false });

  // Request landscape orientation lock (may not work in all browsers)
  if (screen.orientation?.lock) {
    screen.orientation.lock('landscape').catch(() => {});
  }
});
