export type SupplierCommandAttempt = {
  fingerprint: string;
  idempotencyKey: string;
  resourceId?: string;
};

export type SupplierResourceCommandAttempt = SupplierCommandAttempt & {
  resourceId: string;
};

type CommandAttemptInput = {
  scope: string;
  resourcePath: string;
  payload: unknown;
  allocateResourceId?: boolean;
};

export function resolveSupplierCommandAttempt(
  current: SupplierCommandAttempt | null,
  input: CommandAttemptInput & { allocateResourceId: true },
): SupplierResourceCommandAttempt;
export function resolveSupplierCommandAttempt(
  current: SupplierCommandAttempt | null,
  input: CommandAttemptInput,
): SupplierCommandAttempt;
export function resolveSupplierCommandAttempt(
  current: SupplierCommandAttempt | null,
  input: CommandAttemptInput,
): SupplierCommandAttempt {
  const fingerprint = JSON.stringify([input.resourcePath, input.payload]);
  if (current?.fingerprint === fingerprint) return current;
  return {
    fingerprint,
    idempotencyKey: `${input.scope}:${crypto.randomUUID()}`,
    ...(input.allocateResourceId
      ? { resourceId: crypto.randomUUID() }
      : {}),
  };
}
