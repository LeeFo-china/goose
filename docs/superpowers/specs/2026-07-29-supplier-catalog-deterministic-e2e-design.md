# 供应标准目录确定性 E2E 设计

## 背景

供应标准目录的类目、品牌和单位已经具备分页读取、新建、编辑、启停、
幂等键和乐观锁能力。现有 Playwright Smoke 只验证三个新建弹窗能够打开，
共享开发库当前又没有目录数据，因此无法稳定验证保存、编辑和状态切换。

## 目标

- 对类目、品牌、单位分别验证新建、编辑、停用和重新启用。
- 验证创建请求携带 `Idempotency-Key`，更新请求携带
  `expected_version`。
- 至少验证一次 `SUPPLIER_VERSION_CONFLICT` 后刷新最新版本并重试原操作。
- 测试不读取或写入共享开发数据库，不依赖远端目录数据。
- 继续保留现有连接真实开发环境的 Phase 0 Smoke。

## 方案选择

采用独立的内存 Mock Backend 和专用 Playwright 配置。

没有采用以下方案：

- 共享开发库测试数据：会污染环境，并受其他人操作影响。
- 浏览器请求拦截：Next.js 服务端组件直接请求后端，`page.route` 无法覆盖
  首屏和 `router.refresh()` 的服务端读取。

## 架构

新增一个仅供 E2E 使用的 Node HTTP 服务。它提供：

- `/admin/auth/login` 和 `/admin/auth/me`，返回拥有
  `platform.catalog.manage` 的平台管理员会话。
- 三类 `/platform/catalog/*` 分页列表接口。
- 三类 POST/PATCH 写接口，并在内存中维护记录与版本。
- `/__test/reset`、`/__test/mutations` 和
  `/__test/conflict-next` 测试控制接口。
- Admin Shell 所需的只读通知空响应。

专用 Playwright 配置同时启动 Mock Backend 和 Admin Dev Server，并通过
`GOOES_API_BASE_URL` 将服务端组件与同源代理都指向 Mock Backend。

## 数据与请求约束

- 初始状态为每类一条启用记录，使用固定 UUID、时间和版本。
- 列表接口支持 `page`、`pageSize`、`keyword`、`status`；
  类目额外支持 `parent_id`，单位额外支持 `unit_kind`。
- 新建请求必须包含非空 `Idempotency-Key`，Mock 记录请求头和 payload。
- PATCH 必须提供与当前记录一致的 `expected_version`，成功后版本加一。
- 冲突注入会先提升服务端版本，再返回 HTTP 409 和
  `SUPPLIER_VERSION_CONFLICT`，以验证页面刷新后按最新版本重试。

## 测试场景

每类资源执行一条完整工作流：

1. 登录并打开对应目录页签。
2. 新建记录，断言新行和创建成功提示。
3. 编辑记录，断言新名称和保存成功提示。
4. 停用记录，断言状态与提示。
5. 重新启用记录，断言状态恢复。
6. 从 Mock 控制接口读取 mutation journal，断言路径、方法、幂等键、
   payload 和递增的 `expected_version`。

品牌的停用操作额外注入一次版本冲突，断言冲突提示、刷新重试及最终成功。

## 冲突恢复数据流

确定性 E2E 暴露出现有冲突恢复依赖 `router.refresh()` 后保留表格单元格的
局部状态。服务端刷新会重新挂载状态动作，导致原操作意图丢失且没有发出重试
请求。

目录 PATCH 乐观锁失败时，repository 追加一次按主键读取，只查询当前
`version` 和 `status`，并通过 `SUPPLIER_VERSION_CONFLICT` 的 `details`
返回：

```json
{
  "current_version": 3,
  "current_status": "active"
}
```

前端验证该并发快照后：

- 当前状态已经等于原目标状态时，按幂等成功关闭弹窗并刷新。
- 当前状态尚未变化时，直接使用 `current_version` 重试原目标状态。
- 缺失或非法快照时只允许刷新退出，不猜测版本。

该方式只在更新未命中时增加一次主键点查，不增加列表读取，也不改变数据库
结构。

## 错误边界

- 未识别路由返回 404 和可定位的方法、路径。
- 缺失幂等键或错误版本返回稳定业务错误，不伪造成功。
- 409 只暴露目录记录的状态和版本，不返回其他业务字段。
- Mock 只存在于 `apps/admin/e2e`，不会进入生产运行时或数据库 migration。

## 验证

- 专用 Playwright 工作流全部通过。
- Repository 测试证明 409 包含最新状态和版本，前端规则测试拒绝非法快照。
- 现有供应商 Admin 单测和 Catalog API 单测保持通过。
- Admin 类型检查、文件大小检查与生产构建通过。
- 工作区不存在测试生成物或锁文件变更。
