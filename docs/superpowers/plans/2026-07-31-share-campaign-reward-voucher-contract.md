# 好友助力领奖凭证与海报短文案契约实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一好友助力与预约有礼的领奖凭证状态、查询和原子核销契约，并修复领奖码、二维码环境及短文案长度行为。

**Architecture:** 在 `customer-project-log-shares` 领域内增加纯状态策略和双活动凭证解析器，GET 与 POST 共用同一决策结果，仓储层用带旧状态条件的单条更新保证并发下至多一次成功。二维码请求和短文案校验分别提取为可单测的纯函数，dev fixture 通过显式脚本维护，不进入 migration 或自动部署。

**Tech Stack:** Bun、TypeScript、Fastify、Supabase JS、Bun Test、现有 `systemSettingsService` 与 `wechatOpenLinkService`

---

## 文件职责映射

- `apps/api/src/services/customer-project-log-shares/claim-voucher-policy.ts`：纯状态决策、活动类型归一化和阻断原因到业务错误的映射。
- `apps/api/src/services/customer-project-log-shares/claim-voucher-policy.test.ts`：完整状态矩阵、达标后关闭和优先级测试。
- `apps/api/src/services/customer-project-log-shares/legacy/employee-shares.ts`：统一解析好友助力/预约有礼 token，组装详情并分派核销。
- `apps/api/src/repositories/customer-project-log-share-campaigns/legacy/campaigns.ts`：好友助力条件核销。
- `apps/api/src/repositories/customer-project-log-share-campaigns/legacy-repository.ts`、`apps/api/src/repositories/customer-project-log-share-campaigns.ts`：暴露好友助力条件核销方法。
- `apps/api/src/repositories/customer-appointment-reward-campaigns.ts`：预约有礼条件核销。
- `apps/api/src/services/customer-project-log-shares/mini-program-qrcode-request.ts`：读取并规范化 `env_version`，构造微信二维码请求体。
- `apps/api/src/services/customer-project-log-shares/legacy/public-actions.ts`：三个二维码入口复用请求构造器，未达标分享卡不再返回伪领奖码。
- `apps/api/src/services/customer-project-log-shares/share-copy-policy.ts`：48 展示字符校验、尾部省略号拒绝和 short fallback 补齐。
- `apps/api/src/services/customer-project-log-shares/legacy/shared-helpers.ts`、`share-campaign-core.ts`：按 `length` 应用文案策略，并向提示词写入 short 上限。
- `apps/api/src/scripts/marketing-claim-voucher-fixtures.ts`：显式、幂等创建/恢复/清理 dev 联调 fixture。
- `apps/api/src/scripts/marketing-claim-voucher-fixtures.test.ts`：运行参数三重保护与敏感输出约束。
- `docs/miniprogram/2026-07-31-share-campaign-reward-voucher-backend-handoff.md`：发布 commit、fixture、接口 smoke 与 Orange 验收说明。

### Task 1: 建立统一领奖状态策略

**Files:**
- Create: `apps/api/src/services/customer-project-log-shares/claim-voucher-policy.test.ts`
- Create: `apps/api/src/services/customer-project-log-shares/claim-voucher-policy.ts`
- Modify: `apps/api/src/services/customer-project-log-shares/legacy/reward-config.ts`

- [ ] **Step 1: 写状态矩阵失败测试**

测试用固定时钟覆盖 claimed、expired、未达标关闭、未达标、已达标、达标后关闭和无 token：

