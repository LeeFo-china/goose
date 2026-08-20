import {
  DouyinBudgetEstimateRequestSchema,
  DouyinBudgetEstimateResultSchema,
  DouyinBudgetPublicConfigSchema,
  type DouyinBudgetEstimateRequest,
} from "@gooes/domain";
import { z } from "zod";

export const DouyinBudgetEmptyInputSchema = z.strictObject({});
export const CreateDouyinBudgetEstimateSchema =
  DouyinBudgetEstimateRequestSchema;

export {
  DouyinBudgetEstimateRequestSchema,
  DouyinBudgetEstimateResultSchema,
  DouyinBudgetPublicConfigSchema,
};
export type CreateDouyinBudgetEstimate = DouyinBudgetEstimateRequest;
