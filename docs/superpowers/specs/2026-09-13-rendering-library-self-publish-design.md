# 装修效果素材租户自助发布设计

日期：2026-09-13。状态：用户已确认。本文是
`2026-09-11-customer-rendering-library-design.md` 中阶段 B 的子规格，仅覆盖租户
自助发布、公开展示副本和双端浏览接口。

## 1. 目标与范围

租户管理员可以把已经上传并整理好的装修效果素材自行发布给客户浏览。微信和
抖音小程序通过各自的可信会话与租户上下文读取同一份已发布素材。

本阶段包含：

- 租户管理员发布、重新发布和隐藏素材；
- 私有源文件与公开展示文件物理隔离；
- 已发布元数据快照；
- 微信、抖音两套薄 controller 和共享浏览 service；
- Admin 发布确认、线上版本提示和隐藏确认；
- migration、API、Admin 的最小必要测试和联调合同。

本阶段不包含平台人工审核、第三方内容审核、客户家庭照片上传、生成任务、Worker、
真实方舟调用、生成建议和 orange 代码修改。租户自行发布并承担图片内容及版权
责任，产品界面不得写成“平台审核通过”。

## 2. 权限与发布前置条件

发布、重新发布和隐藏均要求当前员工属于目标租户，并同时具有
`rendering_library.read=all` 与 `rendering_library.manage=all`。平台身份不自动取得
租户发布权限。

服务端发布前必须重新验证：

- 素材未软删除，当前版本与 `expected_version` 一致；
- 私有源文件属于同一租户，状态为 active，且符合既有
  `rendering_style_source` 文件策略；
- 标题、空间、风格、来源类型、配色说明和材质搭配说明符合共享合同；
- `rights_confirmed=true`；
- 来源类型为 AI 概念图时继续保留该标识，不能展示成施工实景。

客户端提交的租户 ID、文件路径、公开 URL、发布状态和操作者信息一律不可信，也
不属于发布请求字段。

## 3. 数据模型和状态

`tenant_rendering_styles.status` 扩展为 `draft | published | hidden`。素材行保存当前
可编辑内容，同时增加一组不可由普通更新接口修改的发布快照：

- `published_title`、`published_space`、`published_style`；
- `published_color_notes`、`published_material_notes`、`published_source_type`；
- `published_file_id`；
- `published_version`、`published_at`、`published_by_employee_id`。

公开快照字段在首次发布前全部为空。发布成功后必须完整存在，且
`published_version <= version`。普通资料编辑只增加当前 `version`，不改公开快照；
因此已发布素材可以继续展示上一次发布内容。`version > published_version` 时 Admin
显示“有未发布修改”。

隐藏只把状态变为 `hidden` 并增加版本，保留发布快照和公开文件引用，以支持既有
任务快照和审计。隐藏素材不进入客户列表，也不能用于创建新任务。重新发布基于
当前版本生成新公开快照和新公开文件，不覆盖旧文件。

新增公开文件场景 `rendering_style_public`。公开文件仍登记在
`platform_file_objects`，必须满足：

- `tenant_id`、`owner_type=tenant`、`owner_id` 与素材租户一致；
- `visibility=public`、`status=active`、`mime_type=image/webp`；
- 对象路径为
  `public/renovation-styles/<tenant-id>/<style-id>/<version>.webp`；
- `public_url` 是由服务端存储配置产生的 HTTPS 地址，不接受客户端输入。

数据库结构、约束、索引、RPC、权限和初始化数据只能通过新的 forward migration
加入。migration 不删除私有源文件或历史公开文件；回退时先关闭发布入口并隐藏
公开查询，保留事实数据，后续通过 forward migration 修正。

## 4. 发布数据流和失败恢复

发布采用“外部对象先准备、数据库最后原子提交”的流程：

1. controller 校验 HTTP 参数并取得租户身份；
2. service 完成权限、版本、资料和私有源文件校验；
3. repository 创建状态为 `migrating` 的公开文件记录；
4. 存储 gateway 从受控的私有 COS 对象读取最多 10 MiB 的规范化 WebP，再写入新的
   公开对象；
5. 数据库 RPC 在同一事务内锁定素材，重新验证租户、版本、源文件和公开文件，
   激活公开文件并写入完整发布快照；
6. 返回最新素材及发布状态。

对象复制失败时，素材和原有线上快照保持不变，`migrating` 文件记录留作对账与
回收，不能返回发布成功。对象已经写入但数据库提交失败时，新对象仍不可被公开
素材查询引用；不得自动重复创建另一份副本。后续文件回收任务不属于本阶段。