```ts
import { describe, expect, test } from 'bun:test';
import { decideClaimVoucher } from './claim-voucher-policy';

const now = new Date('2026-07-31T12:00:00.000Z');

test.each([
  ['claimed', { isClaimed: true }, ['claimed', false, 'already_claimed']],
  ['expired', { expiresAt: '2026-07-30T00:00:00.000Z' }, ['expired', false, 'voucher_expired']],
  ['closed under target', { isClosed: true }, ['invalid', false, 'campaign_closed']],
  ['open under target', {}, ['invalid', false, 'campaign_not_achieved']],
  ['achieved', { isAchieved: true }, ['active', true, null]],
  ['achieved then closed', { isAchieved: true, isClosed: true }, ['active', true, null]],
])('%s', (_name, overrides, expected) => {
  const result = decideClaimVoucher({
    hasVoucherToken: true,
    isClaimed: false,
    isClosed: false,
    isAchieved: false,
    expiresAt: null,
    now,
    ...overrides,
  });
  expect([result.voucherStatus, result.canClaim, result.blockReason]).toEqual(expected);
});
```

- [ ] **Step 2: 运行测试并确认正确失败**

Run: `bun test apps/api/src/services/customer-project-log-shares/claim-voucher-policy.test.ts`

Expected: FAIL，原因是 `claim-voucher-policy` 模块或 `decideClaimVoucher` 尚不存在。

- [ ] **Step 3: 实现最小纯策略**

```ts
export type ClaimVoucherBlockReason =
  | 'already_claimed'
  | 'voucher_expired'
  | 'campaign_not_achieved'
  | 'campaign_closed'
  | 'voucher_invalid'
  | null;

export function decideClaimVoucher(input: ClaimVoucherDecisionInput): ClaimVoucherDecision {
  if (!input.hasVoucherToken) return invalid('voucher_invalid');
  if (input.isClaimed) return blocked('claimed', 'already_claimed');
  if (input.expiresAt && new Date(input.expiresAt).getTime() < input.now.getTime()) {
    return blocked('expired', 'voucher_expired');
  }
  if (!input.isAchieved && input.isClosed) return invalid('campaign_closed');
  if (!input.isAchieved) return invalid('campaign_not_achieved');
  return { voucherStatus: 'active', canClaim: true, blockReason: null };
}
```

同时让 `reward-config.ts` 的好友助力序列化调用该策略，保持 `getRewardClaimVoucherStatus` 的旧返回类型兼容。

- [ ] **Step 4: 运行测试和类型检查**

Run: `bun test apps/api/src/services/customer-project-log-shares/claim-voucher-policy.test.ts && bun run --cwd apps/api typecheck`

Expected: 所有矩阵用例 PASS，TypeScript 0 errors。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/services/customer-project-log-shares/claim-voucher-policy.ts \
  apps/api/src/services/customer-project-log-shares/claim-voucher-policy.test.ts \
  apps/api/src/services/customer-project-log-shares/legacy/reward-config.ts
git commit -m "fix(marketing): 统一领奖凭证状态策略"
```

### Task 2: 实现双活动条件核销仓储

**Files:**
- Create: `apps/api/src/repositories/marketing-claim-voucher-atomic.test.ts`
- Modify: `apps/api/src/repositories/customer-project-log-share-campaigns/legacy/campaigns.ts`
- Modify: `apps/api/src/repositories/customer-project-log-share-campaigns/legacy-repository.ts`
- Modify: `apps/api/src/repositories/customer-project-log-share-campaigns.ts`
- Modify: `apps/api/src/repositories/customer-appointment-reward-campaigns.ts`

- [ ] **Step 1: 写条件更新失败测试**

使用轻量 Supabase query stub 断言两个方法都带 token、未领取状态和非 `reward_claimed` 条件，并在 `maybeSingle()` 无数据时返回 `null`：

```ts
expect(filters).toContainEqual(['eq', 'reward_claim_voucher_token', 'voucher-token']);
expect(filters).toContainEqual(['neq', 'reward_claim_status', 'claimed']);
expect(filters).toContainEqual(['neq', 'status', 'reward_claimed']);
expect(result).toBeNull();
```

- [ ] **Step 2: 运行测试并确认正确失败**

Run: `bun test apps/api/src/repositories/marketing-claim-voucher-atomic.test.ts`

Expected: FAIL，原因是两个仓储尚未暴露 `claimRewardByVoucherIfUnclaimed`。

- [ ] **Step 3: 实现两种活动的条件核销**

两个仓储都实现同一输入形状：

```ts
type AtomicVoucherClaimInput = {
  id: string;
  voucherToken: string;
  employeeId: string;
  channel: string;
  claimedAt: string;
};
```

Supabase 更新必须使用 `.eq('id', ...)`、`.eq('reward_claim_voucher_token', ...)`、
`.neq('reward_claim_status', 'claimed')`、`.neq('status', 'reward_claimed')`、
`.select('*').maybeSingle()`；PostgREST 无命中返回 `null`，数据库错误用 `Errors.dbError(...)` 包装。

- [ ] **Step 4: 运行仓储测试和类型检查**

Run: `bun test apps/api/src/repositories/marketing-claim-voucher-atomic.test.ts && bun run --cwd apps/api typecheck`

Expected: PASS，且两个方法的公共包装层类型正确。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/repositories/marketing-claim-voucher-atomic.test.ts \
  apps/api/src/repositories/customer-project-log-share-campaigns \
  apps/api/src/repositories/customer-project-log-share-campaigns.ts \
  apps/api/src/repositories/customer-appointment-reward-campaigns.ts
git commit -m "fix(marketing): 增加领奖凭证原子核销"
```

