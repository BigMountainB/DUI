import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS is REQUIRED on iPhone Safari for DeviceOrientationEvent
// (tilt steer) to be allowed — even on the local LAN.  basicSsl
// generates a self-signed cert on first run; the phone will show a
// "connection not private" warning, tap Advanced → Continue once.
export default defineConfig({
  base: './',
  plugins: [basicSsl()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: { manualChunks: { phaser: ['phaser'] } }
    }
  },
  server: {
    host: true,
    port: 3000
  }
});
