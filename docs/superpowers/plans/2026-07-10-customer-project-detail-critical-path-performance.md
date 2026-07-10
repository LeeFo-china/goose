# Customer Project Detail Critical Path Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将客户项目详情关键路径的 workflow progress 和 project detail 变为可细分观测、可短时复用且可并发去重的读取链路。

**Architecture:** 新增两个无外部依赖的基础单元：`ExpiringInFlightCache` 负责成功值短缓存和执行中 Promise 去重，workflow timing helper 负责细分步骤计时。service 层使用这些单元，controller 只创建 timing collector、调用 service 并把子步骤写入现有 slow timing 日志，不改变 HTTP 契约。

**Tech Stack:** Bun 1.3、TypeScript、Fastify、Supabase、bun:test。

---

## File map

- Create `apps/api/src/utils/expiring-in-flight-cache.ts`: 通用成功值 TTL 缓存与 in-flight 去重。
- Create `apps/api/src/utils/expiring-in-flight-cache.test.ts`: 缓存、并发、失败清理、失效测试。
- Create `apps/api/src/services/project-workflow-progress-timing.ts`: workflow timing 类型和计时函数。
- Create `apps/api/src/services/project-workflow-progress-timing.test.ts`: timing 成功和异常测试。
- Modify `apps/api/src/services/project-workflow-progress.ts`: 记录子步骤，增加 5 秒缓存、并发去重和失效方法。
- Modify `apps/api/src/services/project-workflow-progress.test.ts`: 修正既有返回结构断言。
- Modify `apps/api/src/controllers/customer-self-service/detail-bootstrap-workflow-progress.ts`: 传递 workflow timing collector。
- Modify `apps/api/src/controllers/customer-self-service/detail-bootstrap-workflow-progress.test.ts`: 验证 timing collector 透传。
- Modify `apps/api/src/controllers/customer-self-service/detail-bootstrap-controller.ts`: 创建并输出 `workflow_steps`。
- Modify `apps/api/src/services/customer-project-detail.ts`: 项目详情 5 秒成功缓存和 in-flight 去重。
- Create `apps/api/src/services/customer-project-detail.test.ts`: 项目缓存、隔离、失败和并发测试。
- Modify `apps/api/src/services/project-workflow-runtime.ts`: 项目 workflow start/advance 成功后失效 progress 缓存。
- Modify `apps/api/src/services/workflow-task-project-bridge.ts`: 项目任务 bridge 成功后失效 progress 缓存。

### Task 1: Repair the baseline contract assertion

**Files:**
- Modify: `apps/api/src/services/project-workflow-progress.test.ts:246`

- [ ] **Step 1: Update the existing exact assertion**

在 `returns missing_runtime without guessing when runtime is absent` 的期望对象中加入当前真实契约：

```ts
workflow_definition_id: null,
workflow_title: null,
```

- [ ] **Step 2: Run the target test**

Run:

```bash
bun test src/services/project-workflow-progress.test.ts
```

Expected: 10 tests pass, 0 fail.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/project-workflow-progress.test.ts
git commit -m "test(workflow): 对齐缺失运行时进度契约"
```

### Task 2: Add a reusable expiring in-flight cache

**Files:**
- Create: `apps/api/src/utils/expiring-in-flight-cache.ts`
- Create: `apps/api/src/utils/expiring-in-flight-cache.test.ts`

- [ ] **Step 1: Write failing cache tests**

覆盖以下公开行为：

```ts
const cache = new ExpiringInFlightCache<string, { id: string }>({ ttlMs: 5_000 });

const [first, second] = await Promise.all([
  cache.getOrCreate("project-1", loader),
  cache.getOrCreate("project-1", loader),
]);

expect(loader).toHaveBeenCalledTimes(1);
expect(first).toBe(second);
```

同时覆盖：成功结果在 TTL 内复用、不同 key 隔离、loader reject 后下一次重新执行、`invalidate(key)` 和 `clear()`。

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun test src/utils/expiring-in-flight-cache.test.ts
```