### Task 3: 统一好友助力与预约有礼凭证 GET/POST

**Files:**
- Create: `apps/api/src/services/customer-project-log-shares/employee-claim-voucher.test.ts`
- Modify: `apps/api/src/services/customer-project-log-shares/legacy/employee-shares.ts`
- Modify: `apps/api/src/services/customer-project-log-shares/legacy-service.ts`
- Modify: `apps/api/src/controllers/customer-project-log-shares/marketing-center-instance-controller.ts`

- [ ] **Step 1: 写双活动解析和重复核销失败测试**

依赖注入仓储 stub，至少断言：

```ts
expect((await resolveClaimVoucher('share-token')).campaignType).toBe('share_assist');
expect((await resolveClaimVoucher('appointment-token')).campaignType).toBe('appointment_reward');
expect((await getDetail('appointment-token')).campaign_type).toBe('appointment_reward');
expect(firstClaim.reward_claim_status).toBe('claimed');
await expect(secondClaim).rejects.toMatchObject({ statusCode: 400 });
```

补充无 token、已过期、未达标关闭、达标后关闭和预约有礼详情字段断言。

- [ ] **Step 2: 运行测试并确认正确失败**

Run: `bun test apps/api/src/services/customer-project-log-shares/employee-claim-voucher.test.ts`

Expected: FAIL，预约有礼 token 当前被报告“领取凭证不存在”，或统一解析函数不存在。

- [ ] **Step 3: 实现统一解析、详情和核销分派**

在 `employee-shares.ts` 内归一为：

```ts
type ResolvedClaimVoucher =
  | { campaignType: 'share_assist'; instance: CustomerProjectLogShareCampaignRow }
  | { campaignType: 'appointment_reward'; instance: CustomerAppointmentRewardCampaignRow };
```

`getVoucherMetaForEmployeeClaim` 返回稳定 `campaign_type` 和 `project_id`；详情按活动类型组装，
但统一返回 `voucher_status`、`can_claim`、`claim_block_reason`、`claimed_at`、`expires_at`。
POST 先调用同一策略，只在 `canClaim=true` 时进入对应条件核销；条件更新返回 `null` 时重读并
按最新决策返回“已领取”或其他稳定业务错误。所有错误通过 `Errors.badRequest`/`Errors.forbidden`。

Controller 继续让旧别名和新 Marketing Center 路由共享方法，并直接保留服务返回的
`campaign_type`，避免 `withCampaignType` 把预约有礼误标为好友助力。

- [ ] **Step 4: 运行服务测试、Controller 路由测试与类型检查**

Run: `bun test apps/api/src/services/customer-project-log-shares/employee-claim-voucher.test.ts apps/api/src/controllers/customer-project-log-shares && bun run --cwd apps/api typecheck`

