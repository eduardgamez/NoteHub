import { createStore, del, get, set } from 'idb-keyval';
import type { ProviderId } from './provider';

interface EncryptedSecret { iv: number[]; ciphertext: number[] }

const vault = createStore('notehub-private-v1', 'credentials');
const DEVICE_KEY = 'device-encryption-key';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function getDeviceKey(): Promise<CryptoKey> {
  const stored = await get<CryptoKey>(DEVICE_KEY, vault);
  if (stored) return stored;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await set(DEVICE_KEY, key, vault);
  return key;
}

const secretKey = (provider: ProviderId) => `provider:${provider}`;

export async function saveProviderKey(provider: ProviderId, value: string): Promise<void> {
  const plaintext = value.trim();
  if (!plaintext) throw new Error('Enter an API key first.');
  const key = await getDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  await set(secretKey(provider), { iv: [...iv], ciphertext: [...new Uint8Array(encrypted)] } satisfies EncryptedSecret, vault);
}

export async function getProviderKey(provider: ProviderId): Promise<string | undefined> {
  try {
    const secret = await get<EncryptedSecret>(secretKey(provider), vault);
    if (!secret) return undefined;
    const key = await getDeviceKey();
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(secret.iv) }, key, new Uint8Array(secret.ciphertext));
    return decoder.decode(decrypted);
  } catch {
    return undefined;
  }
}

export async function hasProviderKey(provider: ProviderId): Promise<boolean> {
  return Boolean(await getProviderKey(provider));
}

export async function removeProviderKey(provider: ProviderId): Promise<void> {
  await del(secretKey(provider), vault);
}
