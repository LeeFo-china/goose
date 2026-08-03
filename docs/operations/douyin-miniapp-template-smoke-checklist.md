# 抖音装修行业小程序模板 Smoke 清单

## 使用说明

本清单用于“模板开发安装 + 一个已授权测试商户”的上线前验收。标记为 **[阻断]** 的条目失败、未执行或证据缺失时必须停止发布；其他条目未通过也必须记录负责人、风险接受审批和补测期限。真实模板上传、提审、发布分别取得与环境、安装 UUID、模板版本绑定的授权；远端 migration 单独取得与环境、Supabase project ref、migration 版本集合绑定的授权。

本清单仍覆盖最终上线提审与发布的通用验收。本次开发环境 E2E 的执行证据记录在
`docs/operations/evidence/2026-07-20-douyin-dev-e2e.md`，到 test-qr / 本地发布状态 `testing` 即停止。
submit-audit、sync-status 和 publish 均为 `NOT_IN_SCOPE`，本轮不得执行或勾选通过；后续上线验收需另行授权并完成通用 G 项。

### 执行记录

- 执行日期：`YYYY-MM-DD`
- 环境：`local / staging / production`
- API Commit：`<commit>`
- 小程序 Commit：`<commit>`
- 模板开发 AppID（仅尾号）：`<last-4>`
- 测试商户 AppID（仅尾号）：`<last-4>`
- 租户 ID（可记录 UUID）：`<tenant-id>`
- 安装 ID：`<installation-id>`
- 执行人：`<name>`
- 审批/工单：`<reference>`

证据只记录截图编号、安全错误码、脱敏 `log_id`、发布记录 UUID 和时间。禁止粘贴 token、secret、Ticket、session key、OpenID、短信验证码或完整手机号。

## A. 上线前门禁（全部为阻断项）

- [ ] **[阻断]** `bun run douyin-mini:check` 通过。
- [ ] **[阻断]** `bun run api:check` 通过。
- [ ] **[阻断]** `bun test packages/domain/src/douyin-miniapp.test.ts packages/domain/src/permission.test.ts` 通过。
- [ ] **[阻断]** `bun run test` 通过。若只有已登记的基线失败，必须附完整输出、失败测试名、对应聚焦复测和技术负责人风险接受；不能填写“Root 通过”。
- [ ] **[阻断]** 下方规范隐私/安全扫描已逐项复核，没有秘密值或客户端租户选择器。
- [ ] **[阻断]** `bun x supabase migration list --local` 包含本分支 7 个抖音 migration。
- [ ] **[阻断]** 审批单的环境/project ref 与 CLI link 目标逐字符一致。
- [ ] **[阻断]** 远端 migration 如需应用，已取得明确授权，并用 `--linked` 在应用前后保存证据、确认 Local/Remote 对齐。
- [ ] **[阻断]** 开放平台两个 HTTPS 回调校验成功，响应为纯文本 `success`。
- [ ] **[阻断]** `development`、`preview` 只解析到 `api-dev.goodcms.cn`；`production` 只解析到 `api.goodcms.cn`；未知环境失败关闭。
- [ ] **[阻断]** 首个合法 Ticket 能按“申领事件 → 保存密文信封”完成并幂等重放；回调时间戳超窗、签名错误、AES 解密失败、Component AppID 错误、Ticket 为空或超长、组件为 disabled 时均无新增数据库写入。
- [ ] **[阻断]** 模板开发安装绑定获批的隔离测试租户，测试商户安装绑定获批的主测试租户，两个 UUID 不同。
- [ ] **[阻断]** 本轮商户发布记录最高只到 `testing`，没有 submit-audit、sync-status 或 publish 调用。
- [ ] **[阻断]** 当前测试只针对明确授权的测试商户，不存在批量操作。

规范扫描命令：

