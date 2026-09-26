import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.saudeconnect.app',
  appName: 'SaudeConnect',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