Expected: FAIL because `ExpiringInFlightCache` does not exist.

- [ ] **Step 3: Implement the minimal cache**

公开接口固定为：

```ts
export class ExpiringInFlightCache<Key, Value> {
  constructor(options: { ttlMs: number });
  getOrCreate(
    key: Key,
    loader: () => Promise<Value>,
    options?: { shouldCache?: (value: Value) => boolean },
  ): Promise<Value>;
  invalidate(key: Key): void;
  clear(): void;
}
```

实现要求：先查未过期成功值，再查 in-flight；loader 的 Promise 在 `finally` 中仅清理自身；只缓存 fulfilled 且 `shouldCache` 未拒绝的结果；reject 不缓存。

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
bun test src/utils/expiring-in-flight-cache.test.ts
```

Expected: all cache tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/utils/expiring-in-flight-cache.ts apps/api/src/utils/expiring-in-flight-cache.test.ts
git commit -m "perf(api): 增加短缓存并发去重工具"
```

### Task 3: Add workflow sub-step timing

**Files:**
- Create: `apps/api/src/services/project-workflow-progress-timing.ts`
- Create: `apps/api/src/services/project-workflow-progress-timing.test.ts`
- Modify: `apps/api/src/services/project-workflow-progress.ts:198`

- [ ] **Step 1: Write failing timing tests**

定义固定步骤：

```ts
export const projectWorkflowProgressTimingStepKeys = [
  "subject_state_runtime_ms",
  "graph_ms",
  "pending_tasks_ms",
  "runtime_nodes_ms",
  "procedure_assignments_ms",
  "task_actions_ms",
  "finance_reviewers_ms",
  "completed_node_actors_ms",
  "projection_ms",
] as const;
```

测试 `createProjectWorkflowProgressTimingSteps()` 初始值均为 0；测试 `measureProjectWorkflowProgressStep` 在 callback resolve 和 reject 时都累计耗时。

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun test src/services/project-workflow-progress-timing.test.ts
```

Expected: FAIL because timing helpers do not exist.

- [ ] **Step 3: Implement timing helpers**

计时函数签名：

```ts
export async function measureProjectWorkflowProgressStep<Value>(
  steps: ProjectWorkflowProgressTimingSteps | undefined,
  step: ProjectWorkflowProgressTimingStep,
  callback: () => Promise<Value> | Value,
): Promise<Value>;
```

未传 `steps` 时直接调用 callback；传入时在 `finally` 中累加 `Date.now()` 差值。

- [ ] **Step 4: Instrument `getProjectProgress`**

将签名扩展为：

```ts
async getProjectProgress(
  input: GetProjectProgressInput,
  options?: { timing?: ProjectWorkflowProgressTimingSteps },
): Promise<ProjectWorkflowProgress>
```

按 key 包装现有查询；四个第一阶段并行查询分别计时，三个 enrichment 查询分别计时，最终 projection 计时。保持并行结构和返回值不变。

- [ ] **Step 5: Run timing and projection tests**

Run:

```bash
bun test src/services/project-workflow-progress-timing.test.ts src/services/project-workflow-progress.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/project-workflow-progress.ts apps/api/src/services/project-workflow-progress-timing.ts apps/api/src/services/project-workflow-progress-timing.test.ts
git commit -m "perf(workflow): 增加项目进度子步骤计时"
```

### Task 4: Expose workflow timing through customer bootstrap logs

**Files:**
- Modify: `apps/api/src/controllers/customer-self-service/detail-bootstrap-workflow-progress.ts`
- Modify: `apps/api/src/controllers/customer-self-service/detail-bootstrap-workflow-progress.test.ts`
- Modify: `apps/api/src/controllers/customer-self-service/detail-bootstrap-controller.ts:120`

- [ ] **Step 1: Write the failing loader test**

创建 `workflowSteps = createProjectWorkflowProgressTimingSteps()`，传入 loader，并断言 mock：

```ts
expect(getProjectProgress).toHaveBeenCalledWith(
  { tenantId: "tenant-1", projectId: "project-1" },
  { timing: workflowSteps },
);
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
bun test src/controllers/customer-self-service/detail-bootstrap-workflow-progress.test.ts
```

Expected: FAIL because the timing options are not forwarded.

- [ ] **Step 3: Forward and log timing**

`loadCustomerProjectWorkflowProgress` 输入新增 `workflowSteps`；controller 为每个请求创建 collector，传给 loader，并在 `logCustomerProjectDetailTiming` 的 `extra` 中输出：

```ts
extra: { workflow_steps: workflowSteps },
```

`debug_timing` 输出中也加入 `workflow_steps`，不改变默认生产响应。

- [ ] **Step 4: Run controller tests**

Run:

```bash
bun --env-file=/Users/leefo/Public/work/gooes/apps/api/.env test \
  src/controllers/customer-self-service/detail-bootstrap-workflow-progress.test.ts \
  src/controllers/customer-self-service/detail-bootstrap-construction-stages-timeout.test.ts
