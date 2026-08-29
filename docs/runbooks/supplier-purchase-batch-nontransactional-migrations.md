# 采购批次非事务索引迁移操作手册

## 适用范围

`20260826140500`、`20260826141500`、`20260826142500` 和 `20260829170000` 使用
`CREATE INDEX CONCURRENTLY`。开发库必须通过仓库的
`.github/workflows/migrate-dev-database.yml` 发布，生产库必须通过
`.github/workflows/migrate-production-database.yml` 发布。

Supabase CLI 2.99 的 direct `db push` 和 `db reset` 会把 migration 放入
事务执行，不支持这四份并发索引 migration。正式发布禁止用这些命令应用
20260826140500、20260826141500、20260826142500 或 20260829170000，也禁止绕过
workflow 手工登记 migration history。

## 发布前预检

1. 审查待发布清单，确认 20260826140500、20260826141000、20260826141500、
   20260826142000、20260826142500、20260826142600、20260829150000、
   20260829153000、20260829160000、20260829170000 的顺序和时间戳唯一性；
   20260829170000 必须排在 20260829160000 之后。
2. 确认四份非事务 migration 的首行 mode marker，以及每个
   `gooes:expected-index` marker。marker 固定索引名、表、唯一性、访问方法、
   有序 key columns、opclass 和 predicate。普通索引使用 `null` sentinel；
   142500 的四个 partial index 只允许精确的
   `expression:(purchase_batch_id IS NOT NULL)`，runner 不接受任意表达式。
   现有七字段 marker 保持兼容；需要锁定 btree key 排序时，第八字段必须按 key
   顺序逐项使用 `asc_nulls_last`、`asc_nulls_first`、`desc_nulls_last` 或
   `desc_nulls_first`，数量必须与 key columns 完全一致。20260829170000 必须声明
   `projects_tenant_updated_id_purchase_batch_idx` 的 `tenant_id,updated_at,id`
   btree opclass，以及
   `asc_nulls_last,desc_nulls_first,desc_nulls_first` 排序元数据。
3. 使用 workflow 的 plan 模式记录发布前 migration 数量、最新版本和待执行
   版本；不要以 `db push --dry-run` 作为本批发布授权。
4. 只读检查同名 relation。若存在索引，记录 `pg_index.indisready`、
   `pg_index.indisvalid`、`pg_index.indislive`、索引定义和所属表。

## Workflow 执行保证

Workflow 对普通和显式事务 migration 保持原路径。对带 marker 的文件，它会：

1. 严格解析 marker，拒绝缺失、重复或不在白名单中的元数据。
2. 删除 marker 中同名且任一 `indisready`、`indisvalid`、`indislive` 为 false
   的失败索引；删除使用 `DROP INDEX CONCURRENTLY`。
3. 在事务外用 `psql` 的 `ON_ERROR_STOP=1` 执行版本控制中的原始 migration。
4. 从 PostgreSQL catalog 再次验证 relation 类型、schema/table、唯一性、三个
   状态位、access method、有序 key columns、opclass 和 predicate；方向感知 marker
   还会把 `pg_index.indoption` 精确匹配到每个 key 的方向和 NULL 顺序。
5. 只有全部验证通过后，才单独登记 `supabase_migrations.schema_migrations`。

## 失败恢复

- 原始 DDL 失败：workflow 不登记 history。检查 PostgreSQL 错误以及同名 relation；
  修正数据或锁问题后重新运行同一 workflow。
- 留下 INVALID index：不要手工改 history。确认索引名属于 marker；重跑 workflow，
  由 runner 精确删除失败索引并重建。
- 同名 relation 不是 index，或有效索引的表、列、opclass、唯一性、方法、predicate、
  key 方向或 NULL 顺序
  不符：workflow 会在 history 前停止。先通过审查后的 migration/运维变更处理冲突，
  不得删除未知对象后直接补 history。
- DDL 已成功但 history 写入失败：重跑 workflow。`IF NOT EXISTS` 保留有效索引，
  post-DDL 校验通过后再完成 bookkeeping。

## 回滚

- `20260829170000` 是 forward-only migration。需要回退时先回退 API 代码；保留这条
  additive index 是安全的，不会删除业务数据或改变回退后的查询语义。
- 如后续确需移除索引，必须在 release tooling 支持 expected-absence/drop contract 后，
  以单独审查的带时间戳 migration 完成。禁止手工在远端执行 `DROP INDEX`、禁止手工
  编辑 migration history。

## 发布后验证

