# 抖音扩展配置包装层修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复抖音商家测试小程序无法从官方 `extConfig` 包装层读取 `deployment_key` 的缺陷，并让 `d301` 的 `0.1.2` 测试版完成会话、内容和租户隔离验收。

**Architecture:** 只修改抖音原生小程序的扩展配置边界：优先解析官方 `extConfig`，同时保留旧 `ext` 和直接对象兼容。服务端部署标识校验、数据库安装记录和租户绑定保持不变；修复版必须先进入新的模板库条目，再用于构建商家测试版。

**Tech Stack:** Bun test、TypeScript、抖音原生小程序、抖音开发者工具、抖音第三方小程序 OpenAPI、Fastify 开发 API。

---

## 文件结构

- Create: `apps/douyin-mini/src/platform/ext-config.test.ts`
  - 以真实官方包装结构和兼容结构验证扩展配置解析。
- Modify: `apps/douyin-mini/src/platform/ext-config.ts`
  - 在外部输入边界选择官方或兼容配置对象。
- Create: `docs/operations/evidence/2026-07-26-douyin-d301-ext-config-fix.md`
  - 记录非秘密的测试、模板、商家构建和手机验收证据。
- Read only: `apps/douyin-mini/project.config.json`
  - 保持 Template AppID 与 `urlCheck=true`，不把当前用户改动纳入修复提交。
- Read only: `apps/api/src/services/douyin-miniapp/session.ts`
  - 确认服务端 `deployment_key` 精确校验未变。

### Task 1：建立官方返回结构的回归测试

**Files:**

- Create: `apps/douyin-mini/src/platform/ext-config.test.ts`
- Read: `apps/douyin-mini/src/platform/ext-config.ts`

- [ ] **Step 1：写入失败测试与兼容性测试**

使用 `apply_patch` 创建：

```ts
import { afterEach, describe, expect, test } from "bun:test";
import { readDeploymentConfig } from "./ext-config";

const originalTtDescriptor = Object.getOwnPropertyDescriptor(globalThis, "tt");

function stubExtConfig(value: unknown): void {
  Object.defineProperty(globalThis, "tt", {
    configurable: true,
    value: { getExtConfigSync: () => value },
  });
}

afterEach(() => {
  if (originalTtDescriptor) {
    Object.defineProperty(globalThis, "tt", originalTtDescriptor);
    return;
  }
  Reflect.deleteProperty(globalThis, "tt");
});

describe("readDeploymentConfig", () => {
  test("reads and normalizes the official extConfig wrapper", () => {
    stubExtConfig({
      extConfig: { deployment_key: "  merchant-deployment-key  " },
    });

    expect(readDeploymentConfig()).toEqual({
      deployment_key: "merchant-deployment-key",
    });
  });

  test.each([
    [{ ext: { deployment_key: "legacy-key" } }, "legacy-key"],
    [{ deployment_key: "direct-key" }, "direct-key"],
  ] as const)("keeps compatibility with %p", (raw, expected) => {
    stubExtConfig(raw);
    expect(readDeploymentConfig()).toEqual({ deployment_key: expected });
  });

  test("prefers the official wrapper when multiple shapes are present", () => {
    stubExtConfig({
      extConfig: { deployment_key: "official-key" },
      ext: { deployment_key: "legacy-key" },
      deployment_key: "direct-key",
    });

    expect(readDeploymentConfig()).toEqual({
      deployment_key: "official-key",
    });
  });

  test.each([
    { extConfig: { deployment_key: "" } },
    { extConfig: { deployment_key: " ".repeat(4) } },
    { extConfig: { deployment_key: 42 } },
    { extConfig: { deployment_key: "x".repeat(129) } },
    { extConfig: [] },
  ])("rejects invalid deployment config %p", (raw) => {
    stubExtConfig(raw);
    expect(readDeploymentConfig()).toEqual({});
  });
});
```

- [ ] **Step 2：运行聚焦测试并确认 RED**

Run:

```bash
bun test apps/douyin-mini/src/platform/ext-config.test.ts
```

Expected: 至少“reads and normalizes the official extConfig wrapper”失败，实际值为
`{}`；失败原因必须是当前实现未解析 `extConfig`，不能是 `tt` 未定义、导入失败或
测试语法错误。

- [ ] **Step 3：确认生产文件尚未变化**

Run:

```bash
git diff --exit-code -- apps/douyin-mini/src/platform/ext-config.ts
```

Expected: exit 0。此时只允许新增测试文件。

