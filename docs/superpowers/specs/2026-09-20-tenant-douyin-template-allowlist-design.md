# 租户抖音小程序模板白名单选择设计

## 背景

抖音第三方小程序的提交代码接口允许服务商从自己的模板库中指定 `template_id`，再为授权小程序生成测试版。Gooes 当前只允许平台超管确认一个“当前可发布模板”，租户端虽然已有版本工作区，但新建测试版时只能使用该唯一当前模板，不能从平台认可的多个稳定版本中选择。

本次改造把“平台唯一当前模板”扩展为“一个推荐模板加多个租户可选模板”。租户仍然不能提交任意模板编号，也不能跳过体验、提审和审核流程。

## 目标

- 平台超管可以维护租户可选模板白名单。
- 最新确认模板自动成为推荐模板并进入白名单，既有白名单模板不会因此自动失效。
- 租户可以选择任一仍在白名单中的模板生成测试版，包括平台明确保留的旧版。
- 版本身份以部署模板记录 UUID、`template_id` 和 `template_version` 共同确认；版本字符串只用于展示。
- 已上线过的旧模板可以作为新的发布周期重新上传、测试、提审和发布，历史发布记录保持不可变且可追溯。
- 所有列表接口分页，所有写请求在服务端重新验证权限、模板状态和租户归属。

## 非目标

- 不向租户开放抖音第三方平台完整模板库。
- 不允许租户手工输入 `template_id` 或版本号。
- 不提供绕过抖音审核的直接发布能力。
- 不允许同一授权小程序同时存在两个未完成发布周期。
- 不自动批量升级全部租户。
- 不修改 orange 小程序仓库。

## 方案比较

### 方案一：继续只有一个当前模板

实现最简单，但不能满足租户指定稳定版本的需求，也无法让平台逐步灰度新模板。

### 方案二：平台白名单加推荐模板

平台保留一个 `is_current=true` 的推荐模板，同时允许多条记录 `is_tenant_selectable=true`。租户只能读取和选择白名单记录。该方案支持灰度、受控回退和版本下架，且继续由平台控制风险。

### 方案三：租户直接读取抖音模板库

自由度最高，但会暴露未验收模板、扩大权限边界，并使版本兼容性和紧急下架无法控制。

采用方案二。

## 数据模型

在 `douyin_miniapp_deployable_templates` 增加：

- `is_tenant_selectable boolean NOT NULL DEFAULT false`
- `selectability_updated_at timestamptz NOT NULL DEFAULT now()`
- `selectability_updated_by_employee_id uuid NULL REFERENCES employees(id)`

迁移将现有 `is_current=true` 的模板回填为可选。确认最新模板时：

1. 新模板成为唯一推荐模板；
2. 新模板自动设为租户可选；
3. 旧推荐模板保留原有可选状态，不自动下架。

平台超管可以启用或停用历史模板。推荐模板不能直接停用；需先确认新的推荐模板，再停用旧模板。数据库 RPC 在行锁内校验该规则，并只向 `service_role` 授权。

为支持已上线模板重新进入一个新的发布周期，`douyin_miniapp_releases` 不再以 `(installation_id, template_id, template_version)` 作为永久唯一键。新的原子上传 RPC 按以下规则工作：

1. 锁定安装记录，确保同一安装串行创建发布周期；
2. 若该精确模板存在未完成或可恢复的发布周期，复用该记录，保证重复点击幂等；
3. 若最近一次精确模板发布已经 `released`，创建新的发布记录；
4. 继续保留“每个安装最多一个未完成发布”的部分唯一索引；
5. 历史 `released` 记录不修改、不覆盖。

新发布记录增加 `deployable_template_id uuid` 外键，记录本次选择的白名单模板。历史记录按 `template_id`、`template_version` 和 `channel` 尽量回填；无法唯一匹配的历史记录保留为空，不猜测关联。

迁移必须包含脏数据预检、索引调整、RPC 权限重建和前向回滚说明。回滚时先关闭租户模板选择入口并恢复单一推荐模板读取；已经产生的发布周期和审计历史不得删除。

## 后端接口

### 平台模板列表

```text
GET /platform/douyin-miniapps/deployable-templates
  ?channel=default&page=1&pageSize=20
```

返回分页模板记录，按推荐模板优先、确认时间倒序排列。字段包括记录 ID、模板 ID、版本、描述、推荐状态、租户可选状态、确认人与状态更新时间。

### 平台修改白名单

```text
POST /platform/douyin-miniapps/deployable-templates/:templateRecordId/selectability
```

请求体：

```json
{
  "is_tenant_selectable": true,
  "expected_is_tenant_selectable": false
}
```

使用期望状态做并发校验。状态已被其他管理员修改时返回 `409 DOUYIN_TEMPLATE_SELECTABILITY_CHANGED`；尝试停用推荐模板时返回 `409 DOUYIN_CURRENT_TEMPLATE_MUST_REMAIN_SELECTABLE`。

