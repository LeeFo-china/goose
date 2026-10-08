import { describe, expect, test } from "bun:test";
import {
  canConfirmPhoneChange, createPhoneChangeState, phoneChangeReducer,
} from "./platform-tenant-admin-phone-state";

function ready() {
  let state = createPhoneChangeState(7);
  state = phoneChangeReducer(state, { type: "edit", field: "newPhone", value: "13000000002" });
  state = phoneChangeReducer(state, { type: "edit", field: "reason", value: " 本人换号 " });
  return phoneChangeReducer(state, { type: "same-person", value: true });
}

describe("tenant admin direct phone change state", () => {
  test("requires only valid phone, reason and same-person confirmation", () => {
    expect(canConfirmPhoneChange(createPhoneChangeState(7))).toBe(false);
    const state = ready();
    expect(canConfirmPhoneChange(state)).toBe(true);
    expect(canConfirmPhoneChange({ ...state, newPhone: "123" })).toBe(false);
    expect(canConfirmPhoneChange({ ...state, samePerson: false })).toBe(false);
    expect(canConfirmPhoneChange({ ...state, reason: " " })).toBe(false);
    expect(canConfirmPhoneChange({ ...state, reason: "字".repeat(501) })).toBe(false);
  });
  test("direct confirm contains exactly the five authorized fields", () => {
    const state = phoneChangeReducer(ready(), { type: "confirm", key: "first" });
    expect(state.confirmRequest).toEqual({ new_phone: "13000000002", expected_version: 7,
      reason: "本人换号", same_person_confirmed: true, idempotency_key: "first" });
  });
  test("pending submit ignores edits, duplicate actions and refresh", () => {
    const state = phoneChangeReducer(ready(), { type: "confirm", key: "first" });
    expect(state.pending).toBe("confirm");
    expect(phoneChangeReducer(state, { type: "edit", field: "newPhone", value: "13000000003" })).toBe(state);
    expect(phoneChangeReducer(state, { type: "edit", field: "reason", value: "changed" })).toBe(state);
    expect(phoneChangeReducer(state, { type: "same-person", value: false })).toBe(state);
    expect(phoneChangeReducer(state, { type: "confirm", key: "second" })).toBe(state);
    expect(phoneChangeReducer(state, { type: "refresh" })).toBe(state);
    expect(canConfirmPhoneChange(state)).toBe(false);
  });
  test.each([undefined, 408, 429, 500, 503])("unknown outcome (%s) retries identical payload and key", (status) => {
    const submitted = phoneChangeReducer(ready(), { type: "confirm", key: "original" });
    const unknown = phoneChangeReducer(submitted, { type: "failed", status, message: "结果未知" });
    expect(unknown.outcomeUnknown).toBe(true);
    expect(canConfirmPhoneChange(unknown)).toBe(true);
    const retry = phoneChangeReducer(unknown, { type: "confirm", key: "unused" });
    expect(retry.confirmRequest).toBe(submitted.confirmRequest);
    expect(retry.confirmRequest?.idempotency_key).toBe("original");
  });
  test.each(["newPhone", "reason"] as const)("changed %s after a rejected request starts a new command", (field) => {
    let state = phoneChangeReducer(ready(), { type: "confirm", key: "old" });
    state = phoneChangeReducer(state, { type: "failed", status: 400, message: "请更正输入" });
    state = phoneChangeReducer(state, { type: "edit", field, value: field === "reason" ? "纠正号码" : "13000000003" });
    expect(state.confirmRequest).toBeNull();
    expect(state.outcomeUnknown).toBe(false);
    state = phoneChangeReducer(state, { type: "confirm", key: "new" });
    expect(state.confirmRequest?.idempotency_key).toBe("new");
  });
  test("409 requires refreshed version and renewed same-person confirmation", () => {
    let state = phoneChangeReducer(ready(), { type: "confirm", key: "old" });
    state = phoneChangeReducer(state, { type: "failed", status: 409, message: "版本冲突" });
    expect(state.needsRefresh).toBe(true);
    expect(state.samePerson).toBe(false);
    expect(state.confirmRequest).toBeNull();
    expect(canConfirmPhoneChange(state)).toBe(false);
    state = phoneChangeReducer(state, { type: "refresh" });
    expect(state.pending).toBe("refresh");
    expect(phoneChangeReducer(state, { type: "same-person", value: true })).toBe(state);
    state = phoneChangeReducer(state, { type: "refreshed", version: 8 });
    expect(state.expectedVersion).toBe(8);
    expect(state.newPhone).toBe("13000000002");
    expect(state.reason).toBe(" 本人换号 ");
    expect(canConfirmPhoneChange(state)).toBe(false);
    state = phoneChangeReducer(state, { type: "same-person", value: true });
    state = phoneChangeReducer(state, { type: "confirm", key: "new" });
    expect(state.confirmRequest).toMatchObject({ expected_version: 8, idempotency_key: "new" });
  });
  test("failed refresh keeps confirmation blocked", () => {
    let state = phoneChangeReducer(ready(), { type: "failed", status: 409, message: "版本冲突" });
    state = phoneChangeReducer(state, { type: "refresh" });
    state = phoneChangeReducer(state, { type: "failed", status: 503, message: "刷新失败" });
    expect(state.needsRefresh).toBe(true);
    expect(state.outcomeUnknown).toBe(false);
    expect(canConfirmPhoneChange(state)).toBe(false);
  });
});