### Task 2：最小实现官方包装层解析

**Files:**

- Modify: `apps/douyin-mini/src/platform/ext-config.ts`
- Test: `apps/douyin-mini/src/platform/ext-config.test.ts`

- [ ] **Step 1：写入最小实现**

使用 `apply_patch` 将 `readDeploymentConfig()` 修改为：

```ts
export function readDeploymentConfig(): DeploymentConfig {
  const raw = tt.getExtConfigSync();
  const nested = isRecord(raw.extConfig)
    ? raw.extConfig
    : isRecord(raw.ext)
      ? raw.ext
      : raw;
  const deploymentKey = typeof nested.deployment_key === "string"
    ? nested.deployment_key.trim()
    : "";
  return deploymentKey && deploymentKey.length <= 128
    ? { deployment_key: deploymentKey }
    : {};
}
```

不修改 `isRecord()`，不增加回退到 AppID-only 会话。

- [ ] **Step 2：运行聚焦测试并确认 GREEN**

Run:

```bash
bun test apps/douyin-mini/src/platform/ext-config.test.ts
```

Expected: 全部测试通过，0 fail。

- [ ] **Step 3：运行抖音小程序完整静态门禁**

Run:

```bash
bun run douyin-mini:check
```

Expected: `bun test` 全部通过，随后 `tsc -p tsconfig.json --noEmit` exit 0。

- [ ] **Step 4：检查差异边界**

Run:

```bash
git diff --check
git diff -- \
  apps/douyin-mini/src/platform/ext-config.ts \
  apps/douyin-mini/src/platform/ext-config.test.ts
git status --short
```

Expected:

- 实现差异只涉及包装层选择；
- 测试不输出部署标识、token 或租户信息；
- 既有 `project.config.json`、证据文档和未跟踪文件保持原状；
- 没有 Orange 仓库写入。

- [ ] **Step 5：提交代码修复**

Run:

```bash
git add -- \
  apps/douyin-mini/src/platform/ext-config.ts \
  apps/douyin-mini/src/platform/ext-config.test.ts
test "$(git diff --cached --name-only | sort)" = \
"apps/douyin-mini/src/platform/ext-config.test.ts
apps/douyin-mini/src/platform/ext-config.ts"
git commit -m "fix(douyin): 修复扩展配置包装层解析"
```

Expected: 单一代码提交成功，提交钩子通过。

### Task 3：推送修复并建立模板交付门禁

**Files:**

- Read: `apps/douyin-mini/project.config.json`
- Read: `apps/douyin-mini/src/app.json`
- Read: `apps/douyin-mini/src/platform/ext-config.ts`

- [ ] **Step 1：重新验证提交和工作区边界**

Run:

```bash
git show --stat --oneline HEAD
git show --format= --name-only HEAD | sort
git status --short
```

Expected: HEAD 只包含两个 Task 2 文件；用户既有脏文件未被暂存或改写。

- [ ] **Step 2：普通推送功能分支**

Run:

```bash
test "$(git branch --show-current)" = "feature/douyin-decoration-miniapp"
git push origin feature/douyin-decoration-miniapp
test "$(git rev-parse HEAD)" = \
  "$(git rev-parse origin/feature/douyin-decoration-miniapp)"
```

Expected: 普通 push 成功，不强推，不触发生产部署。

- [ ] **Step 3：验证 IDE 项目身份与域名校验**

Run:

```bash
jq -e '
  .appid == "tt0d647bd99301341b01" and
  .miniprogramRoot == "src/" and
  .setting.urlCheck == true
' apps/douyin-mini/project.config.json >/dev/null
```

Expected: Template AppID 尾号 `1b01`、源码入口 `src/`、域名校验开启。

- [ ] **Step 4：在抖音开发者工具上传模板源码**

在抖音开发者工具中打开
`/Users/leefo/Public/work/gooes/.worktrees/douyin-decoration-miniapp/apps/douyin-mini`，
确认详情页 AppID 尾号 `1b01`，执行上传：

```text
版本号：0.1.1
版本描述：修复商家扩展配置解析
```

Expected: 上传成功，模板小程序绑定记录出现 `0.1.1`；不修改
`project.config.json`，不关闭域名校验。

- [ ] **Step 5：将新草稿加入模板库**

在 `cd67` 控制台的「开发 → 模板管理 → 草稿箱」选择刚上传的 `0.1.1`，
加入模板库。只读记录返回的数字 template_id：

