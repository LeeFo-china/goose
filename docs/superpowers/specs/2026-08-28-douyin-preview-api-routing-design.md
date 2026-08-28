# 抖音商户体验版 API 路由设计

## 问题

抖音体验版运行时统一报告 `envType=preview`。旧模板据此固定访问开发 API，导致生产商户
体验版使用生产 AppID 和部署键访问开发环境，会话交换失败。

## 决策

- 服务器根据只读环境变量 `GOOES_DEPLOY_ENV` 生成商户版本的
  `extConfig.deployment_environment`。
- 仅允许 `development`、`production`，配置缺失或非法时禁止上传商户版本。
- 小程序开发工具始终访问开发 API。
- 商户体验版按 `deployment_environment` 选择开发或生产 API；字段缺失或非法时失败关闭。
- 正式版始终访问生产 API；为兼容已发布旧版本，缺失字段仍允许，显式开发目标则失败关闭。
- 旧 release 数据继续允许只含 `deployment_key`，新上传记录必须由应用写入部署目标。

## 发布顺序

1. 应用 migration，使上传 RPC 同时接受新旧 `extConfig`。
2. 部署 API，使新商户版本写入部署目标。
3. 将修复后的小程序源码上传为新模板并在平台确认最新模板。
4. 生成新的生产商户体验版，确认会话请求到达生产 API 后再提审。

旧模板包不可变，不能继续使用 `0.1.6` 验收生产商户。
