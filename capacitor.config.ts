import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.eduardgamez.notehub', appName: 'NoteHub', webDir: 'dist',
  ios: { contentInset: 'never', preferredContentMode: 'mobile', backgroundColor: '#f7f7f5' },
};
export default config;
