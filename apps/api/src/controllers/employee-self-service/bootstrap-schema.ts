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

export const EmployeeBootstrapQuerySchema = z.object({
  home_mode: optionalEmployeeQueryValue(z.enum(["inline", "defer"])).default("defer"),
  tasks_mode: optionalEmployeeQueryValue(z.enum(["inline", "defer"])).default("defer"),
});

export type EmployeeBootstrapQuery = z.infer<typeof EmployeeBootstrapQuerySchema>;
