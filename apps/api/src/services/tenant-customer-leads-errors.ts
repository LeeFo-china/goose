import { CUSTOMER_LEAD_ERROR_CONFIG, type CustomerLeadErrorCode } from "@gooes/domain";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";

export async function customerLeadBoundary<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof AppError) || !error.code.startsWith("DOUYIN_")) throw error;
    if (error.code.endsWith("_COMMAND_INVALID")) {
      throw Errors.business(400, "线索操作参数无效", "VALIDATION_ERROR");
    }
    if (error.code === "DOUYIN_LEAD_CUSTOMER_UPSERT_FAILED") {
      throw Errors.dbError("客户线索转化失败");
    }
    const code = error.code === "DOUYIN_LEAD_ACTOR_NOT_FOUND"
      ? "CUSTOMER_LEAD_EMPLOYEE_REQUIRED"
      : error.code === "DOUYIN_LEAD_CONVERSION_STATE_INVALID"
        ? "CUSTOMER_LEAD_RESPONSE_INVALID"
        : error.code.replace("DOUYIN_MEASUREMENT_APPOINTMENT_", "CUSTOMER_LEAD_APPOINTMENT_")
          .replace("DOUYIN_LEAD_", "CUSTOMER_LEAD_");
    if (!Object.hasOwn(CUSTOMER_LEAD_ERROR_CONFIG, code)) throw error;
    const config = CUSTOMER_LEAD_ERROR_CONFIG[code as CustomerLeadErrorCode];
    throw Errors.business(config.statusCode, config.message, code);
  }
}
