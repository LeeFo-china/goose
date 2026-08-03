import {
  VIRTUAL_BENEFIT_TYPES,
  VIRTUAL_DURATION_UNITS,
  VIRTUAL_PAYMENT_ENVIRONMENTS,
  VIRTUAL_PRODUCT_STATUSES,
  VIRTUAL_REFUND_TEMPLATES,
} from '@gooes/domain';
import { z } from 'zod';

import { PaginationQuerySchema } from './request';

const GrantRuleSchema = z.discriminatedUnion('benefit_type', [
  z.object({
    benefit_type: z.literal('duration'),
    entitlement_code: z.string().trim().min(1).max(100),
    duration_value: z.number().int().positive(),
    duration_unit: z.enum(VIRTUAL_DURATION_UNITS),
    expiry_mode: z.literal('fixed_duration'),
  }).strict(),
  z.object({
    benefit_type: z.enum(['count', 'points', 'quota']),
    entitlement_code: z.string().trim().min(1).max(100),
    grant_amount: z.number().int().positive(),
    expiry_mode: z.enum(['permanent', 'fixed_duration']),
    expiry_value: z.number().int().positive().optional(),
    expiry_unit: z.enum(VIRTUAL_DURATION_UNITS).optional(),
  }).strict().superRefine((value, context) => {
    const hasFixedExpiry = value.expiry_mode === 'fixed_duration';
    const hasExpiryShape = value.expiry_value !== undefined &&
      value.expiry_unit !== undefined;

    if (hasFixedExpiry !== hasExpiryShape) {
      context.addIssue({
        code: 'custom',
        message: '固定有效期必须同时提供数值和单位',
      });
    }
  }),
]);

export const PlatformVirtualProductListQuerySchema = PaginationQuerySchema
  .extend({
    keyword: z.string().trim().min(1).max(120).optional(),
    product_type: z.enum(VIRTUAL_BENEFIT_TYPES).optional(),
    status: z.enum(VIRTUAL_PRODUCT_STATUSES).optional(),
    production_validation_status: z.enum([
      'pending',
      'valid',
      'invalid',
      'out_of_sync',
    ]).optional(),
  })
  .strict();

const PlatformVirtualProductMutationBaseSchema = z.object({
  name: z.string().trim().min(1).max(100),
  product_type: z.enum(VIRTUAL_BENEFIT_TYPES),
  amount_fen: z.number().int().positive().max(2_147_483_647),
  image_file_id: z.uuid(),
  purchase_notes: z.string().trim().max(500),
  refund_template: z.enum(VIRTUAL_REFUND_TEMPLATES),
  grant_rule: GrantRuleSchema,
}).strict();

export const CreatePlatformVirtualProductSchema =
  PlatformVirtualProductMutationBaseSchema.superRefine((value, context) => {
  if (value.product_type !== value.grant_rule.benefit_type) {
    context.addIssue({
      code: 'custom',
      path: ['grant_rule', 'benefit_type'],
      message: '发放规则类型必须与商品类型一致',
    });
  }
});

export const UpdatePlatformVirtualProductSchema =
  PlatformVirtualProductMutationBaseSchema.partial()
    .extend({ version: z.number().int().positive() })
    .strict()
    .superRefine((value, context) => {
      if (
        value.product_type &&
        value.grant_rule &&
        value.product_type !== value.grant_rule.benefit_type
      ) {
        context.addIssue({
          code: 'custom',
          path: ['grant_rule', 'benefit_type'],
          message: '发放规则类型必须与商品类型一致',
        });
      }
    });

export const PlatformVirtualProductParamsSchema = z.object({
  id: z.uuid(),
}).strict();

export const PlatformVirtualProductChannelParamsSchema = z.object({
  id: z.uuid(),
  environment: z.enum(VIRTUAL_PAYMENT_ENVIRONMENTS),
}).strict();

export const PlatformVirtualProductEmptySchema = z.object({}).strict();

export const PlatformVirtualProductVersionCommandSchema = z.object({
  version: z.number().int().positive(),
}).strict();

export type PlatformVirtualProductListQueryInput = z.infer<
  typeof PlatformVirtualProductListQuerySchema
>;
export type CreatePlatformVirtualProductInput = z.infer<
  typeof CreatePlatformVirtualProductSchema
>;
export type UpdatePlatformVirtualProductInput = z.infer<
  typeof UpdatePlatformVirtualProductSchema
>;
export type PlatformVirtualProductVersionCommandInput = z.infer<
  typeof PlatformVirtualProductVersionCommandSchema
>;
