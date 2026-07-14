import { z } from "zod";
import {
  PROJECT_OPERATIONAL_RISK_SEVERITY_VALUES,
  PROJECT_OPERATIONAL_RISK_TYPE_VALUES,
} from "@gooes/domain";

import { PaginationQuerySchema } from "@/schema/request";

function optionalQueryValue<T extends z.ZodTypeAny>(schema: T) {
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

function optionalJsonValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (value == null) {
      return undefined;
    }

    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized === "") {
        return undefined;
      }

      return normalized;
    }

    return value;
  }, schema.optional());
}

const ProjectOperationalRiskTypeSchema = z.enum(
  PROJECT_OPERATIONAL_RISK_TYPE_VALUES,
);

const ProjectOperationalRiskSeveritySchema = z.enum(
  PROJECT_OPERATIONAL_RISK_SEVERITY_VALUES,
);

const ProjectOperationalRiskQueryKeywordSchema = z
  .string()
  .trim()
  .max(100, "项目关键词不能超过 100 个字符");

const ProjectOperationalRiskJsonKeywordSchema = z
  .string()
  .trim()
  .max(100, "项目关键词不能超过 100 个字符");

export const ProjectOperationalRiskListQuerySchema =
  PaginationQuerySchema.extend({
    risk_type: optionalQueryValue(ProjectOperationalRiskTypeSchema),
    severity: optionalQueryValue(ProjectOperationalRiskSeveritySchema),
    keyword: optionalQueryValue(ProjectOperationalRiskQueryKeywordSchema),
  });

export const ProjectOperationalRiskAiSummaryBodySchema = z.strictObject({
  risk_type: optionalJsonValue(ProjectOperationalRiskTypeSchema),
  severity: optionalJsonValue(ProjectOperationalRiskSeveritySchema),
  keyword: optionalJsonValue(ProjectOperationalRiskJsonKeywordSchema),
});

export type ProjectOperationalRiskListQuery = z.infer<
  typeof ProjectOperationalRiskListQuerySchema
>;
export type ProjectOperationalRiskAiSummaryBody = z.infer<
  typeof ProjectOperationalRiskAiSummaryBodySchema
>;
