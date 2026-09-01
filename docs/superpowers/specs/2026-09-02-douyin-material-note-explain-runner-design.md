# 抖音资料领取受控 EXPLAIN Runner 设计

日期：2026-09-02

## 目标

为抖音文本资料领取链路增加一个可重复、只读且脱敏的 dev 性能门禁，覆盖：

1. 已发布资料公开列表；
2. 租户后台关键词列表；
3. 当前匿名主体的有效领取列表。

该门禁只验证既有查询和索引，不修改业务接口、数据库结构、fixture、租户服务状态或
抖音安装配置。

## 方案选择

采用资料领取专用 runner，不扩展供应商采购 EXPLAIN runner。两者共用安全原则，但
保留独立的 SQL、fixture 预检、索引清单、错误码和 artifact，避免一个领域的证据输入或
查询变更破坏另一个领域的发布门禁。

不采用以下方案：

- 把供应商采购 runner 改造成多领域 runner：领域耦合和回归范围过大；
- 运维人员手工连接 dev 数据库执行 SQL：不可重复、难以证明目标和输出均已脱敏；
- 通过 SQL 插入领取 fixture：绕过公开领取 RPC 和真实抖音会话边界。

## 组件边界

新增以下独立组件：

- `douyin-material-note-explain-config.ts`：解析显式确认、数据库 URL 和 fixture tag，
  拒绝缺失、格式错误或多余配置，错误信息不回显输入值；
- `douyin-material-note-explain-evidence.ts`：解析 PostgreSQL JSON plan，验证 planner、
  索引元数据、分页上限和脱敏摘要；
- `douyin-material-note-explain.ts`：在一个 `REPEATABLE READ, READ ONLY` 事务中完成
  目标校验、fixture 解析和三条 `EXPLAIN ANALYZE`；
- `verify-dev-douyin-material-note-explain.yml`：在受保护的 dev self-hosted runner 上
  校验 main、精确 commit、已部署 API revision、dev 项目和数据库主机，再执行脚本并
  上传 30 天保留的脱敏 JSON artifact；
- 对应的 Bun 测试和 package script。

不新增依赖，不新增或修改 migration，不修改供应商采购 runner。

## 目标与 fixture 解析

工作流只接受以下人工输入：

- 40 位小写 commit SHA；
- 精确确认文本 `development-read-only`。

fixture tag 固定为已经通过租户 API 创建并记录在交接文档中的
`Task10-A-20260902`，不作为自由 SQL 输入。脚本在只读事务内完成以下预检：

1. 找到且只找到该 tag 下的已发布资料；
2. 该资料所属租户存在且只存在一个 active 抖音安装；
3. 第三条查询需要该租户、安装和资料范围内存在一条真实有效领取；
4. 读取该领取的 `subject_hash` 只用于绑定第三条 SQL，不写入 stdout、错误信息或
   artifact。

如果真实有效领取尚不存在，门禁以 `REPRESENTATIVE_CLAIM_MISSING` 失败。必须先由获批
抖音测试账号通过公开领取接口产生记录，不允许 runner 补数据。

## 查询契约

三条查询均使用绑定参数和固定 `LIMIT 20`：

1. `public_list`：按 `tenant_id + published` 过滤，按
   `published_at DESC, id DESC` 排序，并读取发布版本摘要和当前主体的有效领取标记；
2. `tenant_keyword_list`：先按 tenant 和版本标题/摘要/分类关键词过滤，再按
   `updated_at DESC, id DESC` 排序；关键词使用 fixture tag；
3. `owned_active_list`：按 tenant、installation、subject hash 和
   `removed_at IS NULL` 过滤，按 `claimed_at DESC, id DESC` 排序，并读取锁定版本摘要。

SQL 只允许 `SELECT` 与 `EXPLAIN`。测试必须拒绝以
`INSERT/UPDATE/DELETE/MERGE/CREATE/ALTER/DROP/TRUNCATE/ANALYZE` 开头的语句，并验证
查询顺序、绑定参数位置和分页上限。

## 安全门禁

工作流必须同时满足：

- 从 `refs/heads/main` dispatch，输入 SHA 等于 GitHub dispatch SHA；
- checkout 无工作区修改，HEAD 等于输入 SHA；
- `gooes-api-dev` 镜像 revision 等于输入 SHA；
- runner 名称、dev env 文件、项目 ref 和数据库 host 与既有 dev runner 固定值一致；
- 生产项目 ref 和生产数据库 host 均在拒绝列表；
- migration Local/Remote 历史对齐；
- 数据库会话为同一 backend、`repeatable read`、`read only`；
- statement timeout 为 5 秒；
- planner 设置未被非默认参数污染；
- 连接角色具备既有 runner 所需的受控读取能力，但不是普通业务请求身份。

任何校验失败时只输出稳定错误码，禁止输出数据库 URL、tenant/install/note/claim UUID、
subject hash、手机号、token、原始 SQL 参数或完整 plan。

## 计划判定与输出

runner 检查以下既有索引存在、valid 且 ready：

- `douyin_material_notes_public_idx`；
- `douyin_material_notes_tenant_idx`；
- `douyin_material_note_versions_title_trgm_idx`；
- `douyin_material_note_versions_summary_trgm_idx`；
- `douyin_material_note_versions_category_trgm_idx`；
- `douyin_material_note_claims_owned_idx`；
- `douyin_material_note_versions_tenant_note_idx`。

对小表允许 PostgreSQL 选择顺序扫描；达到 1,000 行门槛后，相关查询必须出现清单内的
有效索引，否则门禁失败。该规则避免为 dev 小 fixture 强迫错误的 planner 选择，同时在
有代表性基数时阻止无界扫描。

artifact 只包含：gate 名称、commit SHA、fixture tag、三条查询名称、表的封顶基数分档、
索引命中名称、planning/execution 时间、rows、loops、buffer 汇总和结论。不包含任何直接
身份或原始 plan。

## 错误处理

稳定错误至少包括：

- `CONFIRMATION_REQUIRED`；
- `INVALID_DEV_TARGET`；
- `MIGRATION_HISTORY_MISMATCH`；
- `INVALID_FIXTURE`；
- `REPRESENTATIVE_CLAIM_MISSING`；
- `TRANSACTION_GUARD_INVALID`；
- `NON_DEFAULT_PLANNER`；
- `INDEX_METADATA_INVALID`；
- `QUERY_PLAN_REJECTED`；
- `QUERY_TIMEOUT`；
- `OUTPUT_REDACTION_FAILED`。

CLI 失败只打印 `DOUYIN_MATERIAL_NOTE_EXPLAIN_FAILED:<CODE>`。

## 测试与验收

实现采用测试优先：

1. RED：配置、固定 fixture、SQL 形状、只读事务顺序、dev workflow 门禁、计划解析和
   输出脱敏测试先失败；
2. GREEN：实现最小代码使聚焦测试通过；
3. 运行全部资料 runner 测试、API typecheck/build、发布编排契约和 `git diff --check`；
4. 提交并推送 main，按既定流程重新发布 API dev；
5. 仅在 deployed revision 与新 SHA 一致后 dispatch runner；
6. 下载 artifact，核对三条查询、稳定门禁和脱敏字段；
7. 将 run ID、SHA 和三条计划摘要写入小程序交接文档。

如果真实领取尚不存在，步骤 5 的预期结果是稳定失败
`REPRESENTATIVE_CLAIM_MISSING`；完成两个真实抖音测试账号的公开领取 smoke 后原样重跑，
不得为了通过性能门禁降低预检或改造 fixture。
