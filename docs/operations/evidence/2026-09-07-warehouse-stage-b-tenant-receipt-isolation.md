# Stage B：跨租户正式收货 SQL 验证

## 范围与结果

新增 `scripts/fixtures/warehouse-stage-b/tenant-receipt-isolation.sql`，补齐既有来源单据
读取隔离之外的**正式收货命令**跨租户 ID 混用检查。没有修改生产代码或 migration。

根代理运行以下命令，3 个夹具均通过、exit 0。基线为本地 527 个 migration 的 schema-only
快照，后续采购领域 migration 只应用于新建的无网络、无挂载隔离容器；执行后容器自动清理。
没有读取已有库业务行，也未变更开发库或生产库。

```bash
bun scripts/verify-warehouse-stage-b-database.ts \
  scripts/fixtures/warehouse-stage-b/receipt-cross-order-concurrency.sql \
  scripts/fixtures/warehouse-stage-b/receipt-weighted-cost.sql \
  scripts/fixtures/warehouse-stage-b/tenant-receipt-isolation.sql
```

## 实际覆盖

- 复用两个独立合成租户；明确检查双方仓库启用、采购开关打开，避免被无效前置条件提前拒绝。
- 双方各通过草稿、核算提交/审批、正式确认及正式收货 RPC 创建新订单并成功收货 1/5，留下可收数量和正确履约版本。
- 对两个方向分别验证：外租户订单及明细、外租户明细、本租户与外租户混合明细、外租户已占用收货 ID，共 8 次负向请求。
- 精确比较拒绝 JSON，要求分别为订单不存在、明细不存在、收货 ID 冲突；不能返回异租户冻结成功回执或额外标识。
- 每次拒绝后比较双方 16 张采购、履约、库存、应付、命令事件、项目成本及占用表的完整行 JSON，不仅检查数量/金额。当前这些拒绝不新增命令事件。
- 两个不同租户/操作者使用相同 key 文本分别成功，负向检查后再分别重放原成功请求；仅返回自己的冻结结果且不重复写事实。
- 全部新事实在事务末尾回滚，原加权成本和性能夹具的数据量不变。全套运行时放在两个前置夹具之后；既有 `receipt-weighted-race.sql` 仍必须在性能夹具之后。

## 尚未覆盖的整体门槛

本夹具不证明 HTTP 登录、应用层角色授权、同一用户跨租户切换、采购批次跨租户写入、
金融写入 ID 混用或库存主列表的完整租户隔离。准备订单使用内部核算提交/审批入口，
不是完整工作流 HTTP 验收。完整开发库历史升级、真实接口联调、最终审查和 main 合并仍未完成。

独立规格与质量审查均通过，两个审查者分别独立运行上述 3 个夹具、exit 0。
根代理另运行当时完整 19 个夹具，全部通过，并核对 30 个外层执行计划、11 个真实 RPC
执行计划和 11 个 RPC 元数据记录均可解析且数量一致。该记录仍不是 Stage B 放行单。
