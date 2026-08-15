import { describe, expect, test } from "bun:test";

import {
  buildConversionChainSummary,
  validateConversionEdges,
} from "./supplier-unit-conversion-rules";

const units = [
  { id: "box", symbol: "箱", name: "箱" },
  { id: "piece", symbol: "片", name: "片" },
  { id: "square-meter", symbol: "平方米", name: "平方米" },
];

describe("单位换算链规则", () => {
  test("生成可解释的换算摘要", () => {
    const summary = buildConversionChainSummary(
      [
        { fromUnitId: "box", toUnitId: "piece", factor: "8" },
        { fromUnitId: "piece", toUnitId: "square-meter", factor: "0.18" },
      ],
      units,
      "box",
    );
    expect(summary).toBe("1 箱 = 8 片 = 1.44 平方米");
  });

  test("校验换算边：factor 为正、禁止自环、禁止重复", () => {
    expect(validateConversionEdges([
      { fromUnitId: "box", toUnitId: "piece", factor: "8" },
    ])).toBeNull();
    expect(validateConversionEdges([
      { fromUnitId: "box", toUnitId: "piece", factor: "0" },
    ])).toBe("换算系数必须大于 0");
    expect(validateConversionEdges([
      { fromUnitId: "box", toUnitId: "box", factor: "1" },
    ])).toBe("不允许自环换算");
    expect(validateConversionEdges([
      { fromUnitId: "box", toUnitId: "piece", factor: "8" },
      { fromUnitId: "box", toUnitId: "piece", factor: "8" },
    ])).toBe("换算边不能重复");
  });
});
