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
- 腾讯云 COS 控制台只读查看：账号下 `windwill-1259348056` 桶位于 `ap-nanjing`，桶列表访问列显示“指定用户”；桶公共权限选中“私有读写”，Policy 规则表未列出规则。CORS 现有来源为 `https://api.goodcms.cn`、`https://servicewechat.com`、`https://servicewechat.weixin.qq.com`、`https://admin.goodcms.cn`，方法含 PUT/GET/POST/DELETE/HEAD，Allow-Headers 为 `*`。这些控制台配置仍需用匿名请求和签名到期实际验证对象私有性，且尚未确认运行中的 Worker 使用哪个 CAM 身份。首次检查时内容审核页要求开通数据万象；随后收到用户明确授权并执行了下述开通步骤。
- 在腾讯云主账号下勾选并接受页面列出的腾讯云服务协议、数据万象服务等级协议和计费说明，点击“立即使用数据万象”；按控制台引导创建 `CI_QCSRole` 服务角色，关联 `QcloudCOSDataFullControl`、`QcloudAccessForCIRole`、`QcloudPartAccessForCIRole` 三项预设策略并完成主账号微信身份校验。返回 COS 内容审核页后不再显示开通门槛，目标桶的“功能体验”页经“立即使用数据万象”完成绑定并显示审核策略和“立即审核”入口。跳过资源包购买，没有创建全桶自动审核规则。
- 使用功能体验页预置的腾讯云公开演示图片 URL 发起一次图片审核，页面返回“审核成功／正常”。这仅证明账号服务、桶绑定和控制台演示审核可用；未验证 Worker 使用的 CAM 身份、私有 COS 对象签名审核、审核请求 ID、拒绝/人工分支或生产账单。未使用河南晴天的客户照片，也未触发 Ark 生图。
- 开发 API 容器上的无付费 Ark 预检返回 `ok=true`、`executed=false`、`storageReady=true`，路由为 `decoration_raw_drawing`、模型为 `doubao-seedream-5-0-pro-260628`；它没有调用 Ark。该预检时开发 API 的准入、输入审核 Worker、生图 Worker 三个开关均未设置为 `true`，两个 Worker 均未运行。
- 用 640×480 合成房间图在目标桶创建随机私有输入对象，COS `PUT` 与 `HEAD` 均成功。首次生产输入审核网关的同步 CI 调用失败，原始 COS 错误为 `AccessDenied`、HTTP 403，网关按设计返回 `RENDERING_INPUT_REVIEW_UNAVAILABLE`；两次失败诊断各清理了 2 个随机测试键。随后独立的私有存储检查通过：结果写入与 `HEAD` 校验成功，匿名读取 403，600 秒签名读取 200，2 个临时对象已清理。
- 开发 API 实际使用的 COS SecretId 尾号与 CAM 子账号 `goose-storebucket` 的已启用密钥匹配。该子账号通过 `store-bucket` 用户组具有 COS 权限，但当时缺少 CI 图片审核权限；主账号的 `CI_QCSRole` 服务角色权限不会自动授权给 API 子账号。这解释了控制台主账号演示通过、Worker 凭据调用 403 的差异。腾讯云[图片单次审核授权说明](https://cloud.tencent.com/document/api/436/119478)要求子账号拥有 `ci:CreateAuditingPictureJob`；[CI 授权粒度](https://cloud.tencent.com/document/product/460/41741)支持限定存储桶资源。CAM 自定义策略 `gooes-rendering-ci-picture-audit-nanjing`（ID `286348104`）仅允许该 action 访问 `qcs::ci:ap-nanjing:uid/1259348056:bucket/windwill-1259348056/*`；获得用户在关联步骤的确认后，该策略已关联 `goose-storebucket`，控制台显示关联时间 `2026-09-14 13:29:05`。
- 关联后用相同开发 API 凭据再次运行完整合成图路径：输入对象 `HEAD` 通过、真实 CI 输入审核 `approved`，结果对象写入及 `HEAD` 通过、真实 CI 输出审核 `approved`（原始 Result `0` 且有请求 ID），匿名结果读取 403、签名读取 200，最后清理 2 个随机测试键。所有图片均由脚本合成，未读取或修改河南晴天客户图片、未触发 Ark 生图。该检查不覆盖 CI 拒绝/人工结果、签名到期后的读取、真实 Worker 运行或最终账单。
- 启用开发 API 配置文件中的 `CUSTOMER_RENDERING_INPUT_REVIEW_ENABLED=true` 前，用开发数据库只读计数确认待审核输入、排队生图任务和处理中任务均为 0；准入与生图 Worker 开关保持关闭。开发 [输入审核 Worker 发布 run 34810040010](https://github.com/LeeFo-china/goose/actions/runs/34810040010) 在提交 `fd712c83456da0c58cf4ef70c976efc6bf971112` 上成功，流水线核对了迁移历史及不可变镜像证据。容器 `gooes-customer-rendering-input-review-worker-dev` 显示 `healthy`、重启 0 次，进程内审核开关为 `true`，桶、地域和 SecretId 尾号与开发 API 一致，首轮日志 `scanned=0, claimed=0`。此项证明 Worker 可启动并轮询，尚无真实队列任务通过 Worker 处理。

本检查点使指定租户的**开发环境 API 和数据库**具备下一轮联调基础，并开通了腾讯云账号级数据万象、绑定目标桶，验证了开发 API 的 CAM 身份、私有对象读写和真实 COS CI 批准路径。开发输入审核 Worker 已部署并空轮询；生产库仍停留在前述 620 版只读计划状态，生产服务/开关/试点设置未改。Worker 对真实队列任务的处理、拒绝/人工分支和 Ark 成本仍未验收，因此没有给租户写入任意额度，也没有开启准入或生图 Worker。

## 生产放行前必须补齐

1. 在最终提交上重跑生产只读迁移计划，确认待执行版本、备份与回滚方案，按序由迁移流水线应用后再次核对生产历史；本地 `supabase migration list --linked` 需先安全建立项目链接。不要手工执行 DDL/DML。破坏性回滚只能通过新的补偿 migration；关停入口与 Worker 不应删除历史任务或预占。
2. 数据万象账号与目标桶已开通/绑定；开发 API 凭据的私有对象写入/HEAD、网关 CI 批准、匿名读取拒绝和签名读取已用合成图通过。继续验证真实 Worker 环境使用同一 CAM 身份、CI 拒绝/人工分支、签名到期和跨主体访问。
3. 核对实际 Ark 模型、单次最高计费与日预算，并将 `decoration_raw_drawing` 的路由超时通过现有 AI 配置入口设置为 300000 ms。当前无法从可信提供方回执取得任务级实际费用：提交后的任务按预占金额保守占用日预算，提交前明确失败记 0。必须先确定结算与超额处置规则，并完成付费测试任务的账本核对。
4. 先部署 API 和迁移且保持准入开关、`CUSTOMER_RENDERING_INPUT_REVIEW_ENABLED`、`CUSTOMER_RENDERING_JOB_WORKER_ENABLED` 关闭；验证 401/404、幂等、跨主体、审核和失败恢复。核对生产 Compose 实际使用的 API env 文件路径。然后分别显式部署输入审核 Worker 和生图 Worker，只对一个测试租户开放额度与准入，完成至少一次通过、一次拒绝、一次结果不明的人工对账演练，再考虑扩大范围。

若试点出现异常，先关闭准入与 Worker；使用平台超级管理员人工对账入口按证据处理 `review_required`，不重新提交结果未知的 Ark 请求。保留审计与预占记录供复核。

单租户额度通过平台超级管理员 `GET/PUT /platform/customer-rendering-settings/{tenantId}` 管理。先读取默认关闭状态及 `version`；写入必须同时提交显式 `enabled`、日任务上限、日预算分、单任务预占分、`expected_version` 和不含隐私数据的 `reason`。服务端从员工会话确定操作人，数据库在同一事务中做版本校验、更新与平台审计。试点前先保持 `enabled=false` 配好额度；COS CI、Ark 超时与计费证据核对后才开启指定测试租户。停用时可再次写入 `enabled=false`，不删除历史账本。

人工对账入口为 `POST /platform/customer-rendering-jobs/{job_id}/reconcile`，只接受 `tenant_id`、`decision`（`approve_audited` 或 `release`）和不含隐私数据的 `evidence_ref`（如工单编号）。后端从平台超级管理员员工会话写入 operator，不接受客户端指定 operator。`approve_audited` 仅在任务已有可审计的 COS CI 通过记录和私有结果时可用；结果不明或缺少审核证据的任务需先调查，再依据工单决定是否 `release`。同一 operator、决定和证据重放返回幂等结果，不同决定或证据冲突返回 409。此接口没有自动重试 Ark 的能力。
