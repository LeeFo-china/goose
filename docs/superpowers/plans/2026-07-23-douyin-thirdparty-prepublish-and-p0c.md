# 抖音第三方小程序全网发布前置与 P0-C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not spawn subagents unless the user explicitly authorizes delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将第三方小程序应用 `cd67` 从“开发回调与模板预览可用”推进到“测试小程序已授权、模板代码已提交、具备申请全网发布条件”，全网发布通过后再验证一次 Component Token 与正式授权链接能力。

**Architecture:** Template AppID `1b01` 只承载模板源码和模板库版本；另一个普通测试小程序作为全网发布前的 Authorizer，授权成功后由可信回调建立 `merchant / authorized_unbound` 安装，再绑定到 `5H 验收租户 A`。模板库代码通过现有平台 release API 提交到该测试小程序；第三方应用全网发布通过后，P0-C 才刷新一次 Component Token 并验证正式授权链接。所有秘密只在控制台、运行环境或隐藏输入中处理，证据只保留 AppID 尾号、UUID、状态、时间、Git SHA 和安全错误码。

**Tech Stack:** Bun、TypeScript、抖音原生小程序、抖音开发者工具 4.5.4、抖音服务商平台、Fastify、Supabase、GitHub Actions

---

## 1. 对象边界与当前事实

| 对象 | 身份 | 本计划用途 |
| --- | --- | --- |
| `cd67` | 第三方小程序应用 Component AppID | 接收 Ticket/授权回调、获取 Component Token、生成授权链接、代调用 |
| `1b01` | 模板小程序 Template AppID | IDE 上传模板代码、加入模板库、取得数字 `template_id` |
| 普通测试小程序 | Authorizer AppID，必须与 `1b01` 不同 | 全网发布前完成授权并接收模板代码 |
| `5H 验收租户 A` | Gooes 开发环境测试租户 | 绑定普通测试小程序，验证租户隔离和内容 |

当前固定本地基线：

- 工作树：`/Users/leefo/Public/work/gooes/.worktrees/douyin-decoration-miniapp`
- 分支：`feature/douyin-decoration-miniapp`
- 计划编写时 HEAD：`3b400386d68251acbd208cbabe4f05aba085c39f`
- 模板源码树：`6fa6d6eaf96cf9821d197d5a3cba440dfb4d6cf8`
- IDE：`/Applications/抖音开发者工具.app`，版本 `4.5.4`
- 上传根目录：`apps/douyin-mini/src/`
- 首次模板版本：`0.1.0`
- 版本说明：`首个装修行业模板：租户品牌、案例、工地与免费咨询联调版本`
- request 合法域名：`https://api-dev.goodcms.cn`
- 授权事件 URL：`https://api-dev.goodcms.cn/douyin-thirdparty/events/authorization`
- 消息与事件 URL：`https://api-dev.goodcms.cn/douyin-thirdparty/events/message/$APPID$/callback`

官方流程要求：

1. 未全网发布的第三方应用只能授权测试小程序；
2. 发布前必须完成测试小程序授权；
3. 发布前必须通过 OpenAPI 为测试小程序提交代码；
4. 模板代开发先向 Template AppID 上传，再加入模板库取得 `template_id`；
5. 全网发布审核通过后，才能与真实装修公司小程序建立授权关系。

## 2. 本计划授权边界

用户已在 2026-07-23 明确表示：既定计划后续需要确认的操作一次性全部确认。该确认覆盖本计划中已经精确限定的开发环境动作：

- 向 Template AppID `1b01` 上传 `0.1.0`；
- 将该精确上传版本加入 Component `cd67` 的模板库；
- 只读识别并配置一个已经存在的普通测试小程序；
- 为该测试小程序执行一次授权、绑定、模板代码提交和 test-qr；
- 在官方前置条件全部通过后申请第三方应用全网发布；
- 全网发布通过后执行一次 P0-C Component Token/授权链接验证。

