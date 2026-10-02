import { nativeBridge } from '../native/bridge';

// Keep refresh tokens outside WKWebView storage, which iOS can reclaim.
export const deviceAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    const { value } = await nativeBridge.authGet({ key });
    if (value != null) return value;
    const legacy = localStorage.getItem(key);
    if (legacy != null) {
      await nativeBridge.authSet({ key, value: legacy });
      localStorage.removeItem(key);
    }
    return legacy;
  },
  async setItem(key: string, value: string) {
    await nativeBridge.authSet({ key, value });
    localStorage.removeItem(key);
  },
  async removeItem(key: string) {
    await nativeBridge.authRemove({ key });
    localStorage.removeItem(key);
  },
};

