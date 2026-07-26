# 租户抖音小程序工作台 Phase 2 验证记录

**执行时间：** 2026-07-26  
**环境：** development  
**功能分支：** `feature/douyin-decoration-miniapp`  
**部署提交：** `c549f01365714fe953534ab98e938000521bb1c8`  
**当前结论：** `PARTIAL / BLOCKED_BY_DOUYIN_PREREQUISITE`

## 1. 范围

本阶段实现并验证以下租户侧能力：

- 创建短期抖音授权意图并获取授权链接；
- 安全完成授权回调和租户绑定；
- 生成授权小程序体验二维码；
- 租户提交审核并同步审核状态；
- 保持正式发布为平台专属能力；
- Admin 工作台提供对应交互，但不暴露凭证、上传或正式发布入口。

本阶段不操作生产环境，不发布第三方小程序应用，不正式发布商户小程序。

## 2. 代码与静态验证

部署前验证结果：

| 验证 | 结果 |
| --- | --- |
| Domain 聚焦测试 | `26 pass / 0 fail` |
| Admin 聚焦测试 | `25 pass / 0 fail` |
| API 聚焦测试 | `12 pass / 0 fail` |
| `pnpm --dir apps/admin check` | PASS |
| `bun run api:check` | PASS |
| `git diff --check` | PASS |
| Admin 单文件大小门禁 | PASS，`workspace-actions.tsx` 为 499 行 |

浏览器本地回调安全 smoke 已验证：

- 回调页进入后立即从浏览器历史移除 `intent`、`authorization_code` 和
  `expires_in` 查询参数；
- 无效回调只显示安全错误，不渲染授权码；
- React StrictMode 下使用一次性执行门禁，避免重复兑换授权码。

## 3. Migration

Migration：

`20260726110000_tenant_douyin_authorization_intents.sql`

应用前门禁：

- 开发库现有安装记录 2 条；
- active merchant 安装 1 条；
- active merchant 空租户 0 条；
- active merchant 重复租户 0 组；
- active component 1 条；
- dry-run 仅包含该 migration。

应用结果：

- migration 已通过受控 `supabase db push` 应用到明确授权的开发库；
- Local/Remote 均包含 `20260726110000`；
- Release Dev 运行生成的严格证据为：
  - `migration_history_aligned=true`
  - `target_migration_present=true`
- 表直接访问对 `service_role` 返回 `42501`；
- 无效参数调用 `claim_tenant_douyin_authorization_intent` 返回
  `22023 / DOUYIN_AUTHORIZATION_INTENT_INVALID`，证明写入必须经过 RPC。

回滚顺序：

1. 先禁用租户授权链接与回调端点；
2. 停止授权事件 code digest 关联；
3. 删除授权意图 RPC、索引、触发器和表；
4. 删除授权事件表的 `authorization_code_digest`；
5. 不删除既有安装、凭证或 release。

## 4. 开发环境配置与部署

新增非秘密环境项：

```text
DOUYIN_TENANT_AUTHORIZATION_REDIRECT_URI=https://admin-dev.goodcms.cn/douyin-miniapp/authorize/callback
```

写入方式：

- 仅追加到 `/opt/gooes-dev/docker/.env.dev.api`；
- 原文件和备份均保持 `0600`；
- 备份为
  `/opt/gooes-dev/docker/.env.dev.api.backup.20260726T142938Z`；
- 写入时未重启、未部署，随后由正式 Release Dev 加载。

Release Dev：

- Run ID：`30206251191`
- URL：`https://github.com/LeeFo-china/goose/actions/runs/30206251191`
- 运行时间：2026-07-26 22:31:23 至 22:37:31（UTC+8）
- 结论：`success`
- 服务：`api,admin`
- migration 严格门禁：PASS
- API 部署及健康检查：PASS
- Admin 部署及健康检查：PASS

部署后容器：

| 服务 | revision | 健康状态 |
| --- | --- | --- |
| API | `c549f01365714fe953534ab98e938000521bb1c8` | healthy |
| Admin | `c549f01365714fe953534ab98e938000521bb1c8` | healthy |

API 容器内回调环境项比对为 `MATCH`，未输出其他环境变量或凭证。

## 5. 真实开发环境 smoke

### 5.1 工作台读取

使用仓库定义的 5H 合成验收账号，通过
`https://admin-dev.goodcms.cn/api/backend` 代理读取：

| 项目 | 结果 |
| --- | --- |
| 租户 | `51111111-1111-4111-8111-111111111111` / `5H 验收租户 AAA` |
| Authorizer | 尾号 `d301` |
| 安装 | merchant / active |
| release | `ea547440-fb61-41fa-bf1c-8c0a6304b646` / `0.1.2` / testing |
| 公开资料 | published |
| 内容 | 案例 1、工地 1、active 服务区域 1 |

响应未包含 deployment key、access token、refresh token 或其他凭证。

### 5.2 体验二维码

只调用一次租户体验二维码接口：

