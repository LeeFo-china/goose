# D1 真实 Chrome 验收：数据库授权阻断

日期：2026-09-09。目标仅 DEV；租户为固始晴天装饰工程有限公司。D1 未通过，D2 未开始。

## 已执行及实际结果

- Chrome 连接恢复；平台超管和既有系统管理员风清扬均通过正常登录表单、空验证码登录，未发送短信、读取凭证或绕过认证。
- 平台租户详情确认员工 `d8ecc522-e6a1-49d6-b7b7-aaa0f3084826`、用户 `31ae8836-9646-4514-a38b-baf1d989f3c0` 和正确租户；员工页面显示 219 项权限。
- `/warehouse-transfers` 正常加载。开关关闭时显示“仓库调拨功能未开启”，新建按钮禁用；开启后按钮可用，不再出现此前前端无管理权限问题。
- 通过正常仓库设置 UI 创建 `DEV 调拨验收分仓 20260909`，ID `7b5af333-fcdf-4f92-9ac2-1ccbc77bedce`。原公司仓库 `99565a46-0275-4cb5-bc2a-0e31abda7e90` 仍是默认仓，未修改其属性。
- 平台超管仅开启目标租户调拨开关，版本 16 → 17。以风清扬新建正向草稿：公司仓库 → DEV 测试分仓，SKU `E2E-SKU-0823222632-B`（`732e2b3b-cb7e-4e40-a4e2-228c22bf985c`），数量字符串 `1`，原因“DEV 调拨验收 20260909：测试库存正向调拨，无真实物流”。
- 单次点击“保存草稿”后，页面明确显示“无权访问仓库调拨单据”。没有再次保存、换幂等键重试、提交或完成；没有执行反向调拨。
- 保存失败后只读确认单据、成功回执、调拨流水均为 0；随后平台 UI 关闭调拨开关，版本 17 → 18。页面与数据库均确认 false。
- 最终 Chrome 页面保留在目标租户配置页，测试分仓保留为空仓、启用、非默认；未删除测试记录或任何库存事实。

## Root Cause

这是 API 与数据库权限规则不一致，不是验证码、Chrome 控制或库存不足问题。

1. `apps/api/src/services/authorization/legacy/context-builder.ts` 的 system_admin 分支从 `PERMISSION_CODE_VALUES` 派生全部权限，之前共享枚举补齐后，页面与 API 权限预检均允许两项调拨操作。
2. `command_warehouse_transfer_order` 在实际数据库通过 `__gooes_transfer_assert_permission` 调用 `__gooes_has_tenant_procurement_permission`。后者只接受有效角色的实际 `role_permissions` 或员工 allow，且显式 deny 优先；没有 system_admin 自动拥有全部权限的分支。
3. `20260908185501_warehouse_transfer_atomic_commands.sql` 明确保留“只创建权限定义，不给现有员工或角色授权”的约束。真实库中两项调拨角色授权及员工覆盖均为 0。
4. 只读调用实际 DEV 权限函数：风清扬 `inventory.stock.view=true`（角色授权 1 条），`inventory.transfer.manage=false`、`inventory.transfer.approve=false`（各 0 条），员工 allow/deny 均为 0。角色 `e72850fe-dbba-427f-9109-f1779080a239` 为本租户 active system_admin。
5. 服务错误映射把数据库 `WAREHOUSE_TRANSFER_FORBIDDEN` 映射为实际页面提示。已有 API 系统管理员回归替代 repository 边界，数据库工作流夹具则为合成员工显式插入两项 allow；两者不能证明未显式授权的真实系统管理员能写调拨。这是已有验证证据的缺口。

对照：仓库基础 migration `20260905210000` 明确初始化 system_admin 的五项仓库／领料角色权限；调拨 migration 没有相应初始化。不能用修改共享枚举或重新发布来代替数据库实际授权，也不能为了验收修改通用鉴权函数或静默赋权。

## 数据安全验证

只读检查均使用 DEV hostname 守卫、`BEGIN READ ONLY`、15 秒 SQL 超时，无远端 SQL 写入。

基线 `04:04:50Z` 与收尾 `04:41:38Z`：库存余额、库存流水、项目成本、供应商应付、付款、现金账本、领料单、退料单八组 count/MD5 全部相同。测试库存仍在公司仓库，为 1 箱／88 元。仅仓库总数由 1 → 2，租户设置版本／更新时间因开关往返而变化。

收尾 migration 数量仍为 604，最新 `20260908235954`；本轮没有新增或 apply migration、没有发布、没有变更代码、员工／角色权限、生产或 Orange。

证据文件：

- `2026-09-09-warehouse-transfer-live-before.json`：操作前全量摘要。
- `2026-09-09-warehouse-transfer-live-warehouse-created.json`：双仓建立、开关 false、库存未动。
- `2026-09-09-warehouse-transfer-live-enabled.json`：开关 true／版本 17。
- `2026-09-09-warehouse-transfer-live-save-rejected.json`：保存被拒、单据／回执／调拨事实均为 0。
- `2026-09-09-warehouse-transfer-live-authorization-readonly.sql` 与 `...live-authorization.json`：实际权限判断、授权条数与远端函数定义。
- `2026-09-09-warehouse-transfer-live-closed.json`：开关 false／版本 18、测试库存及空仓状态。
- `2026-09-09-warehouse-transfer-live-after.json`：八组业务摘要未变、授权条数仍为 0。

## 下一步与权限边界

继续真实写验收需要解决既定“不自动授权”与系统管理员全权限语义的冲突。建议先明确是否允许仅为本测试租户的 system_admin 角色，通过受控 migration 初始化两项调拨权限；这不是重试现有命令，而是新增实际权限，不能当作一般测试确认静默处理。当前未编写或执行授权 migration。

若该范围调整获准：先补真实 SQL 授权回归（无授权拒绝、授权后允许、deny／停用／跨租户仍拒绝），再按既有 migration plan/apply、Local/Remote 对齐与 DEV 发布流程推进，最后恢复 UI 正向／反向调拨、守恒及财务隔离验收。禁止直接 SQL 授权、修改通用 helper 绕过校验或扩大到其他租户／角色。

此外，设计中的“调拨与退料／收货并发”需补齐直接行为证据：现有 transfer concurrency 夹具覆盖调拨与领料两个持锁顺序，退料只用于串行恢复，并未覆盖调拨与收货／退料并发。这一门禁也不能在进入 D2 前静默划掉。