Expected: 两类 token 的 GET/POST 均 PASS，旧别名仍注册，无权限检查仍在 Controller 执行。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/services/customer-project-log-shares/employee-claim-voucher.test.ts \
  apps/api/src/services/customer-project-log-shares/legacy/employee-shares.ts \
  apps/api/src/services/customer-project-log-shares/legacy-service.ts \
  apps/api/src/controllers/customer-project-log-shares/marketing-center-instance-controller.ts
git commit -m "fix(marketing): 兼容双活动凭证核销"
```

### Task 4: 停止未达标分享卡暴露伪领奖码

**Files:**
- Create: `apps/api/src/services/customer-project-log-shares/share-card-reward-code.test.ts`
- Modify: `apps/api/src/services/customer-project-log-shares/legacy/public-actions.ts`

- [ ] **Step 1: 写分享卡契约失败测试**

```ts
expect(serializeShareRewardCode(underTargetCampaign)).toBeNull();
expect(serializeShareRewardCode(achievedCampaign)).toBe('REAL-CODE');
expect(serializeShareRewardCode(claimedCampaign)).toBe('REAL-CODE');
```

- [ ] **Step 2: 运行测试并确认当前合成码导致失败**

Run: `bun test apps/api/src/services/customer-project-log-shares/share-card-reward-code.test.ts`

Expected: FAIL，未达标活动返回非空合成码。

- [ ] **Step 3: 实现最小序列化函数并接入 `getShareCard`**

只在活动已达标或已领取时返回现有 `reward_claim_code`，否则返回 `null`；禁止创建、截断或合成代码。

- [ ] **Step 4: 运行测试与类型检查**

Run: `bun test apps/api/src/services/customer-project-log-shares/share-card-reward-code.test.ts && bun run --cwd apps/api typecheck`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/services/customer-project-log-shares/share-card-reward-code.test.ts \
  apps/api/src/services/customer-project-log-shares/legacy/public-actions.ts
git commit -m "fix(marketing): 未达标时隐藏领奖码"
```

### Task 5: 三个二维码入口读取运行环境设置

**Files:**
- Create: `apps/api/src/services/customer-project-log-shares/mini-program-qrcode-request.test.ts`
- Create: `apps/api/src/services/customer-project-log-shares/mini-program-qrcode-request.ts`
- Modify: `apps/api/src/services/customer-project-log-shares/legacy/public-actions.ts`

- [ ] **Step 1: 写二维码设置失败测试**

```ts
const body = await buildMiniProgramQrcodeRequest({
  scene: 'voucher-token',
  page: 'pages/employee/claim/index',
  settings: { getString: async () => 'develop' },
  normalizeEnvVersion: (value) => value as 'develop',
});
expect(body.env_version).toBe('develop');
```

另测空设置默认 `release`，非法值交给现有 normalize 归一。

- [ ] **Step 2: 运行测试并确认正确失败**

Run: `bun test apps/api/src/services/customer-project-log-shares/mini-program-qrcode-request.test.ts`

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现请求构造器并替换三个硬编码**

构造器只读取 `WECHAT_MINIPROGRAM_ENV_VERSION`，默认 `release`，并调用
`wechatOpenLinkService.normalizeEnvVersion`。三个二维码方法都将构造结果传给
`JSON.stringify`，不再出现 `env_version: "release"`。

- [ ] **Step 4: 运行单测、硬编码扫描和类型检查**

Run: `bun test apps/api/src/services/customer-project-log-shares/mini-program-qrcode-request.test.ts && ! rg -n 'env_version: "release"' apps/api/src/services/customer-project-log-shares/legacy/public-actions.ts && bun run --cwd apps/api typecheck`

Expected: PASS，扫描无匹配。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/services/customer-project-log-shares/mini-program-qrcode-request.ts \
  apps/api/src/services/customer-project-log-shares/mini-program-qrcode-request.test.ts \
  apps/api/src/services/customer-project-log-shares/legacy/public-actions.ts
