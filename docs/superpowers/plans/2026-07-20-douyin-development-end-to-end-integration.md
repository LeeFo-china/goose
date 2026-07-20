# 抖音装修小程序开发环境全链路联调 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不提审、不正式发布的前提下，让原生抖音装修小程序通过真实开发 API、服务商 Ticket、模板开发安装、测试商户授权、短信留资和模板测试二维码完成可验证的端到端闭环。

**Architecture:** 小程序在模块启动时把抖音官方 `envType` 严格映射到固定开发/生产 API Origin，未知环境失败关闭。第三方回调仍先完成时间戳、签名、AES 和 Component AppID 校验；只有合法 `PUSH Ticket` 跳过服务层预注册检查，由现有 SECURITY DEFINER 事件申领 RPC 幂等建立组件。软件门禁通过后，使用当前 `release-dev.yml` 手动开发发布链路部署指定 SHA，再按“Ticket → 两类安装 → 两个测试租户 → 留资 → 商户测试版本”的顺序执行真实联调。

**Tech Stack:** Bun、TypeScript、抖音原生小程序 API、Fastify、Zod、Supabase/PostgreSQL、GitHub Actions、抖音开放平台服务商控制台、抖音开发者工具

---

## 文件结构与职责

| 文件 | 动作 | 单一职责 |
| --- | --- | --- |
| `apps/douyin-mini/src/config/index.test.ts` | 新建 | 固定三个官方环境值及未知环境失败关闭契约 |
| `apps/douyin-mini/src/config/index.ts` | 修改 | 只负责 `envType -> API Origin` 映射和请求超时常量 |
| `apps/douyin-mini/src/app.ts` | 修改 | 读取一次抖音环境并用解析后的 Origin 初始化传输与会话 |
| `apps/api/src/services/douyin-miniapp/authorization-events.test.ts` | 修改 | 证明 Ticket 可从空组件状态申领，普通事件仍要求 active 组件 |
| `apps/api/src/services/douyin-miniapp/authorization-events-migration-contract.test.ts` | 修改 | 固定现有 RPC 的幂等插入、disabled 拒绝和操作顺序 |
| `apps/api/src/services/douyin-miniapp/authorization-events.ts` | 修改 | 仅让合法 Ticket 绕过服务层预注册查询；不新增数据库写路径 |
| `docs/operations/douyin-miniapp-template-runbook.md` | 修改 | 记录环境路由、首 Ticket 启动和开发部署边界 |
| `docs/operations/douyin-miniapp-template-smoke-checklist.md` | 修改 | 增加开发 Origin、首 Ticket、两租户和“停在 testing”门禁 |
| `docs/operations/evidence/2026-07-20-douyin-dev-e2e.md` | 新建 | 保存本次不含秘密的逐阶段证据与最终状态 |

本轮不修改任何现有 migration，也不修改 `orange`。如果实施中发现数据库结构、约束、RLS、函数、触发器、枚举或静态初始化数据必须变化，立即停止本计划，先补设计评审和新的 migration 授权。

## Task 1：冻结基线与目标

**Files:**
- Read: `docs/superpowers/specs/2026-07-20-douyin-development-end-to-end-integration-design.md`
- Read: `docs/operations/douyin-miniapp-template-runbook.md`
- Read: `docs/operations/douyin-miniapp-template-smoke-checklist.md`

- [ ] **Step 1：确认隔离工作树、分支和干净状态**

Run:

```bash
pwd
git branch --show-current
git status --short
git rev-parse HEAD
```

Expected:

- 工作目录是 `/Users/leefo/Public/work/gooes/.worktrees/douyin-decoration-miniapp`；
- 分支是 `feature/douyin-decoration-miniapp`；
- 开始实施前工作树无未解释变更；
- HEAD 至少包含设计提交 `8b77c7bf`。

- [ ] **Step 2：记录基线测试，不掩盖已有失败**

Run:

```bash
bun run douyin-mini:check
bun test apps/api/src/services/douyin-miniapp/authorization-events.test.ts
bun test apps/api/src/services/douyin-miniapp/authorization-events-migration-contract.test.ts
bun run api:check
```

Expected: 四条命令退出码均为 `0`。若失败，先按 systematic-debugging 定位根因；不能开始 Task 2。

## Task 2：小程序严格选择开发/生产 API

**Files:**
- Create: `apps/douyin-mini/src/config/index.test.ts`
- Modify: `apps/douyin-mini/src/config/index.ts`
- Modify: `apps/douyin-mini/src/app.ts`

- [ ] **Step 1：编写环境映射失败测试**

Create `apps/douyin-mini/src/config/index.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { ApiRequestError } from "../api/request";
import { resolveApiBaseUrl } from "./index";

describe("resolveApiBaseUrl", () => {
  test.each([
    ["development", "https://api-dev.goodcms.cn"],
    ["preview", "https://api-dev.goodcms.cn"],
    ["production", "https://api.goodcms.cn"],
  ] as const)("maps %s to its fixed API origin", (envType, expected) => {
    expect(resolveApiBaseUrl(envType)).toBe(expected);
  });

  test.each(["", "trial", "release", "Development"])(
    "rejects unknown environment %p without falling back to production",
    (envType) => {
      let caught: unknown;
      try {
        resolveApiBaseUrl(envType);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ApiRequestError);
      expect(caught).toMatchObject({
        statusCode: 0,
        code: "INVALID_API_CONFIG",
      });
    },
  );
});
```

- [ ] **Step 2：运行测试并确认红灯原因正确**

Run:

```bash
bun test apps/douyin-mini/src/config/index.test.ts
```

Expected: FAIL，原因是 `resolveApiBaseUrl` 尚未导出；不能接受语法或第三方类型错误作为预期失败。

- [ ] **Step 3：实现纯环境映射**

Replace `apps/douyin-mini/src/config/index.ts` with:

```ts
import { ApiRequestError } from "../api/request";

const API_BASE_URL_BY_ENV = {
  development: "https://api-dev.goodcms.cn",
  preview: "https://api-dev.goodcms.cn",
  production: "https://api.goodcms.cn",
} as const;

export const API_TIMEOUT_MS = 10_000;

export function resolveApiBaseUrl(envType: string): string {
  const baseUrl = API_BASE_URL_BY_ENV[envType as keyof typeof API_BASE_URL_BY_ENV];
  if (baseUrl) return baseUrl;
  throw new ApiRequestError(
    0,
    "INVALID_API_CONFIG",
    "不支持的抖音小程序运行环境",
  );
}
```

