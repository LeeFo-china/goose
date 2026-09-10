# D2.1 盘点后端接入设计

日期：2026-09-09；基线 a43f5349。承接用户“执行”和本任务内常规确认的统一授权，采用以下安全默认。复用现有隔离工作树，不改 Orange，不操作真实租户或远端数据库。

## 方案与边界

采用盘点专用读取 RPC 和 controller/service/repository 分层，沿用调拨的接口模式。备选直接 service-role 查表会绕过数据库员工权限边界；备选通用库存单据引擎超出本批，不采用。原六个原子命令、计价、快照冲突和幂等规则不改变。

本批完成分页读取、API、库存流水来源响应及平台开关配置 API；后台页面的来源展示/跳转和开关控件属于随后 Admin 批次。本批不开启晴天租户盘点，不自动授予权限，不 apply 或发布，不开展 D2.2 手工调整。

## 读取契约

新增 service_role-only、STABLE SECURITY DEFINER RPC：get_warehouse_stocktake_settings、list_warehouse_stocktake_orders、get_warehouse_stocktake_order、list_warehouse_stocktake_order_items；固定 search_path，内部验证活跃租户、员工与用户绑定和真实存储权限。库存详情/列表/明细要求 inventory.stock.view；设置读取允许 stock.view / stocktake.manage / stocktake.approve 任一权限，调用现有 actor helper 时选已获授权的一项。设置仅返回有效 warehouse_stocktakes_enabled（module_enabled 且该开关）；不扩展全局权限上下文，不用 API 的 system_admin 派生权限替代 SQL 授权。

关闭模块/盘点开关后合法历史仍可读。跨租户详情/明细为 NOT_FOUND；停用身份、显式 deny 仍拒绝。仓库停用不隐藏历史。

列表筛选 warehouseId/status/keyword，默认 page=1/pageSize=20，上限100，keyword 使用盘点现有 JS trim/UTF16 长度 helper，最多100。确定排序 created_at DESC,id DESC，明细 line_no,id；超出页仍保留真实 total。先 materialize <=100 单据，再聚合这些单据明细，不聚合全租户明细。沿用已有索引；仅必要时新 migration 加索引并通过实际 RPC 查询 EXPLAIN ANALYZE 验证可选过滤及缓存计划。

单据完整审计字段沿用真实表；Summary 增加 warehouse_name、item_count、counted_count、difference_count、gain_amount、loss_amount。后三种 count 均0..100；difference_count 只计算已录入且差异非零行，未盘不是无差异。gain_amount/loss_amount 仅 completed 时为非负十进制字符串（无对应差异为 "0.00"），其他状态为 null，不把预估差异计为已过账金额；不加误导性的绝对值 total_amount。单据详情使用同一 Summary。

明细返回真实表全部业务字段和 sku_name/sku_code；snapshot_at、book_balance_id/version、book_quantity/value/unit_cost、counted_quantity、difference_quantity、unit_cost、amount 按真实 nullable；所有 numeric 字段 SQL 转 text。difference_quantity 允许负号，其余数量/金额非负；单项 numeric(18,4)/(18,2) 上限，汇总金额放宽至18位整数2小数。API 严格解析响应，拒绝数字型数量、未知字段、无效状态；不静默丢精度。页 RPC 返回 items/total/page/pageSize，repository 转 list/pagination。

## HTTP 接入

GET /warehouse-stocktakes、/settings、/:id、/:id/items；POST /:id/save-draft、start、record-counts、submit、complete、cancel。不注册通用 CRUD 写入口。同步总路由和 tenant-service capability map。

controller 严格使用已有请求 schema，获取授权上下文及 Idempotency-Key，包装 ResponseHandler；service 校验当前租户员工与权限（complete 要 approve，其余 manage），构造 expected_version 与 payload；repository 仅调用对应 RPC 并严格解析结果。命令不预读当前开关/状态/版本，保留成功回执在关闭开关/状态变化后重放。SQL 拒绝必须以 error-factory 稳定业务码映射；快照冲突提示取消并新建，无计价依据提示不能以客户端价格绕过。未知 DB 错误保持包装，不吞错。

## 现有系统接入

新增 inventory source_document 严格分支 {stocktake_order_id,stocktake_order_no}，对应 source_type=warehouse_stocktake_item 与 adjustment_in/out。SQL 在现有 materialized page 后投影，绑定同租户、同仓库、SKU、完成单据、差异方向。匹配但无法解析的历史来源可 null；不得接受盘点来源配收货/领退/调拨类型或混合来源对象。保留既有 receipt/issue/return/transfer 及旧手工调整兼容。

平台 settings schema/type/select/effective flags/merge/command args 增加可选 warehouse_stocktakes_enabled；依赖仅 module_enabled，与领退料、调拨独立。未传字段保留当前值。该字段显式出现走现有 JSON RPC，旧 typed 参数原样不变。旧回执缺字段不人工补写，保持历史指纹和回执；新 migration 精确断言并扩展私有 rollout core 白名单/boolean 校验/行锁后默认值/写入，不新增重载，不改真实租户数据。新增前置历史回执 fixture 及 runner 精确 hook 验证升级前后的 typed/JSON 精确回放。

## 验收和安全

测试先行：SQL 读权限/隔离/分页/过滤/空页/NULL 与小数/关闭后历史及执行计划；Domain/repository/service/Fastify inject 覆盖六命令与四读取、header/严格输入、无项目权限依赖、无命令预读、稳定错误和状态精度。来源 SQL 和 parser 验证两方向/隔离/历史及页后查找；rollout 验证布尔、依赖、版本、幂等冲突、字段省略与旧回执。

先运行静态测试、Domain build、API typecheck，再运行现有 schema-only disposable PostgreSQL runner（不是完整历史升级或 DEV 验收）。本批延续 runner 已有 SQL_ASCII 测试库局限，证据明确记录；不改变源库。每项 SPEC 审查通过后质量审查，问题修复后复审。最后更新证据、提交并推送当前开发分支，固定 D1 release 指针不变。

自检：无占位项；新增金额语义不和既有绝对单行 amount 混淆；有界读取和独立权限明确；真实 UI、远端 apply、开关开启和角色授权均未混入。
