# 抖音商家小程序扩展配置解析修复设计

## 背景

授权测试小程序 `d301` 的 `0.1.1` 测试版已经完成 request 合法域名配置。
手机冷启动后，请求能够到达开发 API，但
`POST /douyin-mini/auth/session` 返回
`409 / DOUYIN_INSTALLATION_MISSING`。

服务端堆栈表明请求已经找到商家安装记录，失败发生在
`deployment_key` 与安装记录的绑定校验。官方
`tt.getExtConfigSync()` 契约返回
`{ extConfig: object }`，当前客户端解析器只识别 `raw.ext`
或直接对象，因而无法从官方返回结构读取 `deployment_key`。

## 目标

让抖音原生小程序按官方同步 API 返回结构读取部署标识，同时保留现有兼容路径，
恢复 `d301` 商家会话交换，并保持部署标识校验和租户隔离不变。

## 非目标

- 不移除或放宽服务端 `deployment_key` 校验。
- 不修改数据库、migration、安装记录或发布记录。
- 不改变模板上传的 `ext_json` 结构。
- 不修改 API 地址、合法域名、回调、密钥或生产环境。
- 不修改 Orange 仓库。
- 不顺带重构启动、会话、存储或错误页逻辑。

## 方案比较

### 方案 A：兼容官方 `extConfig` 包装层

在 `readDeploymentConfig()` 中按以下优先级解析：

1. `raw.extConfig`
2. `raw.ext`
3. `raw`

只接受对象中的非空字符串 `deployment_key`，继续执行 trim 和 128 字符长度限制。

优点：

- 符合官方 `tt.getExtConfigSync()` 返回契约。
- 改动集中在客户端配置边界。
- 保留现有 IDE、旧基础库或测试桩兼容路径。
- 不降低服务端鉴权强度。

风险：

- 多种包装结构同时存在时需要确定优先级。

结论：采用本方案，以官方 `extConfig` 为最高优先级。

### 方案 B：改变模板上传的 `ext_json`

把 `deployment_key` 复制到更多层级，试图绕过客户端解析问题。

不采用原因：上传结构已经符合抖音模板代开发契约，问题发生在运行时 API
返回包装层；复制字段会制造重复事实来源。

### 方案 C：移除服务端部署标识校验

不采用原因：会让知道 AppID 的请求绕过商家安装绑定，破坏租户隔离。

## 详细设计

### 客户端解析

修改 `apps/douyin-mini/src/platform/ext-config.ts`：

- 将 `tt.getExtConfigSync()` 结果视为不可信外部输入。
- 若 `raw.extConfig` 为普通对象，则从该对象读取。
- 否则兼容 `raw.ext` 普通对象。
- 再否则兼容当前直接对象结构。
- `deployment_key` 必须是字符串，trim 后非空且长度不超过 128。
- 无效输入继续返回空配置，不引入异常或新的错误码。

### 数据流

```text
tt.getExtConfigSync()
  -> { extConfig: { deployment_key } }
  -> readDeploymentConfig()
  -> SessionManager.exchangeFreshSession()
  -> POST /douyin-mini/auth/session
  -> DouyinMiniappSessionService.exchangeMerchant()
  -> 与 d301 安装记录 deployment_key 精确匹配
```

### 安全边界

- 部署标识仍由服务端与安装记录精确比较。
- 客户端不记录、展示或上传除既有会话请求外的部署标识。
- 测试和日志不输出部署标识实际值。
- 不增加容错回退到 AppID-only 会话。

## 测试设计

先添加回归测试并观察失败：

- 官方结构 `{ extConfig: { deployment_key: "..." } }`
  应返回规范化后的部署标识。

保持或补充既有行为验证：

- `{ ext: { deployment_key: "..." } }` 继续兼容。
- 直接对象继续兼容。
- 空白、非字符串和超过 128 字符的值继续返回空配置。
- 当 `extConfig` 存在时优先于兼容包装层，避免歧义。

实施采用红—绿流程：

1. 只添加官方结构测试，运行并确认因返回空配置而失败。
2. 最小修改解析器。
3. 运行聚焦测试并确认通过。
4. 运行抖音小程序完整测试、类型检查和构建。

## 发布与验收

代码验证通过后：

1. 只提交本缺陷相关测试、实现、设计和实施计划。
2. 普通推送 `feature/douyin-decoration-miniapp`。
3. 以模板 `77538` 为 `d301` 上传商家测试版本 `0.1.2`。
4. 获取并解析新测试二维码，确认 AppID 尾号 `d301`、版本 `0.1.2`
   和首页路径。
5. 手机冷启动扫码。
6. 以开发 API 日志和开发库埋点证明：
   - `/douyin-mini/auth/session` 为 200；
   - `/douyin-mini/bootstrap` 为 200；
   - JWT/埋点关联安装为 `d301 / merchant`；
   - 页面展示绑定测试租户的数据。

若任一验证失败，停止继续提审或发布，并保留服务端部署标识校验。

## 回滚

代码回滚只需回退本次解析器与测试提交，再重新上传后续修复版本。
已发布的 `0.1.1` 测试版不删除；`d301` 与 `cd67` 的开发域名配置保持，
因为它们是商家测试版访问开发 API 的必要配置，不属于本缺陷回滚范围。