```bash
rg -n "console\.(log|info|debug)|throw new Error|tenant_id" \
  apps/api/src/controllers/douyin-* \
  apps/api/src/services/douyin-miniapp \
  apps/douyin-mini/src

rg -n "component_appsecret|authorizer_access_token|authorizer_refresh_token|session_key|open_id|sms_code" \
  apps/douyin-mini \
  docs/operations/douyin-miniapp-template-*.md
```

命中字段名不等于泄漏，必须人工判断；任何真实凭证、身份值、手机号或验证码命中都是阻断项。命令输出保存到审批工单或受控构建产物，不新增包含秘密的仓库文件。

证据：`<commands / screenshots / ticket>`

## B. 安装与租户隔离（跨租户、伪造身份、停用失效均为阻断项）

- [ ] 商户授权回调产生 `merchant / authorized_unbound` 安装。
- [ ] 绑定到目标 active 装修公司后，状态变为 `active`。
- [ ] 正确 AppID + 正确 deployment key 能交换 Gooes 会话。
- [ ] 错误 AppID、伪造 deployment key、缺少 deployment key 均被拒绝。
- [ ] 商户请求不能提交或覆盖 `tenant_id`、installation ID。
- [ ] Bootstrap 返回的品牌、功能开关、隐私版本与绑定租户一致。
- [ ] 使用另一个租户的数据标识请求时，不返回任何跨租户内容。
- [ ] 模板开发 AppID 仅命中显式 `template_development` 安装，不命中商户安装。
- [ ] 安装 disable 后，会话、内容、短信、留资失败关闭；enable 后只恢复原租户。
- [ ] 模拟/验证 revoke 后状态为 `revoked`，不能手工 enable，重新授权前不可用。
- [ ] 租户 suspended/archived 时不返回装修服务数据。

证据：`<request id / safe error code / screenshot>`

## C. 公开内容与分页

- [ ] 案例列表默认 `page=1&pageSize=20`，`pageSize=101` 被拒绝。
- [ ] 案例只返回公开、已发布、当前租户的数据和隐私安全字段。
- [ ] 案例详情不存在、跨租户或未公开时统一失败关闭。
- [ ] 工地列表和详情遵守同样分页、租户、公开状态边界。
- [ ] 工地响应不包含内部项目名称、客户信息、预算、合同或员工隐私字段。
- [ ] `features.cases=false` 时案例接口关闭；`features.sites=false` 时工地接口关闭。
- [ ] 快速切换筛选条件时，迟到响应不会覆盖最新页面状态。
- [ ] 空列表、加载中、弱网、超时和重试状态可理解且不会重复导航。

证据：`<response field list / screenshots>`

## D. 短信与留资闭环（重复线索、错误租户、验证码泄露均为阻断项）

使用专用测试手机号，证据中只保留掩码。

- [ ] 非法手机号、空姓名、未同意隐私政策被客户端和服务端拒绝。
- [ ] 短信发送频率限制生效；连续点击不会绕过限流。
- [ ] 错误验证码被拒绝，且不会创建线索。
- [ ] 过期或已消费验证码被拒绝，且不会创建线索。
- [ ] 正确验证码创建一条目标租户线索并返回成功。
- [ ] 同一提交按钮并发/重复点击只创建一条线索。
- [ ] 同租户、同手机号在 24 小时窗口内按规则去重。
- [ ] 同手机号在另一个租户的独立测试不会串租户或错误去重。
- [ ] 提交成功事件与线索写入保持原子一致；失败时没有“成功事件但无线索”。
- [ ] 小程序存储中只有 Gooes JWT 会话，没有 OpenID、session key、验证码或完整手机号持久化。

证据：`<masked phone / lead UUID / event UUID / timestamps>`

## E. 营销事件

- [ ] 允许的事件名可批量提交并返回准确 `accepted` 数。
- [ ] 未知事件名被拒绝。
- [ ] 空批次、超上限批次、超长字段、异常时间被拒绝。
- [ ] 事件由会话安装和租户归属，不接受客户端伪造租户/安装。
- [ ] 重试不会产生无法解释的重复成功事件。
- [ ] 请求和日志中没有手机号、验证码、OpenID、token 或 secret。

