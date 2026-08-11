type KeyFactory = () => string;

export function createTrialIdempotencyIntent(
  keyFactory: KeyFactory = () => crypto.randomUUID(),
) {
  let key = keyFactory();
  return {
    current: () => key,
    beginNew: () => {
      key = keyFactory();
      return key;
    },
  };
}
