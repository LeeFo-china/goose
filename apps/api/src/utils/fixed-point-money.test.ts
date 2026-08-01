import { describe, expect, test } from "bun:test";
import {
  addMoneyCents,
  moneyCentsToSafeNumber,
} from "@/utils/fixed-point-money";

const context = {
  parseErrorMessage: "解析供应商金额失败",
  overflowMessage: "供应商金额超过安全汇总边界",
  details: null,
};

describe("fixed point money", () => {
  test("adds decimal strings as exact cents", () => {
    let cents = BigInt(0);
    cents = addMoneyCents(cents, "0.01", context);
    cents = addMoneyCents(cents, "0.01", context);
    cents = addMoneyCents(cents, "0.01", context);

    expect(cents).toBe(BigInt(3));
    expect(moneyCentsToSafeNumber(cents, context)).toBe(0.03);
  });

  test("accepts the safe cent boundary and rejects larger totals", () => {
    const safeCents = addMoneyCents(BigInt(0), "90071992547409.91", context);
    expect(moneyCentsToSafeNumber(safeCents, context)).toBe(
      90_071_992_547_409.9,
    );

    const unsafeCents = addMoneyCents(
      BigInt(0),
      "90071992547409.92",
      context,
    );
    expect(() => moneyCentsToSafeNumber(unsafeCents, context))
      .toThrowError(expect.objectContaining({
        statusCode: 422,
        code: "FINANCE_MONEY_EXCEEDS_SAFE_RANGE",
      }));
  });

  test("rejects the database maximum instead of rounding through Number", () => {
    const cents = addMoneyCents(
      BigInt(0),
      "9999999999999999.99",
      context,
    );

    expect(() => moneyCentsToSafeNumber(cents, context))
      .toThrowError(expect.objectContaining({
        statusCode: 422,
        code: "FINANCE_MONEY_EXCEEDS_SAFE_RANGE",
      }));
  });

  test("accepts ordinary numbers but rejects ambiguous high numbers", () => {
    for (const amount of [12.34, 1.15]) {
      expect(moneyCentsToSafeNumber(
        addMoneyCents(BigInt(0), amount, context),
        context,
      )).toBe(amount);
    }

    for (const amount of [
      90_071_992_547_409.91,
      90_071_992_547_409.92,
    ]) {
      expect(() => addMoneyCents(BigInt(0), amount, context))
        .toThrowError(expect.objectContaining({
          statusCode: 422,
          code: "FINANCE_MONEY_EXCEEDS_SAFE_RANGE",
      }));
    }
  });

  test("rejects invalid or sub-cent numeric facts", () => {
    for (const amount of [Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1.001]) {
      expect(() => addMoneyCents(BigInt(0), amount, context))
        .toThrowError(expect.objectContaining({
          statusCode: 500,
          code: "DB_ERROR",
        }));
    }
  });
});