1. 运行对应 workflow 的 summary/history gate，确认应用版本与待执行版本一致。
2. 使用授权环境的只读 `supabase migration list` 验证 Local/Remote 对齐到
   `20260829170000`；不要运行 `db reset` 验证正式环境。
3. 查询四个目录 GIN 索引和 142500 的七个既有表索引，确认 `indisready`、
   `indisvalid`、`indislive` 均为 true，并保存 `pg_get_indexdef` 证据；四个
   batch ownership index 还必须核对 partial predicate。另查询
   `projects_tenant_updated_id_purchase_batch_idx`，确认三个状态位均为 true，且
   `pg_get_indexdef` 显示 `public.projects(tenant_id, updated_at DESC, id DESC)`。
   该索引的 `pg_index.indoption` 三个 key 值必须精确为 `0,3,3`（分别表示
   `ASC NULLS LAST`、`DESC NULLS FIRST`、`DESC NULLS FIRST`）。
4. 140500 的索引会被 141000 作为唯一约束接管并重命名；应验证约束及其底层
   六列 unique btree 定义，不能再按 preflight 临时索引名判断缺失。

## 开发库项目选项 EXPLAIN 强制门

仅在 development migration history 已对齐且 API readiness 成功后运行。脚本只接受
显式数据库 URL 和 `development-read-only` 确认；它先开启事务并执行
`SET TRANSACTION READ ONLY`，再执行受控的 `SET LOCAL statement_timeout`，随后才
允许任何基数查询或
`EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON)`。禁止把生产库 URL 传给此命令，
禁止使用 INSERT、UPDATE、DELETE、DDL、独立 ANALYZE 或 seed。

从仓库根目录准备下列环境变量，不要打印或归档变量值：

```bash
cd apps/api
SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_CONFIRM=development-read-only \
SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_DB_URL="${SUPABASE_DB_DIRECT_URL}" \
SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_TENANT_ID="${EXPLAIN_TENANT_ID}" \
SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_UPDATED_AT_FROM="${EXPLAIN_UPDATED_AT_FROM}" \
SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_UPDATED_AT_TO="${EXPLAIN_UPDATED_AT_TO}" \
SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_KEYWORD="${EXPLAIN_KEYWORD}" \
SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_VISIBLE_PROJECT_IDS="${EXPLAIN_VISIBLE_PROJECT_IDS}" \
SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_PAGE_SIZE=100 \
bun run supplier:purchase-project-options:explain
```

时间范围必须提供 UTC ISO 格式的
`SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_UPDATED_AT_FROM`，并在闭区间的
`SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_UPDATED_AT_TO` 与半开区间的
`SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_UPDATED_AT_BEFORE` 中二选一。关键词必须为
1 到 100 个非空字符；`SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_VISIBLE_PROJECT_IDS`
为可选的逗号分隔 UUID，最多 100 个；page size 为 1 到 100，默认 20。

脚本固定覆盖以下计划：

- `tenant_time_page`：租户与时间交集的 `updated_at DESC, id DESC` 有界页；
- `tenant_time_count`：同一租户与时间交集的精确 count；
- `tenant_time_keyword_page`：租户、时间、名称关键词交集的有界页；
- `tenant_time_keyword_count`：同一关键词交集的精确 count；
- `bounded_visible_page`：提供可见 ID 时，再与同一时间和关键词相交的有界页。

开发门阈值是 planning 50ms、execution 250ms、shared read blocks 20,000、temp
read/write blocks 必须为 0；server statement timeout 固定为 5,000ms，并在摘要的
`thresholds.statementTimeoutMs` 中报告。该值是代码常量，不接受环境变量或用户输入。
租户项目基数达到 1,000 时，`tenant_time_page` 必须使用
`projects_tenant_updated_id_purchase_batch_idx` 且不能出现显式 Sort；两个关键词计划
必须使用该复合索引或 `projects_name_purchase_batch_trgm_idx`。低于 1,000 时 planner
可自行选择索引，但时间、buffer 和 temp 阈值仍强制执行。

只归档脚本的 JSON 摘要字段：`explainQueryCount`、`queryNames`、`planningMs`、
`executionMs`、`indexNames`、`nodeTypes`、`sharedHitBlocks`、`sharedReadBlocks`、
`tempReadBlocks`、`tempWrittenBlocks`、`cardinalityBucket`、`visibleProjectCount` 和固定
`thresholds`（含 `statementTimeoutMs`）。不得归档数据库 URL、tenant/project UUID、
关键词、查询参数、原始计划或
结果行。所有计划通过后，才可继续 authenticated dev smoke 和 Orange 交接。
