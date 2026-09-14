# 客户生图输入审核与任务准入开发记录

日期：2026-09-14。分支：`feature/customer-rendering-job-admission`。范围是阶段一的后端底座，不代表客户生图已可用或已发布。

## 已实现

- 私有规范化图片的 COS CI 同步审核：仅 `Result=0` 批准，`1` 拒绝，`2` 转人工；无效响应、未开通或调用失败均不能批准。Worker 每次最多扫描 25 条，用数据库条件更新抢占审核租约；最多三次，崩溃后可恢复并转人工。开关 `CUSTOMER_RENDERING_INPUT_REVIEW_ENABLED` 默认关闭。COS 图片审核需要开通服务与相应 CAM 权限，可能产生审核及大图处理费用；实际账户尚未做付费调用。官方接口：[图片单次审核](https://cloud.tencent.com/document/api/436/119478)、[Node.js SDK 图片审核](https://cloud.tencent.com/document/product/436/109665)。
- 双端 `POST /visitor/renderings/jobs`、`POST /douyin-mini/renderings/jobs`：使用共享 `RenderingJobRequestSchema` 和各自会话，只接受服务端解析的租户/主体。返回 `202`、`job_id`、任务状态与额度投影；输入需已审核通过。`CUSTOMER_RENDERING_JOB_ADMISSION_ENABLED` 默认关闭，在 API 层先拒绝新任务。
- migration `20260914014930_customer_rendering_input_review_and_job_admission.sql`：新增审核状态、默认关闭的租户任务/日预算设置、任务表、带租户设置行锁的原子创建 RPC。RPC 复用既有额度预占函数，任务插入失败会回滚同事务额度预占。准入时锁定素材与文件，并保存所选发布版本、文案和 COS 对象快照；按取得锁后的 Asia/Shanghai 自然日统计。每任务预留金额必须被后续 Worker 视作上界；在真实成本和模型调用上界核实前不能启用租户。

## 本地验证与未完成门禁

- 相关 Bun 测试 109 通过；API `typecheck`、`build`、`check:file-size`、`git diff --check` 通过。
- `supabase migration list --local` 显示本地数据库还有大量早于本迁移的未应用版本，因此没有对共享本地库运行 `migration up`。尝试用一次性独立 Postgres 跑完整迁移链，但该容器缺少 Supabase Storage 服务基线，在 `20260418044333_create_project_logs_bucket.sql` 的 `storage.buckets` 处停住，未执行到本次 migration；容器已删除。本次 SQL 尚未在完整基线数据库上执行，需在隔离且已追平迁移的环境做实际应用与并发集成 smoke，再部署至生产，并用 `supabase migration list` 核对 Local/Remote 对齐。
- 没有执行 COS CI 真实调用；需确认桶已开通图片审核、CAM 权限、私有对象请求与账单上界。审核 Worker 和租户生成设置继续保持关闭。
- 生成 Worker、结果/输出审核、额度结算、实际费用回填、任务查询/私有结果、建议模型、双端页面尚未实现。即使两道准入开关被误启，任务也会停在 `queued`；发布前必须继续关闭设置。

回滚策略：先停审核 Worker、关闭租户 `enabled`；保留任务、审核及额度账本供对账，修正结构使用新的 forward migration，不删历史数据。
