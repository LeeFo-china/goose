# 仓库采购 Stage B 数据库类型同步

状态：本地定向同步、验证与独立规格/质量审查通过；不是开发业务或生产放行记录。

## 来源与范围

- 基线 `d6597702`，工作树 `feature/warehouse-procurement-inventory-stage-b`。
- 开发库已应用原获准范围的全部剩余迁移，593 个版本 Local/Remote 对齐；生成过程与
  只读连接限制见[开发库记录](./2026-09-06-warehouse-procurement-inventory-stage-b-dev.md)。
- 官方 `postgres-meta:v0.96.6` 完整生成结果为 1,031,479 bytes、31,741 行，SHA-256
  `f74d98d1fc92c47d2ce7ae54c3f00792632334dd5b49a5381f7ef97e8caec5a0`。
- 生成结果相对原源文件有 54 个表/函数块差异。仅同步下列 31 个仓库采购相关完整生成块；
  其他 23 个 AI、材料笔记、商品成本分类、分享和预算校验 helper 等历史差异保留。
- 唯一源代码文件为 `apps/api/src/types/database.ts`：688 行新增、18 行删除，31,123 行。
  未修改 RPC 实现、migration、角色权限、开关或业务记录。

### 11 个表

`inventory_balances`、`inventory_transactions`、`warehouse_command_events`、`warehouses`、
`supplier_payable_events`、`supplier_payment_requests`、`supplier_payments`、
`supplier_purchase_batches`、`supplier_purchase_orders`、`supplier_purchase_requisitions`、
`tenant_supplier_settings`。

批次/订单采用完整生成块，因此包含已应用 `20260904193000` 的采购人员 snapshot 字段。
这些属于相同采购记录的真实 schema，未从生成结果中手工删改；不更新其他领域的漂移。

### 20 个函数

```text
__gooes_save_supplier_purchase_batch_draft_v1
get_supplier_payables_by_ids
list_supplier_payable_filter_options
list_supplier_payables
list_supplier_payment_requests
resolve_supplier_purchase_batch_catalog
save_supplier_payment_request_draft
save_supplier_purchase_batch_draft
__gooes_assert_warehouse_workflow_actor
__gooes_has_tenant_procurement_permission
__gooes_resolve_supplier_purchase_order_catalog_v1
__gooes_review_supplier_purchase_batch_destinations_v2
__gooes_submit_supplier_purchase_batch_destinations_v2
assert_warehouse_procurement_destination
create_supplier_purchase_order_receipt_fulfillment_v2
create_tenant_warehouse
list_inventory_balances
list_inventory_transactions
list_supplier_purchase_orders
update_tenant_warehouse
```

## 契约边界

- 采购/财务表的 project_id 按实际 schema 可空，新增目的地、warehouse_id 和复合外键；
  项目/仓库互斥仍由原 SQL CHECK、领域 schema、权限和事务负责，不能靠生成类型替代。
- RPC 默认参数按生成器保留 optional。生成器不表达参数允许显式 null 的全部语义；
  原 JSON RPC gateway 和 HTTP schema 保留其真实契约，没有为消除类型错误伪造签名。
- numeric 字段的生成类型保持 number；财务/库存运行时依然通过既有文本金额和精确单位
  解析，未切换为浮点计算，也未修改冻结事实。
- 私有函数出现在 schema 类型中不等于授予执行权限；本次未新增 RPC 调用或授权。

## 本地验证

- 结构比对：31 个变动块与官方生成候选 new 块逐字相等；23 个未选历史差异均保持 old，
  未改动其他已有表/函数块，没有仅凭命名猜字段或手工重写生成结果。
- API `bun run typecheck`、`bun run build`（972 模块）、`bun run check:file-size` 均 exit 0；
  生成文件使用已有显式排除项，未增加 size exemption。
- 在 API 目录、loopback 虚拟配置、逐文件独立 Bun 进程运行 11 个 repository 文件：
  **81 tests / 630 assertions，0 fail**。覆盖库存、仓库、项目/仓库应付/申请/付款、批次、
  订单及采购申请记录。没有连接真实业务库或用 mock 结果声称真实联调通过。
- `git diff --check` 通过。仅类型同步，无 Admin/Domain 类型依赖变动，不重跑无关浏览器。
- 独立规格与质量审查均通过：各自核对 31 块逐字等于候选、其余 23 差异保留，反向替换
  后完整还原 HEAD；SQL nullable/default/FK 与同域人员 snapshot 一致，无剩余发现。
  审查者未重新连接远端生成或复算完整输出哈希，不将候选结构核验冒充独立远端生成。

开发 API 候选部署、财务权限、正式仓库采购开关和独立审批人仍待落实；main 未合并，生产未发布。
