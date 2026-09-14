# 客户 AI 效果图：任务处理发布门禁

日期：2026-09-14。抖音生产图片上传成功来自用户反馈；这项反馈只覆盖上传，不等于输入审核通过、Ark 生图、输出审核或额度结算已在生产跑通。本记录不包含真实客户图片、签名 URL、密钥、私有对象路径或完整审核原文。

## 当前可复核的实现与证据

| 环节 | 本地证据 | 结论 |
| --- | --- | --- |
| 数据库迁移 | 隔离 Supabase 项目 `gooes_rendering_verify` 使用独立端口，从现有迁移链应用到 `20260914014930`、`20260914022533` 和 `20260914034000`；末三版 `supabase migration list --local` 的 Local/Remote 版本对齐，新设置 RPC 的事务测试通过并回滚，验证后临时容器已移除。前两份迁移与仓库原件 SHA-256 相同。旧迁移中 6 处 `CREATE/DROP INDEX CONCURRENTLY` 及 1 处要求特定生产租户的数据修复只在临时验证副本中调整，仓库原件未改。生产 [只读 plan run 34803494462](https://github.com/LeeFo-china/goose/actions/runs/34803494462) 在迁移内容提交 `d301aacd3` 上成功：远端历史 620 版，最新 `20260913035110`；待执行恰好为上述三份，运行前后版本数均为 620，未创建备份或写库。 | 三份新迁移在完整基线后的隔离库可执行；生产尚未应用。正式应用前仍须核对备份、回滚方案与当时生产历史。`supabase migration list --linked` 仍因本地未链接生产项目而不可用。 |
| 并发准入 | 两个独立数据库连接争用最后一个日任务／预算名额，仅一笔成功；重复幂等键返回同一任务；跨主体文件、下架素材、预算上限均被拒绝。 | 准入保留了原子限额和主体边界。 |
| Worker 与结算 | `supabase/tests/customer_rendering_job_processing.sql` 在隔离库通过并回滚：有界领取、提交意图、私有结果记录、CI 原始审核证据、批准后单次消耗、未知提交转人工、人工决定幂等审计、提交前失败释放预占。Worker 单次领取，记录提交意图后才调用 Ark；未知提交不自动再次付费。 | 本地验证了状态机和额度账本；还没有真实 Ark/COS CI 端到端证据。 |
| 发布与付费前置校验 | 开发和生产发布流程已支持输入审核与生图 Worker 显式单选；默认 `all` 不启动它们。生产 Worker 拉镜像前检查三份客户生图迁移已应用、开关在实际 API 配置文件中恰好一条 `true`，随后检查健康与不可变镜像证据。生图 Worker 在付费调用前要求 Ark 路由超时为 300000 ms；已记录的真实成功调用约耗时 94 秒，原开发路由 60000 ms 不足。 | 配置不足时在付费请求前失败并释放预占。开发路由已通过现有 Admin 入口调整并复核；生产路由仍待调整。未执行生产部署。 |
| 权限与私有结果 | API 根据会话租户和主体读取文件／任务；仅成功且输出审核通过才签发短期私有结果 URL。人工对账仅允许平台超级管理员入口，operator 来自服务端员工会话；数据库 `service_role` RPC 只应由可信后端调用。 | 没有向普通会话开放任意任务或结果；仍需生产 COS 匿名读取与跨主体验收。 |
| 客户端 | 抖音页面上传后查询输入审核、按 tenant/app/installation/subject 隔离保存幂等请求、查询任务并显示“AI 参考效果图”。切后台立即遮蔽私有状态，账号变化或归属 404 清理旧任务与签名 URL。微信端交接契约已写入 `docs/integration/customer-rendering-generation-handoff.md`，本仓库未修改 `orange`。 | 本地合同与静态验证不代替双端真机验收。 |

API 已运行 `bun run check`（typecheck、build、文件大小检查均通过）以及 12 个直接相关测试文件（81 pass、0 fail）。这些测试使用替身验证边界，不构成真实 Ark/COS 调用或生产数据检查。
本轮再次运行 API `bun run check`、5 个新增／变更聚焦测试文件（19 pass、0 fail）及 4 个发布契约测试文件（214 pass、0 fail）；新设置 RPC 还在隔离库通过事务测试。
抖音小程序已运行 `bun run check`（380 pass、0 fail，TypeScript 检查通过），包含同主体恢复、跨账号切换、旧结果遮蔽与 404 清理测试。

## 河南晴天装饰工程有限公司：开发环境执行检查点

- 生产 Admin `/api/auth/me` 只读会话确认租户名称为“河南晴天装饰工程有限公司”、ID 为 `3eebca47-961f-4899-b976-a3d3208d326b`、状态 active。当前生产登录会话是该租户员工，不是平台超级管理员；仓库旧证据曾使用同一 ID 的旧名称，后续以当前会话名称和稳定 ID 为准。
- 开发 [migration plan run 34804543383](https://github.com/LeeFo-china/goose/actions/runs/34804543383) 在提交 `04bb725490ddc992a47b5d7f9931c5f6765d2114` 上成功：`before_count=620`、`after_count=620`、待执行 `20260914014930 20260914022533 20260914034000`，应用 0 版。开发 [migration apply run 34804572398](https://github.com/LeeFo-china/goose/actions/runs/34804572398) 成功：`after_count=623`、`after_latest=20260914034000`，恰好应用上述三版。没有手工远端 DDL/DML。
- 开发 [API release run 34804610699](https://github.com/LeeFo-china/goose/actions/runs/34804610699) 成功；构建、迁移历史门禁、API 部署及健康检查均通过。该次仅选择 `service=api`，没有发布两个 Worker 或开启付费生图入口。
- 开发后台现有平台超管会话通过 `/api/backend/platform/customer-rendering-settings/3eebca47-961f-4899-b976-a3d3208d326b` 读取：`enabled=false`、`version=0`、日任务数/预算/单任务预占均为 `null`。通过现有 AI 模型路由 Admin 将 `decoration_raw_drawing` 的 `timeout_ms` 从 `60000` 改为 `300000`；保存后列表复核为 `300000 ms`。主模型仍为 `doubao-seedream-5-0-pro-260628`，这些配置不证明真实推理成功。
- 开发后台平台超管只读密钥状态接口显示 `ARK_API_KEY` 的 `source=database`、`status=configured`，未读取或记录密钥值。该状态仅表示已登记，不能证明 Ark 鉴权、模型开通或实际费用；目前仍缺少这条精确模型路由的可信单次价格/回执。腾讯云[官方内容审核价格](https://cloud.tencent.com/document/product/460/58119)按图片审核次数及场景计费，常规首档为每千次 1.50 元；账户权益、具体场景数和最终账单仍须实测核对。
- 腾讯云 COS 控制台只读查看：账号下 `windwill-1259348056` 桶位于 `ap-nanjing`，桶列表访问列显示“指定用户”；桶公共权限选中“私有读写”，Policy 规则表未列出规则。CORS 现有来源为 `https://api.goodcms.cn`、`https://servicewechat.com`、`https://servicewechat.weixin.qq.com`、`https://admin.goodcms.cn`，方法含 PUT/GET/POST/DELETE/HEAD，Allow-Headers 为 `*`。这些控制台配置仍需用匿名请求和签名到期实际验证对象私有性，且尚未确认运行中的 Worker 使用哪个 CAM 身份。内容审核页仍显示“开通数据万象”并要求同意服务协议后才能使用；未勾选协议、未开通服务、未调用付费审核，COS CI 尚不可验收。

本检查点只使指定租户的**开发环境 API 和数据库**具备下一轮联调基础。生产库仍停留在前述 620 版只读计划状态，生产服务/开关/试点设置未改。COS CI 尚未开通、Worker CAM/私有对象读写及真实 Ark 成本未验收，因此没有给租户写入任意额度，也没有开启准入或启动 Worker。

## 生产放行前必须补齐

1. 在最终提交上重跑生产只读迁移计划，确认待执行版本、备份与回滚方案，按序由迁移流水线应用后再次核对生产历史；本地 `supabase migration list --linked` 需先安全建立项目链接。不要手工执行 DDL/DML。破坏性回滚只能通过新的补偿 migration；关停入口与 Worker 不应删除历史任务或预占。
2. 核对生产 COS CI 开通状态、桶及对象的私有读策略、Worker CAM 的私有 GET/PUT/HEAD 与审核权限；用非客户测试图验证房间图签名读取、结果私有写入、HEAD/校验和、CI 批准与拒绝、匿名读取失败及签名到期。
3. 核对实际 Ark 模型、单次最高计费与日预算，并将 `decoration_raw_drawing` 的路由超时通过现有 AI 配置入口设置为 300000 ms。当前无法从可信提供方回执取得任务级实际费用：提交后的任务按预占金额保守占用日预算，提交前明确失败记 0。必须先确定结算与超额处置规则，并完成付费测试任务的账本核对。
4. 先部署 API 和迁移且保持准入开关、`CUSTOMER_RENDERING_INPUT_REVIEW_ENABLED`、`CUSTOMER_RENDERING_JOB_WORKER_ENABLED` 关闭；验证 401/404、幂等、跨主体、审核和失败恢复。核对生产 Compose 实际使用的 API env 文件路径。然后分别显式部署输入审核 Worker 和生图 Worker，只对一个测试租户开放额度与准入，完成至少一次通过、一次拒绝、一次结果不明的人工对账演练，再考虑扩大范围。

若试点出现异常，先关闭准入与 Worker；使用平台超级管理员人工对账入口按证据处理 `review_required`，不重新提交结果未知的 Ark 请求。保留审计与预占记录供复核。

单租户额度通过平台超级管理员 `GET/PUT /platform/customer-rendering-settings/{tenantId}` 管理。先读取默认关闭状态及 `version`；写入必须同时提交显式 `enabled`、日任务上限、日预算分、单任务预占分、`expected_version` 和不含隐私数据的 `reason`。服务端从员工会话确定操作人，数据库在同一事务中做版本校验、更新与平台审计。试点前先保持 `enabled=false` 配好额度；COS CI、Ark 超时与计费证据核对后才开启指定测试租户。停用时可再次写入 `enabled=false`，不删除历史账本。

人工对账入口为 `POST /platform/customer-rendering-jobs/{job_id}/reconcile`，只接受 `tenant_id`、`decision`（`approve_audited` 或 `release`）和不含隐私数据的 `evidence_ref`（如工单编号）。后端从平台超级管理员员工会话写入 operator，不接受客户端指定 operator。`approve_audited` 仅在任务已有可审计的 COS CI 通过记录和私有结果时可用；结果不明或缺少审核证据的任务需先调查，再依据工单决定是否 `release`。同一 operator、决定和证据重放返回幂等结果，不同决定或证据冲突返回 409。此接口没有自动重试 Ark 的能力。
