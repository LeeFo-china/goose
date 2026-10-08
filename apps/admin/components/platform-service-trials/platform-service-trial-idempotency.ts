type KeyFactory = () => string;

export function createTrialIdempotencyIntent(
  keyFactory: KeyFactory = () => crypto.randomUUID(),
) {
  let key = keyFactory();
  let fingerprint: string | undefined;
  return {
    current: () => key,
    forPayload: (payload: unknown): string => {
      const next = JSON.stringify(payload);
      if (fingerprint !== undefined && fingerprint !== next) key = keyFactory();
      fingerprint = next;
      return key;
    },
    beginNew: () => {
      fingerprint = undefined;
      key = keyFactory();
      return key;
    },
  };
}