该确认不覆盖：

- 新建普通小程序、替用户确定新小程序名称或主体资料；
- 读取、导出或展示 IDE/浏览器登录态、CLI Token、AppSecret、access token、refresh token、Ticket、session key；
- 安装全局 CLI、生成或重置 CLI Token；
- 生产 API/数据库/回调变更；
- 向真实装修公司发送授权链接；
- 商户小程序提审、发布或付费能力开通；
- 数据库手工 DDL/DML、migration、`db push` 或 repair；
- 修改 `/Users/leefo/Public/work/orange`。

## Task 1：锁定 A08 模板上传包

**Files:**

- Read: `apps/douyin-mini/project.config.json`
- Read: `apps/douyin-mini/project.private.config.json`
- Read: `apps/douyin-mini/src/`
- Modify after success: `docs/operations/evidence/2026-07-20-douyin-dev-e2e.md`

- [x] **Step 1：验证工作树和上传根**

Run:

```bash
cd /Users/leefo/Public/work/gooes/.worktrees/douyin-decoration-miniapp
test "$(git branch --show-current)" = "feature/douyin-decoration-miniapp"
test "$(git rev-parse HEAD:apps/douyin-mini/src)" = \
  "6fa6d6eaf96cf9821d197d5a3cba440dfb4d6cf8"
test -z "$(git status --porcelain -- apps/douyin-mini/src)"
test ! -e apps/douyin-mini/ext.json
test ! -e apps/douyin-mini/src/ext.json
```

Expected: 全部退出 `0`。`__MACOSX/`、`goose/` 和私有项目配置不位于 `src/`，不会进入上传包。

- [x] **Step 2：验证项目配置**

Run:

```bash
cd /Users/leefo/Public/work/gooes/.worktrees/douyin-decoration-miniapp
node - <<'NODE'
const fs = require("node:fs");
const project = JSON.parse(fs.readFileSync("apps/douyin-mini/project.config.json", "utf8"));
if (project.miniprogramRoot !== "src/") process.exit(1);
if (project.setting?.urlCheck !== true) process.exit(1);
if (!String(project.appid || "").endsWith("1b01")) process.exit(1);
console.log(JSON.stringify({
  appidTail: String(project.appid).slice(-4),
  miniprogramRoot: project.miniprogramRoot,
  urlCheck: project.setting.urlCheck,
}));
NODE
```

Expected:

```json
{"appidTail":"1b01","miniprogramRoot":"src/","urlCheck":true}
```

- [x] **Step 3：运行上传前门禁**

Run:

```bash
cd /Users/leefo/Public/work/gooes/.worktrees/douyin-decoration-miniapp
bun run douyin-mini:check
bun run api:check
git diff --check
```

Expected: 小程序检查、API typecheck/build/file-size 和 diff 检查全部通过。

- [x] **Step 4：确认上传工具路径**

Run:

```bash
command -v tma || true
defaults read \
  "/Applications/抖音开发者工具.app/Contents/Info.plist" \
  CFBundleShortVersionString
```

Expected: 当前没有 `tma`，IDE 版本为 `4.5.4`。因此本轮使用已安装、已登录的 IDE 手工上传；不安装 CLI，不生成 CLI Token。

执行记录（2026-07-23）：四步均通过。`douyin-mini:check` 为 87 pass、0 fail、
277 expect，并通过 TypeScript 检查；`api:check` 的 typecheck、build 和 file-size
门禁全部通过。源码树保持
`6fa6d6eaf96cf9821d197d5a3cba440dfb4d6cf8`，IDE 为 `4.5.4`，本机无
`tma` 命令。本轮没有安装依赖、读取登录态或修改上传源码。

## Task 2：A08 向 Template AppID 上传 `0.1.0`

**External state:** Template AppID `1b01` 的最新上传记录

**Files:**

