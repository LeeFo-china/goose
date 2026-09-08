# 阶段 C 开发 apply 与 API / Admin 发布

2026-09-08。执行用户“执行 apply，开发发布”。仅开发环境、已审查的四条 C migration，以及 API / Admin；不合并 main、不发布其他服务、不启用租户 C 开关、不写领退料或付款业务单据，不修改 Orange。

## 固定来源与执行前门禁

- 候选：`983b775ef67bdc3ccd1ee223ace00351dc2fa552`，分支 `release/warehouse-stage-c-dev-20260908`。执行前重新核对远端引用、四文件 SHA-256 和完整迁移历史，无漂移。证据只提交到 feature 分支，不移动发布候选。
- 开发目标：`api-dev.goodcms.cn`，project ref `fclnkyatvfvmzgzdqlba`，SSH 主机断言 `VM-0-11-ubuntu`，数据库 `postgres` / PostgreSQL 17.6。没有访问生产目标。
- CLI Local 599 / Remote 595，远端独有版本 0；待应用仅原四条 C migration。清单及 hash 见[候选 plan](2026-09-08-warehouse-stage-c-candidate-plan.md)。
- 08:15:08 UTC 的[只读兼容预检](2026-09-08-warehouse-stage-c-preapply.json)：原来源约束及唯一键有效，既有成本 4 / 库存 0 / 设置 1，来源不兼容 0；C1 匹配 1、C2 匹配 2/1/1/1、C3 七段顺序匹配均 1。新对象无重名，锁等待和其他超过五分钟的事务均 0。
- 本轮重跑 API check、Admin check、权限边界检查均退出 0；七个定向 API 测试文件合计 35 pass / 0 fail / 218 assertions。此前完整隔离 SQL / HTTP / 浏览器证据保留，不声称本轮重跑全部测试。

## 新鲜备份与资源

08:14:06 UTC 完成开发库新备份，目录 `/var/tmp/gooes-stage-c-preapply-backup.TCnL0BZ1`，文件 mode 0600，保留原备份：

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| database.dump | 8,449,167 | `94b3213d4e91430635195c272e8f9f5d727f718c0a62ba18c67d1177241ba5c7` |
| roles.sql | 6,846 | `4d122cb1cacc26b4465474271417674c38c1f82806e1a601a291ea39b0c3c079` |

另备 `pgsodium_root.key`，与实际源文件逐字节一致；不输出或入库密钥内容。`pg_restore --list` 和完整 `pg_restore --file=/dev/null` 解码均退出 0，归档含 322 个 TABLE DATA 条目。

**新归档没有再次实际恢复到数据库。** 可恢复性另参考此前同 schema 的[完整恢复及 325 表计数对账](2026-09-08-warehouse-orphan-dev-apply.md)，不能把旧恢复结果描述为新快照恢复验收，也不包含对象存储或 WAL 灾备。数据库 dump 是自身一致性快照；角色与密钥备份不属于同一原子数据库快照。

apply 前磁盘可用 3,792,564,224 bytes（94% 已用），数据库约 127 MB；内存可用约 1,046 MiB。Admin 构建期间再次采样余量 3,212,648,448 bytes（95% 已用）。没有主动删除镜像、日志或备份；磁盘容量仍需单独治理。

## apply 结果：PASS

