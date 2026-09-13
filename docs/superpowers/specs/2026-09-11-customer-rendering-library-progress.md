# 客户效果库：分阶段实施记录

日期：2026-09-11；最新补记：2026-09-13。设计依据：
`2026-09-11-customer-rendering-library-design.md`，以及
`2026-09-13-rendering-library-self-publish-design.md`。

## 当前结论

截至 2026-09-13，租户素材**自助发布、公开副本、微信 visitor 与抖音客户浏览
接口、Admin 发布交互**已在隔离分支完成离线实现和 mock 回归；开发环境
migration、COS 原站合成样本 smoke 及 API/Admin 发布已完成，证据见
`../../operations/evidence/2026-09-13-rendering-library-self-publish-dev-release.md`。
双端已认证会话验收、小程序页面、客户上传与生图仍未完成。**不能据此称完整效果库上线**。
阶段 A 的真实模型能力验证也未完成。

以下 B1–B4、配置阻点和旧测试数字保留为 2026-09-11 的历史实施记录；最新
自助发布证据见文末“2026-09-13 自助发布阶段”小节。

工作区：`.worktrees/customer-rendering-library`；分支：`feature/customer-rendering-library`；起点：`b1d468a1d`。A1/B1 已于本轮提交为 `193ee4b3d`（`feat(rendering): 增加方舟适配与租户效果素材草稿管理`）；未推送或部署，未修改 orange。

## 已落地范围

| 文件 | 实际能力 |
| --- | --- |
| `packages/domain/src/customer-rendering.ts` | 首次 1 次、已验证手机号累计 5 次的额度投影；严格生成请求、分页、素材输入、启用预算和结构化建议合同 |
| `packages/domain/src/index.ts`、`shared.ts` | 导出同一套合同 |
| `apps/api/src/gateways/ark-rendering/` | 双图单张生图与原图/结果图视觉请求；超时、响应大小限制、脱敏错误、未知提交分类；无自动重试 |
| `apps/api/src/schema/ai-config.ts` | 创建/更新供应商时拒绝把 Ark 凭据形态的字符串填入秘密配置引用字段 |
| `apps/api/src/services/system-settings/legacy/definitions-ai-social.ts` | 注册平台专用 `ARK_API_KEY` 秘密配置项 |
| `supabase/migrations/20260911053027_add_ark_api_key_setting.sql` | 缺少全局配置槽时仅插入空秘密槽，不覆盖已有内容、不迁移暴露凭据 |

额度投影不是服务端准入机制；尚无数据库原子预占、手机号合并或真实扣次。Gateway 尚未接入业务路由或 Worker；模型、地址、主机授权须由后续可信服务端 resolver 提供，不能接收客户端任意配置。视觉返回文本仍需业务层用建议 schema 校验，不能直接展示。

## 开发配置核对与阻点

通过开发服务器只读数据库事务核对，未修改远端：

- 火山方舟供应商存在，协议为 `openai_compatible`，基础地址为 `https://ark.cn-beijing.volces.com/api/v3`。
- 该供应商下没有模型记录，尚未确定可用生图模型和视觉理解模型。
- `api_key_setting_key` 引用了不存在的系统配置，且值形态疑似真实凭据。当前网关按“配置名称”查找秘密，因此无法解析到可用 Key。
- 不在本记录保留疑似凭据。如果该值确为真实 Key，应在方舟平台轮换，后续通过平台加密秘密配置保存新 Key；供应商只引用 `ARK_API_KEY`。
- 当前开发服务器还没有本次新增的秘密槽定义；须先按正常 migration/部署流程发布，再安全保存凭据，不要把 Key 发到聊天或写入 SQL/Git。
- 现有文字网关直接 POST 完整 `endpoint_url`，不会自动追加 `/chat/completions`。本次未重写旧 Endpoint，也未实现设计中的 `api_base_url` 持久化字段。

用户需提供生图和视觉理解两个已开通模型 ID（不是密钥）。真实测试还须使用授权样本，并确认付费调用范围；不能使用生产客户家庭照片作为默认测试数据。

## 验证证据

执行位置为上述隔离工作区。API 测试必须从 `apps/api` 运行，以加载现有 `@/` 别名。