git commit -m "fix(marketing): 二维码读取小程序环境"
```

### Task 6: 落实 short 文案 48 展示字符契约

**Files:**
- Create: `apps/api/src/services/customer-project-log-shares/share-copy-policy.test.ts`
- Create: `apps/api/src/services/customer-project-log-shares/share-copy-policy.ts`
- Modify: `apps/api/src/services/customer-project-log-shares/legacy/shared-helpers.ts`
- Modify: `apps/api/src/services/customer-project-log-shares/legacy/share-campaign-core.ts`

- [ ] **Step 1: 写 Unicode、尾部省略号、补齐和 medium 兼容失败测试**

```ts
expect(countDisplayCharacters('装修🙂')).toBe(3);
expect(isValidShortShareCopy('完整短文案。')).toBeTrue();
expect(isValidShortShareCopy(`${'好'.repeat(49)}。`)).toBeFalse();
expect(isValidShortShareCopy('还没说完…')).toBeFalse();
expect(normalizeShareCopies(raw, context, 'short')).toHaveLength(3);
expect(normalizeShareCopies(raw, context, 'short').every(({ text }) =>
  countDisplayCharacters(text) <= 48 && !/(?:\.\.\.|…)$/.test(text))).toBeTrue();
expect(normalizeShareCopies(raw, context, 'medium')[0]?.text).toBe(over48CompleteText);
```

- [ ] **Step 2: 运行测试并确认当前超长/省略号未过滤**

Run: `bun test apps/api/src/services/customer-project-log-shares/share-copy-policy.test.ts`

Expected: FAIL，短文案校验函数尚不存在。

- [ ] **Step 3: 实现短文案策略并接入 AI 调用**

导出 `SHORT_SHARE_COPY_MAX_DISPLAY_CHARS = 48`，使用 `Array.from(text).length`。
short 模式先过滤空值、超长、尾部省略号和重复项，再用三条固定、完整且同样通过校验的 fallback
补齐到 3；不对 AI 原文执行 `slice`。medium 模式保持当前“最多三条，失败才 fallback”行为。
`buildCopyPrompt` 在 short 模式明确要求“每条最多 48 个中文展示字符（含标点），句意完整且不得以省略号结尾”。

- [ ] **Step 4: 运行单测与类型检查**

Run: `bun test apps/api/src/services/customer-project-log-shares/share-copy-policy.test.ts && bun run --cwd apps/api typecheck`

Expected: PASS，short 始终三条合规完整文案，medium 不受 48 字限制。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/services/customer-project-log-shares/share-copy-policy.ts \
  apps/api/src/services/customer-project-log-shares/share-copy-policy.test.ts \
  apps/api/src/services/customer-project-log-shares/legacy/shared-helpers.ts \
  apps/api/src/services/customer-project-log-shares/legacy/share-campaign-core.ts
git commit -m "fix(marketing): 校验海报短文案长度"
```

### Task 7: 增加安全、幂等的 dev 联调 fixture