```bash
read -r NEW_TEMPLATE_ID
[[ "$NEW_TEMPLATE_ID" =~ ^[1-9][0-9]{0,18}$ ]]
test "$NEW_TEMPLATE_ID" != "77538"
```

Expected: 新 template_id 格式有效且不复用旧模板 `77538`。不删除旧模板。

### Task 4：为 d301 构建 0.1.2 测试版

**Files:**

- Read: `apps/api/src/controllers/platform-douyin-miniapps/index.ts`
- Read: `apps/api/src/schema/platform-douyin-miniapps.ts`

- [ ] **Step 1：建立短生命周期平台管理员会话**

在本机终端隐藏输入开发平台管理员手机号；开发环境保持既有免验证码登录设置：

```bash
read -r -s ADMIN_PHONE
ADMIN_LOGIN_RESPONSE="$(curl -fsS \
  -H 'content-type: application/json' \
  -X POST \
  'https://api-dev.goodcms.cn/admin/auth/login' \
  --data "$(jq -nc --arg phone "$ADMIN_PHONE" '{phone:$phone}')")"
ADMIN_TOKEN="$(jq -er '.data.token' <<< "$ADMIN_LOGIN_RESPONSE")"
unset ADMIN_PHONE ADMIN_LOGIN_RESPONSE
```

Expected: `ADMIN_TOKEN` 非空且只保存在当前 shell，不打印、不落盘。

- [ ] **Step 2：只读确认 d301 安装**

Run:

```bash
MERCHANT_INSTALLATION_ID="82061c96-29ac-4426-baff-5efc1061fbc8"
INSTALLATION_RESPONSE="$(curl -fsS \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  "https://api-dev.goodcms.cn/platform/douyin-miniapps/$MERCHANT_INSTALLATION_ID")"
jq -e '
  .data.installation_kind == "merchant" and
  .data.authorization_status == "active" and
  .data.authorizer_appid[-4:] == "d301" and
  .data.tenant_id == "51111111-1111-4111-8111-111111111111" and
  (has("deployment_key") | not)
' <<< "$INSTALLATION_RESPONSE" >/dev/null
unset INSTALLATION_RESPONSE
```

Expected: 唯一目标为 active `d301 / merchant`，安全响应不包含部署标识。

- [ ] **Step 3：提交商家测试版 0.1.2**

Run:

```bash
TEMPLATE_VERSION="0.1.2"
UPLOAD_RESPONSE="$(curl -fsS \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -X POST \
  "https://api-dev.goodcms.cn/platform/douyin-miniapps/$MERCHANT_INSTALLATION_ID/releases/upload" \
  --data "$(jq -nc \
    --arg templateId "$NEW_TEMPLATE_ID" \
    --arg version "$TEMPLATE_VERSION" \
    '{
      template_id:$templateId,
      template_version:$version,
      description:"修复商家扩展配置解析",
      channel:"default"
    }')")"
RELEASE_ID="$(jq -er '.data.id' <<< "$UPLOAD_RESPONSE")"
jq -e --arg version "$TEMPLATE_VERSION" \
  '.data.status == "uploaded" and .data.template_version == $version' \
  <<< "$UPLOAD_RESPONSE" >/dev/null
unset UPLOAD_RESPONSE
```

Expected: 新 release 进入 `uploaded`；不得复用或覆盖 `0.1.1` release。

- [ ] **Step 4：生成新测试二维码**

Run:

```bash
QR_RESPONSE="$(curl -fsS \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -X POST \
  "https://api-dev.goodcms.cn/platform/douyin-miniapps/$MERCHANT_INSTALLATION_ID/releases/$RELEASE_ID/test-qr" \
  --data '{}')"
QR_URL="$(jq -er '
  select(.data.status == "testing") |
  .data.test_qr_url
' <<< "$QR_RESPONSE")"
node -e '
  const url = new URL(process.argv[1]);
  if (url.protocol !== "https:" || url.username || url.password) process.exit(1);
' "$QR_URL"
unset QR_RESPONSE
```

Expected: release 进入 `testing`，返回无凭据的 HTTPS 二维码 URL。

- [ ] **Step 5：下载、解析并打开二维码**

Run:

```bash
QR_FILE="/Users/leefo/Downloads/抖音-d301-测试二维码-0.1.2.jpg"
umask 177
curl --fail --silent --show-error --location --proto '=https' \
  --max-redirs 5 --output "$QR_FILE" "$QR_URL"
chmod 600 "$QR_FILE"
file "$QR_FILE" | grep -E 'JPEG image data|PNG image data'
open "$QR_FILE"
unset QR_URL
```