```sh
# apps/api：60 tests passed
bun test src/gateways/ark-rendering/client.test.ts src/schema/ai-config.test.ts src/services/system-settings/legacy/definitions-ai-social.test.ts src/services/ai-generation/openrouter-contract.test.ts

# apps/api：退出码 0
bun run typecheck

# packages/domain：13 tests passed
bun test src/customer-rendering.test.ts src/ai-generation.test.ts

# packages/domain：退出码 0
bunx tsc --noEmit

# 工作区根目录：退出码 0
git diff --check
```

所有网关测试使用注入的模拟响应和虚构凭据；测试不证明模型账号权限、双图效果质量、成本或真实供应商恢复能力。独立规格审查已通过；质量审查补充了 reservation-only、active-ID-only 和非法预算的回归测试。

审查还复现并修复了迟到响应泄漏：`Promise.race` 超时不终止内部执行，fetch 迟到后给已 aborted 的 signal 注册监听不会补发事件。修复在 fetch 返回后立即检查超时并取消响应体。回归从 `{ canceled: false, locked: true, calls: 1 }` 失败，变为 `{ canceled: true, locked: false, calls: 1 }` 通过，证明未重复调用且未留下锁定响应流。

本地 Docker daemon 不可用，未执行 migration 数据库验证；目前只有静态审查。未应用远端 migration，因此不声称 Local/Remote 已对齐。应用前须逐个确认待执行项，应用后以 `supabase migration list` 核对。该 migration 不删除数据；回退保留秘密槽和审计事实，不恢复疑似暴露凭据。

## 继续实施：B1 私有草稿管理

设计与执行计划：`../plans/2026-09-11-rendering-library-drafts.md`、`../plans/2026-09-11-rendering-library-api.md`。

- 新增 `tenant_rendering_styles` migration，素材文件使用租户复合外键，未删除素材禁止重复绑定同一原图。新增分页/过滤索引、RLS 和最小服务角色权限。
- 新增 `rendering_library.read/manage`，默认仅赋予活动租户管理员角色；与平台图库、客户咨询读取分开。服务端不将 self/department/assigned 范围自动扩大为 all。
- 新增共享草稿合同：仅 draft/hidden。修改带 expected_version，且只能修改元数据；只改标题不重置备注/排序，不能替换图片或设置发布/审核字段。
- 新增管理 Repository、Service 和六个自定义 HTTP 路由：列表、详情、创建、修改、隐藏、软删除；不挂载 BaseController 通用 CRUD。
- 所有数据库列表使用 tenant 过滤、显式字段和分页；修改使用 tenant/id/version 条件及版本递增。删除仅隐藏素材记录，当前不清理文件或次数事实。
- 创建只接受同租户、active、未删除、专用场景 `rendering_style_source`、private、10 MB 内的 JPEG/PNG/WebP 文件，且对象路径必须在 `private/renovation-styles/<tenant>/` 下。

以上为 B1 交付边界；后续 B2 已补齐专用上传和预览，并将草稿来源收紧为该通道规范化后的 WebP、租户 owner 和精确文件 ID 路径（见下节），不能用旧公开图库文件绕过。Admin 页面和客户端接口仍未接入。新路由是分支内代码，未部署，不是微信联调已发布接口。

存储核对发现：旧 `uploadImage` 始终登记 public；通用按路径取 URL 对 `private/` 前缀有阻断。因此专用私有上传不能复用旧公开上传入口，也不能仅把数据库 visibility 改 private 而保留可公开访问的对象路径。项目中未找到实际图片内容审核提供商；不能伪造审核通过或直接开放发布。公开展示副本仍按总设计在审核完成后单独建设。

新增 migration：`20260911054819_create_tenant_rendering_library.sql`，仅文件落地，未应用。`supabase/tests/tenant_rendering_library.sql` 是只读、回滚的目录断言脚本，验证 FK、RLS、ACL、索引、权限定义和触发器；当前未执行，不证明数据库并发行为。它也不强制将已有人工缩窄的角色权限改回 all。

继续实施期间再次只读核对开发方舟配置：模型列表仍为空，`referenced_secret_configured=false`；没有读取或输出 Key。相关联调前置条件未消除。

