# 评论停用生产部署与联合验收回执

日期：2026-10-10。配套客户端上传版本：2026.10.10.1；生产 API：`https://api.goodcms.cn`。

**API/Admin 已部署，37项生产接口检查通过；联合真机验收和其余公开内容安全验收尚未通过，不安排重新提审。** 本轮没有数据库迁移，没有修改 orange，没有提交小程序审核。

## 1. 部署证据

- 发布 Tag：`v2026.10.10.1`；源码：`8112d16362285c1c36c90f9dd1c6ff1b1e669394`。
- [候选构建 38040284027](https://github.com/LeeFo-china/goose/actions/runs/38040284027)：成功；候选清单、本地校验器及生产发布流程均确认仅部署 `api,admin`。
- [生产部署 38040981605](https://github.com/LeeFo-china/goose/actions/runs/38040981605)：成功；完成时间北京时间 **2026-10-10 17:21:45**。
- 生产 `gooes-api`、`gooes-admin` 的 revision 均为上述 SHA，健康状态均为 `healthy`。
- API digest：`sha256:ca8f4360e1083b1e11fe6170ec5f37cf6f59a07584a1e3d77d422feab4a47a3c`。
- Admin digest：`sha256:2bd65935ea749a8a6771897dcc216a3396935205c1d08fc008b6f90dfd7aae53`。
- [发布回执](../operations/evidence/2026-10-10-comment-suspension/deployment-receipt.json)、[API镜像清单](../operations/evidence/2026-10-10-comment-suspension/image-manifest-api.json)、[Admin镜像清单](../operations/evidence/2026-10-10-comment-suspension/image-manifest-admin.json)。

部署前已复跑82项相关测试、API/Admin类型检查、文件行数与diff检查。前一生产版本为 `009ce69ed085190e98eb5f0a7ec12476210e8ec8`；回退该版本会恢复旧评论行为，因此不能将普通回滚视为继续满足本次停用要求。

## 2. 生产接口与上传验收

实测经生产 HTTPS 入口；使用数据库中现有员工、客户绑定及访客身份上下文，短期凭证仅在服务器进程内生成、使用，没有写入文档或输出。先确认线上停用常量为 false 才执行预期拒绝的POST/PATCH；未创建评论、图片对象或测试业务记录。读取样本均有数量限制。结果及 requestId 见 [37项检查记录](../operations/evidence/2026-10-10-comment-suspension/api-smoke.json)。这属于服务端身份和接口验收，不替代微信真机登录/操作验收。

以下通过前置认证、参数校验的停用请求均实测返回 **403 / COMMENT_COMMUNICATION_DISABLED / 交流功能暂未开放**：

| 场景 | 实测请求 | 结果 |
| --- | --- | --- |
| 员工日志评论 | GET/POST `/project_log_comments`，含 parent_id 回复 | 拒绝读取、创建、回复 |
| 客户日志评论 | POST `/project_log_comments`（含评分）；GET `/customer/projects/:id/logs/:logId/comments` | 拒绝创建和客户独立列表 |
| 跟进评论 | GET/POST `/customer_follow_ups/:id/comments`，含 parent_id 回复 | 拒绝 |
| 访客图库评论 | 匿名/访客GET、访客POST `/visitor/picture-library/assets/:id/comments` | 拒绝 |
| 超管恢复入口 | POST `/platform/picture-library/comments/:id/show` | 已授权平台身份也拒绝；未恢复任何历史记录 |
| 历史评论图转换 | GET `/uploads/public-url?fileId=...` 及 `?path=...`，3个真实文件各测两种方式 | 平台身份也拒绝，共6项 |

上传场景：`project_log_comment`、`customer_follow_up_comment`、`picture_comment`。

- 员工、客户分别对3个场景测试 `/uploads/cos/direct-init` 和 `/uploads/cos/direct-complete`：12项全部拒绝。
- 访客对允许进入其既有上传权限范围的 `picture_comment` 测试上述两端点：2项全部拒绝。
- complete 使用符合身份路径前缀的参数触发停用拦截；没有向COS实际PUT对象。这证明API登记/完成已关闭，**不证明旧COS直传签名已撤销**。
- 存储服务内部代理上传、COS/Supabase实现、registerExistingCosObject 的拦截由本地实际服务测试覆盖；未在生产创建测试文件。

兼容性结果：不存在的旧编辑路由 `PATCH /project_log_comments/:id` 返回404；缺少身份返回401；非法创建参数返回400。不能要求这些前置错误都变成停用码。图库分页列表仍返回200且 `comment_count=0`；客户业务日志分页返回200，抽样两条的评论计数均为0。

Admin生产页面返回200，包含“评论交流已停用”的治理说明，没有“恢复公开”按钮。本次HTML样本没有命中带图历史行，**不把附件数量提示的生产渲染记作已验证**；其实现和类型检查已验证。见 [只读页面结果](../operations/evidence/2026-10-10-comment-suspension/read-surfaces.json)。

## 3. 历史图片直链：部分通过，仍有访问残留证据

只读核查及Range GET，未删除、改ACL、改桶策略或刷新CDN。

| 检查 | 结果 | 结论边界 |
| --- | --- | --- |
| COS桶ACL | private | 不等于所有对象/历史签名不可读 |
| Bucket Policy读取 | 404 | 记录实际响应，不推断存在全路径拒绝策略 |
| 活跃文件元数据抽样 | 3个 project_log_comment 文件，无签名GET均403 | 仅覆盖这些样本 |
| 历史评论images引用 | 3个日志评论引用GET均403 | 仅覆盖这些引用 |
| 另外两个scene | 有界活跃文件查询未找到样本 | 不等于所有历史数据不存在 |
| 部署前签发的同一GET URL | 部署前206，API新版本健康后仍206 | **API停用没有立即撤销已签名链接** |

当前配置的公开域名与COS源站是同一host，因此上述访问不是两条独立CDN链路证据。没有验证所有曾经使用的域名、CDN、客户端离线缓存或下载副本。

签名样本对应文件 `ad5110b3-f3f2-48ad-9a14-f38523163a49`，HEAD确认对象存在；GET授权时长约1800秒。记录仅保留文件ID、HTTP状态和到期时间，未持久化URL/签名。该URL是为了验收在部署前按当时线上逻辑签发的代表性样本，并非从用户设备提取。部署后复测发生在到期前；本轮没有取得**同一URL到期后的实测结果**，不能据时间经过直接补写“失效验收通过”。运行时普通直传签名TTL为900秒，但未重放历史PUT授权。

证据：[部署前存储检查](../operations/evidence/2026-10-10-comment-suspension/storage-before.json)、[部署后存储检查](../operations/evidence/2026-10-10-comment-suspension/storage-after.json)、[同一签名URL部署前后结果](../operations/evidence/2026-10-10-comment-suspension/signed-link-lifecycle.json)。

剩余项：按评论专用前缀清点所有存储来源和最长有效签名期限，确认没有遗漏的重新签发入口；使用实际旧链接复测到期后访问及缓存。如需立即阻断，制定仅作用于评论对象的存储隔离/访问拒绝方案；不能修改全桶而影响施工日志、验收等文件，也不能以删除历史记录代替治理。数据库元数据变更仍必须用migration。

## 4. 其余公开内容安全核查

以下为此次代码路径核查和有限生产读取结果。没有在生产发布危险文本、上传风险图片或调用真实生成任务；未将代码检查伪装成内容安全服务实测。整体结论为**未通过**。

| 公开路径 | 已核实的控制和缺口 | 下一步 |
| --- | --- | --- |
| 公开项目及施工日志 | `controllers/projects/public-controller.ts` 调用公开项目范围判断；`repositories/projects/legacy/public.ts` 按项目状态/visibility返回日志文本、图片，没有逐条审核通过条件。生产访客分页读取返回200，抽样2条含文本及2张图片。`services/project-logs.ts` 编辑直接更新业务内容，未见与公开版本绑定的内容审核。 | 对外展示前增加审核通过的版本/文件门禁，或同步暂停这部分公开展示；保留内部交付记录。另记现有项目详情内嵌日志的无上限读取，不在本次评论停用中顺手改动。 |
| 装修灵感图库 | `services/picture-library.ts` 创建、编辑、published切换验证权限、分类、文件有效性后直接写入，未见文本/图片审核结果门禁；编辑已发布素材也未见重新审核约束。 | 覆盖标题/正文、分类及封面、图片、发布后编辑；状态published本身不是审核证据。 |
| 租户装修效果素材 | `services/tenant-rendering-publication/service.ts` 与 `20260913001512_publish_tenant_rendering_styles.sql` 校验权限、版本、来源/版权确认、尺寸/checksum，然后生成公开副本；未见内容审核通过条件。 | 公开副本生成和发布必须绑定同一已审核内容版本；人工勾选责任确认不能替代审核。 |
| H5活动页 | `services/marketing-pages/legacy/drafts.ts` 将草稿配置直接创建published版本；`pages.ts` 的标题/描述/封面更新另走路径。`public-h5.ts` 判断published及有效时间，未见内容审核条件。 | 审核活动文本、图片、嵌入素材和分享元数据，覆盖发布后元信息编辑；未通过不对外展示。 |
| 服务商公开资料 | 存在提交审核、平台发布权限、reviewer/version/remark。**`20260714230000_create_service_provider_publication_rpc.sql` 的 v_critical 不含 introduction；已published资料只修改简介时保持published，公开查询读当前introduction。** 本地migration检索未见后续覆盖此函数。 | 简介编辑也需重审或保留上次已审快照；需用migration修正。该问题为源码证据，本轮没有改生产简介复现。现有人审流程不能因此宣称全覆盖。 |
| 客户AI生图 | `workers/customer-rendering-job-worker.ts` 对Ark ContentPolicyViolation拒绝；未知提交/保存失败进入review_required；`services/customer-rendering/job-status.ts` 仅给所属身份的succeeded结果签私有短链。 | 这是一条独立的供应商拦截/私有结果路径，不能外推为图库/活动页/任意上传均已审核。对保存、转公开素材、分享后可见范围仍需专项验收，本轮未生成付费图片。 |

昵称/头像、客服/验收附件及其他分享入口仍需按实际公开范围完成清点与场景验收；不能一概视为公开，也不能因属于业务资料而认定免审。本回执不声称全站所有可编辑内容已核查通过。

建议先处理上述公开读取/编辑缺口，再开展服务端审核或同步停用的下一轮变更。此轮没有扩大关闭范围、改业务数据或虚构“违规/待审核/暂不可审核”接口契约；现有可对接码仍只有本次停用码。

## 5. 联合客户端验收与截图

已只读核对orange回执 `docs/miniprogram/2026-10-10-comment-suspension-frontend-feedback.md`：版本2026.10.10.1已上传；当前还没有取得其已设体验版及四类真机验收的确认。

| 身份/入口 | 此次证据 | 仍须补齐 |
| --- | --- | --- |
| 员工 | [开发者工具截图](../operations/evidence/2026-10-10-comment-suspension/employee-project-simulator.png)：项目日志与业务图片可见，当前屏幕无评论/评分入口；生产接口拒绝通过 | 体验版真机项目详情、客户跟进及历史缓存升级路径 |
| 客户 | 已验证真实客户绑定对应的独立评论接口拒绝、业务日志读取200 | 真机客户详情、无评论/评分/上传入口、登录状态保持截图 |
| 访客 | 已验证匿名/访客评论GET、访客POST及图片上传拒绝，图库列表正常 | 真机图库详情、点赞/收藏/分享回归截图 |
| 旧入口 | 直接调用旧GET/POST、parent_id回复、PATCH、上传init/complete及URL转换的服务端记录 | 旧分享路径/收藏页面/旧缓存/待发送队列的真机回归；403不清登录、不重试、不自动补发 |

截图明确为**开发者工具模拟器**，不是体验版真机。操作时开发者工具出现 `routeDone with a webviewId ... is not found`，界面读取发生严重阻塞；日志和截图均保留此事实，不据此认定为后端故障，也不继续标记其他角色UI通过。截图中的业务资料仅作内部验收证据，提交微信前由提审团队选择测试数据、适当脱敏。

提审前必须同时满足：所有停用入口与上传复核通过、历史图片访问/缓存闭环、剩余公开内容整改及验收、员工/客户/访客/旧入口真机截图齐备。体验版、提审版和正式版功能范围一致；本次没有安排提审。

## 可转发小程序团队

后端API/Admin已部署 `v2026.10.10.1`，生产37项检查通过。旧评论列表/发布/回复、超管恢复、三个评论图片scene的init/complete及public-url统一受限，正常停用码为403 `COMMENT_COMMUNICATION_DISABLED`；原有401/400仍保留。客户业务日志、访客图库读取正常。请按已上传2026.10.10.1补员工/客户/访客及旧入口的真机截图，重点确认403不退出登录、不重试、不补发，历史缓存不再展示评论。员工模拟器截图已附，但不能代替真机。历史签名图链部署后仍可在有效期内读取；公开项目日志、图库、效果素材、活动页及服务商简介编辑存在审核缺口，整体安全验收未通过，暂不重新提审。