使用本机 CoreImage 解析二维码，并只读跟随一次短链，验证目标元数据：

```text
app_id 尾号：d301
version：0.1.2
start_page：pages/home/index
```

Expected: 三项全部匹配后才允许手机扫码。

### Task 5：手机回归与租户隔离验收

**Files:**

- Create: `docs/operations/evidence/2026-07-26-douyin-d301-ext-config-fix.md`

- [ ] **Step 1：执行手机冷启动**

关闭小程序并从系统后台划掉抖音，重新打开抖音后扫描
`抖音-d301-测试二维码-0.1.2.jpg`。

Expected: 不再进入“服务配置异常”或“网络开小差了”页面。

- [ ] **Step 2：验证开发 API 请求链**

Run:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 gooes-dev \
  "sudo docker logs --since '10m' gooes-api-dev 2>&1" |
  grep -E 'douyin-mini/(auth/session|bootstrap|events)'
```

Expected:

- `POST /douyin-mini/auth/session` 为 200；
- `GET /douyin-mini/bootstrap` 为 200；
- `POST /douyin-mini/events` 为 200；
- 不再出现 `DOUYIN_INSTALLATION_MISSING`。

- [ ] **Step 3：只读验证事件安装身份**

对开发数据库执行：

```sql
select
  right(i.authorizer_appid, 4) as app_tail,
  i.installation_kind,
  i.tenant_id,
  array_agg(e.event_name order by e.created_at) as event_names,
  min(e.created_at) as first_at,
  max(e.created_at) as last_at
from public.marketing_events e
join public.douyin_miniapp_installations i
  on i.id = e.douyin_miniapp_installation_id
where e.source = 'douyin_miniapp'
  and e.created_at >= now() - interval '10 minutes'
group by
  right(i.authorizer_appid, 4),
  i.installation_kind,
  i.tenant_id;
```

Expected: 最新事件只归属 `d301 / merchant /
51111111-1111-4111-8111-111111111111`，包含 `app_launch` 和 `page_view`。

- [ ] **Step 4：人工页面验收**

手机确认：

1. 首页展示绑定测试租户当前公司名；
2. 案例和工地来自同一租户；
3. 免费咨询页可打开；
4. 页面不显示 Template `1b01` 的身份或数据；
5. vConsole Network 中业务请求只访问 `api-dev.goodcms.cn`。

Expected: 五项全部通过。

- [ ] **Step 5：写入非秘密证据**

使用 `apply_patch` 创建
`docs/operations/evidence/2026-07-26-douyin-d301-ext-config-fix.md`，记录：

```text
根因：tt.getExtConfigSync 官方 extConfig 包装层未解析
代码提交：修复提交 SHA
模板版本：0.1.1
新 template_id：数字 ID
商家版本：0.1.2
release_id：新 release UUID
Authorizer：尾号 d301
租户：51111111-1111-4111-8111-111111111111
API 验收：session/bootstrap/events 的状态码与北京时间
手机验收：五项结果
```

不得记录完整 AppID、JWT、authorizer token、deployment key、手机号、二维码签名
URL 或数据库连接串。

- [ ] **Step 6：清理临时会话并提交证据**

Run:

```bash
unset ADMIN_TOKEN NEW_TEMPLATE_ID TEMPLATE_VERSION \
  MERCHANT_INSTALLATION_ID RELEASE_ID QR_FILE
git add -- docs/operations/evidence/2026-07-26-douyin-d301-ext-config-fix.md
test "$(git diff --cached --name-only)" = \
  "docs/operations/evidence/2026-07-26-douyin-d301-ext-config-fix.md"
git commit -m "docs(douyin): 记录商家会话修复验收"
git push origin feature/douyin-decoration-miniapp
```

Expected: 证据提交和普通 push 成功；不提审、不发布、不操作生产环境。

## 停止条件

出现以下任一情况立即停止，不绕过：

- 聚焦测试未按预期先失败；
- 完整抖音小程序门禁失败；
- IDE 显示的 AppID 不是 `1b01` 或域名校验关闭；
- 新 template_id 等于旧 `77538`；
- 商家上传未进入 `uploaded`；
- 二维码不是 `d301 / 0.1.2`；
- 手机会话仍返回 409；
- 最新埋点归属 `1b01` 或其他租户；
- 需要修改数据库、回调、密钥、生产环境、提审或发布才能继续。
