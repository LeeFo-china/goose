# Customer 权限边界核查 Phase 3

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/customer/index.ts`
- `apps/api/src/services/customer-phone-privacy.ts`
- `apps/api/src/services/customer-sources.ts`
- `apps/api/src/repositories/customer-sources.ts`

本阶段聚焦客户手机号隐私动作、客户来源时间线、客户来源摘要和批量分配负责人链路。

## 本次调整

- 客户列表在按 `pageCustomerIds` 二次读取客户详情时补充 `tenant_id = authContext.tenantId`。
- `customerSourceService` 明确要求租户上下文，不再把 `tenantId` 作为可空条件传入 repository。
- `customerSourceRepository` 的客户来源查询、客户访问校验统一强制 `tenant_id` 过滤。
- 客户来源序列化关联员工、分享链接时按当前租户过滤，避免脏数据或异常关联造成跨租户信息暴露。

## 已核查边界

- 手机号查看、拨打、复制动作读取客户时已按 `id + tenant_id` 查询。
- 手机号动作先校验 `customer.read` 可见范围，再校验具体手机号权限点。
- 手机号访问日志只记录脱敏手机号、动作、权限点、范围和请求上下文，不返回未授权手机号。
- 批量分配负责人目标员工按当前租户读取，并校验员工状态和 `customer.assign_owner` 范围。
- 批量分配客户集合按当前租户读取，最终更新也带 `tenant_id` 条件。
- 客户来源列表先校验客户属于当前租户，再按 `customer.read` 范围判断是否可访问。
- 客户来源摘要只接受已经过租户上下文的调用，repository 层继续补租户条件。

## 后续注意

- `customer_sources.platform_lead_id` 关联的是平台线索，属于平台来源追溯信息，本阶段保留不按租户过滤；租户能看到的前提是该来源记录已属于当前租户。
- `customer_phone_access_logs` 当前未冗余 `tenant_id`，审计回查需要通过 `customer_id` 关联客户获取租户。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