### B1 验证记录

```sh
# apps/api：75 pass、0 fail、347 assertions
bun test src/repositories/tenant-rendering-library.test.ts src/services/tenant-rendering-library/service.test.ts src/controllers/tenant-rendering-library/index.test.ts src/gateways/ark-rendering/client.test.ts src/schema/ai-config.test.ts src/services/system-settings/legacy/definitions-ai-social.test.ts src/services/ai-generation/openrouter-contract.test.ts
bun run typecheck

# packages/domain：203 pass、0 fail、1069 assertions；类型检查退出码 0
bun test
bunx tsc --noEmit

# apps/admin：退出码 0；本批没有修改 Admin 页面
bunx tsc -p tsconfig.typecheck.json --noEmit --incremental false

# 工作区根目录：均退出码 0
bun scripts/check-api-file-size.ts
git diff --check
```

新增三层 API 测试共 15 项、207 个断言，覆盖真实 service/access-policy 和查询构造。HTTP 测试只替换身份上下文与外部持久化，不证明真实 JWT 中间件或数据库事务行为。身份前置回归实测由未登录且参数错误时的 400，修复为优先返回 401，且六个接口均未触发 Repository。

B1a 数据基础和 B1b API 均已通过独立规格和质量审查。API 质量审查指出原测试仅抽查不存在的路由，现已通过真实 Fastify onRoute 精确断言六个管理 handler 对应的八个 method/path（含两个自动 HEAD）；临时添加额外 POST 路由实测触发失败，移除后通过，复审无剩余问题。目录断言未覆盖保留已有自定义授权时的全部角色授权组合，migration 本身的授权语句已静态审查，仍需隔离数据库验证。

## 继续实施：B2 私有上传与预览

执行计划：`../plans/2026-09-11-rendering-library-image-normalization.md`、`../plans/2026-09-11-rendering-library-private-files.md`。发布前清单：`2026-09-11-rendering-library-private-files-smoke.md`。

B2a 图片规范化已通过独立规格/质量审查，以及根 agent 的 40 项图片与品牌回归（63 assertions）。使用实际 sharp 解码 JPEG/PNG/WebP，修正 EXIF 方向、移除元数据并编码 WebP；输入与输出上限 10 MiB、解码总像素上限 4096²，拒绝动画 WebP/APNG、伪造 MIME 与损坏像素。质量审查的非阻断建议是将纯色方向测试补为不对称像素 fixture，进一步证明旋转方向；当前已验证尺寸交换与 EXIF 移除。

B2b 上传/预览已完成，独立规格与质量审查通过。新增 `POST /tenant/rendering-library/files`、`GET /tenant/rendering-library/files/:id/preview`；HTTP 上传、预览、保存草稿链路经过隔离测试。使用既有文件表状态，不新增 migration；本场景以 migrating 登记为不可用，写入私有对象成功后才激活。失败保留记录供核查，不自动删除未知写入；若激活已提交但响应丢失，数据库可能已经 active，不能把失败响应当作未提交证据。自动回收未实现。

本阶段未访问 COS 或真实模型。真实 bucket policy/CDN 匿名拒绝访问须在发布前验证，不能仅凭 `ACL: private` 参数推断已私有。仍没有 Admin 页面、审核与发布，也未应用此前 migration。

### B2 最终回归命令与证据

根 agent 在分支代码稳定后重新执行：API 范围回归 **233 pass / 0 fail / 844 assertions**；domain 全量 **204 pass / 0 fail / 1088 assertions**。API/domain/Admin 类型检查、文件大小检查和 `git diff --check` 均退出码 0。该结果不包含下述已知失败的全局路由清单测试，不是“全部仓库测试通过”。