权限继续使用 `platform.douyin_miniapp.manage`。

### 租户可操作版本

扩展现有接口：

```text
GET /tenant/douyin-miniapp/release-options
  ?page=1&pageSize=20&templatePage=1&templatePageSize=20
```

发布历史和模板白名单分别分页，响应增加 `template_pagination`，原 `pagination` 继续表示发布历史分页。服务端只返回 `channel=default` 且 `is_tenant_selectable=true` 的模板。

可操作列表包含：

- 所有当前页白名单模板，来源为 `confirmed_template`；
- 与抖音 `latest`、`audit`、`current` 阶段精确匹配的租户发布记录。

已经是当前线上精确版本的模板仍可展示，但不提供重复发布动作。平台白名单中的旧版若不是当前线上精确版本，则提供“生成测试版”动作。

### 生成指定模板测试版

将现有路径调整为语义明确的接口：

```text
POST /tenant/douyin-miniapp/releases/from-template
```

请求体：

```json
{
  "expected_template_record_id": "uuid",
  "expected_template_id": "78690"
}
```

旧路径 `/from-current-template` 在一个兼容周期内保留并调用相同服务，但只能接受当前推荐模板。新路径按记录 ID 查询模板，并验证：

- 模板属于 `default` 通道；
- 模板仍为租户可选；
- `template_id` 与请求中的期望值一致；
- 当前租户有有效授权和 `douyin_miniapp.manage` 权限；
- 当前不存在另一个未完成发布周期；
- 所选模板不是租户当前线上精确版本。

页面打开后模板被下架时返回 `409 DOUYIN_DEPLOYABLE_TEMPLATE_UNAVAILABLE`。请求中的模板 ID 与数据库记录不一致时返回 `409 DOUYIN_DEPLOYABLE_TEMPLATE_CHANGED`。

## Admin 页面

### 平台模板管理

在现有“抖音模板版本”页下方增加分页模板列表。每行显示：

- 版本号与模板 ID 后六位；
- 描述与确认时间；
- “推荐版本”状态；
- “租户可选”开关。

确认最新模板后刷新列表。切换开关期间只禁用当前行；409 时刷新该行并显示后端业务提示。推荐版本的开关保持开启且禁用，并说明“请先确认新的推荐模板”。

### 租户发布工作区

复用现有版本选择器，将多个白名单模板作为可生成测试版选项。显示文案区分：

- `推荐版本`
- `稳定可选版本`
- `旧版回退`
- `已发布`

选择旧版时，在主按钮附近显示提示：该操作会创建新的体验版并重新走审核，不会立即替换线上版本。租户确认正式发布时继续展示所选版本和模板 ID 后六位。

## 错误与安全边界

- 所有业务错误通过 `error-factory.ts` 包装。
- controller 只负责读取、Zod 校验、调用 service 和包装响应。
- repository 负责分页查询和 RPC；不得由 controller 访问 Supabase。
- 白名单状态必须在生成测试版的写请求中重新读取，不能信任页面缓存。
- 模板下架不终止已经进入测试或审核的发布周期；它只阻止创建新的发布周期。
- 不返回 access token、部署密钥、完整抖音响应或其他敏感字段。
- 同一租户同时创建两个版本时，数据库约束与 RPC 行锁共同保证只有一个成功。

## 验证标准

### Migration 与 repository

- 现有推荐模板迁移后自动可选。
- 确认新模板不会自动下架旧白名单模板。
- 推荐模板不能停用。
- 白名单列表使用 `.range()`，`pageSize` 最大为 100。
- 已发布的精确模板可以创建新的发布周期，历史记录不被覆盖。
- 同一未完成发布周期的重复请求保持幂等。
- 同一安装并发创建两个不同模板时只允许一个未完成周期。
- RPC 仅允许 `service_role` 执行。

### API

- 平台列表、白名单开关、租户模板分页均校验权限和参数。
- 租户不能选择未启用、错误通道或不存在的模板。
- 页面缓存模板被停用后，生成请求返回明确 409。
- 请求模板记录 ID 与 `template_id` 不一致时不上传代码。
- 旧兼容路径只能使用当前推荐模板。

### Admin

- 平台管理员能分页查看和切换非推荐模板。
- 租户能区分推荐、稳定、回退和已有发布记录。
- 选择回退版本时展示重新审核提示。
- 列表加载、空状态、并发冲突和无权限状态有明确反馈。

### 完整验证

1. migration contract 测试先红后绿。
2. repository、service、controller 和 Admin 组件测试先红后绿。
3. 运行 API 类型检查、构建和相关测试。
4. 运行 Admin check、构建和相关测试。
5. 在开发数据库应用 migration 前确认待执行文件，应用后运行 `supabase migration list` 验证 Local/Remote 对齐。
6. 使用测试授权小程序分别验证推荐模板、旧版白名单、下架冲突和重复点击，不记录 token、二维码内容或授权小程序隐私数据。

