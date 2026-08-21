import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryRoot = await mkdtemp(join(tmpdir(), 'gooes-domain-consumer-'));

try {
  await execFileAsync('pnpm', ['pack', '--pack-destination', temporaryRoot], {
    cwd: packageRoot,
    maxBuffer: 10 * 1024 * 1024,
  });

  const archiveName = (await readdir(temporaryRoot)).find((name) =>
    name.endsWith('.tgz'),
  );
  if (!archiveName) {
    throw new Error('未生成 domain package archive');
  }

  const consumerRoot = join(temporaryRoot, 'consumer');
  await mkdir(consumerRoot);
  await writeFile(
    join(consumerRoot, 'package.json'),
    JSON.stringify({ name: 'domain-packed-consumer', private: true, type: 'module' }),
  );
  await execFileAsync(
    'pnpm',
    [
      'add',
      '--offline',
      '--ignore-scripts',
      join(temporaryRoot, archiveName),
      'zod@4.4.2',
      'typescript@5.9.3',
    ],
    { cwd: consumerRoot, maxBuffer: 10 * 1024 * 1024 },
  );

  await writeFile(
    join(consumerRoot, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'Bundler',
        noEmit: true,
        strict: true,
        target: 'ES2022',
      },
      include: ['verify.ts'],
    }),
  );
  await writeFile(
    join(consumerRoot, 'verify.ts'),
    `import {
  EMPLOYEE_SERVICE_ACCESS_STATUS_VALUES,
  DOUYIN_DEFAULT_CONTACT_SLA_TEXT,
  DouyinRuntimeConfigSchema,
  EmployeeServiceAccessSummarySchema,
  PLATFORM_SERVICE_TRIAL_STATUS_VALUES,
  SERVICE_TRIAL_FOLLOW_UP_STATUS_VALUES,
  SERVICE_TRIAL_FOLLOW_UP_TYPE_VALUES,
  SERVICE_TRIAL_NOTIFICATION_EVENT_VALUES,
  PlatformServiceTrialScopeSchema,
  SiteContentDraftBlockSchema,
  type PlatformServiceTrialScopeV1,
  type PlatformServiceTrialStatus,
  type ServiceTrialFollowUpStatus,
  type ServiceTrialFollowUpType,
  type ServiceTrialNotificationEvent,
  type EmployeeServiceAccessSummary,
  type DouyinRuntimeConfigDto,
  type DouyinRuntimeConfigInput,
  type SiteContentDraftBlock,
  type SiteContentPublicDetail,
  type SiteContentPublicSummary,
} from '@gooes/domain';
import { z } from 'zod';

const schema: z.ZodType<SiteContentDraftBlock> = SiteContentDraftBlockSchema;
const trialScopeSchema: z.ZodType<PlatformServiceTrialScopeV1> =
  PlatformServiceTrialScopeSchema;
const trialStatus: PlatformServiceTrialStatus =
  PLATFORM_SERVICE_TRIAL_STATUS_VALUES[2];
const followUpType: ServiceTrialFollowUpType =
  SERVICE_TRIAL_FOLLOW_UP_TYPE_VALUES[0];
const followUpStatus: ServiceTrialFollowUpStatus =
  SERVICE_TRIAL_FOLLOW_UP_STATUS_VALUES[1];
const notificationEvent: ServiceTrialNotificationEvent =
  SERVICE_TRIAL_NOTIFICATION_EVENT_VALUES[5];
const employeeAccess: EmployeeServiceAccessSummary =
  EmployeeServiceAccessSummarySchema.parse({
    can_enter_workspace: false,
    readonly: false,
    access_mode: 'service_blocked',
    access_level: 'none',
    access_status: EMPLOYEE_SERVICE_ACCESS_STATUS_VALUES[5],
    trial_id: null,
    trial_status: null,
    starts_at: null,
    ends_at: null,
    title: '审核中',
    message: '请等待平台审核',
    primary_action: null,
    secondary_action: null,
    evaluated_at: '2026-08-12T00:00:00.000Z',
  });
const runtimeConfigInput: DouyinRuntimeConfigInput = {
  brand: { logo_url: null, qualifications: [] },
  theme: { primary_color: '#C45A32', navigation_text_color: 'black' },
  features: {
    cases: true,
    sites: true,
    sms_lead: true,
    douyin_phone: false,
    phone_capture_mode: 'sms',
  },
  home_banners: [],
  trust_metrics: [],
  privacy_policy_version: '2026-08-21',
};
const runtimeConfig: DouyinRuntimeConfigDto =
  DouyinRuntimeConfigSchema.parse(runtimeConfigInput);

const assertTypes = (
  block: SiteContentDraftBlock,
  detail: SiteContentPublicDetail,
): SiteContentPublicSummary => {
  if (block.type === 'heading') {
    const level: 2 | 3 = block.level;
    void level;
  }
  return detail;
};

void schema;
void assertTypes;
void trialScopeSchema;
void trialStatus;
void followUpType;
void followUpStatus;
void notificationEvent;
void employeeAccess;
void runtimeConfig;
void DOUYIN_DEFAULT_CONTACT_SLA_TEXT;
`,
  );
  await execFileAsync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json', '--noEmit'], {
    cwd: consumerRoot,
  });

  await writeFile(
    join(consumerRoot, 'verify.mjs'),
    `import {
  EMPLOYEE_SERVICE_ACCESS_STATUS_VALUES,
  DOUYIN_DEFAULT_CONTACT_SLA_TEXT,
  DouyinRuntimeConfigSchema,
  EmployeeServiceAccessSummarySchema,
  PLATFORM_SERVICE_TRIAL_STATUS_VALUES,
  SERVICE_TRIAL_FOLLOW_UP_STATUS_VALUES,
  SERVICE_TRIAL_FOLLOW_UP_TYPE_VALUES,
  SERVICE_TRIAL_NOTIFICATION_EVENT_VALUES,
  PlatformServiceTrialScopeSchema,
  SiteContentDraftBlockSchema,
} from '@gooes/domain';
import { z } from 'zod';

const expectedTrialStatuses = [
  'pending_review',
  'scheduled',
  'active',
  'grace_period',
  'expired',
  'rejected',
  'withdrawn',
  'revoked',
  'converted',
];
const expectedFollowUpTypes = ['phone', 'wechat', 'online_meeting', 'onsite', 'other'];
const expectedFollowUpStatuses = ['pending', 'completed', 'canceled'];
const expectedNotificationEvents = [
  'application_submitted', 'approved', 'rejected', 'extended', 'revoked',
  'expires_in_7_days', 'expires_in_3_days', 'expires_in_1_day',
  'entered_grace', 'expired', 'converted',
];

if (!(SiteContentDraftBlockSchema instanceof z.ZodType)) {
  throw new Error('packed domain schema 与 consumer 使用了不同的 Zod 类型身份');
}

if (!(PlatformServiceTrialScopeSchema instanceof z.ZodType)) {
  throw new Error('packed trial scope schema 与 consumer 使用了不同的 Zod 类型身份');
}

if (!(EmployeeServiceAccessSummarySchema instanceof z.ZodType)) {
  throw new Error('packed employee service access schema 与 consumer 使用了不同的 Zod 类型身份');
}

if (!(DouyinRuntimeConfigSchema instanceof z.ZodType)) {
  throw new Error('packed domain 缺少抖音运行配置 schema');
}

const normalizedRuntimeConfig = DouyinRuntimeConfigSchema.safeParse({
  brand: { logo_url: null, qualifications: [] },
  theme: { primary_color: '#C45A32', navigation_text_color: 'black' },
  features: {
    cases: true,
    sites: true,
    sms_lead: true,
    douyin_phone: false,
    phone_capture_mode: 'sms',
  },
  home_banners: [],
  trust_metrics: [],
  privacy_policy_version: '2026-08-21',
});
if (!normalizedRuntimeConfig.success
  || DOUYIN_DEFAULT_CONTACT_SLA_TEXT !== '工作人员将在营业时间内与你联系'
  || normalizedRuntimeConfig.data.contact_sla_text !== DOUYIN_DEFAULT_CONTACT_SLA_TEXT) {
  throw new Error('packed domain 无法从 root export 规范化抖音联系文案');
}

if (EMPLOYEE_SERVICE_ACCESS_STATUS_VALUES[3] !== 'grace_period') {
  throw new Error('packed domain 缺少员工服务状态契约');
}

if (JSON.stringify(PLATFORM_SERVICE_TRIAL_STATUS_VALUES) !== JSON.stringify(expectedTrialStatuses)) {
  throw new Error('packed domain 缺少完整的试用状态契约');
}

if (JSON.stringify(SERVICE_TRIAL_FOLLOW_UP_TYPE_VALUES) !== JSON.stringify(expectedFollowUpTypes)
  || JSON.stringify(SERVICE_TRIAL_FOLLOW_UP_STATUS_VALUES) !== JSON.stringify(expectedFollowUpStatuses)
  || JSON.stringify(SERVICE_TRIAL_NOTIFICATION_EVENT_VALUES) !== JSON.stringify(expectedNotificationEvents)) {
  throw new Error('packed domain 缺少完整的试用运营契约');
}

if (!SiteContentDraftBlockSchema.safeParse({ type: 'paragraph', text: 'packed consumer' }).success) {
  throw new Error('packed domain schema 无法执行解析');
}

if (!PlatformServiceTrialScopeSchema.safeParse({
  version: 1,
  capabilities: ['core.projects', 'core.customers'],
}).success) {
  throw new Error('packed trial scope schema 无法执行解析');
}
`,
  );
  await execFileAsync('node', ['./verify.mjs'], { cwd: consumerRoot });
  process.stdout.write('packed domain consumer verified with shared zod identity\n');
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