```sh
# apps/api；这些占位值只满足既有模块初始化，不连接数据库或 COS
env SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_PUBLISH=test-publish-key SUPABASE_SERVICE_ROLE_KEY=test-service-role-key bun test --dots src/gateways/rendering-library-storage/client.test.ts src/services/rendering-library-files/image.test.ts src/services/rendering-library-files/service.test.ts src/controllers/tenant-rendering-library/files.test.ts src/controllers/tenant-rendering-library/index.test.ts src/repositories/tenant-rendering-library.test.ts src/services/tenant-rendering-library/service.test.ts src/gateways/ark-rendering/client.test.ts src/schema/ai-config.test.ts src/services/system-settings/legacy/definitions-ai-social.test.ts src/services/ai-generation/openrouter-contract.test.ts src/services/branding-image-metadata.test.ts src/services/branding-image-metadata-libvips.test.ts src/controllers/uploads/index.test.ts src/services/uploads.test.ts src/controllers/uploads/direct-object-key-access.test.ts src/services/tenant-service-capability-map.test.ts src/services/tenant-service-auth-call-boundary.test.ts
bun run typecheck
# packages/domain
bun test --dots
bunx tsc --noEmit
# apps/admin
bunx tsc -p tsconfig.typecheck.json --noEmit --incremental false
# 工作区根目录
bun scripts/check-api-file-size.ts
git diff --check
```

HTTP 测试使用真实 Fastify/multipart、图片处理、service、repository 查询构造与 COS 本地签名，只替换身份、数据库和 COS 网络边界。未经授权时 `request.parts` 调用计数为 0；非法 multipart/附加字段/超限/截断数据在任何存储写入前失败。真实文件写入、数据库状态迁移、JWT 与有效云端访问策略仍待发布前 smoke。

B2b 质量审查的非阻断覆盖建议已落实并复审通过：模拟激活已提交后响应丢失，先观察 upload 错误地在该未建模故障下成功（RED），再让数据库边界在状态修改后返回错误（GREEN）。测试证明应用返回固定 DB_ERROR，只上传/激活一次，保留已 active 的文件行及对应对象，不重试或删除。此改进仅修改测试，无生产逻辑变更。B2 代码、计划和本记录随同一后续提交保存，提交详情见功能分支 Git 记录。

## 继续实施：B3 当前页批量私有预览

计划：`../plans/2026-09-11-rendering-library-batch-preview.md`。新增 `POST /tenant/rendering-library/files/previews`，严格接受 1–100 个唯一 UUID。它是已知 ID 的有界查找，不是返回全部文件的枚举列表；一次明确字段/租户/ID/未删除过滤/limit 查询，完整验证所有文件的来源与私有资格后，才一次读取 COS 配置并创建签名实例。任意项无资格，整批不返回预览；按照请求顺序返回。POST 显式标为租户服务只读访问类别，不将只读预览误归类成写操作。

根 agent 最终定向回归为 **111 API tests / 860 assertions**，domain 全量 **205 tests / 1110 assertions**，均 0 fail，两边类型检查通过。审查发现 COS SDK `sdk/util.js:118` 以 `round(now/1000)-1` 为签名起点，原先毫秒计算的 advertised expiry 可能晚约 1 秒。真实 SDK 离线签名回归先复现单图与批量 2 个失败，随后统一按保守秒边界计算，到期时间不晚于任一真实签名的失效时间，10 个 service 回归 / 210 assertions 通过。同步 HTTP 旧的毫秒到期断言后重新完成上述 111 项回归。规格及质量审查均通过，未解决问题为零。

```sh
# apps/api，仍使用本地 dummy Supabase 初始化参数
env SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_PUBLISH=test-publish-key SUPABASE_SERVICE_ROLE_KEY=test-service-role-key bun test --dots src/gateways/rendering-library-storage src/services/rendering-library-files src/controllers/tenant-rendering-library src/repositories/tenant-rendering-library.test.ts src/services/tenant-rendering-library src/services/tenant-service-capability-map.test.ts src/services/tenant-service-auth-call-boundary.test.ts
bun run typecheck
# packages/domain
bun test --dots
bunx tsc --noEmit
```

Admin 代理私有头修复已提交 `fdbc512be`。根因是旧 JSON 响应仅复制 content-type，丢失后端的 no-store。新增精确匹配效果库路径的收尾处理，成功、拒绝、连接失败与重定向均使用 private/no-store 和 no-referrer；其他路径保持不变。4 个新增测试先复现 cache-control 为 null，修复后 9 项测试 / 35 assertions 通过，规格/质量审查均通过。没有修改旧上传或其他资源的缓存策略。