- Read: `apps/douyin-mini/`
- Modify after success: `docs/operations/evidence/2026-07-20-douyin-dev-e2e.md`

- [x] **Step 1：在 IDE 核对目标**

在抖音开发者工具打开：

```text
/Users/leefo/Public/work/gooes/.worktrees/douyin-decoration-miniapp/apps/douyin-mini
```

在“详情”中核对：

- AppID 尾号为 `1b01`；
- 第三方应用为“鹅班长装企管家”；
- 模式为模板代开发；
- 项目不含 `ext.json`；
- 当前编译和手机预览正常。

Expected: 五项全部一致。任一不一致立即停止，不上传。

- [x] **Step 2：执行唯一一次上传**

在 IDE 点击“上传”，填写：

```text
版本号：0.1.0
版本说明：首个装修行业模板：租户品牌、案例、工地与免费咨询联调版本
```

Expected: IDE 显示上传成功。模板小程序不生成上传二维码属于正常行为。

执行记录（2026-07-23 23:59 +0800）：用户在收到精确版本号和版本说明后回复
“A08 已上传”。本记录证明用户确认已完成 IDE 动作；A08 仍需下一步服务商控制台
权威回读 `0.1.0` 后才升级为 PASS。

- [x] **Step 3：回读上传记录**

在服务商平台进入：

```text
第三方小程序应用 cd67
→ 开发
→ 模板管理
→ 模板小程序
→ Template AppID 1b01
```

Expected: 最新记录显示版本 `0.1.0`、上述版本说明、当前上传人和本次时间。保存一张不含完整 AppID 和登录身份敏感信息的截图。

- [x] **Step 4：记录 A08**

在 `docs/operations/evidence/2026-07-20-douyin-dev-e2e.md` 的 A08 行记录：

```text
PASS / 0.1.0 / Git SHA 3b400386d68251acbd208cbabe4f05aba085c39f /
source tree 6fa6d6eaf96cf9821d197d5a3cba440dfb4d6cf8 / 北京时间 / 截图文件名
```

不得记录完整 AppID、账号名或任何凭据。

## Task 3：A09 将 `0.1.0` 加入模板库

**External state:** Component `cd67` 的模板库

**Files:**

- Modify after success: `docs/operations/evidence/2026-07-20-douyin-dev-e2e.md`

- [x] **Step 1：添加精确上传版本**

在服务商平台进入：

```text
第三方小程序应用 cd67
→ 开发
→ 模板管理
→ 模板小程序
→ Template AppID 1b01
→ 最新上传版本 0.1.0
→ 添加到模板库
```

Expected: 操作对象明确显示 `0.1.0`；不得选择其他版本，不重复上传。

- [x] **Step 2：验证数字模板 ID**

进入：

```text
第三方小程序应用 cd67
→ 开发
→ 模板管理
→ 模板库
```

Expected: 新记录的版本为 `0.1.0`，模板 ID 为 1–19 位正整数，状态可用于为授权小程序提交代码。

- [x] **Step 3：记录 A09**

在 A09 行记录数字 `template_id`、版本 `0.1.0`、北京时间和脱敏截图文件名。模板 ID 不是秘密，但不得同时暴露完整 Component/Template AppID。

执行记录（2026-07-24 00:09 +0800）：用户从服务商控制台回读并确认
`0.1.0`、说明“首个装修行业模板：租户品牌、案例、工地与免费咨询联调版本”
以及数字 `template_id=77538`。A08/A09 均升级为 PASS；没有第二次上传、
测试商户代码提交、提审或发布。

## Task 4：识别普通测试小程序并完成控制面门禁

**External state:** Component `cd67` 开发配置

**Files:**

- Modify after success: `docs/operations/evidence/2026-07-20-douyin-dev-e2e.md`
- Modify after success: `docs/operations/evidence/2026-07-23-douyin-tenant-binding-p0-readiness.md`

