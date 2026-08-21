import {
  DouyinBudgetEstimateRequestSchema,
  DouyinBudgetEstimateResultSchema,
  DouyinBudgetAiExplanationResponseSchema,
  DouyinBudgetPublicConfigSchema,
  type DouyinBudgetEstimateRequest,
} from "@gooes/domain";
import { z } from "zod";

export const DouyinBudgetEmptyInputSchema = z.strictObject({});
export const DouyinBudgetAiAnalysisParamsSchema = z.strictObject({
  id: z.uuid('无效的 ID 格式'),
});
export const DouyinBudgetAiAnalysisBodySchema = z.strictObject({
  retry: z.boolean().optional().default(false),
});
export const CreateDouyinBudgetEstimateSchema =
  DouyinBudgetEstimateRequestSchema;

export {
  DouyinBudgetEstimateRequestSchema,
  DouyinBudgetEstimateResultSchema,
  DouyinBudgetAiExplanationResponseSchema,
  DouyinBudgetPublicConfigSchema,
};
export type CreateDouyinBudgetEstimate = DouyinBudgetEstimateRequest;
