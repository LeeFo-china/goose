import { describe, expect, test } from "bun:test";
import {
  beginIdempotentSubmission,
  createIdempotencyState,
  createUuidV4IdempotencyKey,
  failIdempotentSubmission,
  succeedIdempotentSubmission,
  updateIdempotencyDraft,
} from "./idempotency";

const FIRST_KEY = "11111111-1111-4111-8111-111111111111";
const SECOND_KEY = "22222222-2222-4222-8222-222222222222";
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function createKeyFactory(keys: string[]) {
  let calls = 0;
  return {
    factory: () => keys[calls++] ?? (() => { throw new Error("unexpected key rotation"); })(),
    calls: () => calls,
  };
}

describe("idempotency state", () => {
  test("keeps one key throughout a draft, failure, and retry", () => {
    const keys = createKeyFactory([FIRST_KEY]);
    const initial = createIdempotencyState({ name: "", area: 90 }, keys.factory);
    const edited = updateIdempotencyDraft(initial, { name: "李先生", area: 90 }, keys.factory);
    const firstAttempt = beginIdempotentSubmission(edited);
    const failed = failIdempotentSubmission(firstAttempt.state);
    const retry = beginIdempotentSubmission(failed);

    expect(initial.key).toBe(FIRST_KEY);
    expect(edited.key).toBe(FIRST_KEY);
    expect(firstAttempt).toMatchObject({ shouldSubmit: true, key: FIRST_KEY });
    expect(failed).toMatchObject({ status: "failed", key: FIRST_KEY });
    expect(retry).toMatchObject({ shouldSubmit: true, key: FIRST_KEY });
    expect(keys.calls()).toBe(1);
  });

  test("rotates after a failed attempt when digest-bearing fields change", () => {
    const keys = createKeyFactory([FIRST_KEY, SECOND_KEY]);
    const initial = createIdempotencyState({ name: "李先生", area: 90 }, keys.factory);
    const failed = failIdempotentSubmission(beginIdempotentSubmission(initial).state);
    const edited = updateIdempotencyDraft(
      failed,
      { name: "李先生", area: 100 },
      keys.factory,
    );

    expect(edited).toMatchObject({
      status: "draft",
      key: SECOND_KEY,
      draft: { name: "李先生", area: 100 },
    });
    expect(keys.calls()).toBe(2);
  });

  test("freezes the attempt snapshot while a submission is in flight", () => {
    const initial = createIdempotencyState({ name: "李先生", area: 90 }, () => FIRST_KEY);
    const submitting = beginIdempotentSubmission(initial).state;
    const ignoredEdit = updateIdempotencyDraft(
      submitting,
      { name: "李先生", area: 100 },
      () => SECOND_KEY,
    );
    const succeeded = succeedIdempotentSubmission(ignoredEdit);

    expect(ignoredEdit).toBe(submitting);
    expect(succeeded.lastSuccess?.snapshot).toEqual({ name: "李先生", area: 90 });
  });

  test("retains the successful key and submitted snapshot", () => {
    const source = { name: "李先生", area: 90 };
    const keys = createKeyFactory([FIRST_KEY]);
    const initial = createIdempotencyState(source, keys.factory);
    const submitting = beginIdempotentSubmission(initial);
    const succeeded = succeedIdempotentSubmission(submitting.state);

    source.name = "外部修改";
    expect(succeeded).toMatchObject({
      status: "succeeded",
      key: FIRST_KEY,
      lastSuccess: {
        key: FIRST_KEY,
        snapshot: { name: "李先生", area: 90 },
      },
    });
    expect(succeeded.lastSuccess?.snapshot).not.toBe(source);
  });

  test("returns the same success without a new submission when clicked again unedited", () => {
    const keys = createKeyFactory([FIRST_KEY]);
    const initial = createIdempotencyState({ name: "李先生" }, keys.factory);
    const succeeded = succeedIdempotentSubmission(beginIdempotentSubmission(initial).state);
    const repeated = beginIdempotentSubmission(succeeded);

    expect(repeated).toEqual({ state: succeeded, shouldSubmit: false, key: FIRST_KEY });
    expect(repeated.state).toBe(succeeded);
    expect(keys.calls()).toBe(1);
  });

  test("rotates once after an actual post-success business-field edit", () => {
    const keys = createKeyFactory([FIRST_KEY, SECOND_KEY]);
    const initial = createIdempotencyState({ name: "李先生", area: 90 }, keys.factory);
    const succeeded = succeedIdempotentSubmission(beginIdempotentSubmission(initial).state);
    const unchanged = updateIdempotencyDraft(
      succeeded,
      { name: "李先生", area: 90 },
      keys.factory,
    );
    const edited = updateIdempotencyDraft(
      unchanged,
      { name: "李先生", area: 100 },
      keys.factory,
    );
    const editedAgain = updateIdempotencyDraft(
      edited,
      { name: "李先生", area: 110 },
      keys.factory,
    );

    expect(unchanged).toBe(succeeded);
    expect(edited).toMatchObject({
      status: "draft",
      key: SECOND_KEY,
      draft: { name: "李先生", area: 100 },
      lastSuccess: {
        key: FIRST_KEY,
        snapshot: { name: "李先生", area: 90 },
      },
    });
    expect(editedAgain.key).toBe(SECOND_KEY);
    expect(keys.calls()).toBe(2);
  });

  test("does not start two simultaneous submissions", () => {
    const initial = createIdempotencyState({ name: "李先生" }, () => FIRST_KEY);
    const first = beginIdempotentSubmission(initial);
    const duplicate = beginIdempotentSubmission(first.state);

    expect(first.shouldSubmit).toBe(true);
    expect(duplicate).toEqual({ state: first.state, shouldSubmit: false, key: FIRST_KEY });
  });

  test("the default and injected factories must produce UUID v4 keys", () => {
    const generated = Array.from({ length: 32 }, () => createUuidV4IdempotencyKey());

    expect(generated.every((key) => UUID_V4_PATTERN.test(key))).toBe(true);
    expect(new Set(generated).size).toBe(generated.length);
    expect(() => createIdempotencyState({ name: "" }, () => "not-a-uuid"))
      .toThrow("幂等键必须是 UUID v4");
  });
});