- [ ] **Step 4：让应用只读取一次环境并复用**

In `apps/douyin-mini/src/app.ts`:

```ts
import { API_TIMEOUT_MS, resolveApiBaseUrl } from "./config";
```

Replace the transport/session initialization with:

```ts
const environment = readDouyinEnvironment();
const transport = new DouyinRequestTransport(
  resolveApiBaseUrl(environment.envType),
  API_TIMEOUT_MS,
);
const session = new SessionManager({
  now: () => Date.now(),
  readEnvironment: () => environment,
  readDeploymentConfig,
  loginOnce,
  exchangeSession: (input) => exchangeDouyinSession(transport, input),
  readStoredSession,
  writeStoredSession,
  clearStoredSession,
});
```

Remove the obsolete `API_BASE_URL` import and old transport/session block. Do not add an API override from query、`ext.json` or remote config.

- [ ] **Step 5：运行聚焦和完整小程序检查**

Run:

```bash
bun test apps/douyin-mini/src/config/index.test.ts
bun run douyin-mini:check
rg -n 'api-dev\.goodcms\.cn|api\.goodcms\.cn|resolveApiBaseUrl' apps/douyin-mini/src
```

Expected:

- 新测试全部 PASS；
- `douyin-mini:check` 退出码 `0`；
- 两个 Origin 只出现在固定映射或测试中；
- 不存在客户端可控 API host。

- [ ] **Step 6：提交环境隔离改动**

```bash
git add apps/douyin-mini/src/config/index.ts \
  apps/douyin-mini/src/config/index.test.ts \
  apps/douyin-mini/src/app.ts
git commit -m "feat(douyin): 区分小程序 API 环境"
```

## Task 3：允许可信首 Ticket 建立组件

**Files:**
- Modify: `apps/api/src/services/douyin-miniapp/authorization-events.test.ts`
- Modify: `apps/api/src/services/douyin-miniapp/authorization-events-migration-contract.test.ts`
- Modify: `apps/api/src/services/douyin-miniapp/authorization-events.ts`

- [ ] **Step 1：编写首 Ticket 失败测试**

Add inside `DouyinAuthorizationEventsService delivery handling` in `authorization-events.test.ts`:

```ts
test("allows a trusted PUSH ticket to claim before the component row exists", async () => {
  const findActive = mock(async () => null);
  const context = fixture({ componentRepository: { findActive } });

  await context.service.handleCallback(callback({
    Ticket: "first-ticket",
    MsgType: "Ticket",
    Event: "PUSH",
  }));

  expect(findActive).not.toHaveBeenCalled();
  expect(context.eventRepository.claimEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      componentAppId: COMPONENT_APP_ID,
      eventName: "PUSH",
      authorizerAppId: null,
    }),
  );
  expect(context.eventRepository.completeTicketEvent).toHaveBeenCalledTimes(1);
});

test("preserves a disabled-component rejection returned by the claim RPC", async () => {
  const context = fixture({
    componentRepository: { findActive: mock(async () => null) },
  });
  context.eventRepository.claimEvent.mockRejectedValue(new AppError(
    503,
    "抖音第三方组件未启用",
    "DOUYIN_COMPONENT_NOT_ACTIVE",
  ));

  await expect(context.service.handleCallback(callback({
    Ticket: "disabled-ticket",
    MsgType: "Ticket",
    Event: "PUSH",
  }))).rejects.toMatchObject({ code: "DOUYIN_COMPONENT_NOT_ACTIVE" });

  expect(context.eventRepository.completeTicketEvent).not.toHaveBeenCalled();
});
```

Keep the existing `requires the configured component to be active and match TpAppId` test unchanged; it proves ordinary authorization events cannot bootstrap a component.

- [ ] **Step 2：运行测试并确认红灯**

Run:

```bash
bun test apps/api/src/services/douyin-miniapp/authorization-events.test.ts
```

Expected: the new first-Ticket test FAILs with `DOUYIN_COMPONENT_NOT_ACTIVE`; existing trust-boundary tests remain valid.

- [ ] **Step 3：固定现有 RPC 的数据库安全契约**

Add to `authorization-events-migration-contract.test.ts`:

```ts
test("bootstraps only an active component through the event claim RPC", () => {
  const claim = functionBody(sql(), "claim_douyin_authorization_event");
  const insert = claim.indexOf(
    "INSERT INTO public.douyin_third_party_components(component_appid)",
  );
  const conflict = claim.indexOf(
    "ON CONFLICT (component_appid) DO NOTHING",
    insert,
  );
  const statusRead = claim.indexOf(
    "FROM public.douyin_third_party_components AS component",
    conflict,
  );
  const disabledGuard = claim.indexOf(
    "IF v_component_status IS DISTINCT FROM 'active'",
    statusRead,
  );

  expect(insert).toBeGreaterThan(-1);
  expect(conflict).toBeGreaterThan(insert);
  expect(statusRead).toBeGreaterThan(conflict);
  expect(disabledGuard).toBeGreaterThan(statusRead);
  expect(claim.slice(insert, disabledGuard)).not.toMatch(
    /UPDATE public\.douyin_third_party_components/,
  );
  expect(claim).toContain("MESSAGE = 'DOUYIN_COMPONENT_NOT_ACTIVE'");
});
```

Run:

```bash
bun test apps/api/src/services/douyin-miniapp/authorization-events-migration-contract.test.ts
```

Expected: PASS against the already-applied RPC. A failure means the design assumption is false; stop rather than add an application insert.

- [ ] **Step 4：只调整服务层检查顺序**

In `authorization-events.ts`, change `handleCallback` to:

```ts
async handleCallback(
  wrapper: DouyinCallbackWrapper,
  log: EventLogger = this.options.log,
): Promise<void> {
  try {
    this.assertFreshTimestamp(wrapper.TimeStamp);
    this.assertSignature(wrapper);
    const message = this.decryptAndParse(wrapper);
    this.assertMessageComponent(message);
    if (!isTicketPush(message)) await this.assertRegisteredComponent();
    await this.dispatch(message, wrapper.TimeStamp, log);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw Errors.business(
      500,
      "抖音授权事件处理失败",
      "DOUYIN_AUTHORIZATION_EVENT_PROCESSING_FAILED",
    );
  }
}
```

Change the first branch in `dispatch` to:

```ts
if (isTicketPush(message)) {
  await this.handleTicket(message, wrapperTime);
  return;
}
```

Add next to the other file-local helpers:

```ts
function isTicketPush(message: DouyinDecryptedEvent): message is DouyinTicketEvent {
  return message.Event === "PUSH" && "Ticket" in message;
}
```

Do not modify repositories or migrations. Do not auto-enable a disabled row.

- [ ] **Step 5：运行回调、迁移契约和 API 门禁**

Run:

```bash
bun test apps/api/src/services/douyin-miniapp/authorization-events.test.ts
bun test apps/api/src/services/douyin-miniapp/authorization-events-migration-contract.test.ts
bun test apps/api/src/controllers/douyin-third-party-events/index.test.ts
bun run api:check
```

Expected: all commands exit `0`; Ticket test confirms no `findActive` call, ordinary event test still rejects inactive component, migration contract confirms no status update path.

- [ ] **Step 6：提交 Ticket 启动修复**

```bash
git add apps/api/src/services/douyin-miniapp/authorization-events.ts \
  apps/api/src/services/douyin-miniapp/authorization-events.test.ts \
  apps/api/src/services/douyin-miniapp/authorization-events-migration-contract.test.ts
git commit -m "fix(douyin): 允许可信 Ticket 初始化组件"
```

## Task 4：更新运维门禁并建立证据记录

**Files:**
- Modify: `docs/operations/douyin-miniapp-template-runbook.md`
- Modify: `docs/operations/douyin-miniapp-template-smoke-checklist.md`
- Create: `docs/operations/evidence/2026-07-20-douyin-dev-e2e.md`

- [ ] **Step 1：替换运维手册的固定 URL 描述**

Replace the paragraph that says the API address is fixed with:

```markdown
小程序 API Origin 由 `tt.getEnvInfoSync().microapp.envType` 严格决定：

| envType | API Origin |
| --- | --- |
| `development` | `https://api-dev.goodcms.cn` |
| `preview` | `https://api-dev.goodcms.cn` |
| `production` | `https://api.goodcms.cn` |

未知环境、缺少环境信息或不支持该 API 时失败关闭，不回落生产。API Origin 不从启动参数、
`ext.json`、租户配置或远端响应读取；`deployment_key` 仍只用于商户实例识别。
```

- [ ] **Step 2：记录首 Ticket 启动边界**

Add below the callback URL table:

```markdown
空环境的首个合法 `PUSH Ticket` 在完成时间窗口、签名、AES 解密和 Component AppID 校验后，
由 `claim_douyin_authorization_event` 幂等建立 active 组件并保存加密 Ticket。普通授权、撤销或未知事件
不能注册组件；已有 disabled 组件不会被回调自动启用。成功正文必须精确为小写纯文本 `success`。
```

- [ ] **Step 3：扩充 Smoke 阻断项**

Add to section A:

```markdown
- [ ] **[阻断]** `development`、`preview` 只解析到 `api-dev.goodcms.cn`；`production` 只解析到 `api.goodcms.cn`；未知环境失败关闭。
- [ ] **[阻断]** 首个合法 Ticket 能幂等建立 active 组件；过期、签名错误、AppID 错误和 disabled 组件均无新增写入。
- [ ] **[阻断]** 模板开发安装与测试商户安装分别绑定两个获批的专用开发测试租户。
- [ ] **[阻断]** 本轮商户发布记录最高只到 `testing`，没有 submit-audit、sync-status 或 publish 调用。
```

- [ ] **Step 4：创建不含秘密的执行记录**

Create `docs/operations/evidence/2026-07-20-douyin-dev-e2e.md`:

```markdown
# 抖音装修小程序开发环境全链路执行记录

**总体状态：** NOT_RUN

**允许终态：** PASS / FAIL / BLOCKED / WAITING_FOR_DEVICE_ACCEPTANCE

## 固定对象

| 对象 | 记录规则 | 当前状态 |
| --- | --- | --- |
| Git Commit | 完整 SHA | NOT_RECORDED |
| Supabase | 只记录开发 project ref | NOT_RECORDED |
| Component AppID | 只记录尾 4 位 | NOT_RECORDED |
| Template AppID | 只记录尾 4 位 | NOT_RECORDED |
| Authorizer AppID | 只记录尾 4 位 | NOT_RECORDED |
| 主测试租户 | tenant UUID + 名称 | NOT_RECORDED |
| 隔离测试租户 | tenant UUID + 名称 | NOT_RECORDED |
| 模板开发安装 | installation UUID | NOT_RECORDED |
| 测试商户安装 | installation UUID | NOT_RECORDED |
| 模板交付 | template ID / SemVer / release UUID | NOT_RECORDED |
| 测试手机号 | 仅掩码 | NOT_RECORDED |

## 阶段证据

| 阶段 | 状态 | 允许记录的证据 |
| --- | --- | --- |
| 静态门禁 | NOT_RUN | 命令、退出码、测试计数 |
| 开发 migration 对齐 | NOT_RUN | project ref、Local/Remote 版本结论 |
| API 开发部署 | NOT_RUN | Actions run ID、SHA、健康状态 |
| 回调与 Ticket | NOT_RUN | 控制台校验、时间、组件尾号、布尔信封状态 |
| 模板开发安装 | NOT_RUN | 安装 UUID、租户 UUID、接口状态 |
| 模板登录与内容 | NOT_RUN | IDE 版本、截图编号、分页结论 |
| 测试商户授权/绑定 | NOT_RUN | 安装 UUID、租户 UUID、安全错误码 |
| 短信与留资 | NOT_RUN | 掩码手机号、lead/submission/event UUID |
| 模板 upload/test-qr | NOT_RUN | template ID、SemVer、release UUID、截图编号 |
| Android 真机 | NOT_RUN | 设备/系统版本、截图编号 |
| iOS 真机 | NOT_RUN | 设备/系统版本、截图编号 |
| disable/enable | NOT_RUN | 安装 UUID、安全错误码、恢复结论 |
| 收尾 | NOT_RUN | 保留/停用对象和未完成项 |

## 禁止记录

不得写入 AppSecret、Token、Ticket、EncodingAESKey、短信验证码、完整手机号、OpenID、session key、
deployment key、二维码原始响应或 provider 原始响应。

## 最终结论

NOT_RUN
```

- [ ] **Step 5：验证并提交文档**

Run:

```bash
git diff --check
rg -n 'api-dev\.goodcms\.cn|首个合法|最高只到 `testing`|NOT_RUN' \
  docs/operations/douyin-miniapp-template-runbook.md \
  docs/operations/douyin-miniapp-template-smoke-checklist.md \
  docs/operations/evidence/2026-07-20-douyin-dev-e2e.md
