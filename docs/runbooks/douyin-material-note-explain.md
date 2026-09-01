# 抖音资料查询 dev EXPLAIN 门禁

## 适用范围

本门禁只验证抖音文本资料的三个既有分页查询，不修改接口、fixture、数据库结构、租户
服务状态或小程序安装配置。入口固定为：

```bash
DOUYIN_MATERIAL_NOTE_EXPLAIN_CONFIRM=development-read-only \
DOUYIN_MATERIAL_NOTE_EXPLAIN_DB_URL="${SUPABASE_DB_DIRECT_URL}" \
bun run douyin:material-note:explain
```

`DOUYIN_MATERIAL_NOTE_EXPLAIN_CONFIRM` 必须等于 `development-read-only`；
`DOUYIN_MATERIAL_NOTE_EXPLAIN_DB_URL` 只能由受保护的 dev runner 注入。
数据库事务固定为 `REPEATABLE READ READ ONLY`，statement timeout 为 5,000ms。

## 受保护执行流程

GitHub workflow
`verify-dev-douyin-material-note-explain.yml` 只允许从 main 手动 dispatch，并同时校验：

- 输入 commit 为 40 位小写 SHA，且等于 dispatch SHA；
- checkout HEAD、干净工作区和 `gooes-api-dev` 镜像 revision 均等于该 SHA；
- runner、dev env 文件、项目 ref 和数据库 host 为固定 dev 值；
- 生产项目 ref 与生产数据库 host 位于拒绝列表；
- 仓库与 dev 的完整 migration history 一致，且
  `20260901120030_index_douyin_material_note_event_erasure.sql` 已存在；
- 数据库角色、同一 backend、只读事务、planner 默认基线和索引元数据全部通过。

禁止使用 `enable_seqscan=off` 或其他 planner 变更制造索引命中。

## 固定 fixture

fixture tag 固定为 `Task10-A-20260902`。runner 在只读事务中解析该 tag 下唯一的已发布
资料和唯一 active merchant 安装，再稳定选择最新一条有效领取
（`claimed_at DESC, id DESC LIMIT 1`）作为 `owned_active_list` 的代表主体。

不存在有效领取时返回 `REPRESENTATIVE_CLAIM_MISSING`。不得通过 SQL 创建或修改 fixture，
不得为通过门禁伪造 subject、领取或抖音会话。

## 查询与索引清单

| 查询 | 主基数关系 | 必须存在且有效的索引:关系 |
| --- | --- | --- |
| public_list | douyin_material_notes | douyin_material_notes_public_idx:douyin_material_notes、douyin_material_note_versions_tenant_note_idx:douyin_material_note_versions、douyin_material_note_claims_owned_idx:douyin_material_note_claims |
| tenant_keyword_list | douyin_material_note_versions | douyin_material_notes_tenant_idx:douyin_material_notes、douyin_material_note_versions_title_trgm_idx:douyin_material_note_versions、douyin_material_note_versions_summary_trgm_idx:douyin_material_note_versions、douyin_material_note_versions_category_trgm_idx:douyin_material_note_versions |
| owned_active_list | douyin_material_note_claims | douyin_material_note_claims_owned_idx:douyin_material_note_claims、douyin_material_note_versions_tenant_note_idx:douyin_material_note_versions |

三条查询都使用绑定参数和 `LIMIT 20`。公开列表按
`published_at DESC, id DESC`，租户关键词列表按 `updated_at DESC, id DESC`，
有效领取列表按 `claimed_at DESC, id DESC` 稳定排序。

## 基数与性能判定

主关系采用封顶 1,000 行计数：

| 分档 | 规则 |
| --- | --- |
| small（0–999） | PostgreSQL 可基于成本选择 `Seq Scan` 或批准索引 |
| large（1,000） | 主关系禁止 `Seq Scan`，且必须命中清单内属于主关系的批准索引 |

共同阈值：

- planning time 不超过 50ms；
- execution time 不超过 250ms；
- shared read blocks 不超过 20,000；
- temp read/written blocks 均为 0；
- statement timeout 为 5,000ms。

关联表通过索引 catalog 校验存在、`indisvalid=true` 且 `indisready=true`。大表门禁只针对
每条查询的主基数关系，避免把主键 JOIN 错误地要求为业务筛选索引。

## 稳定错误码

| 错误码 | 含义 |
| --- | --- |
| CONFIRMATION_REQUIRED | 未提供精确 dev 只读确认 |
| MISSING_CONFIG | 必要配置缺失 |
| INVALID_DATABASE_URL | 数据库地址格式无效 |
| INVALID_PLAN | JSON plan 结构无效 |
| NON_DEFAULT_PLANNER | planner 基线被污染或证据不完整 |
| INVALID_CARDINALITY | 封顶基数无效 |
| INDEX_RELATION_MISMATCH | 索引与关系清单不一致 |
| INDEX_METADATA_INVALID | 索引缺失、无效、未 ready 或重复 |
| PLANNING_THRESHOLD | planning time 超限 |
| EXECUTION_THRESHOLD | execution time 超限 |
| SHARED_READ_THRESHOLD | shared read blocks 超限 |
| TEMP_BLOCKS | 使用了临时块 |
| LARGE_TABLE_SEQ_SCAN | large 主关系出现顺序扫描 |
| LARGE_TABLE_INDEX_REQUIRED | large 主关系未命中批准索引 |
| INVALID_FIXTURE | 固定资料、安装或领取证据无效 |
| REPRESENTATIVE_CLAIM_MISSING | 尚无真实有效领取 |
| TRANSACTION_GUARD_INVALID | backend、只读或隔离级别校验失败 |
| INVALID_DEV_TARGET | runner、角色、项目或数据库目标无效 |
| QUERY_TIMEOUT | 查询超过 5 秒 |
| DATABASE_FAILURE | 数据库查询失败且未暴露原始错误 |
| DATABASE_CLOSE_FAILED | 数据库连接关闭失败 |

CLI 失败只打印 `DOUYIN_MATERIAL_NOTE_EXPLAIN_FAILED:STABLE_CODE`。

## 输出与留存

成功 artifact 只保存：

- gate、fixture tag、query count 和阈值；
- 三条查询的基数分档、节点类型、索引名称；
- planning/execution time、actual rows/loops 和 buffer 汇总；
- migration 对齐布尔证据。

不得保存或上传数据库 URL、tenant/install/note/claim UUID、subject hash、手机号、token、
SQL bindings、predicate、SQL 全文或原始 EXPLAIN JSON。artifact 保留 30 天；工作流失败时
只记录稳定错误码，不上传部分 plan。
