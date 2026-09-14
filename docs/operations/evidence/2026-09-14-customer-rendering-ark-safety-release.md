# 客户生图移除数据万象审核：发布检查点

日期：2026-09-14。变更见 [PR #143](https://github.com/LeeFo-china/goose/pull/143)。本记录只证明代码和只读迁移计划，**不代表新流程已部署、抖音体验版已更新或付费生图已验收**。既有数据万象账号／桶开通、CAM 授权和历史审查证据保留；新流程仅继续使用 COS 私有存储。

## 已核实

- 规范化图片写入 `ready`；历史元数据完整的 `pending_review`／`approved` 由版本化 migration `20260914191000` 转为 `ready`，拒绝及不完整记录不开放。旧输入审查 Worker、输入／输出 CI 网关和部署选择已移除。
- 方舟返回明确 `ContentPolicyViolation` 时任务失败、释放额度预留，客户端提示更换图片或描述；其他明确 4xx 拒绝单独标记。请求结果不明、结果保存失败或结算不确定继续进入 `review_required`，不自动重发付费请求。成功须有方舟响应和完整的私有结果记录，不要求数据万象输出审核。
- API 最新定向 100 个测试、抖音定向 53 个测试、发布契约 211 个测试通过；API TypeScript 检查和构建、抖音 TypeScript 检查通过。抖音包没有独立 build 脚本。共享本地 Supabase 未追平历史迁移，未在该库执行本次 SQL；数据库集成脚本已改为新状态机，但尚未在追平的隔离库运行。
- [开发只读计划 run 34838569131](https://github.com/LeeFo-china/goose/actions/runs/34838569131) 在 `d64f73547ec280d37c3f771b911dc514adf9b00c` 上成功：开发库已有 623 版，尚待 `20260914070000`、`20260914173000`、`20260914191000` 三版；未写库。
- [生产只读计划 run 34838504943](https://github.com/LeeFo-china/goose/actions/runs/34838504943) 在同一提交上成功：生产库已有 625 版，最新 `20260914173000`，**唯一待执行**为 `20260914191000`；前后版本数均为 625，`applied_count=0`。这只是迁移计划，不是 SQL 执行验证。
- [含安全停机步骤的生产只读计划 run 34839594635](https://github.com/LeeFo-china/goose/actions/runs/34839594635) 在 `e65b38af3ed5cb6947be7dc0ed4fbfbbbfeb03e8` 上再次成功，仍只有 `20260914191000` 待执行、625 版无写入。正式 apply 会先核对运行中 API 准入开关为关闭，优雅停止旧生图／输入审查 Worker，并要求处理中任务为 0；计划模式不会停容器。
- [开发迁移 apply run 34839184834](https://github.com/LeeFo-china/goose/actions/runs/34839184834) 在 `72c9f324c270b65bc4ead1a0ba1a9bf5b96260e3` 上成功：按先前计划应用三版，开发库从 623 增至 626，最新为本次 `20260914191000`。[开发 API 发布 run 34839263638](https://github.com/LeeFo-china/goose/actions/runs/34839263638) 完成不可变镜像构建、`supabase migration list` 全量历史校验与 API 健康检查。[后续 API 发布 run 34839570073](https://github.com/LeeFo-china/goose/actions/runs/34839570073) 应用旧审查容器退役步骤，日志确认旧容器已停并删除。开发环境尚未执行真实付费方舟生图及抖音真机验收。
- 独立代码审查指出两个切换边界：旧 API 可在迁移与部署间晚写 `pending_review`；方舟 HTTP 200 错误体的明确非内容拒绝原先会保留预留额度。`1c7f15088` 已补同 ID 状态／complete 的有界幂等转 `ready`，并让明确的结构化拒绝走释放结算；对应回归测试和 API 类型检查通过。该修复提交尚未发布到开发或生产。

## 切换顺序与剩余证据

1. 在方舟控制台核对生产所选模型端点使用标准安全护栏、未配置会关闭该护栏的自定义策略，并记录非敏感配置证据。未核实前不开放付费准入。
2. 确认生产 `CUSTOMER_RENDERING_JOB_ADMISSION_ENABLED` 和租户准入关闭；停止旧 `gooes-customer-rendering-input-review-worker` 与旧生图 Worker。只读核对 `customer_rendering_jobs.status='processing'` 为 0，并处理已在途及 `review_required` 任务。migration 内也有处理中任务非零即拒绝的保护。正式停旧容器后清理其孤儿容器，避免 Compose 移除服务定义后仍继续运行。
3. 在最终发布 SHA 上重新执行生产只读迁移计划，检查仅本版待执行，再通过受控 `migrate-production-database.yml` 应用版本化 migration。应用后使用 `supabase migration list` 核对 Local/Remote 对齐；禁止手工修表。若需回滚，先关准入和 Worker，保留任务、额度、私有对象及历史审查记录，使用新的前向 migration 修正。
4. 发布 API 与付费 Worker，先做小范围租户验证：旧已规范化照片状态变 `ready`、新照片完成即 `ready`、方舟成功只消费一次额度且只返回短期私有 URL、明确拒绝释放额度、未知结果保留对账路径。随后上传并在真机检查新版抖音模板，再按证据开启指定租户准入。

微信客户端仍在只读的 `orange` 仓库，需由小程序团队按[新交接契约](../../integration/customer-rendering-generation-handoff.md)修改与发布；本仓库未改动它。