```

Expected: no whitespace errors; required boundaries are present; no credential values appear.

Commit:

```bash
git add docs/operations/douyin-miniapp-template-runbook.md \
  docs/operations/douyin-miniapp-template-smoke-checklist.md \
  docs/operations/evidence/2026-07-20-douyin-dev-e2e.md
git commit -m "docs(douyin): 补充开发联调执行门禁"
```

From Task 5 onward, update the evidence file immediately after each stage. Keep it as the only allowed uncommitted file until Task 13 so those operational notes do not change the Git SHA being deployed.

## Task 5：执行完整软件门禁和只读数据库预检

**Files:**
- Modify: `docs/operations/evidence/2026-07-20-douyin-dev-e2e.md`

- [ ] **Step 1：运行完整本地门禁**

Run:

```bash
bun run douyin-mini:check
bun run api:check
bun test packages/domain/src/douyin-miniapp.test.ts packages/domain/src/permission.test.ts
bun test apps/api/src/services/douyin-miniapp/authorization-events.test.ts \
  apps/api/src/services/douyin-miniapp/authorization-events-migration-contract.test.ts \
  apps/api/src/services/douyin-miniapp/session.test.ts \
  apps/api/src/services/douyin-miniapp/content.test.ts \
  apps/api/src/services/douyin-miniapp/marketing.test.ts \
  apps/api/src/services/platform-douyin-miniapps.test.ts \
  apps/api/src/services/platform-douyin-miniapp-releases.test.ts \
  apps/api/src/services/platform-douyin-miniapp-releases/operation-service.recovery.test.ts
bun run test
git diff --check
```

Expected: every command exits `0`. Record exact test counts in the evidence file.

- [ ] **Step 2：运行安全扫描**

Run:

```bash
rg -n 'console\.(log|info|debug)|throw new Error|tenant_id' \
  apps/api/src/controllers/douyin-* \
  apps/api/src/services/douyin-miniapp \
  apps/douyin-mini/src
rg -n 'component_appsecret|authorizer_access_token|authorizer_refresh_token|session_key|open_id|sms_code' \
  apps/douyin-mini \
  docs/operations/douyin-miniapp-template-*.md \
  docs/operations/evidence/2026-07-20-douyin-dev-e2e.md
```

Expected: inspect every hit. Field names and tests are allowed; any real credential、identity、phone or verification code is a blocker.

- [ ] **Step 3：验证 `.env` 仍指向开发数据库，不输出秘密**

Run from the repository worktree:

```bash
set -a
source /Users/leefo/Public/work/gooes/.env
set +a
ACTUAL_DEV_REF="$(SUPABASE_DB_URL="$SUPABASE_DB_DIRECT_URL" \
  node scripts/validate-dev-database-target.mjs --resolve-project-ref)"
node scripts/validate-dev-database-target.mjs \
  "$SUPABASE_DB_DIRECT_URL" "$ACTUAL_DEV_REF" \
  api-dev.goodcms.cn fclnkyatvfvmzgzdqlba \
  'api.goodcms.cn 1.13.20.39' unqhypivjkpwldhufpjc
```

Expected: exit `0`, resolved ref is `fclnkyatvfvmzgzdqlba`; command output must not print connection strings.

- [ ] **Step 4：只读验证 migration 已对齐**

Run:

```bash
bun x supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
bun x supabase db push --dry-run --include-all --db-url "$SUPABASE_DB_DIRECT_URL"
```

Expected: Local/Remote 完全对齐，dry-run 显示远端已是最新。本轮没有新 migration，因此严禁执行非 dry-run 的 `db push`。

## Task 6：配置开发服务端并部署精确 SHA

**Files / external state:**
- External: `/opt/gooes-dev/docker/.env.dev.api` on `gooes-dev-vm-0-11`
- External: remote Git branch `feature/douyin-decoration-miniapp`
- External: GitHub Actions `Release Dev`

- [ ] **Step 1：固定部署身份**

Run:

```bash
BRANCH="feature/douyin-decoration-miniapp"
FULL_SHA="$(git rev-parse HEAD)"
UNEXPECTED_CHANGES="$(git status --short | \
  rg -v '^ M docs/operations/evidence/2026-07-20-douyin-dev-e2e\.md$' || true)"
