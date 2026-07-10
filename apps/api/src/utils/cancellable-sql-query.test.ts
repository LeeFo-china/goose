import { describe, expect, mock, test } from "bun:test";
import { executeCancellableSqlQuery } from "./cancellable-sql-query";

function cancellablePromise<Value>(promise: Promise<Value>, cancel: () => void) {
  return Object.assign(promise, { cancel: mock(cancel) });
}

describe("executeCancellableSqlQuery", () => {
  test("returns a query result without a signal", async () => {
    const query = cancellablePromise(Promise.resolve(["row"]), () => undefined);

    await expect(executeCancellableSqlQuery(query)).resolves.toEqual(["row"]);
    expect(query.cancel).not.toHaveBeenCalled();
  });

  test("cancels a pending query when the signal aborts", async () => {
    const controller = new AbortController();
    let rejectQuery: ((reason: unknown) => void) | undefined;
    const query = cancellablePromise(
      new Promise<never>((_resolve, reject) => { rejectQuery = reject; }),
      () => rejectQuery?.(controller.signal.reason),
    );

    const result = executeCancellableSqlQuery(query, controller.signal);
    controller.abort("deadline");

    await expect(result).rejects.toBe("deadline");
    expect(query.cancel).toHaveBeenCalledTimes(1);
  });

  test("cancels immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort("already timed out");
    const query = cancellablePromise(Promise.resolve([]), () => undefined);

    await expect(executeCancellableSqlQuery(query, controller.signal))
      .rejects.toBe("already timed out");
    expect(query.cancel).toHaveBeenCalledTimes(1);
  });

  test("removes the abort listener after the query settles", async () => {
    const controller = new AbortController();
    const query = cancellablePromise(Promise.resolve(["row"]), () => undefined);

    await executeCancellableSqlQuery(query, controller.signal);
    controller.abort("too late");

    expect(query.cancel).not.toHaveBeenCalled();
  });
});
