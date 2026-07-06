# Supabase RLS Inventory - 2026-07-06

## Scope

This audit covers the linked `gooes-dev` Supabase project `fclnkyatvfvmzgzdqlba`.
The backend API uses `SupabaseDB.getAdminClient()` after Fastify auth,
`AuthContext`, tenant context, and permission checks. The hardening migration
therefore treats RLS and privilege revokes as a deny-by-default guard against
direct Supabase table/RPC access with anon/authenticated keys.

## Preflight Migration Status

- Local migration files: 297.
- Remote `supabase_migrations.schema_migrations` rows: 297.
- Local/remote version diff: 0 missing locally, 0 missing remotely.
- Latest remote version: `20260705205000_add_platform_partner_members_pagination_index`.
- `supabase migration list --linked` failed through the linked pooler with
  `tenant/user postgres.fclnkyatvfvmzgzdqlba not found`, so this audit used
  `SUPABASE_DB_DIRECT_URL` with `supabase db query --db-url`.

## RLS Disabled Tables

Preflight query found 148 `public` tables with RLS disabled:

```text
public._backup_departments_20260527
public._backup_tenant_department_legacy_20260527
public.administrative_areas
public.ai_call_logs
public.ai_decoration_qa_suggestion_cache
public.ai_models
public.ai_providers
public.ai_scene_routes
public.camera_access_logs
public.customer_appointment_reward_campaigns
public.customer_follow_up_comments
public.customer_follow_ups
public.customer_log_share_assists
public.customer_log_share_campaigns
public.customer_log_share_opens
public.customer_phone_access_logs
public.customer_project_log_shares
public.customer_service_ticket_actions
public.customer_service_tickets
public.customer_sources
public.customers
public.department_post_rules
public.department_templates
public.departments_retired_20260527
public.employee_permission_overrides
public.employee_personalization_rules
public.employee_roles
public.employees
public.expense_request_approvals
public.expense_request_categories
public.expense_request_items
public.expense_request_settlements
public.external_referrers
public.ezviz_access_tokens
public.finance_closing_periods
public.finance_cost_categories
public.finance_ledger_entries
public.finance_monthly_difference_resolutions
public.finance_reconciliation_exception_actions
public.marketing_assets
public.marketing_campaign_project_scopes
public.marketing_campaign_templates
public.marketing_campaigns
public.marketing_events
public.marketing_leads
public.marketing_page_versions
public.marketing_pages
public.notifications
public.ops_script_runs
public.partner_commission_ledger
public.partner_settlement_batches
public.partner_settlement_items
public.payments
public.permissions
public.picture_asset_categories
public.picture_asset_comment_images
public.picture_asset_comments
public.picture_asset_favorites
public.picture_asset_likes
public.picture_asset_share_events
public.picture_asset_variants
public.picture_assets
public.picture_categories
public.platform_audit_logs
public.platform_credit_recharge_products
public.platform_file_objects
public.platform_lead_assign_logs
public.platform_leads
public.platform_partner_applications
public.platform_partner_invite_codes
public.platform_partner_levels
public.platform_partner_members
public.platform_partners
public.platform_payment_configs
public.platform_revenue_events
public.posts
public.project_acceptance_actions
public.project_acceptance_items
public.project_acceptance_open_tickets
public.project_acceptance_template_items
public.project_acceptance_template_sections
public.project_acceptance_templates
public.project_acceptances
public.project_cameras
public.project_cost_budgets
public.project_log_comments
public.project_logs
public.project_member_role_post_rules
public.project_members
public.project_procedure_assignment_logs
public.project_procedure_assignments
public.project_receivable_allocations
public.project_receivable_events
public.project_receivable_plans
public.project_referrals
public.project_share_campaign_configs
public.projects
public.properties
public.role_permissions
public.roles
public.sms_send_logs
public.sms_verification_codes
public.social_video_scripts
public.social_video_transcriptions
public.system_setting_change_logs
public.system_settings
public.tenant_billing_events
public.tenant_billing_plans
public.tenant_billing_subscriptions
public.tenant_credit_accounts
public.tenant_credit_ledger
public.tenant_credit_orders
public.tenant_credit_wechat_notifications
public.tenant_departments
public.tenant_devices
public.tenant_panorama_assets
public.tenant_panorama_jobs
public.tenant_partner_bindings
public.tenant_payment_configs
public.tenant_pricing_rules
public.tenant_service_areas
public.tenant_share_links
public.tenant_subscription_invoices
public.tenant_template_applications
public.tenant_templates
public.tenant_usage_daily
public.tenant_wechat_pay_applyment_events
public.tenant_wechat_pay_applyments
public.tenants
public.user_auth_events
public.user_business_memberships
public.user_location_contexts
public.user_oauth_identities
public.user_profiles
public.visitor_project_follows
public.wechat_payment_notifications
public.wechat_payment_orders
public.wechat_rebind_requests
public.workflow_definition_bindings
public.workflow_definitions
public.workflow_edges
public.workflow_instance_nodes
public.workflow_instances
public.workflow_nodes
public.workflow_subject_states
public.workflow_tasks
public.workflow_transition_logs
public.workflow_versions
```

