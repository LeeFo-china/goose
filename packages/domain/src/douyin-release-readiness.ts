import { z } from 'zod';

export const DOUYIN_RELEASE_BLOCKER_CODES = [
  'INSTALLATION_MISSING',
  'INSTALLATION_INACTIVE',
  'TENANT_INACTIVE',
  'PUBLIC_PROFILE_MISSING',
  'PUBLIC_PROFILE_INCOMPLETE',
  'PUBLIC_SERVICE_AREA_MISSING',
  'PUBLIC_PROJECT_COUNT_LOW',
  'PUBLIC_PROJECT_PHASE_COVERAGE_LOW',
  'PUBLIC_PROJECT_COMPLETENESS_LOW',
  'PUBLIC_PROJECT_PROGRESS_LOG_LOW',
  'PUBLIC_PROJECT_TEST_CONTENT',
  'PUBLIC_PROJECT_PRIVACY_RISK',
  'BUDGET_PRICING_MISSING',
  'BUDGET_PRICING_DISCLAIMER_MISSING',
  'SMS_UNAVAILABLE',
  'PRIVACY_VERSION_MISSING',
  'HOST_CONFIGURATION_MISSING',
] as const;

export const DOUYIN_RELEASE_WARNING_CODES = [
  'PUBLIC_PROJECT_LOG_LOW',
  'PUBLIC_PROJECT_IMAGE_LOW',
  'HOST_NOT_SMOKED',
  'REVIEW_EVIDENCE_MISSING',
] as const;

export const DOUYIN_RELEASE_FINDING_SEVERITY_VALUES = [
  'blocker',
  'warning',
] as const;

const PublicDateTimeSchema = z.union([
  z.iso.datetime({ offset: true, precision: 0 }),
  z.iso.datetime({ offset: true, precision: 1 }),
  z.iso.datetime({ offset: true, precision: 2 }),
  z.iso.datetime({ offset: true, precision: 3 }),
]);

const SafeFindingDetailsSchema = z.strictObject({
  actual_count: z.int().nonnegative().optional(),
  expected_count: z.int().nonnegative().optional(),
  found_count: z.int().nonnegative().optional(),
  required_count: z.int().nonnegative().optional(),
  project_ids: z.array(z.uuid()).max(100).optional(),
  project_id: z.uuid().optional(),
  host: z.string().trim().min(1).max(80).optional(),
  route: z.string().trim().min(1).max(120).optional(),
  field: z.string().trim().min(1).max(80).optional(),
  phase: z.string().trim().min(1).max(40).optional(),
  reason: z.string().trim().min(1).max(200).optional(),
  metric: z.string().trim().min(1).max(80).optional(),
});

const FindingMessageSchema = z.string().trim().min(1).max(200);

const BlockerFindingSchema = z.strictObject({
  severity: z.literal('blocker'),
  code: z.enum(DOUYIN_RELEASE_BLOCKER_CODES),
  message: FindingMessageSchema,
  details: SafeFindingDetailsSchema,
});

const WarningFindingSchema = z.strictObject({
  severity: z.literal('warning'),
  code: z.enum(DOUYIN_RELEASE_WARNING_CODES),
  message: FindingMessageSchema,
  details: SafeFindingDetailsSchema,
});

export const DouyinReleaseReadinessSchema = z
  .strictObject({
    ready: z.boolean(),
    checked_at: PublicDateTimeSchema,
    tenant: z.strictObject({
      id: z.uuid(),
      name: z.string().trim().min(1).max(120),
    }),
    blockers: z.array(BlockerFindingSchema).max(50),
    warnings: z.array(WarningFindingSchema).max(50),
    metrics: z
      .record(
        z.string().trim().min(1).max(80),
        z.union([
          z.int().nonnegative(),
          z.boolean(),
          z.string().trim().min(1).max(120),
        ]),
      )
      .refine(
        (metrics) => !Object.keys(metrics).some((key) => /phone|secret|token/i.test(key)),
        '指标不能包含敏感字段',
      ),
  })
  .superRefine((result, context) => {
    const isReadyByBlockers = result.blockers.length === 0;
    if (result.ready !== isReadyByBlockers) {
      context.addIssue({
        code: 'custom',
        message: '提审就绪状态必须与阻断项一致',
        path: ['ready'],
      });
    }
  });

export type DouyinReleaseBlockerCode =
  (typeof DOUYIN_RELEASE_BLOCKER_CODES)[number];
export type DouyinReleaseWarningCode =
  (typeof DOUYIN_RELEASE_WARNING_CODES)[number];
export type DouyinReleaseFindingSeverity =
  (typeof DOUYIN_RELEASE_FINDING_SEVERITY_VALUES)[number];
export type DouyinReleaseReadiness = Readonly<
  z.infer<typeof DouyinReleaseReadinessSchema>
>;
