# 客户线索四步基础工作验证记录

日期：2026-09-06。
分支：`feature/customer-leads-foundation`。
代码基线：`28d1ae3761766093d3cffe2c8547c743e5e7c202`。

## 范围与结果

- 完成现有抖音线索本地代码、SQL 历史和权限基线核对。
- 实现通用 DTO、来源/状态/动作、分页与命令输入校验、公开命令结果校验、错误契约。
- 增加四项 customer_lead 权限目录及角色配置名称；生成独立权限 migration。
- 完成 `docs/2026-09-06-customer-leads-foundation-contract.md`，明确已实现契约与未上线接口的区别。
- 未修改原抖音 controller/service/repository/schema、抖音工作台及权限代码；对应 `git diff` 为空。
- 未注册 `/tenant/customer-leads` 路由，未实施通用 RPC，未应用远端 migration，未操作 orange。

## 已通过的验证

| 命令 / 检查 | 结果 |
|---|---|
| `bun run api:typecheck` | 修改前、修改后均退出 0 |
| 在 packages/domain：`bun run build` | 退出 0；产物 145981 bytes，external Zod identity 验证通过 |
| `bun scripts/check-customer-lead-foundation.ts` | 77 项离线断言通过 |
| `bun test --cwd packages/domain src/permission.test.ts` | 18 pass / 0 fail |
| `bun test --cwd apps/api src/services/tenant-douyin-leads-access.test.ts` | 修改前后均 5 pass / 0 fail |
| `bun test --cwd apps/api src/services/tenant-douyin-leads.test.ts` | 修改前后均 15 pass / 0 fail |
| `bun test --cwd apps/api src/controllers/tenant-douyin-leads/index.test.ts` | 修改前后均 6 pass / 0 fail |
| `bun test --cwd apps/api src/services/tenant-douyin-leads-public.test.ts` | 4 pass / 0 fail |
| `bun test --cwd apps/api src/services/authorization/system-admin-douyin-permissions.test.ts` | 1 pass / 0 fail |
| 在 apps/admin：`bun run typecheck` | 退出 0，包含 next typegen 与 tsc |
| 在 apps/admin：`bun run check:file-size` | 1362 个 TS/TSX 文件检查通过 |
| 新客户线索角色分组、模块名称和动作摘要 | 4 个权限 × 3 个实际函数断言，共 12 项通过 |
| `git diff --check` | 退出 0 |
| 独立代码审查 | 未发现当前基础工作范围内的重要缺陷；命名与文档细节已处理 |

离线断言覆盖：默认分页、页码/条数上限、租户字段注入、未知来源、反向日期、未分配冲突、无预约跟进、预约确认时间、命令版本/UUID、customer_id 输出权限、重复转化输出矛盾、旧权限保留和 migration 增量范围。

角色分组定向验证依次调用 `getPermissionGroup/getModuleLabel/getPermissionSummary`，期望新四项权限分到 customer 组，模块为“客户线索”，摘要为“客户线索 · 查看/分配/跟进/转化”。

## 已定位且未在本阶段修复的已有问题

运行 `bun test --cwd apps/admin components/roles/role-permission-display.test.ts`：4 pass / 1 fail。

失败项是 `all canonical permissions have an explicit role configuration group`。以下五个库存权限缺少 inventory 模块到角色分组的映射：

- `inventory.warehouse.view`
- `inventory.warehouse.manage`
- `inventory.stock.view`
- `inventory.issue.manage`
- `inventory.issue.approve`

已使用 `git show HEAD:packages/domain/src/permission.ts` 与 `git show HEAD:apps/admin/components/roles/role-permission-display.ts` 核对：基线提交已有这五个权限且没有 inventory 分组映射。本次新增 customer_lead 的分组、模块、资源和动作断言全部通过，不扩展修改库存范围。

不能据此记录“所有测试均通过”；准确结论是本次定向契约、旧线索回归和静态检查通过，另有一个已定位的存量角色分组失败。

## 执行过程中修正的验证命令

根目录直接执行 `bun test ./apps/api/src/...` 无法解析 API 独有的 `@/*` 别名；`apps/api/tsconfig.json` 才定义该 paths。切换到该目录执行后，26 项基线全部通过，没有修改业务代码。

本机 Bun 1.3.2 的 `bun --cwd apps/api test ...` 会把 test 当作 package script，正确命令是 `bun test --cwd apps/api src/...`，或在 apps/api 下执行 `bun test src/...`。计划已修正并实际验证正确参数顺序。

功能分支创建首次因 `.git` 沙箱写限制失败，提权重试后成功。Supabase CLI 首次因 `~/.supabase/telemetry.json` 写限制失败，提权重试后生成 `20260906040943_tenant_customer_lead_permissions.sql`；未执行 db push。

## 数据库与后续验证边界

本机未发现可直接使用的 psql，因此此次只检查 migration 内容、邻近 SQL 模式与增量边界，没有执行 SQL 运行时验证。远端目标、实际函数 owner/catalog、迁移对齐和权限种子实际生效尚未验证。

下一阶段应先核对目标库和待执行集合，再 dry-run/apply 本 migration，并用同一目标的 `supabase migration list` 验证对齐。随后实施通用 SQL 与 API，才能验证真实幂等、事务、租户权限及微信会话。

现有 system_admin 自动获得代码目录中的新权限，不依赖新增角色授权行；普通角色的配置列表与授权依赖权限 migration。该行为已在契约文档说明，未修改现有授权算法。
