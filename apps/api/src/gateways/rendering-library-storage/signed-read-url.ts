import type { RenderingStorageLocation } from './client';

/** Validate the installed COS SDK's signed GET shape before giving a URL to Ark or a client. */
export function validateCosSignedReadUrl(signed: string, location: RenderingStorageLocation,
  secretId: string, ttlSeconds: number): { url: string; expiresAt: string } | null {
  const host = `${location.bucket}.cos.${location.region}.myqcloud.com`;
  if (!signed.startsWith(`https://${host}/${location.object_key}?`)) return null;
  try {
    const url = new URL(signed);
    const query = url.searchParams;
    const keys = [...query.keys()];
    const allowed = ['q-sign-algorithm', 'q-ak', 'q-sign-time', 'q-key-time',
      'q-header-list', 'q-url-param-list', 'q-signature'];
    const times = query.get('q-sign-time')?.split(';').map(Number);
    const start = times?.[0]; const end = times?.[1]; const now = Date.now() / 1000;
    if (url.protocol !== 'https:' || url.host !== host || url.pathname !== `/${location.object_key}`
      || url.username || url.password || url.hash || keys.length !== allowed.length
      || keys.some((name) => !allowed.includes(name)) || new Set(keys).size !== allowed.length
      || query.get('q-sign-algorithm') !== 'sha1' || query.get('q-ak') !== secretId
      || query.get('q-header-list') !== 'host' || query.get('q-url-param-list') !== ''
      || !/^[a-f0-9]{40}$/.test(query.get('q-signature') ?? '')
      || query.get('q-key-time') !== query.get('q-sign-time') || times?.length !== 2
      || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start === undefined || end === undefined
      || end - start !== ttlSeconds || start > now + 2 || start < now - 5 || end <= now) return null;
    return { url: signed, expiresAt: new Date(end * 1000).toISOString() };
  } catch { return null; }
}
