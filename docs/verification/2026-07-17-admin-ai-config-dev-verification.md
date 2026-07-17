# Admin AI 配置入口与 dev 自动部署验证记录

日期：2026-07-17  
仓库：`gooes`  
分支：`main`  
最新验证提交：`9fc1179205183d271a0798e09fb03a705da63af9`

## 验证范围

本次验证覆盖：

- Admin 旧页面入口 `/platform/ai-config` 不再返回 404。
- Admin 正式页面入口 `/platform/ai-models` 可被 dev 环境命中。
- `admin-only` 变更可触发自动构建并自动部署到 dev。
- CI 修复后，`admin-only` 自动部署不再因 remaining services job 被 skipped 而失败。

不覆盖：

- 登录态下的页面视觉检查。
- 超管侧 AI 模型路由数据是否完整展示。
- 租户管理员触发 `project-health/ai-summary` 的真实 AI 调用结果。

上述登录态和真实 AI 调用需要有效账号会话或人工登录后完成。

## 变更说明

相关提交：

```text
78d8e9bc fix(admin): 兼容平台AI配置旧路径
52118266 ci(dev): 修复admin单服务部署跳过
9fc11792 Merge branch 'feature/admin-recharge-refunds-ui'
```

关键文件：

```text
apps/admin/app/(console)/platform/ai-config/page.tsx
apps/admin/components/platform-ai/ai-config-route-compat.test.ts
.github/workflows/auto-deploy-dev.yml
.github/workflows/release-dev.yml
apps/web/tests/automatic-dev-deployment-contract.test.ts
scripts/release-orchestration-contract.test.ts
```

## 路由验证

命令：

```bash
curl -I --max-time 20 https://admin-dev.goodcms.cn/platform/ai-config
curl -I --max-time 20 https://admin-dev.goodcms.cn/platform/ai-models
curl -I --max-time 20 https://admin-dev.goodcms.cn/project-health
curl -I --max-time 20 https://admin-dev.goodcms.cn/login
```

结果：

```text
https://admin-dev.goodcms.cn/platform/ai-config  -> HTTP 307 location: /login
https://admin-dev.goodcms.cn/platform/ai-models  -> HTTP 307 location: /login
https://admin-dev.goodcms.cn/project-health      -> HTTP 307 location: /login
https://admin-dev.goodcms.cn/login               -> HTTP 200
```

结论：

- `/platform/ai-config` 已不再是 404。
- 未登录访问 console 页面会被统一重定向到 `/login`，符合当前 Admin 认证边界。
- `/platform/ai-config` 登录态后的页面级兼容逻辑为 `redirect("/platform/ai-models")`。

## admin-only 自动部署验证

最新 main 提交 `9fc1179205183d271a0798e09fb03a705da63af9` 触发了 admin-only 自动构建和自动部署。

Build run：

```text
Run ID: 29548958418
Name: Build development affected services
Conclusion: success
```

Build plan：

```json
{
  "schema_version": 1,
  "target_environment": "development",
  "commit_sha": "9fc1179205183d271a0798e09fb03a705da63af9",
  "before_sha": "52118266be42536188d8ccd685587912254475ce",
  "workflow_run_id": 29548958418,
  "migration_changed": false,
  "classifications": ["admin", "non-runtime"],
  "build_services": ["admin"],
  "deploy_services": ["admin"],
  "no_op": false
}
```

Auto deploy run：

```text
Run ID: 29549731590
Name: Auto dev deploy 9fc1179205183d271a0798e09fb03a705da63af9
Conclusion: success
```

关键 job 结果：

```text
Authorize automatic development deployment       success
Verify development migration history / verify   success
Require migration and API readiness              success
Deploy API                                       skipped
Deploy admin / Deploy dev                        success
Require remaining services readiness             success
Verify development Web gate                      skipped
Deploy Web                                       skipped
Summarize automatic development deployment       success
```

结论：

- `admin-only` build plan 正确解析为只构建和部署 `admin`。
- API 和 Web 未被误部署。
- `Deploy admin / Deploy dev` 成功。
- `Require remaining services readiness` 成功，说明 `deploy-rest` 缺少 `always()` 导致 skipped 的问题已消除。

## 本地测试验证

命令：

```bash
bun test apps/admin/components/platform-ai/ai-config-route-compat.test.ts apps/web/tests/automatic-dev-deployment-contract.test.ts scripts/release-orchestration-contract.test.ts apps/web/tests/dev-change-plan.test.ts
```

结果：

```text
112 pass
0 fail
1576 expect() calls
```

覆盖点：

- `/platform/ai-config` 页面源码包含 `redirect("/platform/ai-models")`。
- 自动 dev 部署在 remaining services 阶段使用 `always()`，避免上游 skipped 导致 admin-only 部署被跳过。
- dev change plan 会把 Admin 运行时代码变更解析为 `build_services=["admin"]` 和 `deploy_services=["admin"]`。

## 登录态人工验收清单

需要使用超管 `18637605353` 登录 dev Admin 后确认：

1. 访问 `https://admin-dev.goodcms.cn/platform/ai-config`。
2. 确认进入 AI 模型路由页面，而不是 404。
3. 访问 `https://admin-dev.goodcms.cn/platform/ai-models`。
4. 确认页面可展示 AI 供应商、模型和场景路由。
5. 确认场景路由存在 `project_operational_risk_summary`。

需要使用租户管理员 `18800000001` 登录后确认：

1. 访问 `/project-health`。
2. 页面不出现空白页、500 或 ChunkLoadError。
3. 触发 AI 摘要。
4. 确认 `project-health/ai-summary` 成功返回，或在 AI 配置缺失时返回明确错误。

## 当前结论

自动化范围内验证通过：

- Admin 旧入口 `/platform/ai-config` 已不再 404。
- Admin-only 自动构建和自动 dev 部署已实际通过。
- 相关 workflow contract 和 dev change plan 测试通过。

剩余风险：

- 尚未完成登录态页面视觉和真实 AI 调用验收。
- 需人工或带登录会话的浏览器环境补充验证 AI 场景数据展示与摘要生成结果。
