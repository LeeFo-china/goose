import { Errors } from "@/errors/error-factory";
import { matchesPostgresError } from "@/errors/postgres-error-details";

const POSTGRES_CHECK_VIOLATION = "23514";
const PENDING_CONFIG_ERROR =
  "PLATFORM_PAYMENT_CONFIG_PENDING_ORDERS";
const LEGACY_PENDING_RECHARGE_CONFIG_ERROR =
  "PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS";

export async function runPlatformPaymentConfigMutation<Result>(
  mutation: () => Promise<Result>,
) {
  try {
    return await mutation();
  } catch (error) {
    if (matchesPostgresError(
      error,
      POSTGRES_CHECK_VIOLATION,
      PENDING_CONFIG_ERROR,
    ) || matchesPostgresError(
      error,
      POSTGRES_CHECK_VIOLATION,
      LEGACY_PENDING_RECHARGE_CONFIG_ERROR,
    )) {
      throw Errors.business(
        409,
        "存在使用当前微信支付配置的待支付订单，请等待订单支付或关闭后再修改",
        PENDING_CONFIG_ERROR,
      );
    }
    throw error;
  }
}