```

Expected: 2 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/controllers/customer-self-service/detail-bootstrap-controller.ts apps/api/src/controllers/customer-self-service/detail-bootstrap-workflow-progress.ts apps/api/src/controllers/customer-self-service/detail-bootstrap-workflow-progress.test.ts
git commit -m "perf(customer): 输出项目详情工作流细分耗时"
```

### Task 5: Deduplicate and cache workflow progress reads

**Files:**
- Modify: `apps/api/src/services/project-workflow-progress.ts`
- Create: `apps/api/src/services/project-workflow-progress-cache.test.ts`

- [ ] **Step 1: Write failing service cache tests**

通过导出的 `ProjectWorkflowProgressService` 和可注入 loader，验证：两个相同并发请求只执行一次 load；5 秒内后续请求复用；tenant/project key 隔离；异常不缓存；`source = unavailable` 不缓存；`invalidateProject({ tenantId, projectId })` 后重新执行。

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun test src/services/project-workflow-progress-cache.test.ts
```

Expected: FAIL because the service has no cache or invalidation API.

- [ ] **Step 3: Implement cache integration**

使用：

```ts
private readonly progressCache = new ExpiringInFlightCache<string, ProjectWorkflowProgress>({
  ttlMs: 5_000,
});
```

公开：

```ts
invalidateProject(input: GetProjectProgressInput): void;
```

缓存 key 为 `tenantId:projectId`；`shouldCache` 拒绝 `source === "unavailable"`。把原查询编排移动到私有 `loadProjectProgress`，`getProjectProgress` 只负责 cache/in-flight。

- [ ] **Step 4: Run workflow tests**

Run:

```bash
bun test src/services/project-workflow-progress-cache.test.ts src/services/project-workflow-progress.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/project-workflow-progress.ts apps/api/src/services/project-workflow-progress-cache.test.ts
git commit -m "perf(workflow): 合并重复项目进度读取"
```

### Task 6: Deduplicate and cache customer project detail reads

**Files:**
- Modify: `apps/api/src/services/customer-project-detail.ts`
- Create: `apps/api/src/services/customer-project-detail.test.ts`

- [ ] **Step 1: Write failing project detail tests**

为 `CustomerProjectDetailService` 注入 repository stub，覆盖：相同 key 并发只查询一次；5 秒内复用；customer/tenant/project 隔离；null 结果抛出原有 not-found 且不缓存；repository reject 后下一次重试；成功详情仍预热 access cache。

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun test src/services/customer-project-detail.test.ts
```

Expected: FAIL because the class is not injectable and has no detail cache.

- [ ] **Step 3: Implement project detail cache**

