# 腾讯云 OCR 一期运维手册

## 1. 当前发布门禁

- `TENCENT_OCR_ENABLED` 默认保持 `false`。
- 只有在生产环境完成一次 dry-run、一次 apply，并确认小时级调度连续运行后才能开启。
- 身份证能力还必须完成腾讯云加密公钥和官方 Demo 的真实联调；未通过时保持 `TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED=false`。

## 2. 结果清理命令

在 API 发布目录执行：

```bash
# 默认只读，不修改数据库
bun run --cwd apps/api ocr:results:cleanup

# 明确执行过期与密文清理
bun run --cwd apps/api ocr:results:cleanup --apply
```

每个数据库批次最多处理 500 条 `status IN (processing,succeeded) AND expires_at<=now` 的记录，按
`expires_at` 升序选择。dry-run 只查询一个批次；apply 模式会在同一次任务中连续执行，直到
积压清空或达到 20 个批次（最多 10,000 条）。apply 把状态改为 `expired` 并清空
`result_ciphertext`，保留脱敏摘要、告警码、RequestId、耗时与计费单元作为审计数据。

读取接口在判断到 `expires_at` 已过期时直接返回 `410 OCR_RECOGNITION_EXPIRED`，不依赖清理任务是否已经执行。

## 3. 生产调度

调度定义：`.github/workflows/ocr-result-cleanup.yml`。任务运行在现有生产发布 runner，通过
`docker exec gooes-api` 使用当前已部署 API 镜像的代码和容器环境，不在 GitHub 中复制
数据库或 OCR 密钥。

调度要求：

- 周期：每小时一次，在整点后 17 分钟执行。
- 定时模式：固定执行
  `docker exec gooes-api bun src/scripts/ocr-result-cleanup.ts --apply`。
- 手工模式：`workflow_dispatch` 默认 `dry-run`，需要明确选择 `apply` 才写数据库。
- 启用门禁：定时事件仅在仓库变量
  `OCR_CLEANUP_SCHEDULE_ENABLED=true` 时运行；手工任务不受该变量影响。
- 超时：10 分钟。
- 防重入：GitHub Actions concurrency 固定为
  `ocr-result-cleanup-production`，不取消正在执行的任务，不允许并行清理。
- 运行边界：只允许 `gooes-prod-vm-0-3`，并要求 `gooes-api` 为
  `running/healthy` 且已包含清理脚本。
- 日志：只记录计数、最早过期时间和模式，不记录图片、signed URL、识别字段或密钥。
- 证据：每次把脱敏 summary 写入 Job Summary，并保存 30 天 artifact。
- 积压告警：连续执行 20 个批次后仍有积压时，`batch_limit_reached=true`，workflow 失败并
  输出 GitHub error。

当前状态：调度定义已进入功能分支，但尚未合并到默认分支，也没有生产 workflow run
证据，因此 OCR 总开关不得开启。合并并部署包含清理脚本的 API 镜像后，部署负责人必须先
手工执行一次 dry-run 和一次 apply，再设置 `OCR_CLEANUP_SCHEDULE_ENABLED=true`，观察至少
一个小时级定时 run，并把 run ID 与脱敏 artifact 回填到 Phase 1 smoke 记录。

2026-07-22 已使用当前目标数据库执行命令级验证：dry-run 与 apply 均成功，候选数和更新数均为 0。该证据只证明脚本和数据库连接可用，不替代生产小时级调度器的安装与连续运行证据。

## 4. 责任与告警

- Owner：Gooes 平台运维负责人。
- 告警接收：现有生产发布告警渠道和平台运维群。
- 立即告警：进程退出码非 0、执行超时、数据库连接失败。
- 容量告警：`batch_limit_reached=true`，表示单次已处理 20 个批次后仍可能存在积压，需要
  人工再次执行并评估调度容量。
- 安全告警：日志出现身份证号、银行卡号、地址、图片 URL 或配置密钥时，立即停用 OCR 并按安全事件处理。

## 5. 首次启用检查

1. `supabase migration list` 确认 `20260722130000`、`20260722150000` 和
   `20260722170000` Local/Remote 对齐。
2. dry-run 输出 `mode=dry-run`，并确认没有数据库更新。
3. 使用受控过期测试记录运行 apply，确认 `status=expired` 且 `result_ciphertext IS NULL`。
4. 再次 dry-run，确认已处理记录不再进入候选集。
5. 确认 workflow concurrency、10 分钟超时、单批 500 条、单次最多 20 批和超限积压告警
   生效。
6. 回填 smoke 记录后，才允许在平台设置中启用 OCR。

## 6. 回滚

1. 立即设置 `TENCENT_OCR_ENABLED=false`。
2. 停止生产清理调度器，但不要恢复已清除的敏感密文。
3. 保留 `ocr_recognitions` 脱敏审计记录。
4. 数据库结构如需移除，必须另建 forward migration；禁止手工删表或恢复密文。