- [x] **Step 1：只读识别普通测试小程序**

在服务商平台进入：

```text
第三方小程序应用 cd67
→ 代开发流程指引
→ 授权测试小程序
```

检查“授权测试小程序列表”。

Expected: 至少有一个普通小程序 AppID，且尾号不为 `1b01`。记录应用名称、AppID 尾号和当前授权状态。

停止条件：列表为空，或列表中只有 `1b01`。此时不得创建新小程序；向用户报告“缺少普通测试 Authorizer”，由用户确定是否新建及其名称、主体和类目。

执行记录（2026-07-24 10:01 +0800）：用户从 Component `cd67` 控制台确认
“授权测试小程序列表”为空。开发库和 gooes 工作区的独立只读发现也只存在
Template `1b01`，普通 merchant/Authorizer 为 0。已命中本步骤停止条件；
继续前必须由用户确定新建普通小程序的名称、主体和类目，并由主体负责人本人接受
平台协议和提交创建申请。

- [x] **Step 1A：由主体负责人创建普通测试小程序**

官方基础信息审核规则要求名称为 4～20 个中文、数字或英文字，并建议采用
“品牌/企业关键词 + 行业词”的可辨识组合。结合河南好店主体、模板实际页面和
首轮仅验证装修资讯、案例/工地展示、在线预约与人工咨询的范围，本轮预填方案为：

```text
应用类型：小程序（不是小游戏）
主体：河南好店大数据科技有限公司
建议名称：好店装修服务
服务类目：房地产 → 房地产 → 装修/建材
主营类目：装修/建材
简介：提供装修案例、在建工地、服务区域展示及免费装修咨询预约服务。
用途：第三方代开发应用 cd67 的预发布普通测试 Authorizer
```

“装修/建材”官方适用范围为家居建材装修资讯、在线预约和人工咨询，与当前模板
精确匹配；企业主体开放类目表对该项未列额外行业资质。不得为了通过审核额外选择
电商“家居家电”、商品房预售、物业管理或其他模板没有实际功能的类目。

提交前停止并由主体负责人完成三项确认：

1. 控制台显示主体仍为“河南好店大数据科技有限公司”，且主体额度可用；
2. 确认采用“好店装修服务”；若平台提示重名，记录原始提示后重新确定名称；
3. 本人阅读并接受平台服务协议后提交创建申请。

Expected: 创建/审核通过后记录应用名称与 AppID 尾号；不得记录完整 AppID，不得把
Template `1b01` 或 Component `cd67` 误记为新普通小程序。

执行记录（2026-07-24 10:11 +0800）：用户确认已注册普通小程序“好店装修服务”，
AppID 尾号为 `d301`，并已将其加入 Component `cd67` 的“授权测试小程序列表”。
本计划与 Git 证据不记录完整 AppID。普通测试 Authorizer 缺口解除，后续授权只能
选择该名称和尾号，不能选择 Template `1b01`。

同一时间对开发库执行分页只读安全投影：Component `cd67` 为 `active`，最新
Ticket 于北京时间 10:10 到达；安装总数仍为 1，只有 Template `1b01`，
merchant 为 0。该结果证明列表添加尚未被误判为授权；下一步必须完成官方测试授权，
由可信 `AUTHORIZED` 回调创建普通 merchant 安装。

- [ ] **Step 2：核对开发配置**

同一页面必须权威回读：

```text
授权域名：已配置为本次开发授权完成页所属域名
授权事件接收 URL：https://api-dev.goodcms.cn/douyin-thirdparty/events/authorization
消息与事件接收 URL：https://api-dev.goodcms.cn/douyin-thirdparty/events/message/$APPID$/callback
消息验证 TOKEN：已设置
消息加密解密 KEY：已设置
```

Expected: 两个 URL 逐字符一致，Token/AES 只确认“已设置”，不显示、不复制、不轮换。

- [ ] **Step 3：固定本轮测试授权模式**

