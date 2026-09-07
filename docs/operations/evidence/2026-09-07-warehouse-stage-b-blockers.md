# 仓库库存 Stage B：第一批阻断修复

日期：2026-09-07。分支：`feature/warehouse-procurement-inventory-stage-b`。

## 范围与结论

接续 [WIP 审查](./2026-09-07-warehouse-stage-b-wip-review.md)，完成同步 main 及四个确定缺陷的代码修复。**不是完整 Stage B 交付，不得据此合回 main 或发布。**

- WIP 保存提交：`77ec1616`。
- 同步 main 的合并提交：`b0d4582b`，包含 main `ce2c67fb`，无冲突。
- 所有业务修改都留在 Stage B worktree，未修改 main 工作区、orange 或生产配置。
- 本次只修改尚处于本地 WIP 的 Stage B migration 草稿，未执行整份 migration，未核对或改写开发/生产迁移历史。正式应用前必须确认待执行版本及 Local/Remote 历史，不得直接从旧计划执行 db push；如果发现该版本已在任何目标环境应用，应改用新的修正 migration，不覆盖已应用历史。

## 本批修复

| 问题 | 修复方式 | 验证依据 |
| --- | --- | --- |
| 三张财务表 UPDATE 回填触发保护 | 新增 `destination_type text NOT NULL DEFAULT 'project'`，保留旧调用默认值；不执行 UPDATE，不禁用保护触发器 | 有历史数据、仍启用保护触发器的 PostgreSQL fixture 升级成功，旧行/新行默认值正确，互斥约束和更新保护仍有效 |
| 分次收货重复计价 | 以 tenant、order、purchase item 汇总历史入库金额；本次金额为累计应确认金额减历史金额，保留尾差处理 | 10 件 100 元分 4 + 6 记 40 + 60；三等分尾差场景；小数数量场景；重复 source 失败且余额不变 |
| 内部履约 helper 绕过记账 | rename 后撤销 PUBLIC、anon、authenticated、service_role 执行权限，保留正式 SECURITY DEFINER wrapper 授权 | PostgreSQL 检查 helper 对三个业务角色均不可执行；正式 wrapper 授权另有文本契约检查 |
| inventory 路由未映射 | 作为独立模块纳入既有分类，保留 read 服务门禁、路径边界和 `inventory.stock.view` | 新增四条 GET/HEAD 路由及相似前缀拒绝测试，全注册路由唯一分类测试通过 |

未通过放宽权限、跳过校验、关闭触发器或吞掉异常来消除报错。

## 验证记录

### TDD 与隔离 SQL 回归

- 路由专项：实现前 1 pass / 4 fail，失败为“租户服务路由未映射能力”；实现后 5 pass。
- SQL 文本契约：实现前 3 pass / 3 fail，修复后 6 pass / 0 fail。
- PostgreSQL 回归脚本：[verify-warehouse-inventory-sql.ts](../../../scripts/verify-warehouse-inventory-sql.ts)。它直接从 migration 提取目的地 DDL、仓库金额 CTE、helper rename/ACL 片段，不重写业务公式。
- 对 WIP `77ec1616` 执行相同脚本：5 项均按预期失败（保护触发器、三种分次计价场景、helper ACL）。基线模式返回非零是预期结果。
- 当前工作区：5 项全部通过。测试中的重复 source 为唯一约束及子事务回滚验证，不代表正式 API 幂等完整链路已验收。

从该 worktree 根目录运行：

```bash
# 需 Docker 可用，且本机已有脚本中固定版本的 PostgreSQL 镜像。
# 不自动下载镜像，不连接任何现有数据库。
bun scripts/verify-warehouse-inventory-sql.ts --baseline
bun scripts/verify-warehouse-inventory-sql.ts
```

脚本用随机名称创建一次性容器，`--network none`，不映射端口、不挂载业务卷；SQL fixture 仅存在于容器中，各项检查事务回滚，结束后停止并自动删除该容器。未操作现有 `supabase_db_gooes`，未执行开发/生产 migration。

### 静态及单元测试

API 测试从该 worktree 的 `apps/api` 目录逐文件运行，避免共享 mock 污染或从仓库根加载错误配置。

| 检查 | 结果 |
| --- | --- |
| 新 inventory 路由分类 | 5 通过 |
| 全注册路由 capability map | 35 通过 |
| route-access | 19 通过 |
| tenant-service-access | 19 通过 |
| capability propagation | 3 通过 |
| 库存 migration contract | 6 通过 |
| 库存 schema / repository / service / controller | 2 / 2 / 1 / 2 通过 |
| 库存 Domain | 1 通过 |
| 以上合计 | 95 通过 |
| API 类型检查、API 构建 | 通过 |
| Domain 构建及外部 Zod 身份检查 | 通过 |
| 独立 SQL 脚本 TypeScript 检查 | 通过 |
| 权限边界、API 文件大小、diff 空白检查 | 通过 |

上述不是全仓测试。旧 WIP 清单中的 10 条未映射路由问题已由 main 的仓库修复和本次库存修复覆盖；不要将其与尚未完成的真实 API/数据库验收混淆。

## 仍未完成与后续顺序

1. 采购、收货及付款的 `project | warehouse` 目的地端到端闭环；包括项目依赖解析、权限和付款 RPC 的完整适配。
2. Admin 库存余额/流水页、菜单和仓库补货入口；本次不开放仓库补货开关。
3. 库存分页 RPC 的查询工作量优化和 EXPLAIN；返回有界不等于扫描有界。
4. 获准环境中的全量历史 migration 升级、Local/Remote 对齐、完整 wrapper 收货/应付事务、跨租户、并发收货、付款及项目采购回归。
5. 完整 Stage B 验收和最终审查后，另行确认合并、清理及发布。

隔离 SQL 片段测试不能替代以上门槛，尤其不能宣称整份 migration 已在历史业务数据库成功应用、财务闭环已完成或所有权限/并发场景已覆盖。
