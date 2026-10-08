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

export type PhoneConfirmRequest = {
  new_phone: string;
  expected_version: number;
  reason: string;
  same_person_confirmed: true;
  idempotency_key: string;
};
export type PhoneChangeResult = {
  employee_id: string; phone_masked: string; version: number; changed_at: string; idempotent: boolean;
};

export type PhoneChangeState = {
  expectedVersion: number;
  newPhone: string;
  reason: string;
  samePerson: boolean;
  pending: "confirm" | "refresh" | null;
  needsRefresh: boolean;
  outcomeUnknown: boolean;
  error: string | null;
  confirmRequest: PhoneConfirmRequest | null;
};

export type PhoneChangeEvent =
  | { type: "edit"; field: "newPhone" | "reason"; value: string }
  | { type: "same-person"; value: boolean }
  | { type: "confirm"; key: string }
  | { type: "failed"; status?: number; message: string }
  | { type: "refresh" }
  | { type: "refreshed"; version: number };

export function createPhoneChangeState(version: number): PhoneChangeState {
  return { expectedVersion: version, newPhone: "", reason: "", samePerson: false,
    pending: null, needsRefresh: false, outcomeUnknown: false, error: null, confirmRequest: null };
}

export function canConfirmPhoneChange(state: PhoneChangeState): boolean {
  if (state.pending || state.needsRefresh) return false;
  // Preserve the original command so the server can resolve an unknown outcome idempotently.
  if (state.outcomeUnknown && state.confirmRequest) return true;
  return Boolean(/^1[3-9]\d{9}$/.test(state.newPhone) &&
    state.reason.trim() && state.reason.length <= 500 && state.samePerson);
}

export function phoneChangeReducer(state: PhoneChangeState, event: PhoneChangeEvent): PhoneChangeState {
  switch (event.type) {
    case "edit":
      if (state.pending || state[event.field] === event.value) return state;
      return { ...state, [event.field]: event.value, confirmRequest: null, outcomeUnknown: false, error: null };
    case "same-person":
      if (state.pending || state.samePerson === event.value) return state;
      return { ...state, samePerson: event.value, confirmRequest: null, outcomeUnknown: false, error: null };
    case "confirm": {
      if (!canConfirmPhoneChange(state)) return state;
      const request = state.confirmRequest ?? {
        new_phone: state.newPhone, expected_version: state.expectedVersion, idempotency_key: event.key,
        reason: state.reason.trim(), same_person_confirmed: true as const,
      };
      return { ...state, pending: "confirm", error: null, confirmRequest: request };
    }
    case "failed": {
      if (event.status === 409) return { ...state, pending: null, error: event.message,
        needsRefresh: true, samePerson: false, confirmRequest: null, outcomeUnknown: false };
      const unknown = event.status === undefined || event.status >= 500 || [408, 429].includes(event.status);
      return { ...state, pending: null, error: event.message,
        outcomeUnknown: Boolean(state.confirmRequest && (unknown || state.outcomeUnknown)) };
    }
    case "refresh":
      return state.pending ? state : { ...state, pending: "refresh", error: null };
    case "refreshed":
      return { ...state, expectedVersion: event.version, pending: null, needsRefresh: false,
        samePerson: false, confirmRequest: null, outcomeUnknown: false, error: null };
  }
}
