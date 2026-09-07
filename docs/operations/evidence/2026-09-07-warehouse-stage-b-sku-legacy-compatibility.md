# Stage B 历史短码 SKU 改价兼容

状态：修复已通过独立规格与质量审查；未应用到已有数据库。
属于历史采购兼容验收，不代表 Stage B 整体完成或环境发布。

## 根因与修复边界

- 真实商品创建 v1 生成 `TS-` 加 UUID 前 16 位的历史编码。SKU 保存命令更新时不改此编码，但末段可采购目录查询使用重新构造的完整码，返回 `catalog_result_not_exact`。
- 此逻辑早于 Stage B。原 Repository 已接受历史短码，不需要放宽响应校验；开发/生产实际受影响行数尚未核对。
- `20260907102914_fix_supplier_sku_exact_catalog_resolution.sql` 将既有目录资格查询提取为私有 helper，仅新增可选 SKU UUID 精确过滤。原公开六参数 resolver 传空 UUID，保留关键词子串匹配、分页、总数、错误与授权。
- 保存命令只替换末段目录调用，传已锁定 SKU UUID。仍检查唯一结果及商品、SKU、价目表、价格项、单位、金额、税率、有效期；不按价格项 ID 过滤来隐藏同 SKU 多价歧义。
- 历史编码、canonical 完整码请求指纹、事件键、成功冻结重放及价格版本流程均不改。私有 helper 为 SECURITY INVOKER，沿用原函数所有者，禁止 PUBLIC/anon/authenticated/service_role 直接执行。
- migration 校验两份有效函数 body MD5、唯一替换锚点及相同所有者，定义漂移或 helper 已存在即中止，不覆盖未知实现。

## 已执行证据

1. 根代理 RED：`receipt-cross-order-concurrency.sql` 的真实 v1 短码商品完成收货后，实际改价返回 `catalog_result_not_exact`；失败前后 SKU、价目表及命令事件未留下变动。
2. 应用候选 migration 到一次性离线 PostgreSQL 后，同一回归改价成功，SKU 编码不变，价格从 10 到 20；同键重试返回冻结响应，不新增命令事件。
3. 校验保存事件的完整 canonical 请求及 MD5 与原算法一致。
4. 再通过真实 v2 创建与旧 SKU UUID 前 16 位相同的新完整码 SKU，其商品名称也包含旧码。公开搜索仍匹配两项，pageSize=1 和越界空页保留 total=2；旧 SKU 改名且价格不变仍能准确保存，不产生新价格版本。
5. 校验私有 helper 对业务角色不可执行，原公开 resolver 仍授权 service_role。
6. 根代理、独立规格审查者及独立质量审查者分别重跑三夹具，均 exit 0，两轮审查无 Critical / Important。根代理完整运行 16 份采购领域 SQL 夹具 exit 0；再次校验输出为 16 份夹具、30 组函数外计划、11 组真实 RPC 内部计划和 11 条元数据，计划 JSON 均可解析。
7. 既有 Repository 保存契约测试独立运行：10 tests / 79 assertions 通过，使用虚拟环境配置，无真实服务调用。

复跑（仓库根目录）：

```bash
bun scripts/verify-warehouse-stage-b-database.ts \
  scripts/fixtures/warehouse-stage-b/receipt-cross-order-concurrency.sql \
  scripts/fixtures/warehouse-stage-b/sku-legacy-compatibility.sql \
  scripts/fixtures/warehouse-stage-b/receipt-weighted-cost.sql
```

## 尚未证明的范围

- 当前新增测试覆盖的是「改名且价格不变」，不是完全无字段变化的纯 no-op；同 SKU 多条有效价格仍拒绝，由未变的查询与唯一性校验证明，尚无新增执行用例。
- 公共关键词查询兼容只执行了上述碰撞与分页案例，未做全部生产数据规模性能验收。
- 没有执行开发库完整升级、真实 API 联调、生产数据影响统计或发布；隔离 runner 只回放采购领域 migration，不等于完整历史升级。
- 如需撤销修复，应新增前向 migration 恢复旧函数后移除无引用的 helper；这会重新引入历史短码保存问题。不得改写旧编码、删除价格/命令历史。