本轮全网发布前测试使用服务商控制台提供的官方授权入口，不传
`redirect_uri`。官方“直接获取授权链接”接口将 `redirect_uri` 标记为可选，
未传时授权完成后不跳转；可信 `AUTHORIZED` 通知仍推送到现有授权事件接收 URL。

控制台精确入口为：

```text
第三方小程序应用 cd67
→ 开发
→ 开发配置
→ 页面顶部“授权链接”
→ “小程序代开发”行
→ 获取
```

“代开发流程指引 → 授权测试小程序”卡片仅用于完善授权相关开发配置、添加测试
小程序和查看授权链路 OpenAPI 文档；它本身没有“获取授权链接”按钮。不得选择
同一区域的“小程序代创建+代开发”，因为普通测试小程序“好店装修服务”已经创建。

Expected: 当前授权域名只读记录但不作为测试授权阻断项，不修改授权域名，不使用
临时页面或第三方域名。固定开发授权完成页
`https://admin-dev.goodcms.cn/platform/douyin-miniapps/authorization/callback`
留到后续租户侧“小程序中心”设计与实现阶段。

- [ ] **Step 4：核对第三方应用发布状态**

进入：

```text
第三方小程序应用 cd67
→ 代开发流程指引
```

Expected: 当前仍可能显示“未发布”；此时属于预发布阶段正常状态。记录前 3 步每一项的完成/未完成状态，不把“未发布”误判为 P0-C 已通过。

## Task 5：A06/A07 完成测试小程序授权与租户绑定

**External state:** 测试 Authorizer 授权、Gooes 开发安装

**Files:**

- Read: `apps/api/src/controllers/douyin-third-party-events/index.ts`
- Read: `apps/api/src/controllers/platform-douyin-miniapps/index.ts`
- Modify after success: `docs/operations/evidence/2026-07-20-douyin-dev-e2e.md`

- [ ] **Step 1：打开官方测试授权入口**

从 Component `cd67` 的“开发 → 开发配置”页面顶部“授权链接”区域，在
“小程序代开发”行点击“获取”并打开授权页。不要点击“小程序代创建+代开发”。
只选择 Task 4 已识别的普通测试小程序，授予本次代开发需要的开发管理和运营管理
权限。

Expected: 页面完成授权；授权事件回调返回 `success`。不得选择 Template `1b01`。

- [ ] **Step 2：用平台分页接口定位唯一安装**

使用已存在的短生命周期开发平台管理员会话，将 JWT 仅置于当前 shell 变量 `ADMIN_TOKEN`，执行：

```bash
INSTALLATIONS_RESPONSE="$(curl -fsS \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  'https://api-dev.goodcms.cn/platform/douyin-miniapps?page=1&pageSize=100')"
jq -e \
  '[.data.list[] |
    select(.installation_kind == "merchant" and
           .authorization_status == "authorized_unbound")] |
   length == 1' <<< "$INSTALLATIONS_RESPONSE" >/dev/null
MERCHANT_INSTALLATION_ID="$(jq -er \
  '.data.list[] |
   select(.installation_kind == "merchant" and
          .authorization_status == "authorized_unbound") |
   .id' <<< "$INSTALLATIONS_RESPONSE")"
MERCHANT_APP_TAIL="$(jq -er --arg id "$MERCHANT_INSTALLATION_ID" \
  '.data.list[] | select(.id == $id) | .authorizer_appid[-4:]' \
  <<< "$INSTALLATIONS_RESPONSE")"
unset INSTALLATIONS_RESPONSE
```

Expected: 唯一安装为 Task 4 记录的 AppID 尾号。若为 0 或大于 1，停止并按尾号人工消歧，不绑定。

- [ ] **Step 3：只读验证凭证信封**

通过只读数据库查询工具，以安装 UUID 为绑定参数，只返回布尔值：