## anon/authenticated Table Grants

- Tables with direct anon/authenticated grants: 150.
- Grant rows: 300.
- Every grant row had the same privilege set:
  `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE`.

This confirms the RLS warning is not cosmetic: before hardening, direct
publish-key table access was broadly available if a caller bypassed the API.

## Tenant Boundary Matrix

The tenant boundary query found 109 public tables with one or more of:
`tenant_id`, `tenant_department_id`, `owner_id`, `employee_id`, `project_id`,
`customer_id`, `partner_id`, `business_type`, `business_id`.

Important classifications:

- Direct tenant-owned tables include `customers`, `employees`, `projects`,
  finance tables, tenant billing tables, workflow tables, marketing tables,
  and partner revenue/binding tables.
- Indirect tenant-scoped tables include tables that carry `project_id`,
  `customer_id`, `employee_id`, or `partner_id` and are filtered through
  service/repository joins.
- Tables without `tenant_id` are not automatically public. Examples include
  dictionaries/global platform tables and indirect-scope tables.
- This migration intentionally does not add tenant table policies because the
  current tenant model is enforced in the API/service layer.

## anon/authenticated RPC Grants

Preflight query found 56 public functions, 41 executable by `anon`, and
30 executable by `anon` while marked `SECURITY DEFINER`.

High-risk `anon` + `SECURITY DEFINER` functions included:

```text
assign_platform_lead(p_lead_id uuid, p_tenant_id uuid, p_operator_employee_id uuid, p_assigned_note text)
billing_confirm_wechat_recharge(p_order_id uuid, p_transaction_id text, p_paid_amount_fen integer, p_paid_at timestamptz, p_notification_id uuid, p_metadata jsonb)
billing_ensure_account(p_tenant_id uuid)
billing_freeze_credits(p_tenant_id uuid, p_change_credits bigint, p_event_type text, p_source_type text, p_source_id text, p_correlation_id uuid, p_remark text)
billing_manual_recharge(p_tenant_id uuid, p_amount_fen integer, p_credits bigint, p_bonus_credits bigint, p_operator_user_id uuid, p_remark text, p_metadata jsonb, p_idempotency_key text)
billing_settle_event(p_billing_event_id uuid, p_correlation_id uuid, p_operator_user_id uuid)
billing_unfreeze_credits(p_tenant_id uuid, p_change_credits bigint, p_event_type text, p_source_type text, p_source_id text, p_correlation_id uuid, p_remark text)
bind_customer_from_tenant_share(p_auth_user_id uuid, p_phone text, p_share_token text)
claim_next_social_video_transcription()
claim_next_social_video_transcription(p_stale_before timestamptz)
create_project_log_fast(p_tenant_id uuid, p_employee_id uuid, p_project_id uuid, p_stage_code text, p_node_name text, p_content text, p_images jsonb, p_project_log_scope text, p_tenant_department_id uuid)
find_auth_user_by_email(p_email text)
get_customer_project_construction_stage_bootstrap(p_tenant_id uuid, p_customer_id uuid, p_project_id uuid)
get_employee_permission_context_fast(p_employee_id uuid)
get_employee_project_detail_bootstrap_data(p_project_id uuid, p_tenant_id uuid, p_log_limit integer)
get_project_log_calendar(project_uuid uuid, timezone_name text)
get_visitor_picture_asset_navigation(p_asset_id uuid, p_category_id uuid, p_direction text, p_limit integer)
list_customer_home_projects(p_tenant_id uuid, p_customer_id uuid, p_page integer, p_page_size integer, p_recent_logs_per_project integer)
list_customer_project_acceptance_summaries(p_tenant_id uuid, p_customer_id uuid, p_project_id uuid, p_page integer, p_page_size integer, p_status text, p_stage_code text)
list_customer_project_detail_logs(p_tenant_id uuid, p_customer_id uuid, p_project_id uuid, p_page_size integer)
list_employee_login_bindings(p_employee_ids uuid[])
list_visitor_picture_assets(p_category_id uuid, p_page integer, p_page_size integer)
list_wechat_login_memberships(p_user_id uuid)
picture_asset_set_favorite(p_asset_id uuid, p_visitor_id text, p_favorited boolean)
picture_asset_set_like(p_asset_id uuid, p_visitor_id text, p_liked boolean)
recalculate_project_referral(p_project_id uuid)
resolve_wechat_login_state_by_openid(p_openid text)
sync_user_oauth_identity(p_user_id uuid, p_platform text, p_openid text, p_unionid text)
verify_wechat_customer_bootstrap(p_user_id uuid, p_openid text, p_tenant_id uuid, p_customer_id uuid, p_employee_id uuid, p_page integer, p_page_size integer, p_recent_logs_per_project integer)
verify_wechat_identity_binding(p_user_id uuid, p_openid text, p_tenant_id uuid, p_customer_id uuid, p_employee_id uuid)
```

