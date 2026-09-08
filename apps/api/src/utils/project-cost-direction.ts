import { Errors } from "@/errors/error-factory";
import { addMoneyCents, type FixedPointMoneyContext } from "./fixed-point-money";

export type ProjectCostDirection = "increase" | "decrease";

const defaultContext: FixedPointMoneyContext = {
  parseErrorMessage: "解析项目成本事件失败",
  overflowMessage: "项目成本超过安全汇总边界",
  details: null,
};

export function parseProjectCostDirection(value: unknown): ProjectCostDirection {
  // Legacy callers predate the additive direction field; all their facts increase cost.
  if (value === undefined || value === "increase") return "increase";
  if (value === "decrease") return "decrease";
  throw Errors.dbError("解析项目成本方向失败", value);
}

export function projectCostEventCents(
  amount: unknown,
  direction: unknown,
  context: FixedPointMoneyContext = defaultContext,
): bigint {
  const sign = parseProjectCostDirection(direction);
  const cents = addMoneyCents(BigInt(0), amount, context);
  return sign === "decrease" ? -cents : cents;
}
