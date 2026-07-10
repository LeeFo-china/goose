# Customer Project Detail Optional Module Cancellation Plan

> **Execution mode:** follow `executing-plans` and `test-driven-development`; keep each task independently verified and committed.

**Goal:** 让 `detail-bootstrap` 的可选模块在 controller 超时后停止其可取消的 Supabase/Bun SQL 查询，避免已返回 partial response 的请求继续占用本地 `max = 2` 数据库连接。

**Root cause addressed:** 当前 `Promise.race` 只停止等待，不停止底层查询。日志、验收和营销入口查询超时后仍可能持有连接，连续请求会放大排队时间。SQL 执行计划本身已验证为毫秒级，因此本阶段不新增索引、RPC、缓存依赖或扩大连接池。

**Compatibility boundary:** 不改变 HTTP 成功响应、`partial_errors`、分页结构和默认超时值；不修改 orange；不部署；不对营销 legacy 深层查询虚报“完整可取消”。

## Verified third-party APIs

- Installed `@supabase/postgrest-js@2.100.0` declares `abortSignal(signal: AbortSignal): this` in `dist/index.d.mts`.
- Installed `bun-types@1.3.11` declares `Query.cancel(): Query<T>` in `sql.d.ts`.
- Bun 运行时只读检查确认 `sql.unsafe("SELECT 1")` 的 Query 同时具有 `then` 和 `cancel` 方法。

## File map

- Create `apps/api/src/utils/abortable-module-timeout.ts` and tests: controller deadline, timer cleanup, abort, handled late rejection.
- Create `apps/api/src/utils/cancellable-sql-query.ts` and tests: bind `AbortSignal` to Bun Query `cancel()`.
- Modify `apps/api/src/controllers/customer-self-service/detail-bootstrap-controller.ts` and tests: promise factory receives signal; logs/acceptances report full cancellation support, campaign modules report boundary-only support.
- Modify `apps/api/src/services/customer-project-detail-logs.ts` and `apps/api/src/repositories/customer-project-detail-logs.ts`: propagate signal to Bun SQL and Supabase RPC.
- Modify project acceptance summary service/repository files: propagate signal, and avoid sharing a signal-owned in-flight request with unrelated callers.
- Modify customer campaign bootstrap service/repository files: cancel the fast entry-gate SQL and check the signal before entering non-cancellable legacy orchestration.

## Task 1: Abortable optional-module deadline

1. Write failing tests for success, loader error, timeout abort, timer cleanup, timeout error details, and a late loader rejection without `unhandledRejection`.
2. Implement `withAbortableModuleTimeout({ module, timeoutMs, cancelSupported, load })` using `AbortController`, `Errors.business`, and `finally` timer cleanup.
3. Timeout details must include `module`, `timeout_ms`, and `cancel_supported`.
4. Run the new utility test and commit.

## Task 2: Bun SQL cancellation adapter

1. Write failing tests with a structural thenable exposing `cancel()`.
2. Implement `executeCancellableSqlQuery(query, signal?)`; on abort call `query.cancel()`, remove the listener in `finally`, and preserve the driver's rejection.
3. Do not invent Bun types or add dependencies.
4. Run utility tests and commit.

## Task 3: Cancel customer detail logs queries

1. Add failing repository/service tests proving the signal reaches Supabase `.abortSignal` and Bun Query `cancel()`.
2. Add optional `signal` to the bootstrap-specific logs service/repository input.
3. For direct SQL cancellation, do not mark direct SQL globally unavailable and do not fall back to Supabase after abort.
4. Apply `.abortSignal(signal)` to the RPC fallback.
5. Run logs tests and commit.

## Task 4: Cancel customer acceptance summary queries

1. Add failing tests for signal propagation from `listCustomerAcceptances` to the summary RPC.
2. Extend existing options/input with optional `signal` and apply it to Bun SQL/Supabase RPC.
3. A signal-owned request may read a fulfilled cache entry, but must not reuse or populate the shared in-flight slot; this prevents one request timeout from canceling another caller's query.
4. Abort must not mark direct SQL unavailable or trigger a fallback.
5. Run acceptance summary tests and commit.

## Task 5: Bound campaign entry queries honestly

1. Add failing service/repository tests for signal propagation and abort before legacy orchestration.
2. Extend `hasShareAssistEntry` and `hasAppointmentRewardEntry` with optional `signal`; pass it to direct SQL queries and check `signal.throwIfAborted()` before returning a cache miss/result.
3. In controller campaign loaders, check the signal again before calling legacy campaign services.
4. Campaign timeout metadata must set `cancel_supported: false`, because only the entry gateway is cancellable; do not claim complete cancellation for legacy downstream calls.
5. Run campaign bootstrap tests and commit.

## Task 6: Integrate the controller deadline

1. Add controller tests asserting logs and acceptances loaders receive an `AbortSignal`, timeout responses retain existing empty fallbacks/partial errors, and timeout logs include cancellation support metadata.
2. Replace the private `Promise.race` implementation with the tested utility and promise factories.
3. Pass signals only through the scoped read paths above; workflow progress remains required and is not downgraded to optional timeout.
4. Keep constants at 1200/2500/2500/1800ms and preserve the response contract.
5. Run controller tests and commit.

## Task 7: Verify and probe

1. Run all new tests plus the 57-test critical-path suite.
2. Run `bun run api:check`, `git diff --check`, the 500-line gate, and inspect worktree scope.
3. Run a local fake-slow cancellation probe proving `cancel()`/abort occurs near the configured deadline and no late unhandled rejection occurs.
4. Run the fa32 cold/warm service probe again to ensure the prior cache improvement remains intact.
5. Record that dev deployment, 10-round HTTP P50/P95, client disconnect simulation, and `pg_stat_activity` observation remain release-environment checks requiring deployment authority.

## Rollback

- Revert controller utility wiring to restore wait-only timeouts.
- Signal parameters are optional, so repository/service commits can be reverted independently.
- No migration or data rollback is required.
