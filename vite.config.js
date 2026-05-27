import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS is REQUIRED on iPhone Safari for DeviceOrientationEvent
// (tilt steer) to be allowed — even on the local LAN.  basicSsl
// generates a self-signed cert on first run; the phone will show a
// "connection not private" warning, tap Advanced → Continue once.
// Set DUI_HTTP=1 to disable the self-signed HTTPS plugin and serve
// over plain http:// (handy for iPhone testing when you don't need
// tilt-steer / DeviceOrientationEvent).
const useHttp = process.env.DUI_HTTP === '1';

export default defineConfig({
  base: './',
  plugins: useHttp ? [] : [basicSsl()],
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