同一素材版本和同一幂等键的重放返回首次结果，不再次复制。相同幂等键对应不同
请求摘要返回 409。不同请求基于旧版本发布或隐藏返回
`RENDERING_STYLE_VERSION_CONFLICT`。

## 5. Admin 交互

素材详情和卡片操作区增加以下状态化操作：

- 草稿或隐藏素材：显示“发布”；
- 已发布且没有新修改：显示“已发布”和“重新发布”；
- 已发布且存在新修改：显示“线上仍为上一版本”和“发布最新修改”；
- 已发布素材：显示“隐藏”。

发布确认弹窗汇总图片、标题、空间、风格、来源类型和版权确认，并固定显示：
“该素材将由本公司自行公开发布，本公司承担内容及版权责任。”未确认责任声明时
提交按钮不可用。

隐藏使用二次确认，并提示：隐藏会阻止新的客户浏览与生成，但不会删除历史引用，
也不能保证立即清除客户端或 CDN 已缓存的副本。请求执行期间禁用重复提交；409
冲突时加载服务器最新版本，不用本地数据覆盖。

## 6. 双端客户浏览接口

提供以下接口：

- `GET /visitor/renderings/styles`
- `GET /visitor/renderings/styles/:id`
- `GET /douyin-mini/renderings/styles`
- `GET /douyin-mini/renderings/styles/:id`

两套 controller 分别沿用现有微信访客会话和抖音客户会话校验，仅把可信
tenant/actor 上下文传给共享 service。浏览 service 只查询 `status=published`、未
删除且发布快照完整的素材。

列表支持 `page`、`pageSize`、`space`、`style`；默认 20，最大 100。数据库查询使用
明确字段、稳定的 `sort_order/id` 排序和 `.range()`，不得先读取全量数据再分页。
详情中隐藏或不存在的素材统一返回 404。

客户端 DTO 只包含：素材 ID、发布标题、空间、风格、配色说明、材质搭配说明、
来源类型、公开图片 HTTPS 地址和发布时间。不得返回租户 ID、私有源文件 ID、公开
文件 ID、对象路径、员工信息、当前草稿内容或内部版本。

已发布图片允许客户端和 CDN 按既有公共图片策略缓存。隐藏会立即停止 API 返回，
但不承诺撤回已经产生的外部缓存；发布和隐藏界面必须明确这一限制。

## 7. 错误与安全边界

所有错误经 `error-factory.ts` 包装，不透传数据库、COS、凭据、对象路径和 SDK
错误。稳定语义包括：

- 401：会话缺失或失效；
- 403：没有租户读取或管理权限；
- 404 `RENDERING_STYLE_NOT_FOUND`：素材不可见或不存在；
- 409 `RENDERING_STYLE_VERSION_CONFLICT`：素材版本冲突；
- 409 `RENDERING_STYLE_PUBLISH_IDEMPOTENCY_CONFLICT`：幂等键内容不一致；
- 422 `RENDERING_STYLE_NOT_PUBLISHABLE`：资料、授权或源文件不满足发布条件；
- 502 `RENDERING_STYLE_PUBLIC_COPY_FAILED`：公开副本创建失败；
- 503 `RENDERING_STORAGE_UNAVAILABLE`：存储配置不可用。

普通日志不记录 COS 签名、Key、私有图片内容、完整对象地址或客户信息。公开复制只
能读取 repository 返回且通过同租户策略校验的对象位置，不接受任意 URL，避免将
该能力变成服务端抓取器。

## 8. 验收标准

最小自动化和 smoke 证据必须覆盖：

1. migration 约束、索引、RLS/ACL、RPC owner 和幂等事实表；
2. 草稿首次发布、已发布内容编辑不影响线上快照、重新发布、隐藏和隐藏后重发；
3. 对象复制失败、复制成功但数据库失败均不会产生半发布状态或自动二次复制；
4. 旧版本并发发布/隐藏只有一个成功；相同幂等重放只生成一份公开副本；
5. 跨租户素材和文件不能发布或读取；无管理权限不能触发任何存储写入；
6. 双端列表分页、过滤、稳定排序、字段最小化和详情 404；
7. Admin 桌面与窄屏发布确认、未发布修改提示、隐藏确认、409 恢复；
8. API/domain/Admin 类型检查、相关 Bun 测试、文件大小检查和 diff check。

开发数据库应用前必须列明待执行 migration，应用后以
`supabase migration list` 核对 Local/Remote 对齐。真实 COS smoke 使用授权的开发
素材，验证公开 URL 可读、私有源 URL 仍不可匿名读取、隐藏后 API 不再返回；不把
缓存立即失效作为验收条件。

本阶段只在 gooes 中提供微信接口合同和 smoke 步骤，不修改
`/Users/leefo/Public/work/orange`。