Repository scan found no admin/h5 direct Supabase client usage; API repositories
call RPCs through service-role `SupabaseDB.getAdminClient()`. The migration
therefore revokes direct anon/authenticated function execution and keeps
service_role execution.

## Post-Migration Evidence

Applied migration:

```text
supabase db push --db-url "$SUPABASE_DB_DIRECT_URL"
applied: 20260706110000_harden_public_direct_access.sql
```

SQL verification:

```text
public tables with RLS disabled: 0
anon/authenticated public table grant rows: 0
anon/authenticated executable public functions: 0
sample sensitive RPC check: anon_execute=false, authenticated_execute=false, service_role_execute=true
schema_migrations row for 20260706110000: present
supabase db advisors --type security --level warn: no rls_disabled findings
```

Direct publish-key smoke:

```text
employees: blocked with 42501
customers: blocked with 42501
projects: blocked with 42501
payments: blocked with 42501
finance_ledger_entries: blocked with 42501
project_receivable_plans: blocked with 42501
partner_commission_ledger: blocked with 42501
platform_partner_members: blocked with 42501
find_auth_user_by_email: blocked with 42501
get_employee_permission_context_fast: blocked with 42501
get_project_log_calendar: blocked with 42501
list_employee_login_bindings: blocked with 42501
list_visitor_picture_assets: blocked with 42501
```

Repository verification:

```text
bun run check:permission-boundaries: passed
bun run api:check: passed
focused finance/workflow bun test command: 38 pass, 0 fail
```

Tenant isolation verification:

```text
bun --env-file=apps/api/.env scripts/seed-phase5h-tenant-verification.ts --format=shell > /tmp/gooes-phase5h.env
API_BASE_URL=http://127.0.0.1:3000 STRICT_TENANT_VERIFY=1 bun scripts/verify-phase5h-tenant-isolation.ts
Summary: 27 passed, 0 failed, 0 skipped.
```

The Phase 5H seed script was updated to match the current tenant organization
model: it writes `tenant_departments`, assigns employees through
`tenant_department_id`, and uses the current `/project-logs/projects` route.

## Function Search Path Follow-up

Applied migration:

```text
supabase db push --db-url "$SUPABASE_DB_DIRECT_URL"
applied: 20260706123000_fix_function_search_path.sql
```

The migration pins `search_path = public` for the four functions reported by
Supabase Security Advisor:

```text
public.update_updated_at_column()
public.workflow_edge_condition_matches(jsonb, jsonb)
public.search_finance_project_risk_ids(uuid, integer, integer, text, text, text, text, boolean, boolean, boolean, numeric, numeric)
public.list_latest_finance_reconciliation_exception_actions(uuid, text[])
```

Post-change evidence:

```text
pg_proc.proconfig for all four functions: search_path=public
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL": Local/Remote aligned through 20260706123000
supabase db advisors --db-url "$SUPABASE_DB_DIRECT_URL" --type security --level warn: No issues found
```

## Rollback Notes

The rollback must be a new migration. If direct API regressions appear, first
verify that the caller is not using anon/authenticated direct Supabase access.
The existing Fastify API should continue to work because it uses service_role
and this migration does not enable `FORCE ROW LEVEL SECURITY`.

If emergency rollback is required, disable RLS only on the table names listed
above and restore only the specific direct grants that are proven necessary.
Do not use blanket direct grants for anon/authenticated.
