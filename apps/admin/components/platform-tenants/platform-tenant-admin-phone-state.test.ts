import { describe, expect, test } from "bun:test";
import {
  canConfirmPhoneChange, canSendPhoneCode, createPhoneChangeState, phoneChangeReducer,
} from "./platform-tenant-admin-phone-state";

const now = Date.parse("2026-10-08T00:00:00Z");
const challenge = { challenge_id: "synthetic-challenge", expires_at: new Date(now + 300_000).toISOString(), cooldown_seconds: 60 };
function ready() {
  let state = createPhoneChangeState(7);
  state = phoneChangeReducer(state, { type: "edit", field: "newPhone", value: "13000000002" });
  state = phoneChangeReducer(state, { type: "sent", challenge, now });
  state = phoneChangeReducer(state, { type: "edit", field: "code", value: "123456" });
  state = phoneChangeReducer(state, { type: "edit", field: "reason", value: "本人换号" });
  return phoneChangeReducer(state, { type: "same-person", value: true });
}

describe("tenant admin phone change state", () => {
  test("requires valid phone, new SMS, reason and same-person confirmation", () => {
    expect(canSendPhoneCode(createPhoneChangeState(7), now)).toBe(false);
    const state = ready();
    expect(canConfirmPhoneChange(state, now)).toBe(true);
    expect(canConfirmPhoneChange({ ...state, challenge: null }, now)).toBe(false);
    expect(canConfirmPhoneChange({ ...state, samePerson: false }, now)).toBe(false);
    expect(canConfirmPhoneChange({ ...state, reason: " " }, now)).toBe(false);
    expect(canConfirmPhoneChange({ ...state, reason: "字".repeat(501) }, now)).toBe(false);
    expect(canConfirmPhoneChange({ ...state, code: "123" }, now)).toBe(false);
  });
  test("cooldown blocks only send; expired challenge blocks new confirm", () => {
    const state = ready();
    expect(canSendPhoneCode(state, now + 59_000)).toBe(false);
    expect(canSendPhoneCode(state, now + 60_000)).toBe(true);
    expect(canConfirmPhoneChange(state, now + 59_000)).toBe(true);
    expect(canConfirmPhoneChange(state, now + 300_000)).toBe(false);
  });
  test("editing phone invalidates challenge and code without bypassing cooldown", () => {
    const state = phoneChangeReducer(ready(), { type: "edit", field: "newPhone", value: "13000000003" });
    expect(state.challenge).toBeNull();
    expect(state.code).toBe("");
    expect(canSendPhoneCode(state, now)).toBe(false);
    expect(canConfirmPhoneChange(state, now)).toBe(false);
  });
  test("pending submit ignores edits and duplicate actions", () => {
    const state = phoneChangeReducer(ready(), { type: "confirm", key: "first", now });
    expect(state.pending).toBe("confirm");
    expect(phoneChangeReducer(state, { type: "edit", field: "reason", value: "changed" })).toBe(state);
    expect(phoneChangeReducer(state, { type: "same-person", value: false })).toBe(state);
    expect(phoneChangeReducer(state, { type: "confirm", key: "second", now })).toBe(state);
    expect(canSendPhoneCode(state, now + 60_000)).toBe(false);
  });
  test("unknown outcome retries identical payload and key, even after local expiry", () => {
    const submitted = phoneChangeReducer(ready(), { type: "confirm", key: "original", now });
    const unknown = phoneChangeReducer(submitted, { type: "failed", message: "网络异常" });
    expect(unknown.outcomeUnknown).toBe(true);
    expect(canConfirmPhoneChange(unknown, now + 600_000)).toBe(true);
    const retry = phoneChangeReducer(unknown, { type: "confirm", key: "unused", now: now + 600_000 });
    expect(retry.confirmRequest).toEqual(submitted.confirmRequest);
    expect(retry.confirmRequest).toMatchObject({ new_phone: "13000000002", expected_version: 7,
      challenge_id: challenge.challenge_id, code: "123456", reason: "本人换号",
      same_person_confirmed: true, idempotency_key: "original" });
  });
  test.each(["newPhone", "code", "reason"] as const)("changed %s generates a new command key", (field) => {
    let state = phoneChangeReducer(ready(), { type: "confirm", key: "old", now });
    state = phoneChangeReducer(state, { type: "failed", message: "未知" });
    state = phoneChangeReducer(state, { type: "edit", field, value: field === "reason" ? "纠正号码" : "13000000003" });
    expect(state.confirmRequest).toBeNull();
    if (field === "newPhone") state = phoneChangeReducer(state, { type: "sent", challenge, now });
    state = phoneChangeReducer(state, { type: "edit", field: "code", value: "654321" });
    state = phoneChangeReducer(state, { type: "confirm", key: "new", now });
    expect(state.confirmRequest?.idempotency_key).toBe("new");
  });
  test("wrong OTP 400 keeps challenge and permits corrected OTP", () => {
    let state = phoneChangeReducer(ready(), { type: "confirm", key: "wrong", now });
    state = phoneChangeReducer(state, { type: "failed", status: 400, message: "验证码错误" });
    expect(state.needsRefresh).toBe(false);
    expect(state.challenge).toEqual(challenge);
    state = phoneChangeReducer(state, { type: "edit", field: "code", value: "654321" });
    expect(canConfirmPhoneChange(state, now)).toBe(true);
    expect(phoneChangeReducer(state, { type: "confirm", key: "corrected", now }).confirmRequest?.idempotency_key).toBe("corrected");
  });
  test("409 requires refreshed version and a fresh challenge", () => {
    let state = phoneChangeReducer(ready(), { type: "confirm", key: "old", now });
    state = phoneChangeReducer(state, { type: "failed", status: 409, message: "版本冲突" });
    expect(state.needsRefresh).toBe(true);
    expect(state.challenge).toBeNull();
    expect(state.confirmRequest).toBeNull();
    expect(canSendPhoneCode(state, now + 60_000)).toBe(false);
    state = phoneChangeReducer(state, { type: "refreshed", version: 8 });
    expect(state.expectedVersion).toBe(8);
    expect(state.samePerson).toBe(false);
    expect(canSendPhoneCode(state, now + 60_000)).toBe(true);
    expect(canConfirmPhoneChange(state, now + 60_000)).toBe(false);
  });
  test("exhausted OTP requires resend without treating the result as unknown", () => {
    const submitted = phoneChangeReducer(ready(), { type: "confirm", key: "exhausted", now });
    const state = phoneChangeReducer(submitted, { type: "failed", status: 429,
      code: "TENANT_ADMIN_PHONE_CODE_EXHAUSTED", message: "请重新发送" });
    expect(state.challenge).toBeNull();
    expect(state.confirmRequest).toBeNull();
    expect(state.outcomeUnknown).toBe(false);
    expect(canConfirmPhoneChange(state, now)).toBe(false);
    expect(canSendPhoneCode(state, now + 60_000)).toBe(true);
  });
  test("send retries preserve command key; successful resend replaces challenge", () => {
    let state = phoneChangeReducer(ready(), { type: "send", key: "send-one", now: now + 60_000 });
    expect(state.challenge).toBeNull();
    state = phoneChangeReducer(state, { type: "failed", message: "发送结果未知" });
    state = phoneChangeReducer(state, { type: "send", key: "unused", now: now + 60_000 });
    expect(state.sendRequest?.idempotency_key).toBe("send-one");
    state = phoneChangeReducer(state, { type: "sent", challenge: { ...challenge, challenge_id: "next" }, now: now + 60_000 });
    expect(state.challenge?.challenge_id).toBe("next");
    expect(state.code).toBe("");
    expect(state.sendRequest).toBeNull();
  });
});