```sql
select
  right(authorizer_appid, 4) as appid_suffix,
  access_token_ciphertext is not null as has_access_ciphertext,
  access_token_iv is not null as has_access_iv,
  access_token_tag is not null as has_access_tag,
  access_token_key_version is not null as has_access_key_version,
  access_token_expires_at > now() as access_expires_in_future,
  refresh_token_ciphertext is not null as has_refresh_ciphertext,
  refresh_token_iv is not null as has_refresh_iv,
  refresh_token_tag is not null as has_refresh_tag,
  refresh_token_key_version is not null as has_refresh_key_version,
  refresh_token_expires_at > now() as refresh_expires_in_future
from public.douyin_miniapp_installations
where id = :merchant_installation_id;
```

Expected: 恰好一行，八个信封/有效期布尔值全部为 `true`。不得选择密文或 token 原值。

- [ ] **Step 4：绑定 `5H 验收租户 A`**

先通过现有平台 API 只读取得该租户 UUID 和当前模板开发安装的 `runtime_config`，确认名称精确为 `5H 验收租户 A`。然后执行：

```bash
MERCHANT_BIND_RESPONSE="$(curl -fsS \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -X POST \
  "https://api-dev.goodcms.cn/platform/douyin-miniapps/$MERCHANT_INSTALLATION_ID/bind" \
  --data "$(jq -nc \
    --arg tenant "$MAIN_TENANT_ID" \
    --argjson runtime "$RUNTIME_CONFIG" \
    '{tenant_id:$tenant,runtime_config:$runtime}')")"
jq -e --arg tenant "$MAIN_TENANT_ID" \
  '.data.installation_kind == "merchant" and
   .data.authorization_status == "active" and
   .data.tenant_id == $tenant and
   (has("deployment_key") | not)' \
  <<< "$MERCHANT_BIND_RESPONSE" >/dev/null
unset MERCHANT_BIND_RESPONSE
```

Expected: 安装状态为 `active`，租户 UUID 一致，安全响应不泄露 deployment key。

- [ ] **Step 5：记录并清理会话**

记录 Authorizer 尾号、安装 UUID、租户 UUID、授权和绑定时间、安全状态；随后：

```bash
unset ADMIN_TOKEN MAIN_TENANT_ID RUNTIME_CONFIG
```

## Task 6：用模板库代码为测试小程序提交代码

**External state:** 一条开发 release、测试小程序测试版、test-qr

**Files:**

- Read: `apps/api/src/controllers/platform-douyin-miniapps/index.ts`
- Read: `apps/api/src/schema/platform-douyin-miniapps.ts`
- Modify after success: `docs/operations/evidence/2026-07-20-douyin-dev-e2e.md`

- [ ] **Step 1：准备唯一交付版本**

Run:

```bash
TEMPLATE_VERSION="0.1.0-dev.$(date -u +%Y%m%d%H%M%S)"
[[ "$TEMPLATE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+-dev\.[0-9]{14}$ ]]
```

Expected: 得到严格 SemVer，且不复用已有商户交付版本。

- [ ] **Step 2：调用单安装 upload**

使用 Task 3 的数字 `TEMPLATE_ID`、Task 5 的 `MERCHANT_INSTALLATION_ID` 和新的短生命周期 `ADMIN_TOKEN`：

```bash
UPLOAD_RESPONSE="$(curl -fsS \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -X POST \
  "https://api-dev.goodcms.cn/platform/douyin-miniapps/$MERCHANT_INSTALLATION_ID/releases/upload" \
  --data "$(jq -nc \
    --arg templateId "$TEMPLATE_ID" \
    --arg version "$TEMPLATE_VERSION" \
    '{template_id:$templateId,
      template_version:$version,
      description:"装修行业营销获客模板开发联调",
      channel:"default"}')")"
RELEASE_ID="$(jq -er '.data.id' <<< "$UPLOAD_RESPONSE")"
jq -e --arg version "$TEMPLATE_VERSION" \
  '.data.status == "uploaded" and .data.template_version == $version' \
  <<< "$UPLOAD_RESPONSE" >/dev/null
unset UPLOAD_RESPONSE
```

