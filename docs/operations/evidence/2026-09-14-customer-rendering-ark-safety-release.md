# 客户生图移除数据万象审核：发布检查点

日期：2026-09-14。变更见 [PR #143](https://github.com/LeeFo-china/goose/pull/143)。本记录只证明代码和只读迁移计划，**不代表新流程已部署、抖音体验版已更新或付费生图已验收**。既有数据万象账号／桶开通、CAM 授权和历史审查证据保留；新流程仅继续使用 COS 私有存储。

## 已核实

- 规范化图片写入 `ready`；历史元数据完整的 `pending_review`／`approved` 由版本化 migration `20260914191000` 转为 `ready`，拒绝及不完整记录不开放。旧输入审查 Worker、输入／输出 CI 网关和部署选择已移除。
- 方舟返回明确 `ContentPolicyViolation` 时任务失败、释放额度预留，客户端提示更换图片或描述；其他明确 4xx 拒绝单独标记。请求结果不明、结果保存失败或结算不确定继续进入 `review_required`，不自动重发付费请求。成功须有方舟响应和完整的私有结果记录，不要求数据万象输出审核。
- API 定向 87 个测试、抖音定向 53 个测试、发布契约 211 个测试通过；API TypeScript 检查和构建、抖音 TypeScript 检查通过。抖音包没有独立 build 脚本。共享本地 Supabase 未追平历史迁移，未在该库执行本次 SQL；数据库集成脚本已改为新状态机，但尚未在追平的隔离库运行。
- [开发只读计划 run 34838569131](https://github.com/LeeFo-china/goose/actions/runs/34838569131) 在 `d64f73547ec280d37c3f771b911dc514adf9b00c` 上成功：开发库已有 623 版，尚待 `20260914070000`、`20260914173000`、`20260914191000` 三版；未写库。
- [生产只读计划 run 34838504943](https://github.com/LeeFo-china/goose/actions/runs/34838504943) 在同一提交上成功：生产库已有 625 版，最新 `20260914173000`，**唯一待执行**为 `20260914191000`；前后版本数均为 625，`applied_count=0`。这只是迁移计划，不是 SQL 执行验证。

## 切换顺序与剩余证据

1. 在方舟控制台核对生产所选模型端点使用标准安全护栏、未配置会关闭该护栏的自定义策略，并记录非敏感配置证据。未核实前不开放付费准入。
2. 确认生产 `CUSTOMER_RENDERING_JOB_ADMISSION_ENABLED` 和租户准入关闭；停止旧 `gooes-customer-rendering-input-review-worker` 与旧生图 Worker。只读核对 `customer_rendering_jobs.status='processing'` 为 0，并处理已在途及 `review_required` 任务。migration 内也有处理中任务非零即拒绝的保护。正式停旧容器后清理其孤儿容器，避免 Compose 移除服务定义后仍继续运行。
3. 在最终发布 SHA 上重新执行生产只读迁移计划，检查仅本版待执行，再通过受控 `migrate-production-database.yml` 应用版本化 migration。应用后使用 `supabase migration list` 核对 Local/Remote 对齐；禁止手工修表。若需回滚，先关准入和 Worker，保留任务、额度、私有对象及历史审查记录，使用新的前向 migration 修正。
4. 发布 API 与付费 Worker，先做小范围租户验证：旧已规范化照片状态变 `ready`、新照片完成即 `ready`、方舟成功只消费一次额度且只返回短期私有 URL、明确拒绝释放额度、未知结果保留对账路径。随后上传并在真机检查新版抖音模板，再按证据开启指定租户准入。

微信客户端仍在只读的 `orange` 仓库，需由小程序团队按[新交接契约](../../integration/customer-rendering-generation-handoff.md)修改与发布；本仓库未改动它。
