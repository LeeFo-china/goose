export type IdempotencyBusinessValue = string | number | boolean | null;

export type IdempotencyBusinessFields = Readonly<
  Record<string, IdempotencyBusinessValue>
>;

export type IdempotencyStatus = "draft" | "submitting" | "failed" | "succeeded";

export type IdempotencyKeyFactory = () => string;

export type SuccessfulSubmission<Fields extends IdempotencyBusinessFields> = {
  readonly key: string;
  readonly snapshot: Fields;
};

export type IdempotencyState<Fields extends IdempotencyBusinessFields> = {
  readonly key: string;
  readonly status: IdempotencyStatus;
  readonly draft: Fields;
  readonly lastSuccess: SuccessfulSubmission<Fields> | null;
};

export type SubmissionDecision<Fields extends IdempotencyBusinessFields> = {
  readonly state: IdempotencyState<Fields>;
  readonly shouldSubmit: boolean;
  readonly key: string;
};

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BYTE_COUNT = 16;

export function createUuidV4IdempotencyKey(): string {
  const bytes = Array.from(
    { length: BYTE_COUNT },
    () => Math.floor(Math.random() * 256),
  );
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join(""),
  ].join("-");
}

export function createIdempotencyState<Fields extends IdempotencyBusinessFields>(
  initialDraft: Fields,
  keyFactory: IdempotencyKeyFactory = createUuidV4IdempotencyKey,
): IdempotencyState<Fields> {
  return {
    key: createKey(keyFactory),
    status: "draft",
    draft: copyFields(initialDraft),
    lastSuccess: null,
  };
}

export function updateIdempotencyDraft<Fields extends IdempotencyBusinessFields>(
  state: IdempotencyState<Fields>,
  nextDraft: Fields,
  keyFactory: IdempotencyKeyFactory = createUuidV4IdempotencyKey,
): IdempotencyState<Fields> {
  if (hasSameFields(state.draft, nextDraft)) return state;
  if (state.status === "submitting") return state;
  const draft = copyFields(nextDraft);
  if (state.status === "draft") return { ...state, draft };
  return {
    ...state,
    key: createKey(keyFactory),
    status: "draft",
    draft,
  };
}

export function beginIdempotentSubmission<Fields extends IdempotencyBusinessFields>(
  state: IdempotencyState<Fields>,
): SubmissionDecision<Fields> {
  if (state.status === "submitting" || state.status === "succeeded") {
    return { state, shouldSubmit: false, key: state.key };
  }
  return {
    state: { ...state, status: "submitting" },
    shouldSubmit: true,
    key: state.key,
  };
}

export function failIdempotentSubmission<Fields extends IdempotencyBusinessFields>(
  state: IdempotencyState<Fields>,
): IdempotencyState<Fields> {
  return state.status === "submitting"
    ? { ...state, status: "failed" }
    : state;
}

export function succeedIdempotentSubmission<Fields extends IdempotencyBusinessFields>(
  state: IdempotencyState<Fields>,
): IdempotencyState<Fields> {
  if (state.status !== "submitting") return state;
  return {
    ...state,
    status: "succeeded",
    lastSuccess: {
      key: state.key,
      snapshot: copyFields(state.draft),
    },
  };
}

function createKey(factory: IdempotencyKeyFactory): string {
  const key = factory();
  if (!UUID_V4_PATTERN.test(key)) throw new TypeError("幂等键必须是 UUID v4");
  return key;
}

function copyFields<Fields extends IdempotencyBusinessFields>(fields: Fields): Fields {
  return { ...fields };
}

function hasSameFields<Fields extends IdempotencyBusinessFields>(
  current: Fields,
  next: Fields,
): boolean {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);
  return currentKeys.length === nextKeys.length
    && currentKeys.every((key) => Object.is(current[key], next[key]));
}
