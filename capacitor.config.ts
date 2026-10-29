import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.datenza.app',
  appName: 'DATENZA',
  webDir: 'public',
  server: {
    url: 'https://datenza.vercel.app',
    cleartext: true,
  },
};

export default config;