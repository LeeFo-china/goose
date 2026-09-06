# 城市合伙人审核交互验收

## 交付范围

基线：`176ba328`。实现：`e944275f`。浏览器回归：`57d09c51`。

修复 Admin → 城市合伙人 → 合伙人列表缺少审核入口的问题。具有 `platform.partner.manage` 权限的账号在待审核行点击“审核通过”，核对资料与区县，填写审核说明后“审核通过并启用”。说明会更新原合伙人备注，弹窗同时展示原备注。

沿用 `PATCH /platform/partners/:id/status`，仅提交 `status=active` 与 `reason`。未改申请线索审核流程、数据库、合同/结算状态或 orange。此记录不代表生产发布。

## 验证证据

- 原有合伙人测试：11 passed。
- 新增回归红阶段：11 passed / 4 failed，失败点为遗漏审核接线、审核组件、同步提交锁和 textarea 长度约束。
- 修复后：`bun test --cwd apps/admin components/platform-partners`，15 passed / 0 failed，121 assertions。
- `bun run --cwd apps/admin typecheck`：exit 0。
- `bun run --cwd apps/admin check:file-size`：exit 0，1381 TS/TSX 文件均不超过 500 行。
- `git diff --check`：exit 0。
- 在 `apps/admin` 运行 `bunx playwright test --config=playwright.partner-approval.config.ts`：7 passed，32.6 秒。

浏览器覆盖真实 Admin 页面及本地 HTTP mock：资料核对/取消零写入、同步重复 submit 仅一条 PATCH、提交中 Escape 不关闭、成功刷新并保留分页 URL、只读及非 pending 状态隐藏入口、说明必填/长度/纯空白、403 与 409 保留输入后人工重试、未配区县禁用、390×844 窄屏。已人工查看桌面与窄屏截图。

## 环境与限制

- HTTP mock 仅监听 `127.0.0.1:3989`；测试 Admin 仅访问该 mock，端口 `3039`，使用独立 `.next-e2e/partner-approval`。测试账号及合伙人均为虚构，无生产写入。
- Bun 冻结安装在依赖解析阶段持续无进展，终止本次安装后，在隔离工作树以本地符号链接复用同基线根工作区的既有依赖和 domain 构建产物；未修改包版本和锁文件。
- Playwright 输出已有 `NO_COLOR`/`FORCE_COLOR` 环境冲突警告，不影响结果。
- 纯空白说明经 trim 后由既有后端 schema 拒绝；本次未为既有状态接口新增跨会话幂等或版本校验。
- 未执行 push 或生产发布。需要发布 Admin 后，生产页面才会出现新入口。
