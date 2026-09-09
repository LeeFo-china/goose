# D1 来源/配置 DEV 发布记录

## 发布前门禁

- 范围：调拨库存流水来源、独立原子 rollout 开关、此前未发布的 core API；不含 Admin 调拨交互，不启用任何租户，不创建真实业务单据，不操作生产或 Orange。
- Task 1 与 Task 2 均经过 SPEC → 独立质量审查，无未解决 Critical/Important/Minor。来源语义错配在复审前以 11 个 RED 用例定位并修复。
- API 最新 83 tests / 2062 assertions 通过；Domain 1 test / 5 assertions；API check（类型、构建、文件大小）、Domain build、Admin check 通过。
- 离线 PostgreSQL runner 依序执行 9 组：material-workflow、material-security、transfer-contract、transfer-workflow、transfer-inventory-sources、transfer-rollout、transfer-security、transfer-concurrency、transfer-read-performance。全部通过。使用 527 条 schema-only 基线及领域 migration，不等同完整真实数据恢复或租户 E2E。
- 首次整合因 source fixture 排在 concurrency 后，初始固定流水从 5 增为 11 而失败；根因是测试前置状态顺序。调整 fixture 顺序后全部重跑通过，没有放宽断言或修改业务实现。
- 来源 EXPLAIN：分页 1/20/100 的 item/order index scans 分别不超 1/20/100，空页 0；10000 单据、20000 明细的列表性能及双向/超扣/领退料交叉并发测试通过。
- DEV 容量约 80%，可用 12.66 GB；未执行任何清理。当前旧 API/Admin `21f48c4f717a9ccc73e0f06dca7460509e33cdda` healthy。

## 待执行 migration（仅两条）

- `20260908235654_warehouse_transfer_rollout_command.sql` SHA256 `f4b80055b98268fa29126bad14fd193924cbad75110d4d42ee3315a9774c178f`
- `20260908235954_warehouse_transfer_inventory_sources.sql` SHA256 `f2ec25ad51504504f379d2ad9dfaf6b2a8ff10742c88c7cd458e932b4d682dc8`
- Supabase CLI 发布前 Local/Remote 已应用部分 602 条对齐，latest `20260908185501`，仅上述两条待执行。两条仅修改函数，不更新租户业务行；原 typed/JSON wrappers、回执和权限维持原样。
- 如需回退，通过新 migration 移除新增来源分支；开关经原子命令关闭，保留历史事实/回执。不得删除已应用 migration 或逆向删除业务事实。

## 备份与只读基线

- DEV 私有目录 `/var/tmp/gooes-transfer-integration-preapply.2bDqjl`，文件权限 600。
- `database.dump` 8620158 bytes，SHA256 `770457dceb33910bb8ad0f0cfbfc1c2510c02c3cc1b30f9823d077ab7b7ef4f1`。
- `roles.sql` 6846 bytes，SHA256 `0c010c157cfd50c4951daabd86daad4a1494ac4dbc772a41a20fcec4e372c2d2`。
- 同目录保存 pgsodium key（未输出内容）。pg_restore 目录读取及全归档解码通过；未执行实际恢复演练。
- 基线见 `2026-09-09-warehouse-transfer-integration-preapply.json`。调拨 orders/items/commands/启用租户/角色及员工授权均 0；supplier events 130 条。业务摘要与函数 metadata 在 apply 后对比。

## 后续门禁

Admin 库存来源类型和 table 展示仍按采购/领退料处理；下一批需完成调拨来源显示/跳转、调拨管理页面、开关 UI 与实际租户验收，再决定启用。当前不得宣称 D1 已全部完成，不进入盘点/手工调整验收。

RAG 本轮查询返回 502，依据本地设计、代码及 SQL 验证；未同步远端知识库。

## 执行结果

- 冻结分支 `release/warehouse-transfer-integration-dev-20260909`，不可变 SHA `0f350b0175feb84d0e69d1cdb7eab49f9e8f133f`；功能分支已推送，无 main 合并。
- [Migration plan 34294121418](https://github.com/LeeFo-china/goose/actions/runs/34294121418) success：602 → 602，仅 `20260908235654 20260908235954` 待执行。
- [Migration apply 34294179710](https://github.com/LeeFo-china/goose/actions/runs/34294179710) success：恰好应用上述两条，602 → 604，latest `20260908235954`。
- 重新运行 Supabase CLI migration list，保存 `2026-09-09-warehouse-transfer-integration-history.txt`；去除 CLI 版本更新提示（不改动表格数据）后，既有 `verify-migration-history.mjs` 判定 Local/Remote 604 条全量对齐且目标存在。没有放宽校验脚本。
- apply 后摘要见 `2026-09-09-warehouse-transfer-integration-postapply.json`：10 组业务 count/md5 和 supplier events 完全不变；调拨启用数/单据/明细/命令/角色和员工授权仍全 0；无长事务/锁等待。只有预期两个函数 definition hash 改变，所有 wrappers 定义和函数权限/config 不变。
- [API/Admin DEV release 34294327062](https://github.com/LeeFo-china/goose/actions/runs/34294327062) **success**，发布流程的完整 migration history 门禁通过。
- API/Admin 容器均 healthy，revision 均为固定 SHA `0f350b0175feb84d0e69d1cdb7eab49f9e8f133f`，run 标签均为 `34294327062`。API image `sha256:0e64e389d54f4709f2f03436eb7a386f8ebceb86f8ab0172c7d3fac007f16896`；Admin image `sha256:efebda0608e5e1b72556de853fe0df86b0f664fc2dd1849b63cd69cf035f87a4`。
- HTTP：`https://api-dev.goodcms.cn/` 200、`https://admin-dev.goodcms.cn/login` 200，未认证 `/api/inventory/transactions?page=1&pageSize=20` 与 `/api/warehouse-transfers?page=1&pageSize=20` 均 401。此检查不替代授权员工真实业务 E2E。
- 发布后再次只读核验：10 组业务摘要仍与发布前完全一致；metadata 与 apply 后一致；604 migrations，调拨启用数及单据仍 0，无锁等待/长事务。证据见 `2026-09-09-warehouse-transfer-integration-postrelease.json`。
- 最终磁盘 82%，可用 11360194560 bytes；未执行人工清理。保留功能分支/工作树和旧冻结分支；本批发布证据作为后续 docs commit，不移动已部署冻结 SHA。