Expected: 精确一条 release 进入 `uploaded`。平台已经通过 OpenAPI 为测试小程序提交代码。

- [ ] **Step 3：生成测试二维码**

Run:

```bash
QR_RESPONSE="$(curl -fsS \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -X POST \
  "https://api-dev.goodcms.cn/platform/douyin-miniapps/$MERCHANT_INSTALLATION_ID/releases/$RELEASE_ID/test-qr" \
  --data '{}')"
jq -e \
  '.data.status == "testing" and
   (.data.test_qr_url | type == "string" and length > 0)' \
  <<< "$QR_RESPONSE" >/dev/null
unset QR_RESPONSE
```

Expected: release 进入 `testing` 并返回测试二维码。不得调用商户 `submit-audit` 或 `publish`。

- [ ] **Step 4：手机验证测试 Authorizer**

使用抖音扫码，确认：

1. 首页公司名与 `5H 验收租户 A` 当前服务端名称一致；
2. 案例和工地来自该租户；
3. 修改租户名称并重新进入后能刷新，不依赖编译期硬编码；
4. request 请求只访问 `api-dev.goodcms.cn`；
5. Template `1b01` 的开发预览与普通测试 Authorizer 是两个不同身份。

Expected: 五项通过，无跨租户数据。

- [ ] **Step 5：记录并清理**

记录 `template_id`、交付 SemVer、release UUID、Authorizer 尾号、北京时间和脱敏截图；随后：

```bash
unset ADMIN_TOKEN TEMPLATE_ID TEMPLATE_VERSION MERCHANT_INSTALLATION_ID RELEASE_ID
```

## Task 7：申请第三方应用全网发布

**External state:** Component `cd67` 发布审核

**Files:**

- Modify after action: `docs/operations/evidence/2026-07-23-douyin-tenant-binding-p0-readiness.md`

- [ ] **Step 1：回读官方前置状态**

进入 Component `cd67` 的“代开发流程指引”。

Expected:

```text
创建第三方小程序应用：已完成
授权测试/添加模板小程序：已完成
提交测试小程序代码：已完成
测试小程序代码：已提交
```

任一未完成时停止，按页面具体提示修复；不得通过假状态、手工数据库写入或真实商户授权绕过。

- [ ] **Step 2：复核开发配置和基本信息**

进入：

```text
开发 → 开发配置
设置 → 基本信息
```

Expected: 授权域名、两个回调 URL、应用简介、公司主体和业务范围均与已确认材料一致；Token/AES 只确认已设置。

- [ ] **Step 3：提交全网发布**

回到“代开发流程指引”，点击：

```text
发布第三方小程序应用 → 发布应用
```

Expected: 页面显示已提交审核或已发布。若提示还需“提交和提审测试小程序”，停止并把提示原文记录到证据文档；不得自动调用商户提审接口。

- [ ] **Step 4：等待并权威回读**

只读回读应用状态。

Expected: 只有状态明确为“已发布/全网发布成功”才可进入 Task 8。审核中或驳回都不视为通过。

## Task 8：P0-C Component Token 与正式授权链接验证

**External state:** 最多一次 Component Token 刷新、一个未发送给真实商户的授权链接

**Files:**

- Modify after success: `docs/operations/evidence/2026-07-23-douyin-tenant-binding-p0-readiness.md`

- [ ] **Step 1：只读运行门禁**

确认：

```text
Component cd67：全网已发布
authorization 回调：最近 20 分钟内持续 200
Ticket：最近 20 分钟内已更新
开发 API：healthy
migration：Local/Remote 对齐且 mismatch 0
在途开发部署：0
```

Expected: 六项全部通过。

