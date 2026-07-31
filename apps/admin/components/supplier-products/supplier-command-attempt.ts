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
  keyFormat?: "scoped" | "uuid";
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
  const fingerprint = JSON.stringify([
    input.scope,
    input.resourcePath,
    input.payload,
    input.keyFormat ?? "scoped",
  ]);
  if (current?.fingerprint === fingerprint) return current;
  const randomKey = crypto.randomUUID();
  return {
    fingerprint,
    idempotencyKey: input.keyFormat === "uuid"
      ? randomKey
      : `${input.scope}:${randomKey}`,
    ...(input.allocateResourceId
      ? { resourceId: crypto.randomUUID() }
      : {}),
  };
}
