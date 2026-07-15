# 装企主动入驻 / 服务商发布验证记录

日期：2026-07-15  
分支：`feature/service-provider-onboarding`

## 远端数据库目标

从 `/Users/leefo/Public/work/gooes/.env` 读取连接信息，只记录非敏感字段：

- host：`api-dev.goodcms.cn`
- port：`5432`
- database：`postgres`
- user：`postgres.your-tenant-id`
- 连接变量：`SUPABASE_DB_DIRECT_URL`

## Migration 执行

执行前：

- `supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"`：截至 `20260714170000` Local/Remote 对齐，以下 8 个 migration 为 Local-only。
- `supabase db push --dry-run --db-url "$SUPABASE_DB_DIRECT_URL"`：只计划推送以下 8 个 migration。
- `tenant_service_areas` adcode 去重预检：
  - 查询：按 `tenant_id, adcode` 分组，筛选 `count(*) > 1`
  - 结果：`[]`

已执行：

```text
supabase db push --db-url "$SUPABASE_DB_DIRECT_URL"
```

实际应用的 migration：

```text
20260714210000_create_tenant_onboarding_workflow.sql
20260714211000_atomic_tenant_onboarding_applicant_mutations.sql
20260714212000_claim_tenant_onboarding_notifications.sql
20260714220000_create_tenant_onboarding_approval_rpc.sql
20260714221000_atomic_tenant_onboarding_platform_review_mutations.sql
20260714222000_add_tenant_onboarding_review_search_indexes.sql
20260714223000_atomic_tenant_onboarding_partner_assist.sql
20260714230000_create_service_provider_publication_rpc.sql
```

执行后：

- `supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"`：上述 8 个 migration 已显示为 Local/Remote 对齐。
- 远端表存在性检查通过：
  - `tenant_onboarding_applications`
  - `tenant_onboarding_application_reviews`
  - `tenant_onboarding_notification_deliveries`
  - `tenant_service_provider_profiles`
- 远端 RPC 存在性检查通过，共 20 个：
  - `submit_tenant_onboarding_application`
  - `supplement_tenant_onboarding_application`
  - `withdraw_tenant_onboarding_application`
  - `claim_tenant_onboarding_notification`
  - `finalize_tenant_onboarding_notification_sent`
  - `finalize_tenant_onboarding_notification_failed`
  - `mutate_tenant_onboarding_platform_review`
  - `approve_tenant_onboarding_application`
  - `resolve_tenant_onboarding_region_paths`
  - `initialize_default_decoration_tenant`
  - `submit_tenant_onboarding_partner_assist`
  - `expire_tenant_onboarding_partner_assists`
  - `update_tenant_service_provider_profile`
  - `upsert_tenant_service_provider_area`
  - `submit_tenant_service_provider_profile`
  - `publish_tenant_service_provider`
  - `return_tenant_service_provider_to_draft`
  - `suspend_tenant_service_provider`
  - `list_tenant_service_provider_publications`
  - `list_visitor_local_service_providers`

## Supabase 类型

`supabase gen types typescript --db-url "$SUPABASE_DB_DIRECT_URL" --schema public` 在当前机器失败：

```text
failed to inspect docker image: Cannot connect to the Docker daemon at unix:///var/run/docker.sock
```

处理方式：

- 已恢复失败命令造成的空文件输出。
- 按 migration 和现有 `database.ts` 生成格式，局部补齐：
  - `platform_file_objects.owner_visitor_id`
  - `tenants.unified_social_credit_code`
  - 新增入驻/服务商表类型
  - 新增入驻/服务商 RPC 类型
- `bun run api:check` 已通过，确认类型文件语法和 API 编译有效。

## COS gate

系统设置中只读确认：

- `PLATFORM_STORAGE_PROVIDER=tencent_cos`
- `PLATFORM_COS_BUCKET=windwill-1259348056`
- `PLATFORM_COS_REGION=ap-nanjing`
- `PLATFORM_COS_PUBLIC_BASE_URL=https://windwill-1259348056.cos.ap-nanjing.myqcloud.com`
- `PLATFORM_COS_UPLOAD_USE_ACCELERATE=true`

未完成项：

- 当前 `.env` 缺少 `APP_CONFIG_ENCRYPTION_KEY`，无法解密 `TENCENT_COS_SECRET_ID` / `TENCENT_COS_SECRET_KEY`。
- 因此未能执行 COS bucket versioning / CORS 的只读 SDK 检查。
- 未运行真实营业执照远端直传 smoke。

上线前仍需确认：

- bucket versioning 为未启用或 Suspended。
- CORS 允许小程序直传所需的 `PUT` 和请求头，至少覆盖 `Content-Type`。
- `tenant_onboarding_license` 私有直传能完成 direct-init、COS PUT、direct-complete，且不会生成 public URL。

## 验证命令

通过：

```text
bun test src/schema/tenant-onboarding.test.ts src/services/tenant-onboarding-migration-contract.test.ts src/services/tenant-onboarding-region-match.test.ts src/services/tenant-onboarding-applications.test.ts src/services/tenant-onboarding-notifications.test.ts src/services/tenant-onboarding-approval-migration.test.ts src/services/tenant-onboarding-review.test.ts src/services/tenant-onboarding-partner-assist.test.ts src/services/tenant-service-providers.test.ts src/services/files/file-url-resolver-private.test.ts src/services/partner-tenant-onboarding-compatibility.test.ts src/controllers/platform-partners/routes.test.ts
```

结果：`158 pass, 0 fail`

通过：

```text
bun test packages/domain/src/permission.test.ts
bun test apps/admin/components/service-provider/service-provider-workspace.test.ts
bun run api:check
pnpm --dir apps/admin check
```

结果：

- domain permission：`8 pass, 0 fail`
- admin service-provider workspace：`2 pass, 0 fail`
- API typecheck/build/file-size：通过
- admin file-size/typecheck：通过

## 已知外部风险

Supabase CLI 查询返回既有安全 advisory：

```text
public.platform_partner_member_rebind_requests has RLS disabled
```

未自动修复。直接执行：

```sql
ALTER TABLE public.platform_partner_member_rebind_requests ENABLE ROW LEVEL SECURITY;
```

会在没有 policy 的情况下阻断访问，需要单独评审并补齐 RLS policy 后再处理。

## 回滚说明

本次 migration 以新增表、索引、RPC、权限和兼容列为主。若尚未产生业务数据，可按 migration 注释中的逆序 drop/revoke 回滚。若已产生入驻申请、审核记录、通知投递、服务商资料等业务数据，不应删除历史数据；应通过前向 migration 禁用入口或调整流程。