证据：`<batch size / accepted / safe error code>`

## F. Android、iOS 与入口恢复

- [ ] Android 真机：首页、案例、工地、留资、返回栈正常。
- [ ] iOS 真机：首页、案例、工地、留资、返回栈正常。
- [ ] 从允许的深链/分享入口进入正确页面；未知入口安全回到首页。
- [ ] 冷启动、热启动、会话过期后可重新登录。
- [ ] 弱网、断网、请求超时后展示可恢复状态，不产生重复留资。
- [ ] 前后台切换后筛选状态、表单状态和最新请求结果一致。
- [ ] 页面没有未处理异常、原始错误栈或调试日志。

证据：`<device / OS / IDE version / screenshots>`

## G. 模板上传、测试、提审与发布（全部为阻断项）

以下步骤只操作本清单记录的安装 ID。IDE 上传、商户 upload、submit-audit、publish 分别保存独立授权记录；sync-status 和只读查询可使用同一验收工单授权。

- [ ] IDE 上传前已记录 Commit、构建结果和模板开发版本。
- [ ] 服务商模板库已生成数字 `template_id`，且来源是本次已验证代码。
- [ ] 使用新的严格 SemVer 调用商户 upload；客户端不能控制 ext JSON。
- [ ] 发布记录从 `created` 进入 `uploaded`，安装和版本归属正确。
- [ ] 测试二维码只能由 `uploaded/testing` 版本生成，测试访问正常。
- [ ] 提审 host 列表唯一、合法，审核说明不含敏感信息。
- [ ] 审核状态同步只匹配当前精确版本，并按 0/1/2/3 映射。
- [ ] 未审核通过时 publish 被拒绝。
- [ ] 审核通过后，经再次授权执行 publish，状态进入 `released`。
- [ ] 发布后安装的模板版本和 submitted/audited/released 时间单调更新。
- [ ] 并发点击时同一安装只有一个外部操作，不发生重复上传/提审/发布。
- [ ] 在 `apps/api` 执行 `bun test src/services/platform-douyin-miniapp-releases/operation-service.recovery.test.ts`，证明 provider 成功、本地写失败后重试通过对账恢复且外部 mutator 只调用一次；共享/生产环境未做破坏性故障注入。
- [ ] 同一聚焦测试证明不确定发布结果返回 `DOUYIN_RELEASE_OUTCOME_UNCERTAIN`，人工核对前没有自动重放。
- [ ] 发布记录、响应和日志不含 claim token、access/refresh token 或 provider 原始响应。

证据：`<release UUID / version / safe log_id / audit screenshots>`

## H. 回滚演练

- [ ] 已记录上一稳定模板库 ID 和功能版本。
- [ ] 回滚使用新的交付 SemVer，不复用旧商户版本号。
- [ ] 回滚仍完整执行 upload、二维码、提审、同步、publish。
- [ ] 未使用 SQL 手工改发布状态、安装模板指针或时间字段。
- [ ] 回滚后重新执行 B–G 中与故障相关的检查。

证据：`<rollback release UUID / new version / approval>`

## I. 观察与签字（租户串线、凭证泄漏、重复发布或批量操作为阻断项）

- [ ] 发布后至少观察一个工作日。
- [ ] 人工核对至少一条测试线索进入正确装修公司。
- [ ] 会话、Bootstrap、短信、留资、事件、token 刷新和发布错误率无异常。
- [ ] 没有租户串线、凭证泄露、重复发布或批量操作。
- [ ] 上一稳定模板仍可用于正常审核回滚。

| 角色 | 姓名 | 结论 | 时间 |
| --- | --- | --- | --- |
| 开发 |  | `通过 / 不通过` |  |
| 测试 |  | `通过 / 不通过` |  |
| 运营 |  | `通过 / 不通过` |  |
| 发布审批人 |  | `批准 / 拒绝` |  |

最终结论：`允许单商户发布 / 停止发布`

未通过项与后续动作：`<items>`