**Files:**
- Create: `apps/api/src/scripts/marketing-claim-voucher-fixtures.test.ts`
- Create: `apps/api/src/scripts/marketing-claim-voucher-fixtures.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: 写运行保护失败测试**

```ts
expect(() => parseFixtureArgs([])).toThrow('必须显式指定 --target=dev');
expect(() => parseFixtureArgs(['--target=production', '--confirm-dev-fixtures'])).toThrow();
expect(redactFixtureOutput({ token: 'secret', projectId: 'p1' })).toEqual({ projectId: 'p1' });
```

另测 `--mode=upsert|cleanup`、已知 dev 租户 ID 和稳定 fixture key。

- [ ] **Step 2: 运行测试并确认正确失败**

Run: `bun test apps/api/src/scripts/marketing-claim-voucher-fixtures.test.ts`

Expected: FAIL，脚本模块尚不存在。

- [ ] **Step 3: 实现 fixture 脚本**

脚本必须同时满足 `--target=dev`、`--confirm-dev-fixtures` 和已知 dev 租户 ID；使用 admin client
按稳定 key 查询后 upsert/恢复八类业务 fixture，名称包含“联调 Fixture”。`cleanup` 只删除这些稳定 key
命中的记录，禁止按租户全量删除。输出仅含手机号/身份说明、项目 ID、活动/实例 ID、凭证 URL 路径和
`WECHAT_MINIPROGRAM_ENV_VERSION`，永不输出登录 token、Authorization、service role key。

package script：

```json
"marketing:claim-voucher:fixtures": "bun --env-file=.env --env-file=.env.local src/scripts/marketing-claim-voucher-fixtures.ts"
```

- [ ] **Step 4: 运行测试和 dry-run**

Run: `bun test apps/api/src/scripts/marketing-claim-voucher-fixtures.test.ts && bun run --cwd apps/api marketing:claim-voucher:fixtures -- --target=dev --confirm-dev-fixtures --mode=upsert --dry-run`

Expected: PASS；dry-run 列出八类 fixture 和 env version，不写数据库、不包含任何 token/secret。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/scripts/marketing-claim-voucher-fixtures.ts \
  apps/api/src/scripts/marketing-claim-voucher-fixtures.test.ts apps/api/package.json
git commit -m "test(marketing): 增加领奖凭证联调数据"
```

### Task 8: 全量验证、发布 dev 和编写小程序交接

**Files:**
- Create: `docs/miniprogram/2026-07-31-share-campaign-reward-voucher-backend-handoff.md`

- [ ] **Step 1: 运行领域测试、全量 API 门禁和差异检查**

Run:

```bash
bun test apps/api/src/services/customer-project-log-shares apps/api/src/repositories/marketing-claim-voucher-atomic.test.ts apps/api/src/scripts/marketing-claim-voucher-fixtures.test.ts
bun run api:check
git diff --check
git status --short
```

Expected: 测试 0 failures；typecheck/build/file-size 全部通过；无空白错误；只包含本任务文件。

- [ ] **Step 2: 创建或恢复 dev fixture**

Run: `bun run --cwd apps/api marketing:claim-voucher:fixtures -- --target=dev --confirm-dev-fixtures --mode=upsert`

Expected: 输出八类 fixture 的非敏感标识、客户/员工测试身份和 `env_version=develop`，无登录 token。

- [ ] **Step 3: 提交最终验证文档**

交接文档记录：接口路径、稳定字段、状态矩阵、兼容别名、权限、幂等行为、fixture 身份/ID、二维码入口、
实际 env version、每个 smoke 的 HTTP 状态和 Orange 验收矩阵；明确 Orange 仓库保持未修改。

```bash
git add docs/miniprogram/2026-07-31-share-campaign-reward-voucher-backend-handoff.md
git commit -m "docs(miniprogram): 交接领奖凭证后端契约"
```

- [ ] **Step 4: 按仓库现有发布流程推送并部署 dev**

先检查当前 workflow 和发布脚本，再将分支安全集成到最新 `main` 并推送。若仓库配置为 main push 自动部署，
跟踪对应 workflow 至成功；若需要管理员版本发布，则使用现有 dev 发布入口。不得把 fixture 自动加入部署。

Expected: 开发 API 运行发布 commit，部署任务成功。

- [ ] **Step 5: 对 dev 执行接口 smoke**

使用授权测试身份但不记录 token，逐一验证：未达标、达标、已领取、过期、未达标关闭、达标关闭、无权限、
预约有礼；二维码返回有效图片且日志/请求证据显示 `env_version=develop`；超长 AI 原始结果由自动化测试证明
被过滤并补齐。重复/并发核销最多一次 200。

- [ ] **Step 6: 最终发布报告**

向用户提供发布 commit、部署状态、非敏感 fixture、smoke 摘要和可直接转发给 Orange 的消息。消息必须说明
后端改动、Orange 需要验证的入口与矩阵、旧别名兼容、dev env version，以及“不回传登录 token”。