导出 class 供测试使用，constructor 默认使用现有 repository。新增 `ExpiringInFlightCache<string, ProjectDetail>`，TTL 5 秒，key 为 `tenantId:customerId:projectId`。loader 返回 null 时抛出 `Errors.notFound`，因此 null 不会进入成功缓存。

- [ ] **Step 4: Run project tests**

Run:

```bash
bun test src/services/customer-project-detail.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/customer-project-detail.ts apps/api/src/services/customer-project-detail.test.ts
git commit -m "perf(customer): 合并重复项目详情读取"
```

### Task 7: Invalidate workflow progress after mutations

**Files:**
- Modify: `apps/api/src/services/project-workflow-runtime.ts`
- Modify: `apps/api/src/services/workflow-task-project-bridge.ts`
- Test: `apps/api/src/services/project-workflow-runtime.test.ts`
- Test: `apps/api/src/services/workflow-task-project-bridge.test.ts`

- [ ] **Step 1: Write failing invalidation assertions**

在 workflow runtime start/advance 成功测试和 project task bridge 成功测试中 mock：

```ts
projectWorkflowProgressService.invalidateProject({ tenantId, projectId });
```

断言失败、skipped 或未处理分支不失效。

- [ ] **Step 2: Run focused tests to verify failure**

Run:

```bash
bun test src/services/project-workflow-runtime.test.ts src/services/workflow-task-project-bridge.test.ts
```

Expected: the new invalidation assertions fail because invalidation is not called.

- [ ] **Step 3: Add invalidation calls**

只在 runtime `started`/`advanced` 或 bridge 成功返回前调用；使用现有 tenantId 和 projectId，不新增查询。

- [ ] **Step 4: Run focused tests**

Run:

```bash
bun test src/services/project-workflow-runtime.test.ts src/services/workflow-task-project-bridge.test.ts
```

Expected: both test files pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/project-workflow-runtime.ts apps/api/src/services/workflow-task-project-bridge.ts apps/api/src/services/*test.ts
git commit -m "perf(workflow): 在项目流程变更后失效进度缓存"
```

### Task 8: Verify the critical-path phase

**Files:**
- Verify: all files listed in Tasks 1-7.

- [ ] **Step 1: Run focused tests**

```bash
bun --env-file=/Users/leefo/Public/work/gooes/apps/api/.env test \
  src/utils/expiring-in-flight-cache.test.ts \
  src/services/project-workflow-progress-timing.test.ts \
  src/services/project-workflow-progress-cache.test.ts \
  src/services/project-workflow-progress.test.ts \
  src/services/customer-project-detail.test.ts \
  src/controllers/customer-self-service/detail-bootstrap-workflow-progress.test.ts \
  src/controllers/customer-self-service/detail-bootstrap-construction-stages-timeout.test.ts
```

Expected: 0 failures.

- [ ] **Step 2: Run API checks**

```bash
bun run api:check
```

Expected: typecheck, build and API file-size gate all pass.

- [ ] **Step 3: Run local read-only performance probe**

使用 fa32 项目重复调用 `customerProjectDetailService.getOwnedProject` 和 `projectWorkflowProgressService.getProjectProgress`，记录 cold、warm 和两个并发相同请求。Expected: 第二次与并发重复调用复用结果，底层 loader 不重复执行。

- [ ] **Step 4: Review scope and worktree**

```bash
git diff --check
git status --short
git diff --stat "$(git merge-base main HEAD)"..HEAD
```

Expected: only planned gooes files changed; orange untouched; no generated build output tracked.

- [ ] **Step 5: Write the optional-module cancellation follow-up plan**

基于新增 `workflow_steps` 和现有 `logs_ms/acceptances_ms/campaign_summary_ms`，为 Supabase `.abortSignal(signal)` 与 Bun SQL Query `.cancel()` 写第二份实施计划。第二阶段不得改变客户接口契约。
