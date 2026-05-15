# Admin 设计系统与页面整改规范

更新时间：2026-05-15

适用范围：`apps/admin`

参考来源：

- `docs/admin-ui-style-guide.md`
- `docs/2026-05-12-admin-list-page-layout-refactor-summary.md`
- `docs/2026-05-15-vben-admin-design-style-summary.md`

## 设计定位

Admin 是企业级业务后台，不是营销站，也不是数据大屏。页面应服务员工、租户管理员、平台超管的高频操作，核心目标是：

- 信息密度适中，便于扫描、筛选和比较。
- 操作路径明确，主操作突出，危险操作有确认。
- 布局稳定，骨架屏和真实页面结构一致。
- 视觉克制，使用 flat、轻边框、少阴影的工具型风格。
- 主题和状态使用语义 token，避免页面级硬编码颜色。

## 全局框架

默认框架采用：

- 左侧固定导航。
- 顶部轻工具栏。
- 中间业务内容区。
- 侧边栏底部展示当前登录身份。

全局能力应由布局或公共组件承载，不应在业务页面重复实现：

- 菜单和权限过滤。
- 登录身份展示。
- 内容宽度、紧凑模式、侧边栏折叠等用户偏好。
- 主题色、暗色模式等视觉偏好。
- 统一弹窗、表格、表单、附件预览和空态。

## 页面结构

### 列表页

列表页统一采用“页面概览 + 列表 Card”的两段式结构：

1. 页面顶部
   - 左侧：`h1` + 一句简短说明。
   - 右侧：当前页面主操作。

2. 指标区
   - 展示当前业务判断最有价值的 3-6 个指标。
   - 指标区不要堆砌无判断价值的数据。

3. 列表 Card
   - `CardHeader` 第一行：列表标题、筛选摘要、状态 Badge 或右侧轻操作。
   - `CardHeader` 第二行：筛选条件、搜索框、重置操作。
   - `CardContent`：表格。
   - `CardContent` 底部：分页和总数。

筛选条件必须放在它作用的列表 Card 内，不再作为页面级独立 Card。

### Tab 页面

Tab 页面采用“tab 融入内容 Card 头部”的结构：

- 页面顶部只保留标题、说明、主操作。
- 当前 tab 的指标区放在管理 Card 上方。
- TabsList 放入管理 Card 的 `CardHeader`。
- Tab 内容不再额外套一层 Card，内部需要分组时使用轻边框区块。

### 详情页和详情弹窗

详情结构优先采用：

1. 基础信息。
2. 明细列表。
3. 流程记录或审批链。
4. 附件、凭证、图片。
5. 操作记录。

详情内的重复 UI 必须抽公共组件，例如：

- 信息栅格。
- 审批时间线。
- 附件列表。
- 图片预览。
- 旋转、打开原图等媒体操作。

## 组件原则

优先使用现有组件：

- `Button`
- `Badge`
- `Card`
- `DataTable`
- `Dialog`
- `Field`
- `Input`
- `Select`
- `Textarea`
- `StatusAlert`
- `Empty`
- `Skeleton`

新增公共组件放在 `apps/admin/components/admin/`，shadcn 原始组件放在 `apps/admin/components/ui/`。

组件抽象标准：

- 至少被两个页面复用，或明显属于通用后台交互。
- 能统一间距、边框、空态、loading、可访问性。
- 不把业务接口、业务状态机塞进公共 UI 组件。

当前优先沉淀的公共组件：

- 图片预览：`RotatableImagePreview`
- 附件列表：`AttachmentList`
- 详情信息栅格：`DetailInfoGrid`
- 审批时间线：`ApprovalTimeline`
- 列表 Card 头部：`ListCardHeader`

## 颜色与主题

颜色必须优先使用语义 token：

- 背景：`background`
- 卡片：`card`
- 边框：`border`
- 主文本：`foreground`
- 次级文本：`muted-foreground`
- 主操作：`primary`
- 危险操作：`destructive`
- 成功状态：`success`
- 警告状态：`warning`

禁止在业务页面中散落 raw hex。确实需要品牌色时，应先沉淀为全局 CSS variable。

后续主题能力按 Vben 思路逐步扩展：

- 主色。
- 侧边栏色。
- 顶部栏色。
- 暗色模式。
- 紧凑模式。

第一阶段只做本地用户偏好，不写业务数据库。

## 表格规范

- 优先使用 `DataTable`。
- 短字段使用 `whitespace-nowrap`。
- 长字段使用 `truncate`。
- 状态字段使用 `Badge`。
- 操作列靠右，复杂操作使用 dropdown。
- 表格容器允许横向滚动，不强行压缩字段导致换行。
- 分页放在列表 Card 内，与筛选和表格保持同一查询上下文。

## 表单规范

- 新增和编辑优先使用 `Dialog`。
- 表单字段使用 `Field`、`FieldLabel`、`FieldError`。
- 校验使用 `zod + react-hook-form`。
- 提交按钮位于右下角。
- 异步提交时按钮内显示 loading。
- 错误使用 `StatusAlert`，文案要可操作。

## 动效规范

Admin 可以使用轻动效，但动效必须服务状态变化：

- 允许：hover、按钮反馈、弹层进入、tab 切换、loading、skeleton。
- 谨慎：大面积背景动画、粒子、3D、鼠标跟随。
- 时长：150-300ms。
- 必须支持 `prefers-reduced-motion`。
- 不允许动效影响表格、审批、上传、付款等核心操作效率。

React Bits 可以作为局部动效参考，但不作为后台整体风格基准。

## 偏好设置

第一阶段偏好设置只做本地体验：

- 侧边栏折叠。
- 内容宽度。
- 紧凑模式。
- 主题色。

偏好不写入业务表，不影响权限和数据。

后续如果要做账号级同步，再单独设计用户偏好表和接口。

## 骨架屏规范

`loading.tsx` 必须与真实页面结构一致：

- 真实页面是两段式，骨架屏也必须是两段式。
- 筛选骨架放在列表 Card 的 `CardHeader` 内。
- 分页骨架放在列表 Card 底部。
- 禁止保留独立筛选 Card，避免加载态和完成态跳变。

## 新增或整改页面检查清单

- 是否使用统一页面框架。
- 是否使用两段式或 tab 融合式结构。
- 筛选、表格、分页是否处于同一个列表 Card。
- 是否复用现有 shadcn/admin 公共组件。
- 是否使用语义 token，避免 raw hex。
- 表格短字段是否避免无意义换行。
- 操作列是否清晰，危险操作是否确认。
- 异步操作是否有 loading 和错误态。
- 空数据是否使用统一 Empty/Skeleton。
- 图片、附件、详情结构是否复用公共组件。
- 移动端是否不重叠、不溢出。

