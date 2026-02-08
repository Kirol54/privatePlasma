import { config } from '../config';

const STORAGE_KEYS = {
  PROXY_URL: 'shielded-pool-proxy-url',
};

export interface Settings {
  proxyUrl: string;
}

export function getProxyUrl(): string {
  const stored = localStorage.getItem(STORAGE_KEYS.PROXY_URL);
  if (stored) return stored;
  return config.proxyUrl;
}

export function setProxyUrl(url: string): void {
  // Remove trailing slash if present
  const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  localStorage.setItem(STORAGE_KEYS.PROXY_URL, cleanUrl);
}

export function resetProxyUrl(): void {
  localStorage.removeItem(STORAGE_KEYS.PROXY_URL);
}