Admin 页面计划为 `../plans/2026-09-11-rendering-library-admin.md`。impeccable 的上下文检查确认已有 PRODUCT.md/DESIGN.md，沿用后台深蓝品牌、组件和产品密度；design-taste-frontend 明确排除 Admin，因此不引入营销 hero 或另一套 UI。浏览器先建立隔离 loopback mock 和测试数据，未实现页面时实际返回 404，首个工作流测试正确失败；后续结果见 B4。

本轮 LightRAG 仍返回502，以已提交方案和当前代码为准。未执行数据库 migration、COS 网络请求、真实生图、推送或部署；原上线前置条件不变。

## 继续实施：B4 Admin 内部素材管理

新增租户菜单及 `/rendering-library`，只允许公司员工且 read=all 读取，管理操作另需 manage=all，平台身份不自动绕过。界面只管理内部草稿/隐藏状态，没有发布或客户生成入口。

已实现分页/空间风格状态筛选、当前页一次批量私有预览、独立详情预览、最多20张的串行上传任务、逐图标题和授权确认、完整资料编辑及版本化隐藏/删除。上传成功立即保留 file_id，保存资料失败只重试创建；FILE_USED 不视为成功，也不换文件绕过。上传结果未知时不自动重传，删除只移出素材库，不承诺删除原文件。

规格和质量审查均已完成代码复核。审查推动补齐404明确提示及停止重复提交、409显式加载最新版本、上传授权/标题的就地错误关联。质量审查另发现取消旧预览后新列表失败会残留 loading，浏览器先复现失败，再在列表请求重置时清除状态。手机400px初版筛选竖排挤压首张图片信息，`toBeInViewport` 实际失败后改为紧凑三列，重新截图确认标题及操作完整可见。