- [ ] **Step 2：触发一次 Component Token 能力**

通过现有服务端 access-token service 的受控调用路径触发一次获取。只记录：

```text
result=PASS|FAIL
source=cached|refreshed
expires_in_future=true|false
safe_error_code
log_id
```

不得打印或返回 token 原值。只允许一次外部刷新；结果不确定时停止，不盲目重试。

- [ ] **Step 3：验证不带跳转的授权链接生成**

P0-C 先生成一个不传 `redirect_uri` 的 `link_type=1` 授权链接，只验证：

- 返回成功；
- 目标 Component 尾号为 `cd67`；
- 未返回 `40058`；
- 链接不发送给任何真实装修公司。

证据文档不得保存完整授权 URL 或其中的临时参数。

后续租户侧“小程序中心”实现并部署固定授权完成页后，再单独验证带
`redirect_uri` 的授权链接和 `admin-dev.goodcms.cn` 授权域名；该生产化门禁
不阻塞本轮全网发布前测试授权。

- [ ] **Step 4：更新 P0-R 结论**

将 `docs/operations/evidence/2026-07-23-douyin-tenant-binding-p0-readiness.md` 更新为：

```text
开发测试租户授权链路：PASS
Component Token：PASS
授权链接生成：PASS
真实装修公司授权入口：仍关闭，等待租户侧小程序中心实现和生产上线门禁
```

- [ ] **Step 5：最终验证并提交文档**

Run:

```bash
cd /Users/leefo/Public/work/gooes/.worktrees/douyin-decoration-miniapp
bun run douyin-mini:check
bun run api:check
git diff --check
git status --short
```

Expected: 检查全部通过；只提交本计划和本轮明确更新的证据文档，不提交 `project.config.json`、`project.private.config.json`、`__MACOSX/`、`goose/` 或其他用户文件。

Commit:

```bash
git add \
  docs/superpowers/plans/2026-07-23-douyin-thirdparty-prepublish-and-p0c.md \
  docs/operations/evidence/2026-07-20-douyin-dev-e2e.md \
  docs/operations/evidence/2026-07-23-douyin-tenant-binding-p0-readiness.md
git diff --cached --check
git commit -m "docs(douyin): record third-party prepublish validation"
```

## 3. 停止与恢复规则

- A08 上传成功后不得再上传第二个模板版本，直到 A09 已取得 `template_id`。
- 没有普通测试 Authorizer 时停止；Template `1b01` 不能兼任测试商户。
- 授权回调没有生成唯一 `authorized_unbound` 安装时停止，不手工补库。
- Component/Authorizer 凭证不得出现在终端输出、截图、证据或 Git。
- provider 成功但本地 release 写入不确定时，按现有
  `DOUYIN_RELEASE_OUTCOME_UNCERTAIN` 运维规则停止并对账，不重复提交。
- 全网发布审核中时只读等待；审核驳回时记录原因并重新规划，不重复点击。
- P0-C 失败只记录安全错误码和 `log_id`，不轮换 Token/AES，不修改回调 URL，不重启或部署。
- 本计划不启用真实装修公司授权入口，不执行生产发布。

## 4. 官方依据

- [授权测试/添加模板小程序](https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/guide/template/establish)
- [提交测试小程序代码](https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/guide/template/step-3-submit-code)
- [发布第三方小程序应用](https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/guide/template/publishing)
- [代开发环节说明](https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/overview-guide/smallprogram/DevelopingCode)
- [基础信息审核标准](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/operation/miniapp-creation/basic-info/basic-info-audit-standard)
- [企业主体开放服务类目](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/operation/service-category/commercial-service-category)
- [小程序类目介绍](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/operation/service-category/Categories)
- [小程序命令行工具](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/dev-tools/developer-instrument/development-assistance/ide-cli)
- [CLI 免密登录](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/dev-tools/developer-instrument/development-assistance/cli-token)
