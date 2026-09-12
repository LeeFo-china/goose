# 装修效果库 Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已完成的私有草稿、上传与批量预览 API 接入可日常操作的租户效果素材页。

**Architecture:** Server page 检查租户员工与 read=all，client 通过既有 `/api/backend` 代理请求，后台仍为权限最终来源。分页列表和预览分开加载，一页一次批量签名；上传队列只驻留当前页面内存，上传成功即保留 file_id，资料保存重试不再上传。单项编辑与删除使用 expected_version，不自动覆盖并发修改。

**Tech Stack:** Next.js 15、React 19、Tailwind v3、项目现有 shadcn/Radix、lucide-react、Bun、Playwright。不新增依赖。

## 已批准方向的界面细化

依据主设计 3.1，仅完成草稿阶段，不包含发布/审核/生成用量/客户咨询。读取 PRODUCT.md/DESIGN.md，impeccable product register、admin-design 和既有客户列表；design-taste-frontend 的营销布局不适用于本 Admin，不迁移设计系统。布局变化 3、动效 2、信息密度 6：图像承担识别，状态和操作稳定可扫读，动效仅用现有交互反馈。

- `/rendering-library`，菜单“装修效果库”位于租户业务组“营销活动”后，read=all，无 platform bypass。
- 20px 紧凑标题、简短说明与“上传素材”；提示“当前仅保存公司内部草稿，尚未向客户开放”。无假统计、发布按钮或 AI 演示数据。
- 空间、风格、状态筛选，默认 page=1/pageSize=20；筛选重置页码，前后页显示服务端总数。固定筛选/分页，网格区域内部滚动；桌面多列，窄屏单列，不把图片卡片再包在卡片里。
- 图片 4:3 固定占位，object-cover，详情 object-contain；图片下显示标题、来源/空间/风格、草稿或隐藏状态。预览失效显示可理解状态和“刷新预览”，不循环签名，不用 Next Image 公共缓存代理，不把签名 URL 写 localStorage。
- 上传作为页内任务面板，避免 20 张素材塞进小模态框。公共空间/风格/来源/授权声明，最多选 20 张、每张 10 MiB，只支持 JPG/PNG/WebP，服务端仍完整校验。逐项标题和处理状态；明确“上传中 / 保存资料中 / 已保存 / 失败”，不伪造百分比；按 1 个并发顺序处理，单项失败不阻止后续项。成功后可单独编辑全部标签和说明。
- 保存失败保留 file_id，只重试创建资料。上传失败允许显式重新上传，提示上次请求结果可能未知；不自动重试。FILE_USED 提示刷新列表核对，不当成成功，不换 file_id 绕过唯一约束。处理期间禁止修改队列/关闭；未保存队列关闭确认，离页提醒；撤销本地队列不承诺删除远端文件。
- 浏览器实测补充：Next App Router 的站内前进/后退不会触发 beforeunload。仅在上传面板安装 Navigation API 能力检测，对可取消的同文档 traverse 提供确认，确认后按真实 destination key 继续；不修改浏览器历史、不劫持路由器。跨文档沿用 beforeunload，未支持 API 或浏览器禁止取消时明确提示先保存/关闭上传再离页，不能承诺所有浏览器和强制退出都保留内存队列。[Navigation API 的取消限制](https://github.com/WICG/navigation-api/blob/main/README.md#restrictions-on-firing-canceling-and-responding)明确允许用户越过连续拦截；若需崩溃/强制离页恢复，需另行设计持久化，不纳入本阶段。
- 详情编辑面板使用现有 Dialog（含 title/description），可修改标题、空间、风格、配色、材质搭配、来源、排序。版本冲突保留本地输入，显式“加载最新资料”后才能再次提交，不能后台刷新版本自动覆盖。隐藏/删除有确认与明确影响，删除仅移出库，原图按现有保留规则处理，不声称立即删除文件。
- loading / empty / filtered-empty / error / retry / read-only / forbidden 均有状态；所有输入真实 label，错误关联 aria-describedby，键盘可操作，长标题/窄屏不溢出，semantic token 对比度不低于 AA。

## Task 1: Admin 数据合同、权限与私有代理

**Files:** 新建 `apps/admin/components/rendering-library/{contracts.ts,requests.ts,upload-queue.ts}` 及就近 Bun 测试；修改 `apps/admin/app/api/backend/[...path]/route.ts` 与原测试；新增 `apps/admin/app/(console)/rendering-library/page.tsx`、修改 `components/layout/menu-config.ts`。

- [x] 先写失败测试：平台/无员工/无 read/非 all 均不可读；manage 必须与 read=all 同时存在；合法 DTO/schema、分页不超过100；fetch失败固定前端提示；upload成功+create失败再次执行只调用create；FILE_USED不当成功；proxy JSON成功与错误都保持私有 no-store。
- [x] 共享 schema 导入 @gooes/domain，不复制枚举。list 使用现有 `{list,pagination}` 包装并校验边界。权限函数明确如下：

```ts
export function renderingAccess(session: AdminSession | null) {
  const tenantEmployee = Boolean(session?.tenant?.id && session.employee.id);
  const hasAll = (code: string) => Boolean(session?.permissions.some((p) => p.code === code && p.scope === 'all'));
  const canRead = tenantEmployee && hasAll('rendering_library.read');
  return { canRead, canManage: canRead && hasAll('rendering_library.manage') };
}
```

- [x] Request helper 使用 fetch(`/api/backend/tenant/rendering-library/...`, {cache:'no-store', ...})，复用 parseBackendJson，成功 data 经实际 schema 解析；不接收 tenant/model/url 参数；multipart用FormData仅file，不手写boundary。网络/解析错误不记录URL/响应体。
- [x] 上传单项运行顺序固定：验证字段 → 若无 file_id 执行 upload并立即通知状态保存ID → create({metadata,file_id,rights_confirmed:true}) → 保存成功。返回或上报失败时保留最近file_id。上传与create都不自动重试，不以捕获失败模拟成功。
- [x] Proxy 针对 `/tenant/rendering-library` 前缀，在最终response设置 `Cache-Control: private, no-store` 和 `Referrer-Policy: no-referrer`，包括缺失凭证/后端连接失败早返回；其他路由响应语义不变。新增测试验证成功和错误，不透传任意上游头。
- [x] Server page使用 getAdminSession +现有平台模式拒绝，未授权渲染明确提示且不挂载client。菜单 requirement read all、allowPlatformAdminPermissionBypass=false。
- [x] 执行 Bun 定向测试与 Admin `bunx tsc -p tsconfig.typecheck.json --noEmit --incremental false`。

## Task 2: 完整素材管理工作流

**Files:** 新建 `components/rendering-library/{library-client.tsx,library-filters.tsx,style-card.tsx,style-editor.tsx,style-fields.tsx,upload-panel.tsx,upload-item.tsx,use-library-data.ts}`，职责分别为状态组合、筛选、图片显示、编辑/确认、共享表单、队列编排、单项展示、列表/预览请求生命周期；就近 tests。单文件目标<300行，遵守现有行数硬限制。必要时将异步编辑动作独立 `style-mutations.ts`。

- [x] 先写失败的纯状态/SSR渲染测试：枚举中文映射完整、所有表单label、只读不出写按钮、空/错误状态、无发布入口、请求队列保留ID和进度；Playwright用例先建成可识别未实现功能的失败断言。
- [x] 实现上述界面细化。列表变化撤销或忽略迟到response，预览结果只属于当前列表，签名失败不隐藏metadata。刷新预览一次批调用当前页ids；读取失败可重试，禁逐卡请求。已结束的请求不覆盖新筛选数据。
- [x] 复用 Field/FieldGroup/FieldError、SelectGroup、Button、Badge、Skeleton、Empty、StatusAlert、Dialog、AlertDialog。仅布局class，保留token/字体；没有营销hero/新字体/图片生成/伪数据。字段校验沿用domain限制，标题为空及授权未勾选阻止提交且显示字段错误。
- [x] 队列处理中加同步ref锁防双击，不允许同一个项目重复并发；关闭/移除撤销blob URL，beforeunload listener严格清理，组件卸载停止调度后续项，不承诺撤销已发服务端操作。
- [x] 所有列表 mutation成功后刷新列表；末页删除后回退可用页；失败留在当前面板，409/404明确处理；成功结果更新version，未知提交不静默重试。
- [x] GREEN：运行新模块Bun测试、proxy测试、菜单权限相关回归、Admin静态类型/行数/diff检查。

## Task 3: 确定性浏览器验证与交付

**Files:** 新建 `apps/admin/playwright.rendering-library.config.ts`、`apps/admin/e2e/rendering-library-{mock-backend.mjs,mock-fixture.mjs,workflow.spec.ts}`；若需要按职责拆 `mock-handlers.mjs`/`test-helpers.ts`；更新实施记录。

- [x] 复用已有 `scripts/playwright-dev-server.mjs`，隔离端口3038/3988和 `.next-e2e/rendering-library`，不复用未知服务。仅loopback mock，不连真实API/数据库/COS/模型，不读取实际cookie/密钥。固定测试身份与完整服务状态响应仅位于e2e。
- [x] Playwright通过测试cookie+mock backend走真实Admin page和proxy；验证分页筛选、批量预览次数、选择两张图/一张资料保存失败/只重试资料不重新上传、编辑冲突保留输入和显式加载最新、隐藏/删除确认、只读/无权限、图片失效刷新、400px与1440px无横向溢出、键盘label/focus。
- [x] 图片展示用仓库已有非私密静态图片夹具或本地e2e Buffer，不取真实家庭照片。页面截图仅测试数据，保存 `test-results/rendering-library`，不提交生成产物。
- [x] 静态检查通过后再启动浏览器。检查截图和浏览器console，记录mock验证边界，不把mock通过称作真实后端联调。
- [x] 规格审查通过后质量审查；修复及最小回归；更新 `docs/superpowers/specs/2026-09-11-customer-rendering-library-progress.md` 的命令、事实、未验证边界。按阶段提交，不推送/部署/迁移。

## 验证命令

```sh
# apps/admin 内，先静态再浏览器
bun test --dots components/rendering-library
bun test --dots 'app/api/backend/[...path]/route.test.ts'
bunx tsc -p tsconfig.typecheck.json --noEmit --incremental false
node scripts/check-file-size.mjs
bunx playwright test --config=playwright.rendering-library.config.ts
# repo root
git diff --check
```

LightRAG 本轮依然502，代码和已提交方案为依据。Ark模型/审核配置、COS真实匿名拒绝、DB migration、真实跨租户联调继续作为上线前置条件，页面不绕过它们。