站内后退实测会绕过 beforeunload，原代码直接卸载队列。现仅上传面板使用原生 Navigation API 的可取消同文档 traverse，提示继续整理或放弃；继续按真实历史 key 导航，不修改历史或全局路由。不支持 API、浏览器不允许取消或强制退出时不能保证内存队列保留，面板明确提示先保存/关闭上传。[浏览器规范的取消限制](https://github.com/WICG/navigation-api/blob/main/README.md#restrictions-on-firing-canceling-and-responding)不允许应用把用户困在页面中；持久化恢复不在本阶段。

### B4 验证

根 agent 最终定向 Bun 回归为 **31 pass / 0 fail / 148 assertions**（含20个效果库模块测试、菜单、既有代理及浏览器fixture合同测试）；Admin 类型检查、1573个TS/TSX文件行数检查、staged diff check均退出码0。最终完整 Chromium 工作流 **14 pass / 0 fail（45.2秒）**，含后退取消保留队列/历史不变、显式放弃后回原条目，以及80字符不间断长标题的窄屏检查。所有用例的 pageerror 断言为空。终端仅有环境 FORCE_COLOR/NO_COLOR 重复定义的非失败提示，不把无 pageerror 说成全部浏览器/真实云服务验证。

```sh
# apps/admin
bun test --dots components/rendering-library components/layout/rendering-library-menu.test.ts 'app/api/backend/[...path]/route.test.ts' e2e/rendering-library-mock-fixture.test.ts
bunx tsc -p tsconfig.typecheck.json --noEmit --incremental false
node scripts/check-file-size.mjs
bunx playwright test --config=playwright.rendering-library.config.ts
# 工作区根目录
bun scripts/check-file-size.ts --staged
git diff --cached --check
```

浏览器使用真实Next页面/代理与Chromium，后端仅loopback测试服务（3038/3988），预览图片使用仓库已有公开品牌图片，不含真实客户照片。检查桌面1440px、窄屏400px、空库、部分失败、长标题及离页确认截图；测试数据和后端只在e2e目录，没有生产假数据或新增依赖。截图保存在忽略的 `apps/admin/test-results/rendering-library/`，不提交生成物。

浏览器测试自身的两处竞态/假设也已定位：删除确认尚未关闭时，背景 article 因模态的 aria-hidden 被查询成0，提前读取事件导致漏算DELETE；改为等待确认关闭及列表恢复。已取消的后退不会产生load，`page.goBack()` 会等待超时；核对已安装Playwright的真实CDP类型后，以浏览器原生history entry操作触发后退，不等待假定成功的页面加载，并检查取消后历史未变化、确认后返回真实原条目（包括客户页动态pageSize参数）。没有为测试改动生产删除或路由行为。

本阶段仍未部署、执行migration、访问真实数据库/COS/Ark或改动orange；这些mock与离线测试不等于真实后端、存储策略或模型联调通过。

## 2026-09-13 自助发布阶段：Task 1–8 状态

批准设计：`2026-09-13-rendering-library-self-publish-design.md`；执行计划：
`../plans/2026-09-13-rendering-library-self-publish.md`。交接合同：
`../../operations/customer-rendering-style-catalog-api.md`。

| 任务 | 本地状态 | 交付边界 |
| --- | --- | --- |
| 1 共享合同 | 已实现 | `draft/published/hidden`、严格发布请求、公开 DTO/分页 schema；domain 回归覆盖边界 |
| 2 数据迁移与原子命令 | migration 和 SQL 断言已入库，**未应用** | 发布快照、公开文件关联、幂等事实/遗失键别名、租约及 begin/complete/fail RPC；只有静态合同测试，尚无真实 PostgreSQL 并发证明 |
| 3 COS 公开副本网关 | 已实现、仅离线测 | 私有 WebP 受限读取、校验 SHA256/大小、独立公开对象及 HEAD 恢复；未验证真实 bucket policy/CDN |
| 4 发布 repository/service | 已实现、仅模拟外部边界 | 双权限、资料/源文件校验、原子命令编排、未知写入保留 preparing、同键重放、并发后读；未真实提交 DB/COS |
| 5 租户发布 HTTP | 已实现 | `POST /tenant/rendering-library/styles/:id/publish`；严格 body 与现有身份边界 |
| 6 客户公开目录 | 已实现 | 一次带关系查询、显式字段、同租户发布快照过滤、数据库分页与最小 DTO |
| 7 微信/抖音浏览路由 | 已实现 | 各有列表和详情两个 session-only GET；404、参数和渠道身份回归 |
| 8 Admin 发布交互 | 已实现、mock 浏览器验证 | 责任确认、未发布修改、重新发布、隐藏缓存提示、重复提交/冲突恢复；发布前须加载并核对当前有效图片，过期自动刷新、挂起可重试，400px 窄屏 |

本阶段采用**租户自行发布**，不含平台或第三方人工审核。审核、真实客户生图
质量与费用不应由上述通过项推断。管理员确认的是本公司自行公开及版权责任；
AI 概念图保留 `source_type=ai_concept`。普通编辑只改当前草稿字段和版本，公开
目录读取发布快照；隐藏保留快照和旧公开对象，但立即从 API 查询结果排除，
外部缓存无法保证即时失效。新公开文件与私有源文件物理分离。

### Task 9 离线总回归（2026-09-13，最终修补后复跑）

在 `.worktrees/feat-customer-rendering-quota` 执行批准计划 Task 9 命令：

| 范围 | 结果 |
| --- | --- |
| domain 全量 Bun | 218 pass / 0 fail / 1221 `expect()`；40 文件 |
| domain 类型检查 | `bunx tsc --noEmit` 退出 0 |
| API 相关 Bun | 171 pass / 0 fail / 1568 `expect()`；19 文件 |
| API 类型检查 | `bun run typecheck` 退出 0 |
| Admin 相关 Bun | 42 pass / 0 fail / 161 `expect()`；8 文件 |
| Admin 类型检查 | `bunx tsc -p tsconfig.typecheck.json --noEmit --incremental false` 退出 0 |
| Admin Chromium | 36 pass / 0 fail，Playwright 报告总用时 1.6 分钟；CLI 不汇总断言数 |
| 文件大小 | Admin 1601 个 TS/TSX 文件 ≤500 行；API 检查通过，生成的 database types 为既有排除项 |
| 差异检查 | `git diff --check` 退出 0（文档提交前再次核验） |

API 单测使用虚构 Supabase 初始化值，实际数据库/COS 网络边界被模拟；
Playwright 使用真实 Next 页面、代理与 Chromium，但后端是 loopback mock。
这些结果**不证明** migration 已应用、真实 PostgreSQL 并发、COS 私有策略、
公开 URL 可匿名读取、CDN 隐藏效果或两端小程序已接入。浏览器运行出现
`NO_COLOR`/`FORCE_COLOR` 同时设置的非失败警告。

跨层审查后补齐了发布源文件失效的 `422 RENDERING_STYLE_NOT_PUBLISHABLE`
合同，以及 Admin 发布前的私有图片核对、过期刷新、挂起超时和提交时同步
校验。上述数字是这些修补后重新执行的结果。测试 mock 曾在一次独立审查运行中
因空批量预览请求体退出，单例及全量重跑通过；它仍是非阻断的测试设施健壮性
待办，不应据此宣称真实预览链路通过。

静态核对：controller 只解析 HTTP 并调用 service；发布 service 只通过
repository RPC 与 storage gateway 访问外部状态；公开目录使用显式字段、
一次关系查询、`tenant_id`/`status=published`/未删除过滤及 `.range()`，没有
每条素材再查文件的 N+1。公开 DTO 不含租户/文件/对象路径/员工/版本；错误
走 `Errors`。发布在存储准备后才由事务写快照；复制失败/未知响应不伪造成功，
租约和同键恢复有离线测试。真实安全性质仍以 Task 10 数据库/COS smoke 为准。
本阶段未修改 orange。

### 当前仍未交付及后续检查点

- Task 10：开发 migration、完整 Local/Remote 核对、隔离 SQL、合成图 COS 原站
  smoke 与 API/Admin 部署已完成；同租户微信/抖音已认证会话、最终 CDN、真实
  双连接并发及回滚演练尚未验收。具体边界见开发发布证据，不能把局部 smoke
  说成完整双端交付。
- 微信小程序 `orange` 与抖音客户端的目录页面、会话接入和真机验收由各自团队
  实施；gooes 只提供交接文档与后端接口。本阶段没有改 orange。
- 客户房型/房间照片上传、一次免费/手机号后最多五次的**服务端准入**、生成任务
  Worker、Ark 实图/视觉建议、计费及审核，均属于后续独立阶段，不能把共享
  quota schema 或此目录当作已上线能力。

## 2026-09-11 时点的历史待办（以下不代表最新状态）

### 扩展回归发现的既有失败

继续 B2 时额外运行 `tenant-service-route-inventory.test.ts`、`tenant-service-capability-map.test.ts`、`tenant-service-auth-call-boundary.test.ts`：42 pass、1 fail。失败仅在路由清单，实际多出 `/douyin-mini/customer-auth/authorize-phone`、`sms/send-code`、`sms/verify`、`select` 四个路由。根因是这些既有路由直接 `fastify.post(path, handler)` 注册，没有访问类别 metadata，且清单测试的例外列表未收录。

上述 controller 和测试相对起点 `b1d468a1d` 没有变化。在主工作区实际 HEAD=`b1d468a1d5268c968e65a747e90ca0294d1cd1de`，使用本地虚构 Supabase 环境变量独立重跑同一 inventory 测试，也得到相同四个差异（0 pass、1 fail、1674 assertions）。没有改动主工作区文件，没有修改例外列表或抖音认证行为。这是已有回归问题，不声称全部仓库测试通过；其访问分类应另行核对专用抖音会话规则后修正。

### 后续阶段

- 阶段 A：可用模型/新秘密配置、真实双图与看图样本、尺寸/费用/审核/未知结果恢复验证。
- 阶段 B：实际 migration 应用/数据库与 COS 策略验证、文件回收、内容审核/公开发布和客户浏览接口；私有草稿、上传/预览后端、批量预览及Admin内部管理已完成本地验收，证据见B4，不能等同于完整 B 阶段交付。
- 阶段 C：身份及验证手机号、数据库并发额度/预算预占、跨渠道合并和频控。
- 阶段 D：持久化任务/Worker、私有 COS 转存、内容审核、建议校验/重试、费用核销。
- 阶段 E/F：抖音体验页、咨询授权与线索、微信接口交接、灰度及提审。

这些阶段需按设计分别形成可执行的小步计划。当前合同不能作为“接口已发布”的微信联调通知，不能打开面向客户的生成开关。