test -z "$UNEXPECTED_CHANGES"
printf '%s\n' "$BRANCH" "$FULL_SHA"
```

Expected: the evidence file is the only allowed modification and `FULL_SHA` is 40 characters. Save the deployed SHA, not secret values, to the evidence file.

- [ ] **Step 2：动作时确认并更新开发 API 环境变量**

STOP and obtain explicit authorization containing:

- environment: development;
- server: `gooes-dev-vm-0-11`;
- file: `/opt/gooes-dev/docker/.env.dev.api`;
- nine `DOUYIN_*` variable names;
- recovery: restore the previous secured env-file version and redeploy the previous API SHA.

After approval, use the existing secured server management session and run:

```bash
sudoedit /opt/gooes-dev/docker/.env.dev.api
sudo bash -c '
  set -a
  source /opt/gooes-dev/docker/.env.dev.api
  set +a
  required=(
    DOUYIN_COMPONENT_APP_ID
    DOUYIN_COMPONENT_APP_SECRET
    DOUYIN_COMPONENT_MESSAGE_TOKEN
    DOUYIN_COMPONENT_MESSAGE_AES_KEY
    DOUYIN_TEMPLATE_APP_ID
    DOUYIN_TEMPLATE_APP_SECRET
    DOUYIN_CREDENTIAL_KEYS_JSON
    DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION
    DOUYIN_SUBJECT_HASH_KEY
  )
  for key in "${required[@]}"; do
    if [[ -z ${!key:-} ]]; then
      echo "missing:$key"
      exit 1
    fi
  done
  [[ ${#DOUYIN_COMPONENT_MESSAGE_AES_KEY} -eq 43 ]]
  [[ ${#DOUYIN_SUBJECT_HASH_KEY} -ge 32 ]]
  jq -e --arg active "$DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION" \
    'type == "object" and has($active) and (.[$active] | type == "string")' \
    <<< "$DOUYIN_CREDENTIAL_KEYS_JSON" >/dev/null
  echo "douyin-config-shape:ok"
'
```

Expected: only `douyin-config-shape:ok` is printed; values never appear in terminal history, logs, chat or evidence.

- [ ] **Step 3：动作时确认并推送精确分支**

STOP and obtain explicit authorization for pushing `FULL_SHA` to `origin/feature/douyin-decoration-miniapp`. After approval:

```bash
git push --set-upstream origin feature/douyin-decoration-miniapp
REMOTE_SHA="$(git ls-remote origin refs/heads/feature/douyin-decoration-miniapp | awk '{print $1}')"
test "$REMOTE_SHA" = "$FULL_SHA"
```

Expected: remote branch head equals the exact local SHA.

- [ ] **Step 4：动作时确认并触发 API-only 开发发布**

STOP and obtain explicit authorization for:

- workflow: `.github/workflows/release-dev.yml`;
- ref: `feature/douyin-decoration-miniapp`;
- service: `api`;
- environment: development;
- recovery: manually release the previously recorded healthy API SHA.

After approval:

```bash
gh workflow run release-dev.yml \
  --ref feature/douyin-decoration-miniapp \
  -f service=api \
  -f operation=release \
  -f reason='Douyin development end-to-end integration'
RUN_ID="$(gh run list \
  --workflow release-dev.yml \
  --branch feature/douyin-decoration-miniapp \
  --event workflow_dispatch \
  --limit 20 \
  --json databaseId,headSha \
  --jq ".[] | select(.headSha == \"$FULL_SHA\") | .databaseId" | head -n 1)"
test -n "$RUN_ID"
gh run watch "$RUN_ID" --exit-status
gh run view "$RUN_ID" --json conclusion,headSha,url \
  --jq '{conclusion,headSha,url}'
```

Expected: conclusion `success`, head SHA equals `FULL_SHA`; migration verification succeeds before API deployment.

- [ ] **Step 5：验证远端路由已经切换到目标实现**

Run:

```bash
test "$(curl -sS -o /dev/null -w '%{http_code}' https://api-dev.goodcms.cn/)" = "200"
test "$(curl -sS -o /dev/null -w '%{http_code}' \
  -H 'content-type: application/json' \
  -X POST https://api-dev.goodcms.cn/douyin-thirdparty/events/authorization \
  --data '{}')" = "400"
test "$(curl -sS -o /dev/null -w '%{http_code}' \
  -H 'content-type: application/json' \
  -X POST https://api-dev.goodcms.cn/douyin-thirdparty/events/message \
  --data '{}')" = "400"
test "$(curl -sS -o /dev/null -w '%{http_code}' \
  -H 'content-type: application/json' \
  -X POST https://api-dev.goodcms.cn/douyin-mini/auth/session \
  --data '{}')" = "400"
```

Expected: malformed public callback/session bodies are rejected by controller validation with 400, never by ordinary auth with 401.

## Task 7：配置真实回调并接收首个 Ticket

**External state:**
- Douyin service-provider console
- Dev database runtime component row

- [ ] **Step 1：只读核对服务商应用**

Using the logged-in Chrome tab, record without modifying:

- service-provider application name;
- Component AppID suffix;
- Template AppID suffix;
- authorized test-miniapp suffix;
- current authorization-event URL;
- current message/event URL.

Expected: all suffixes match the server configuration owner. Never read browser cookies/local storage or copy secret values into evidence.

- [ ] **Step 2：动作时确认并保存回调配置**

STOP and obtain explicit authorization for these exact development URLs:

```text
https://api-dev.goodcms.cn/douyin-thirdparty/events/authorization
https://api-dev.goodcms.cn/douyin-thirdparty/events/message
```

The confirmation must identify the Component AppID suffix and recovery URL values. After approval, save both URLs; keep message Token and EncodingAESKey aligned with the secured dev API configuration.

Expected: console verification succeeds and the endpoint responds with exact lowercase plain text `success` for the provider's valid encrypted request.

- [ ] **Step 3：只读 verify 首 Ticket 信封**

Poll no faster than once per minute; the provider normally pushes Ticket about every ten minutes. Query only booleans and suffixes:

```sql
select
  right(component_appid, 4) as appid_suffix,
  status,
  component_ticket_ciphertext is not null as has_ciphertext,
  component_ticket_iv is not null as has_iv,
  component_ticket_tag is not null as has_tag,
  component_ticket_key_version is not null as has_key_version,
  component_ticket_received_at is not null as has_received_at,
  access_token_ciphertext is not null as component_access_token_cached
from public.douyin_third_party_components
order by created_at desc
limit 10;
```

Expected: exactly one matching suffix, `status=active`, every Ticket-envelope boolean true. `component_access_token_cached` may still be false before the first authorization flow; record it without exposing the token and verify the complete component-token envelope after Task 9. No Ticket plaintext or ciphertext is printed.

## Task 8：创建模板开发安装并验证模板会话

**External state:**
- Dev platform-management API
- Douyin IDE preview session

- [ ] **Step 1：只读选择两个专用测试租户**

Use a read-only database query to choose two approved active development tenants with distinguishable public cases/sites. Set shell variables locally without adding them to repository files:

```bash
: "${MAIN_TENANT_ID:?set from the approved main tenant selected by the preceding query}"
: "${ISOLATION_TENANT_ID:?set from the approved isolation tenant selected by the preceding query}"
[[ "$MAIN_TENANT_ID" =~ ^[0-9a-f-]{36}$ ]]
[[ "$ISOLATION_TENANT_ID" =~ ^[0-9a-f-]{36}$ ]]
test "$MAIN_TENANT_ID" != "$ISOLATION_TENANT_ID"
```

Record UUIDs/names and allowed test-data policy in the evidence file. If either tenant contains real customer activity that must not be touched, select another tenant.

- [ ] **Step 2：建立短生命周期平台管理员令牌**

Use the read-only employee/role inventory to identify the approved development account whose global roles include `platform_admin` and whose tenant is null. Set it only in the current shell; do not use any tenant-bound administrator and do not write the phone to evidence. Run without printing the response/token:

```bash
: "${GOOES_E2E_PLATFORM_ADMIN_PHONE:?set to the approved dev platform-admin phone from the read-only inventory}"
ADMIN_LOGIN_RESPONSE="$(curl -fsS \
  -H 'content-type: application/json' \
  -X POST https://api-dev.goodcms.cn/admin/auth/login \
  --data "$(jq -nc --arg phone "$GOOES_E2E_PLATFORM_ADMIN_PHONE" \
    '{phone:$phone,code:""}')")"
jq -e '
  (.data.roles | index("platform_admin")) != null and
  .data.tenant == null and
  (.data.permissions | any(
    .code == "platform.douyin_miniapp.manage" and .scope == "all"
  ))
' \
  <<< "$ADMIN_LOGIN_RESPONSE" >/dev/null
ADMIN_TOKEN="$(jq -er '.data.token' <<< "$ADMIN_LOGIN_RESPONSE")"
unset ADMIN_LOGIN_RESPONSE
test -n "$ADMIN_TOKEN"
```

Expected: permission assertion succeeds; token remains only in the current shell and is unset at the end of operational tasks.

- [ ] **Step 3：定义完整、非敏感 runtime config**

Run:

```bash
RUNTIME_CONFIG='{
  "brand":{"logo_url":null,"qualifications":[]},
  "theme":{"primary_color":"#C45A32","navigation_text_color":"black"},
  "features":{"cases":true,"sites":true,"sms_lead":true,"douyin_phone":false,"phone_capture_mode":"sms"},
  "home_banners":[],
  "trust_metrics":[{"label":"开发联调","value":"仅测试"}],
  "privacy_policy_version":"douyin-dev-e2e-2026-07-20"
}'
jq -e . <<< "$RUNTIME_CONFIG" >/dev/null
```

- [ ] **Step 4：动作时确认并创建模板开发安装**

STOP and obtain explicit authorization containing isolation tenant UUID, Template AppID suffix, operation `POST /platform/douyin-miniapps/template-development`, and recovery `disable the created installation after the test if requested`.

After approval:

```bash
TEMPLATE_INSTALL_RESPONSE="$(curl -fsS \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -X POST https://api-dev.goodcms.cn/platform/douyin-miniapps/template-development \
  --data "$(jq -nc \
    --arg tenant "$ISOLATION_TENANT_ID" \
    --argjson runtime "$RUNTIME_CONFIG" \
    '{tenant_id:$tenant,runtime_config:$runtime}')")"
TEMPLATE_INSTALLATION_ID="$(jq -er '.data.id' <<< "$TEMPLATE_INSTALL_RESPONSE")"
jq -e --arg tenant "$ISOLATION_TENANT_ID" \
  '.data.installation_kind == "template_development" and
   .data.authorization_status == "active" and
   .data.tenant_id == $tenant' <<< "$TEMPLATE_INSTALL_RESPONSE" >/dev/null
unset TEMPLATE_INSTALL_RESPONSE
```

Expected: one active `template_development` installation bound to the isolation tenant; response contains no deployment key or credential envelope.

- [ ] **Step 5：导入 IDE 并验证真实模板会话**

In Douyin IDE:

1. Import `/Users/leefo/Public/work/gooes/.worktrees/douyin-decoration-miniapp/apps/douyin-mini`.
2. Confirm the selected project is the Template AppID suffix recorded in Task 7.
3. Preview with `envType=preview` and confirm the first request goes to `https://api-dev.goodcms.cn/douyin-mini/auth/session`.
4. Confirm `tt.login -> code2sessionForTemplate -> Gooes JWT -> bootstrap` succeeds.
5. Open company、cases、case detail、sites、site detail and privacy pages.
6. Confirm `pageSize=101` is rejected in an API smoke and normal pages use bounded pagination.

Expected: UI displays only the isolation tenant brand/content; local storage contains the Gooes JWT only, not OpenID、session key、phone or code.

## Task 9：授权测试商户并绑定主租户

**External state:**
- Douyin service-provider authorization
- Dev merchant installation

- [ ] **Step 1：动作时确认授权测试小程序**

STOP and obtain explicit authorization identifying Component AppID suffix and Authorizer AppID suffix. In the service-provider console:

1. ensure the Authorizer AppID is in the authorized test-miniapp list;
2. generate/open the official authorization entry;
3. authorize the required development and operation permissions;
4. do not revoke authorization during this plan.

Expected: valid encrypted `AUTHORIZED` callback returns `success`.

- [ ] **Step 2：通过平台 API 查找授权安装**

Run:

```bash
INSTALLATIONS_RESPONSE="$(curl -fsS \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  'https://api-dev.goodcms.cn/platform/douyin-miniapps?page=1&pageSize=100')"
MERCHANT_INSTALLATION_ID="$(jq -er \
  '.data.list[] | select(.installation_kind == "merchant" and .authorization_status == "authorized_unbound") | .id' \
  <<< "$INSTALLATIONS_RESPONSE" | head -n 1)"
MERCHANT_APP_ID="$(jq -er --arg id "$MERCHANT_INSTALLATION_ID" \
  '.data.list[] | select(.id == $id) | .authorizer_appid' \
  <<< "$INSTALLATIONS_RESPONSE")"
unset INSTALLATIONS_RESPONSE
test -n "$MERCHANT_INSTALLATION_ID"
test -n "$MERCHANT_APP_ID"
```

Expected: one `merchant / authorized_unbound` record for the intended suffix. If multiple candidates exist, stop and identify by suffix before binding.

- [ ] **Step 3：只读验证组件与商户凭证信封**

Query by the already-recorded component suffix and `MERCHANT_INSTALLATION_ID`, projecting booleans only:

```sql
select
  right(component_appid, 4) as appid_suffix,
  access_token_ciphertext is not null as has_ciphertext,
  access_token_iv is not null as has_iv,
  access_token_tag is not null as has_tag,
  access_token_key_version is not null as has_key_version,
  access_token_expires_at > now() as expires_in_future
from public.douyin_third_party_components
where right(component_appid, 4) = :component_appid_suffix;

select
  id,
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

Pass the recorded suffix and UUID as named bound parameters in the read-only database query tool. Expected: exactly one row from each query and every credential-envelope boolean is true. Never select or print ciphertext, token, Ticket or deployment key.

- [ ] **Step 4：动作时确认并绑定主测试租户**

STOP and obtain explicit authorization containing merchant installation UUID, Authorizer AppID suffix, main tenant UUID and recovery `disable, not delete, the installation`.

After approval:

```bash
MERCHANT_BIND_RESPONSE="$(curl -fsS \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -X POST "https://api-dev.goodcms.cn/platform/douyin-miniapps/$MERCHANT_INSTALLATION_ID/bind" \
  --data "$(jq -nc \
    --arg tenant "$MAIN_TENANT_ID" \
    --argjson runtime "$RUNTIME_CONFIG" \
    '{tenant_id:$tenant,runtime_config:$runtime}')")"
jq -e --arg tenant "$MAIN_TENANT_ID" \
  '.data.installation_kind == "merchant" and
   .data.authorization_status == "active" and
   .data.tenant_id == $tenant and
   (has("deployment_key") | not)' <<< "$MERCHANT_BIND_RESPONSE" >/dev/null
unset MERCHANT_BIND_RESPONSE
```

Expected: active merchant installation bound to the main tenant; safe API response does not leak deployment key.

- [ ] **Step 5：验证错误 AppID/key 在 provider 调用前失败**

Run with deliberately invalid public identifiers and a dummy code:

```bash
WRONG_APP_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' \
  -H 'content-type: application/json' \
  -X POST https://api-dev.goodcms.cn/douyin-mini/auth/session \
  --data '{"app_id":"tt-invalid-test-app","deployment_key":"invalid-public-key","code":"invalid-on-purpose","launch_context":{"entry_path":"pages/home/index","scene":"1001","source_type":"direct"}}')"
MISSING_KEY_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' \
  -H 'content-type: application/json' \
  -X POST https://api-dev.goodcms.cn/douyin-mini/auth/session \
  --data "$(jq -nc --arg app "$MERCHANT_APP_ID" \
    '{app_id:$app,code:"invalid-on-purpose",launch_context:{entry_path:"pages/home/index",scene:"1001",source_type:"direct"}}')")"
test "$WRONG_APP_STATUS" = "409"
test "$MISSING_KEY_STATUS" = "409"
```

Expected: both fail with `DOUYIN_INSTALLATION_MISSING` semantics before any code2session provider work.

## Task 10：上传模板并生成单商户测试二维码

**External state:**
- Douyin IDE template upload
- Service-provider template library
- One merchant release record and test QR

- [ ] **Step 1：重新运行上传前门禁**

Run:

```bash
bun run douyin-mini:check
bun run api:check
UNEXPECTED_CHANGES="$(git status --short | \
  rg -v '^ M docs/operations/evidence/2026-07-20-douyin-dev-e2e\.md$' || true)"
test -z "$UNEXPECTED_CHANGES"
git rev-parse HEAD
```

Expected: checks pass, no changes except the evidence file, SHA equals deployed SHA.

- [ ] **Step 2：动作时确认并上传模板开发代码**

STOP and obtain explicit authorization identifying Template AppID suffix, Git SHA, IDE project path, version string, and recovery `retain previous template ID; do not overwrite a merchant online version`.

After approval, use Douyin IDE Upload for the Template AppID. Record only version、Git SHA、time and screenshot number.

- [ ] **Step 3：动作时确认并加入模板库**

STOP and obtain explicit authorization for the exact uploaded template version. Add it to the service-provider template library and set:

```bash
: "${TEMPLATE_ID:?set to the numeric ID returned by the approved template-library action}"
[[ "$TEMPLATE_ID" =~ ^[1-9][0-9]{0,18}$ ]]
```

Do not add a second upload while this step is pending.

- [ ] **Step 4：动作时确认并调用单商户 upload**

Create a unique strict SemVer:

```bash
TEMPLATE_VERSION="0.1.0-dev.$(date -u +%Y%m%d%H%M%S)"
```

STOP and obtain explicit authorization containing merchant installation UUID、Template ID、SemVer、channel `default` and exact Git SHA.

After approval:

```bash
UPLOAD_RESPONSE="$(curl -fsS \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -X POST "https://api-dev.goodcms.cn/platform/douyin-miniapps/$MERCHANT_INSTALLATION_ID/releases/upload" \
  --data "$(jq -nc \
    --arg templateId "$TEMPLATE_ID" \
    --arg version "$TEMPLATE_VERSION" \
    '{template_id:$templateId,template_version:$version,description:"装修行业营销获客模板开发联调",channel:"default"}')")"
RELEASE_ID="$(jq -er '.data.id' <<< "$UPLOAD_RESPONSE")"
jq -e --arg version "$TEMPLATE_VERSION" \
  '.data.status == "uploaded" and .data.template_version == $version' \
  <<< "$UPLOAD_RESPONSE" >/dev/null
unset UPLOAD_RESPONSE
```

Expected: one release in `uploaded`; no submit-audit/publish state or credential appears.

- [ ] **Step 5：动作时确认并生成 test-qr**

STOP and obtain explicit authorization containing merchant installation UUID and release UUID. After approval:

```bash
QR_RESPONSE="$(curl -fsS \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -X POST "https://api-dev.goodcms.cn/platform/douyin-miniapps/$MERCHANT_INSTALLATION_ID/releases/$RELEASE_ID/test-qr" \
  --data '{}')"
jq -e '.data.status == "testing" and (.data.test_qr_url | type == "string")' \
  <<< "$QR_RESPONSE" >/dev/null
unset QR_RESPONSE
```

Expected: local release status `testing`, test QR URL present. Do not call submit-audit、sync-status or publish.

## Task 11：验证两个租户的内容、短信与直属线索

**External state:**
- Template preview bound to isolation tenant
- Merchant test QR bound to main tenant
- Test SMS and leads

- [ ] **Step 1：验证商户真实会话和租户隔离**

Open the merchant test QR in Douyin. Confirm:

1. runtime is `development` and all requests use `api-dev.goodcms.cn`;
2. `tt.login` uses the Authorizer AppID and package-provided deployment key;
3. session、Bootstrap、company、cases、sites succeed;
4. merchant shows main-tenant content;
5. template preview still shows isolation-tenant content;
6. an ID copied from one tenant cannot be read by the other session.

Expected: two distinct server-derived sessions and no client `tenant_id` selector.

- [ ] **Step 2：动作时确认并发送模板安装测试短信**

STOP and obtain explicit authorization identifying masked phone、template installation UUID and isolation tenant UUID. The user enters the phone in the Template preview and receives the code outside chat/logs.

Verify:

- rapid second send is rate-limited;
- wrong six-digit code creates no lead;
- the user enters the real code directly in the miniapp, never in chat;
- first correct submit creates one isolation-tenant lead;
- immediate replay of the identical request/idempotency key returns the same lead result.

- [ ] **Step 3：动作时确认并发送商户安装测试短信**

STOP and obtain explicit authorization for the same masked phone、merchant installation UUID and main tenant UUID. Repeat the flow from the merchant test QR:

- wrong code creates no lead;
- correct code creates one main-tenant lead;
- a second code and a new idempotency key within 24 hours update/reuse the main-tenant lead with `already_submitted=true` and `updated_existing=true`;
- client double-click cannot create a second submission.

- [ ] **Step 4：只读核对线索、提交事实与事件**

Query by the two installation UUIDs and the test window; project only safe fields:

```sql
-- Bind :template_installation_id and :merchant_installation_id to the two
-- UUID variables already captured in this shell; do not paste untracked IDs.
select
  lead.id,
  lead.tenant_id,
  lead.douyin_miniapp_installation_id,
  right(lead.phone, 4) as phone_suffix,
  lead.source,
  lead.created_at
from public.marketing_leads as lead
where lead.douyin_miniapp_installation_id in (
  :template_installation_id,
  :merchant_installation_id
)
  and lead.source = 'douyin_miniapp'
order by lead.created_at;

select
  submission.id,
  submission.tenant_id,
  submission.douyin_miniapp_installation_id,
  submission.marketing_lead_id,
  submission.already_submitted,
  submission.updated_existing,
  submission.created_at
from public.douyin_miniapp_lead_submissions as submission
where submission.douyin_miniapp_installation_id in (
  :template_installation_id,
  :merchant_installation_id
)
order by submission.created_at;

select
  event.tenant_id,
  event.douyin_miniapp_installation_id,
  event.event_name,
  count(*) as event_count
from public.marketing_events as event
where event.douyin_miniapp_installation_id in (
  :template_installation_id,
  :merchant_installation_id
)
group by event.tenant_id, event.douyin_miniapp_installation_id, event.event_name
order by event.tenant_id, event.event_name;
```

At execution time pass the two shell UUIDs as named bound parameters in the read-only database query tool; never interpolate SQL strings or print the full phone/code. Expected:

- one tenant-scoped lead per tenant for the same phone suffix;
- replay does not add a submission;
- main-tenant 24-hour resubmission points to the same lead and has both booleans true;
- successful submissions have matching `lead_submit` and `lead_submit_success` events.

## Task 12：验证停用失效、恢复与真机

**External state:**
- Merchant installation status
- Android and iOS device acceptance

- [ ] **Step 1：动作时确认并 disable 测试商户安装**

STOP and obtain explicit authorization containing merchant installation UUID and automatic recovery plan `enable the same installation immediately after failure-closed evidence`.

After approval:

```bash
curl -fsS \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -X POST "https://api-dev.goodcms.cn/platform/douyin-miniapps/$MERCHANT_INSTALLATION_ID/disable" \
  --data '{}' | jq -e '.data.authorization_status == "disabled"' >/dev/null
```

Reload the merchant test QR. Expected: session/content/SMS/lead fail closed with `DOUYIN_INSTALLATION_DISABLED`; no new provider or lead writes.

- [ ] **Step 2：动作时确认并 enable 同一安装**

STOP and obtain explicit authorization for enable of the same UUID. After approval:

```bash
curl -fsS \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -X POST "https://api-dev.goodcms.cn/platform/douyin-miniapps/$MERCHANT_INSTALLATION_ID/enable" \
  --data '{}' | jq -e '.data.authorization_status == "active"' >/dev/null
```

Expected: the same tenant binding is restored; merchant login/content works again. Do not rotate deployment key and do not revoke authorization.

- [ ] **Step 3：完成 Android 真机检查**

Test home、company、cases、case detail、sites、site detail、lead form、privacy、back stack、cold start、hot start、session expiry and weak-network recovery. Record device model、OS、Douyin/IDE version and screenshot references only.

Expected: PASS; otherwise overall status cannot exceed `WAITING_FOR_DEVICE_ACCEPTANCE` or `FAIL`.

- [ ] **Step 4：完成 iOS 真机检查**

Repeat the exact Android path on iOS and record the same evidence fields.

Expected: PASS; otherwise the full E2E goal is not complete.

## Task 13：最终审计、收尾与证据提交

**Files:**
- Modify: `docs/operations/evidence/2026-07-20-douyin-dev-e2e.md`

- [ ] **Step 1：只读证明发布链路停在 testing**

Run:

```bash
RELEASES_RESPONSE="$(curl -fsS \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  "https://api-dev.goodcms.cn/platform/douyin-miniapps/$MERCHANT_INSTALLATION_ID/releases?page=1&pageSize=20")"
jq -e --arg id "$RELEASE_ID" \
  '.data.list[] | select(.id == $id) |
   .status == "testing" and
   .submitted_at == null and
   .audited_at == null and
   .released_at == null' <<< "$RELEASES_RESPONSE" >/dev/null
unset RELEASES_RESPONSE
```

Expected: exact release remains `testing`; no audit/publish timestamps.

- [ ] **Step 2：重新运行软件与仓库门禁**

Run:

```bash
bun run douyin-mini:check
bun run api:check
bun run test
git diff --check
git status --short
```

Expected: checks pass; only the evidence file may be modified.

- [ ] **Step 3：完成证据文件**

Replace every executed `NOT_RUN` / `NOT_RECORDED` with actual safe data and `PASS`、`FAIL`、`BLOCKED` or `WAITING_FOR_DEVICE_ACCEPTANCE`. Include:

- full Git SHA and Actions run ID;
- dev project ref;
- AppID suffixes only;
- tenant/install/release UUIDs;
- masked phone only;
- boolean credential-envelope evidence;
- test counts and screenshot references;
- objects retained、disabled or requiring later cleanup.

Do not include any forbidden value listed in the file.

- [ ] **Step 4：安全扫描证据并提交**

Run:

```bash
if rg -n '(tt[A-Za-z0-9]{12,}|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}|1[3-9][0-9]{9})' \
  docs/operations/evidence/2026-07-20-douyin-dev-e2e.md; then
  exit 1
fi
git diff --check
git add docs/operations/evidence/2026-07-20-douyin-dev-e2e.md
git commit -m "docs(douyin): 记录开发环境全链路证据"
```

Expected: secret/phone scan has no matches and commit succeeds.

- [ ] **Step 5：清理进程内敏感变量并判定最终状态**

Run:

```bash
unset ADMIN_TOKEN RUNTIME_CONFIG TEMPLATE_ID TEMPLATE_VERSION
unset GOOES_E2E_PLATFORM_ADMIN_PHONE
unset MAIN_TENANT_ID ISOLATION_TENANT_ID
unset TEMPLATE_INSTALLATION_ID MERCHANT_INSTALLATION_ID MERCHANT_APP_ID RELEASE_ID
```

Mark the goal complete only if every design acceptance requirement has direct evidence, including Android and iOS. If a real device、test phone、console authorization or external permission remains unavailable, leave the goal active with the exact `BLOCKED` or `WAITING_FOR_DEVICE_ACCEPTANCE` item; do not redefine success as “code ready”.
