import { z } from "zod";

export function optionalEmployeeQueryValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (value == null) {
      return undefined;
    }

    if (typeof value === "string") {
      const normalized = value.trim();
      if (
        normalized === "" ||
        normalized === "undefined" ||
        normalized === "null"
      ) {
        return undefined;
      }

      return normalized;
    }

    return value;
  }, schema.optional());
}

function employeeBooleanQueryValue(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (value == null || value === "") {
      return undefined;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalized)) {
        return true;
      }
      if (["false", "0", "no", "off"].includes(normalized)) {
        return false;
      }
    }

    return value;
  }, z.boolean().default(defaultValue));
}

export const EmployeeBootstrapQuerySchema = z.object({
  home_mode: optionalEmployeeQueryValue(z.enum(["inline", "defer"])).default("defer"),
  tasks_mode: optionalEmployeeQueryValue(z.enum(["inline", "defer"])).default("defer"),
  debug_timing: employeeBooleanQueryValue(false),
});

export type EmployeeBootstrapQuery = z.infer<typeof EmployeeBootstrapQuerySchema>;
