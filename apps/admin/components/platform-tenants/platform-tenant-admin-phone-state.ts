export type TenantAdmin = {
  id: string;
  name: string | null;
  phone_masked: string | null;
  status: string | null;
  version: number;
  has_login_binding: boolean;
  can_change: boolean;
  disabled_reason: string | null;
};

export type TenantAdminList = {
  list: TenantAdmin[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export type PhoneChallenge = { challenge_id: string; expires_at: string; cooldown_seconds: number };
export type PhoneSendRequest = { new_phone: string; expected_version: number; idempotency_key: string };
export type PhoneConfirmRequest = PhoneSendRequest & {
  challenge_id: string; code: string; reason: string; same_person_confirmed: true;
};
export type PhoneChangeResult = {
  employee_id: string; phone_masked: string; version: number; changed_at: string; idempotent: boolean;
};

export type PhoneChangeState = {
  expectedVersion: number;
  newPhone: string;
  code: string;
  reason: string;
  samePerson: boolean;
  challenge: PhoneChallenge | null;
  cooldownUntil: number;
  pending: "send" | "confirm" | "refresh" | null;
  needsRefresh: boolean;
  outcomeUnknown: boolean;
  error: string | null;
  sendRequest: PhoneSendRequest | null;
  confirmRequest: PhoneConfirmRequest | null;
};

export type PhoneChangeEvent =
  | { type: "edit"; field: "newPhone" | "code" | "reason"; value: string }
  | { type: "same-person"; value: boolean }
  | { type: "send" | "confirm"; key: string; now: number }
  | { type: "sent"; challenge: PhoneChallenge; now: number }
  | { type: "failed"; status?: number; code?: string; message: string }
  | { type: "refresh" }
  | { type: "refreshed"; version: number };

export function createPhoneChangeState(version: number): PhoneChangeState {
  return { expectedVersion: version, newPhone: "", code: "", reason: "", samePerson: false,
    challenge: null, cooldownUntil: 0, pending: null, needsRefresh: false,
    outcomeUnknown: false, error: null, sendRequest: null, confirmRequest: null };
}

export function canSendPhoneCode(state: PhoneChangeState, now: number): boolean {
  return !state.pending && !state.needsRefresh && /^1[3-9]\d{9}$/.test(state.newPhone) && now >= state.cooldownUntil;
}

export function canConfirmPhoneChange(state: PhoneChangeState, now: number): boolean {
  if (state.pending || state.needsRefresh) return false;
  // A retry must reach server-side idempotency lookup even after the challenge expires locally.
  if (state.outcomeUnknown && state.confirmRequest) return true;
  return Boolean(state.challenge && Date.parse(state.challenge.expires_at) > now &&
    /^1[3-9]\d{9}$/.test(state.newPhone) && /^\d{6}$/.test(state.code) &&
    state.reason.trim() && state.reason.length <= 500 && state.samePerson);
}

export function phoneChangeReducer(state: PhoneChangeState, event: PhoneChangeEvent): PhoneChangeState {
  switch (event.type) {
    case "edit":
      if (state.pending || state[event.field] === event.value) return state;
      return { ...state, [event.field]: event.value, confirmRequest: null, outcomeUnknown: false, error: null,
        ...(event.field === "newPhone" ? { challenge: null, code: "", sendRequest: null } : {}) };
    case "same-person":
      if (state.pending || state.samePerson === event.value) return state;
      return { ...state, samePerson: event.value, confirmRequest: null, outcomeUnknown: false, error: null };
    case "send":
      if (!canSendPhoneCode(state, event.now)) return state;
      return { ...state, pending: "send", error: null, challenge: null, code: "", confirmRequest: null,
        outcomeUnknown: false, sendRequest: state.sendRequest ?? {
          new_phone: state.newPhone, expected_version: state.expectedVersion, idempotency_key: event.key,
        } };
    case "sent":
      return { ...state, pending: null, error: null, challenge: event.challenge, code: "", sendRequest: null,
        confirmRequest: null, outcomeUnknown: false, cooldownUntil: event.now + event.challenge.cooldown_seconds * 1000 };
    case "confirm": {
      if (!canConfirmPhoneChange(state, event.now)) return state;
      const request = state.confirmRequest ?? (state.challenge ? {
        new_phone: state.newPhone, expected_version: state.expectedVersion, idempotency_key: event.key,
        challenge_id: state.challenge.challenge_id, code: state.code, reason: state.reason.trim(),
        same_person_confirmed: true as const,
      } : null);
      return { ...state, pending: "confirm", error: null, confirmRequest: request };
    }
    case "failed": {
      if (event.code === "TENANT_ADMIN_PHONE_CODE_EXHAUSTED") return { ...state,
        pending: null, error: event.message, challenge: null, code: "",
        confirmRequest: null, sendRequest: null, outcomeUnknown: false };
      if (event.status === 409) return { ...state, pending: null, error: event.message,
        needsRefresh: true, challenge: null, code: "", samePerson: false,
        sendRequest: null, confirmRequest: null, outcomeUnknown: false };
      const unknown = event.status === undefined || event.status >= 500 || [408, 429].includes(event.status);
      return { ...state, pending: null, error: event.message,
        outcomeUnknown: Boolean(state.confirmRequest && (unknown || state.outcomeUnknown)),
        sendRequest: unknown ? state.sendRequest : null };
    }
    case "refresh":
      return state.pending ? state : { ...state, pending: "refresh", error: null };
    case "refreshed":
      return { ...state, expectedVersion: event.version, pending: null, needsRefresh: false,
        challenge: null, code: "", samePerson: false, confirmRequest: null, sendRequest: null,
        outcomeUnknown: false, error: null };
  }
}