- HTTP 200；
- release 仍为 `0.1.2 / testing`；
- 新 URL 来自 `https://p9-developer-sign.bytemaimg.com`；
- `x-expires` 位于未来；
- 二维码图片 HTTP 200；
- 完整签名 URL 未写入证据。

该结果同时验证了 Admin/API 新增的过期二维码判断修复：旧 URL 不再被误判为
可提审，新生成 URL 可正常进入提审前置状态。

### 5.3 安全边界

| 操作 | 结果 |
| --- | --- |
| 已绑定租户再次创建授权链接 | `409 / DOUYIN_TENANT_ALREADY_AUTHORIZED` |
| testing release 提前同步审核状态 | `409 / DOUYIN_RELEASE_STATE_CONFLICT` |
| 租户调用平台正式发布接口 | `403 / FORBIDDEN` |

租户 API 中不存在 upload 或 publish 路由；平台 publish 再由平台管理员身份门禁。

## 6. 抖音平台阻断

### 6.1 提交审核

提审输入：

- release：`0.1.2`
- host：`douyin`
- audit note：`装修行业模板 0.1.2 租户联调审核`

执行证据：

1. 查询抖音可用审核宿主成功，证明 `douyin` 是当前 Authorizer 可用宿主；
2. 失败位置精确位于
   `POST https://open.douyin.com/api/apps/v2/package_version/audit/`；
3. 抖音 log ID：
   `20260726230141377A94380710077AE13D`；
4. API 安全返回
   `502 / DOUYIN_OPEN_PLATFORM_API_ERROR`；
5. release 回落并保持 `testing`，审核意图和安全失败码已记录，操作锁已释放；
6. 只执行一次同意图幂等恢复。抖音版本列表未出现 `0.1.2` 的 audit/current
   记录，返回
   `409 / DOUYIN_RELEASE_OUTCOME_UNCERTAIN`，证明平台未受理，未再次提交。

官方提审文档列出的常见前置阻断包括：

- `11302`：测试版本未找到；
- `11305`：主体认证未完成；
- `11306`：名称、简介、图标或服务类目未完成；
- `11307`：提审宿主不正确。

当前已排除 `11307`，也已通过二维码证明测试版本存在；还需在 d301 控制台核对
主体认证及名称、简介、图标、服务类目状态。现有安全错误映射未保留抖音数字
`err_no`，所以不能在没有控制台证据的情况下把 `11305` 或 `11306` 写成已确认
根因。

官方文档：

- `https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/API/smallprogram/auth-app-manage/develop/audit-code-v2`
- `https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/guide/template/publishing`

### 6.2 API 生成授权链接

未绑定开发租户调用授权链接接口时：

- 失败位置精确位于
  `POST https://open.douyin.com/api/tpapp/v3/auth/gen_link/`；
- 抖音 log ID：
  `20260726230740A33CC58BFF7900B6F479`；
- API 安全返回
  `502 / DOUYIN_OPEN_PLATFORM_API_ERROR`；
- 本地授权意图由服务标记为失败，没有返回或保存可用授权链接。

官方文档要求：

- scope 为 `thirdparty.dev.auth`；
- `redirect_uri` 域名必须与第三方小程序应用控制台的“授权域名”完全一致；
- 未全网发布的第三方应用只能与“授权测试小程序列表”中的小程序建立授权关系。

需在 cd67 控制台核对：

1. 授权域名是否精确为 `admin-dev.goodcms.cn`；
2. 第三方小程序权限集中是否仍包含开发管理权限；
3. 目标测试小程序是否仍在授权测试小程序列表；
4. 第三方应用当前是否处于允许测试授权的状态。

官方文档：

- `https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/API/smallprogram/authorization/gen-link-v2`
- `https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/guide/customization/establish`
- `https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/overview-guide/smallprogram/permissions`

## 7. Chrome 证据边界

Chrome 已打开：

`https://admin-dev.goodcms.cn/douyin-miniapp/workspace`

标签页可发现且标题为“鹅班长”，但 Chrome 插件在页面 Playwright DOM 和可交互
DOM 两种读取方式均超时。未使用 AppleScript、独立 Playwright、屏幕控制或其他
替代机制绕过该边界。

因此本记录不把开发域名 UI smoke 写成 PASS。功能验证来自固定 SHA 容器健康检查、
正式域名 HTTP 接口和抖音真实 OpenAPI 调用。

## 8. Phase 2 退出结论

已通过：

- workspace；
- 已绑定租户隔离；
- 真实体验二维码；
- 过期二维码防误提审；
- 正式发布平台专属；
- migration、部署与凭证不泄露门禁。

尚未通过：

- 新租户授权链接；
- 移动端完成新授权；
- 抖音受理 0.1.2 提审；
- audit pending 后的状态同步；
- 开发域名 Chrome UI 交互证据。

Phase 2 不能标记完成，也不能进入依赖审核成功的 Phase 3。下一次重试前必须先取得
cd67 授权域名/权限集/测试列表和 d301 主体认证/基本信息的控制台证据；修正平台
前置条件后，每个写接口最多重试一次，并继续保留抖音 log ID。
