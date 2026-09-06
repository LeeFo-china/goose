# 租户抖音线索组件配置设计

## 背景与目标

抖音线索组件的 `clue_component_id` 由目标小程序在抖音开放平台创建，
仅能用于创建它的那个小程序。平台全局只负责第三方组件、手机号解密私钥和
模板能力；每个商家的线索组件开关与组件 ID 应由对应租户在自己的抖音小程序
工作台维护。

本次为租户 Admin 增加手机号留资方式配置，支持在抖音官方手机号授权和现有
短信验证码之间切换。关闭、缺少有效配置或更换授权小程序时，统一使用短信验证。

当前首个配置对象：

- 授权小程序 AppID：`ttd033a68e4e56ccd301`
- 线索组件 ID：`5785490b6443ad9def6f88e69c57920c`

组件 ID 不是密钥，可以显示给具备租户抖音小程序管理权限的员工，但不得跨
授权小程序复用。

## 方案选择

采用“租户维护、平台提供技术底座”的方案：

- 租户 Admin 管理当前授权小程序的留资方式和组件 ID。
- 平台超管不再承担逐租户录入职责，只展示全局技术能力是否就绪。
- 当前使用手动录入。抖音虽然在文档目录列出线索组件查询 OpenAPI，但公开接口
  合同不完整，暂不猜测接口地址或响应结构。
- 将来官方查询接口稳定后，可在相同租户配置区增加“同步线索组件”，不改变配置
  归属和小程序运行合同。

不采用平台超管逐商家配置，因为该模式容易把组件 ID 绑定到错误 AppID，也让
平台人员承担商家经营配置。不采用只依赖自动同步，因为目前没有可验证的官方
接口合同。

## 数据与合同

`douyin_miniapp_installations.runtime_config.features` 继续作为小程序当前运行模式
真值；安装记录新增 nullable `clue_component_id`，专门保存当前 AppID 的组件 ID。
这样关闭功能时 `runtime_config` 可恢复为旧版完全兼容的短信结构，同时独立列仍
保留 ID，方便再次开启。

新增 forward migration：

- 增加 nullable `clue_component_id`，约束为既有 1..128 位安全格式。
- 从已经启用官方手机号的历史 `runtime_config` 受控回填组件 ID。
- 新增 service-role-only、`SECURITY DEFINER` 的原子更新 RPC。
- RPC 在一把 scoped row lock 内校验 tenant、installation、AppID、active merchant、
  `expected_updated_at` 和组件 ID，再同时更新独立列与 `runtime_config.features`。
- 表级 ACL 不扩大；PUBLIC、anon、authenticated 不可执行 RPC。

官方手机号模式仍要求 `sms_lead=true`、`douyin_phone=true`、
`phone_capture_mode=douyin_phone` 且把独立列中的组件 ID写入运行配置。短信模式写回
既有无组件 ID 的严格结构，保证旧版 API、Admin 和小程序滚动升级兼容。

新增租户接口：

```text
PATCH /tenant/douyin-miniapp/lead-capture-config
```

请求只允许：

- `authorizer_appid`：调用者当前看到的授权小程序，用于防止换绑竞态。
- `enabled`：是否启用抖音官方手机号授权。
- `clue_component_id`：关闭时可为空；开启时必填并符合既有严格格式。
- `expected_updated_at`：当前安装记录版本，用于乐观并发控制。

响应只返回当前 AppID、留资方式、组件 ID、是否启用和新 `updated_at`。

服务端必须校验租户、`douyin_miniapp.manage` 权限、当前活动 merchant 安装、
AppID 精确匹配和 `updated_at` 精确匹配。repository 只调用原子 RPC，由数据库按
tenant、installation、AppID 和 compare-and-swap token 防止越权或覆盖并发修改。

任何数据库错误使用固定业务错误包装，不返回 Supabase 原始信息。

## 换绑与回退

同一个 AppID 下关闭开关时保留组件 ID，运行模式立即切回短信验证码。

租户授权另一个 AppID 时，授权完成逻辑可以继承品牌、主题和内容展示配置，但
必须清除旧组件 ID，并把留资方式重置为短信。旧 AppID 的组件 ID 绝不能复制到
新安装。

小程序 bootstrap 仍以服务端规范化后的 `runtime_config.features` 为唯一真值：

- `douyin_phone=true` 且组件 ID 合法：渲染官方手机号授权入口。
- 其他情况：渲染短信验证码入口。

## 租户 Admin 交互

在抖音小程序工作台增加“手机号留资”设置区，保持现有后台的紧凑卡片和表单
模式：

- 显示当前授权小程序 AppID，避免把 ID 配到错误小程序。
- 使用 Switch 控制“抖音官方手机号快捷留资”。
- 开启时显示线索组件 ID 输入框、配置指引和保存按钮。
- 关闭时输入框仍可查看和编辑，保存后小程序回退短信验证码。
- 未授权、授权失效或没有管理权限时只读/禁用，不提供误导性保存操作。
- 保存期间禁用相关控件；成功后使用服务端返回的新 `updated_at` 更新本地状态；
  冲突时重新加载工作台，不静默覆盖。
- 明确说明组件 ID 来自当前小程序的抖音开放平台，不显示平台密钥或手机号私钥。

## 验证

- Domain：旧短信配置、新短信保留 ID、官方手机号配置、非法组合和额外字段。
- API schema/controller/service/repository：严格请求、权限、租户/AppID作用域、
  开启必填、关闭保留、CAS 冲突、错误脱敏。
- 授权回调：更换 AppID 后品牌配置保留，但官方手机号配置被清除并回退短信。
- Admin：开关、条件校验、权限、loading/error、冲突刷新和窄屏布局。
- Mini compatibility：关闭显示短信；开启且 ID 合法显示官方授权；旧配置继续解析。
- 完成后运行 domain build、API focused/check、Admin focused/check、Mini focused/check
  和 diff/file-size 检查。

## 发布与回滚

发布顺序为 migration、API、Admin，再由租户工作台保存配置；最后重新打开或刷新
抖音小程序验证 bootstrap 和官方授权按钮。migration 应用后需核对 Local/Remote
对齐、RPC ACL、旧配置回填和真实 CAS。

回滚时先通过当前接口关闭租户开关，即可让旧版客户端继续使用短信验证码；新增
nullable 列不会影响旧代码。已应用 migration 不回改，若 RPC 或约束有缺陷只用
新的 forward migration 修复。破坏性回滚需先停用官方手机号、导出组件绑定，再
撤销 RPC；不删除组件绑定历史。