[Migrate Dev Database #34203572839](https://github.com/LeeFo-china/goose/actions/runs/34203572839) 为 `completed / success`，headSha 精确匹配候选。使用既有工作流 `mode=apply`、`confirm_dev_project_ref=fclnkyatvfvmzgzdqlba`，没有手工执行 DDL/DML 修库。

```text
before_count=595
after_count=599
pending_count=4
applied_count=4
applied_versions=20260908015230 20260908015649 20260908020216 20260908023924
before_latest=20260908062915
after_latest=20260908062915
```

四条较早版本通过完整版本差集执行，latest 不变是正常结果，不修改版本号、不 repair 历史。应用后重新运行开发直连 Supabase CLI migration list 和 `scripts/verify-migration-history.mjs`，599 / 599 完整对齐，目标版本存在；[完整历史](2026-09-08-warehouse-stage-c-applied-history.txt)仅去掉行尾空白，599 行版本对应逐项相等。

08:17:44 UTC 的[应用后只读实查](2026-09-08-warehouse-stage-c-postapply.json)：

- 7 个入口 RPC 仅 service_role 可执行；5 个 helper 对 PUBLIC / anon / authenticated / service_role 均不可执行。12 个函数均 SECURITY DEFINER 且固定 search_path。
- 5 张新表 RLS enabled / forced，上述应用角色无直接表权限，序列权限关闭；7 个材料约束 validated、5 个不变性触发器 enabled。
- `warehouse_materials_enabled NOT NULL DEFAULT false`，现有设置 1 条，启用 / 空值 / 父开关异常均为 0。没有调用开关命令。
- 新 5 张业务表均为空。原成本 4 条仍全部采购来源 / increase；库存事实仍 0。
- C2 方向表达式匹配 2/1/1/1；C3 函数定义 MD5 `cadf7fae090ec378cf80315a9f436289` 与应用前顺序替换预测完全一致。

主代理另行核对权限失败数为 0，并对以下八张业务表在 apply 前后按 id（设置按 tenant_id）排序的行 JSON 计算摘要；成本排除新增方向 / 材料来源列、库存排除新增材料来源列、设置排除新增 C 开关后，计数及摘要一致：

| 表 | 行数 | MD5（空表无摘要） |
| --- | ---: | --- |
| project_cost_events | 4 | `d162e04abfa7a1cafe8206686d0836a1` |
| inventory_transactions | 0 | — |
| inventory_balances | 0 | — |
| supplier_payable_events | 4 | `82b3134bd11d3f02ebb303e33965e6ab` |
| supplier_payments | 0 | — |
| supplier_purchase_orders | 14 | `2e96716e01047b30242108f040453c75` |
| warehouses | 1 | `e4d4603c47cdd509b4ee01a4e9916588` |
| tenant_supplier_settings | 1 | `e31690108011f759d15e8b48f999b8d1` |

该核对只覆盖表中明确列出的业务数据，不代表整个数据库所有表无变化。

## 开发发布结果：PASS

[Release Dev #34203757524](https://github.com/LeeFo-china/goose/actions/runs/34203757524) 为 `completed / success`，08:18:09–08:25:15 UTC。参数 `service=api,admin`、`operation=release`，headSha 精确匹配候选。构建、完整迁移历史、API 部署、API readiness、Admin 部署及剩余服务 readiness 全部通过。

已下载的[可信构建清单、镜像及迁移门禁](2026-09-08-warehouse-stage-c-release-artifacts.json)明确 build_services / deploy_services 均仅 `["api", "admin"]`。Web / H5 / social-video-worker 矩阵 job 的 checkout、build、push、manifest 全部 skipped，生产校验 job skipped；实际部署仅 API / Admin。没有跳过检查或修改 workflow。迁移 artifact 的 sentinel 仍为既有 `20260711120000`，完整历史也被严格核对；C 目标版本另外由本轮 CLI 校验确认。

主代理通过 SSH 独立检查实际容器：二者 revision 均为 `983b775ef67bdc3ccd1ee223ace00351dc2fa552`、run ID 均为 `34203757524`、状态均 running / healthy，digest 与下载的同次 manifest 一致：

| 服务 | 运行镜像 digest |
| --- | --- |
| API（goose-api） | `sha256:720a66ff7dbd403e9d3847accbf0ec681f4bca8fb8232d1e8554a2e628422249` |
| Admin（goose-admin） | `sha256:70487add799fd93f9ac7a44880a90dde8d772dcea616ccd6b327c986dddc57d1` |

镜像仓库均为 `useccr.ccs.tencentyun.com/america_goose/`。其他五个服务仍为 revision `65d1ed282bcfbbf608b6b8f6d49c288e1fa032e8`、run ID `34147912954` 且 running / healthy；三个 worker digest 与发布前一致，Web / H5 保持旧 run，未被本次 workflow 发布。

发布后独立无凭据 HTTP 检查：

- `https://api-dev.goodcms.cn/`：200。
- `https://admin-dev.goodcms.cn/login`：200。
- API `/warehouse-issues?page=1&pageSize=20`、`/warehouse-returns?page=1&pageSize=20`、`/warehouse-issues/settings`：均 401 / `TOKEN_MISSING`。
- Admin `/warehouse-issues`、`/warehouse-returns`：均 307 跳转 `/login`；运行容器 `app-paths-manifest.json` 真实包含两页构建产物。
- API 容器 SKU 清理 fixture SHA-256 仍为 `806e07c2fb5a8a8afb3bd2abb40478ed57238219c80a57034f49913ddb73cb98`，清理修复随 C 候选保留。

上述未登录检查证明鉴权拒绝及页面产物存在，不证明有权限员工的真实业务调用成功。08:27:39 UTC 再次显式只读查询：历史仍 599，C enabled / issue / return / command 均 0，上述八表计数和摘要仍一致。

发布后磁盘可用 3,953,139,712 bytes（94% 已用）；未主动清理。远端 main 仍 `ad22e9e7f73833e01986654ae73b4a2ea925734a`，固定发布分支仍 `983b775e`。构建只有既有 Docker action Node 运行时弃用 warning，无失败；本轮不扩展修改 CI 依赖。

## 验收边界与后续

独立只读审查确认两份 SQL JSON 与实查证据一致、599 个唯一版本与固定候选及远端逐项匹配、hash 格式正确，备份与真实业务验收边界没有夸大。镜像、HTTP 和发布后八表摘要由主代理另行实查，未将审查代理的格式核对描述为重复业务数据验证。

测试租户仍为固始晴天装饰工程有限公司，现成有权限的员工为风清扬，身份及权限只读选择依据见[候选记录](2026-09-08-warehouse-stage-c-candidate-plan.md)。没有冒用该员工登录、生成 JWT、修改权限 / 登录配置或写实际业务单据。

既有发布 workflow 自带配置账号登录及分页项目风险读取 smoke；这属于发布健康检查，不是本次指定租户 / 员工的领退料验收，不能以此宣称实际 C 流程通过。

开发部署完成也不等于 C 真实业务验收。后续需另行确认开关操作，正常员工登录，并选定项目 / SKU / 数量等测试边界，之后验收领料、分次退料及库存 / 净成本 / 应付对账。main 全服务发布、生产发布、调拨 / 盘点 / 手工调整均不在本次发布验收结论内。

回退沿用[发布准备中的失败处理](../2026-09-08-warehouse-stage-c-release-readiness.md#5-失败处理与回退)：保持 C 关闭，先验证旧镜像对新 schema 的兼容性；不用手工 SQL 撤销迁移或删除事实。若未来已经产生领退料事实，不可切回忽略成本方向的旧 API。
