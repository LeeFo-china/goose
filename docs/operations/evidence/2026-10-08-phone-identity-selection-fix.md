# 手机号多身份登录故障修复

日期：2026-10-08（Asia/Shanghai）。用户反馈验证码登录时提示“统一手机号登录状态返回异常”。

## 根因和修复

手机号匹配多个身份时，服务调用 `begin_phone_identity_selection` 保存候选身份。API 的 `serializeStoredCandidate` 只传身份 ID，遗漏数据库强制要求的 `binding_state`、`display_snapshot`，触发 `PHONE_IDENTITY_SELECTION_PAYLOAD_INVALID`。验证码已被验证，但无法进入身份选择；单身份自动登录不经过这个分支。

生产只读检查确认反馈账号匹配 `customer`、`platform_admin` 两个身份，且实际运行代码的序列化结果缺少上述字段。最近一条对应会话在截图时间附近停留于 `verified`。当前容器日志不包含当时请求，因此不将日志作为该请求的直接证据。检查没有使用用户验证码、绑定身份或修改生产登录会话。

修复补齐绑定状态和展示快照（角色、标题、副标题、换绑类型），复用已有数据库契约，不改变身份识别规则和权限校验。微信和抖音共用该序列化函数。仅发布 API，无数据库 migration，无需修改或发布小程序。

## 回归证据

- 加入候选字段断言后，修复前测试失败；隔离 PostgreSQL 使用实际旧序列化结果调用 RPC，同样报 `PHONE_IDENTITY_SELECTION_PAYLOAD_INVALID`。
- 修复后 82 项测试通过、0 失败，覆盖手机号登录、选择、仓储、schema、路由和抖音登录；`bun run api:check` 的类型检查、构建和文件长度检查通过。
- `helpers.test.ts` 覆盖 `bindable`、`current`、`rebind_required` 三类候选。
- 隔离数据库用实际新序列化结果执行 `supabase/tests/phone_identity_selection.sql` 成功，覆盖验证码领取、候选持久化、选择预留、释放重试、完成与幂等重放；所有夹具在事务末尾回滚。

单元回归命令（在 `apps/api` 下执行，使用测试占位配置）：

```sh
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_PUBLISH=test-publish-key SUPABASE_SERVICE_ROLE_KEY=test-service-role-key bun test src/services/phone-identity-login src/services/douyin-miniapp/customer-auth.test.ts src/repositories/phone-identity-login.test.ts src/schema/phone-identity-login.test.ts src/controllers/phone-identity-login/routes.test.ts
```

数据库 smoke：在具有项目 schema 和手机号登录 migration 的一次性本地数据库中运行。先在相同测试配置下用 Bun 执行 `scripts/fixtures/phone-identity-selection-candidates.ts` 生成 JSON，再通过 psql 的 `-v candidates_json=<生成的 JSON>` 参数执行 `supabase/tests/phone_identity_selection.sql`。禁止在生产库执行这些夹具。

## 发布

应用提交：`f439759fe6bb591b4190bd362eafa88279562f1c`；Tag：`v2026.10.08.2`。

[候选构建](https://github.com/LeeFo-china/goose/actions/runs/37710313173)成功，候选清单的 requested/build services 均仅包含 `api`。生产服务器首次拉取镜像达到 300 秒超时，工作流第二次重试成功，随后完成镜像摘要、revision 和候选校验。

[部署](https://github.com/LeeFo-china/goose/actions/runs/37711312121)成功，回执完成时间为 `2026-10-08T01:08:56Z`（北京时间 09:08:56），服务清单仅包含 `api`。

独立生产验收：

- `gooes-api` 为 `running/healthy`，镜像 revision 等于上述修复提交；公网 API 首页 HTTP 200。
- 使用生产容器中的真实 repository、候选构建器和序列化函数进行只读检查，返回 `candidate_count=2`、`modes=[customer, platform_admin]`、`missing_database_fields=[]`；修复前同一检查缺少 `binding_state` 和 `display_snapshot`。
- 没有修改真实用户身份、会话或数据库数据。隔离测试库已停止，临时开发 worktree 已合并清理。

真实用户登录需要重新获取验证码，不能复用此前已消费或过期的验证码。此次生产验证仅做只读候选检查和健康检查，不代表已代替用户完成登录。
