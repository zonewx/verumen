import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import os from 'os'; // This is a built-in Node module

// 1. A reusable function to find your current LAN IPv4 address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Find the first IPv4 address that isn't 'internal' (127.0.0.1)
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  // Fallback if no network IP is found (shouldn't happen on a connected PC)
  return '127.0.0.1';
}

const networkIP = getLocalIP();
console.log(`📡 Vite config auto-detecting proxy target: http://${networkIP}:3000`);

// 2. Your standard Vite config
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // This enables the server to listen on the local network IP
    proxy: {
      '/api': {
        // 3. Dynamically set the target to the auto-discovered IP
        target: `http://${networkIP}:3000`, 
        changeOrigin: true,
        secure: false,
      },
    },
  },
});