// src/errors/error-factory.ts
import { AppError } from "./app-error";
import { ErrorCodes } from "./error-codes.ts";
import { z } from "zod";

export const Errors = {
  /**
   * 通用 400 错误
   */
  badRequest: (msg: string | readonly unknown[]) => {
    // 确保传给 AppError 的第二个参数一定是 string
    const message = Array.isArray(msg) ? "参数校验失败" : (msg as string);
    const details = Array.isArray(msg) ? msg : undefined;

    return new AppError(400, message, ErrorCodes.VALIDATION_ERROR, details);
  },

  /**
   * 专门处理 Zod 验证错误
   */
  fromZod: (error: z.ZodError) => {
    // 1. 安全地获取第一条错误 (使用可选链 ?. )
    const firstIssue = error.issues[0];

    // 2. 如果没有找到 issue (理论上不该发生)，提供一个保底的字符串
    if (!firstIssue) {
      return new AppError(400, "请求参数格式非法", ErrorCodes.VALIDATION_ERROR);
    }

    // 3. 格式化路径：将数组 [ "address", "city" ] 变为 "address.city"
    const path = firstIssue.path.join(".");

    // 4. 拼接最终展示给前端的 message
    const message = path
      ? `字段 [${path}] 校验失败: ${firstIssue.message}`
      : firstIssue.message;

    // 5. 将完整的 issues 数组作为 details 传入，方便前端或开发者查看具体原因
    return new AppError(
      400,
      message,
      ErrorCodes.VALIDATION_ERROR,
      error.issues,
    );
  },

  notFound: (msg: string) => new AppError(404, msg, ErrorCodes.USER_NOT_FOUND),

  unauthorized: (
    msg: string = "未授权",
    code: string = ErrorCodes.UNAUTHORIZED,
    details?: unknown,
  ) => new AppError(401, msg, code, details),

  forbidden: () => new AppError(403, "无权限", ErrorCodes.FORBIDDEN),

  dbError: (msg = "数据库错误", details?: unknown) =>
    new AppError(500, msg, ErrorCodes.DB_ERROR, details),
};
