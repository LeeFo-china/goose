# 抖音 d301 扩展配置解析修复验收记录

## 结论

状态：`PASS`

2026-07-26，授权测试小程序 AppID 尾号 `d301` 已使用新模板完成
`0.1.2` 测试版冷启动和手机四页验收。开发 API 的 session、bootstrap
和事件链路全部成功，不再出现 `DOUYIN_INSTALLATION_MISSING`。

本次仅涉及开发环境、模板库、商家测试版和测试二维码；未执行数据库
migration、`db push`、repair、手工数据库写入、小程序提审、发布或生产操作。

## 根因

抖音原生 API `tt.getExtConfigSync()` 的官方返回结构使用
`{ extConfig: object }` 包装扩展配置。客户端原实现只解析 `raw.ext` 或
直接解析 `raw`，因此商家测试包虽然携带了服务端生成的
`deployment_key`，客户端仍会把部署配置读取为空。

缺少 `deployment_key` 时，`POST /douyin-mini/auth/session` 无法定位
商户安装，返回 `409 / DOUYIN_INSTALLATION_MISSING`。此前补齐 Template、
Component 和授权商户的 request 合法域名解决了网络到达问题，但不能解决
该客户端解析错误。

修复后解析优先级为：

1. 官方 `raw.extConfig`
2. 兼容结构 `raw.ext`
3. 兼容直接结构 `raw`

仍保留字符串 trim、最大 128 字符和非法类型拒绝门禁。

## 代码与验证

- 修复提交：`f194c554b3655ace1625517851c283d438fd2710`
- 提交说明：`fix(douyin): 修复扩展配置包装层解析`
- 目标文件：
  - `apps/douyin-mini/src/platform/ext-config.ts`
  - `apps/douyin-mini/src/platform/ext-config.test.ts`
- TDD 红灯：官方包装层读取为空、包装层优先级错误，共 2 个预期失败。
- 聚焦回归：9 pass / 0 fail。
- 完整小程序门禁：96 pass / 0 fail，286 项断言。
- TypeScript：`tsc -p tsconfig.json --noEmit` 通过。

修复提交已普通推送到 `feature/douyin-decoration-miniapp`，没有强推。

## 模板与商家测试版本

| 项目 | 结果 |
| --- | --- |
| Component AppID | 尾号 `cd67` |
| Template AppID | 尾号 `1b01` |
| IDE 模板上传版本 | `0.1.1` |
| 模板库 ID | `77595` |
| 保留的旧模板 ID | `77538` |
| 商家 AppID | 尾号 `d301` |
| 商家安装 UUID | `82061c96-29ac-4426-baff-5efc1061fbc8` |
| 商家测试版本 | `0.1.2` |
| Release UUID | `ea547440-fb61-41fa-bf1c-8c0a6304b646` |
| Release 状态 | `testing` |
| 测试入口 | `pages/home/index` |

二维码保存于本机
`/Users/leefo/Downloads/抖音-d301-测试二维码-0.1.2.jpg`，文件权限为
`0600`。CoreImage 解码和一次 HTTPS 短链跟随确认：

- AppID 尾号为 `d301`
- 嵌套商家版本为 `0.1.2`
- 启动页为 `pages/home/index`
- 版本类型为 `latest`

未记录二维码完整链接或短链参数。

## 开发 API 验收

用户于北京时间 `2026-07-26 16:13:24` 完成 `0.1.2` 冷启动扫码。
从该时刻开始的开发 API 容器日志脱敏汇总为：

| 请求 | 200 数量 |
| --- | ---: |
| `POST /douyin-mini/auth/session` | 1 |
| `GET /douyin-mini/bootstrap` | 1 |
| `POST /douyin-mini/events` | 3 |

同一窗口内：

- 上述三类请求的非 200 数量为 0。
- `DOUYIN_INSTALLATION_MISSING` 数量为 0。
- 日志未用于记录登录 code、JWT、请求头或用户标识原文。

## 安装、租户与事件归属

开发数据库只读查询使用必要字段、时间窗口和 `limit 100`。扫码窗口内共有
11 条 `douyin_miniapp` 事件，包含 `app_launch` 和 `page_view`：

- AppID 尾号：`d301`
- 安装类型：`merchant`
- 授权状态：`active`
- 租户 UUID：`51111111-1111-4111-8111-111111111111`
- 其他安装或其他租户事件数量：0
- 首条事件：北京时间 `2026-07-26 16:13:24`
- 末条事件：北京时间 `2026-07-26 16:13:32`

当前埋点路径证据包含首页；案例、工地和免费咨询页面由用户手机人工验收覆盖。

## 手机四页验收

用户确认以下项目全部通过：

1. 首页正常展示绑定租户的公开公司资料。
2. 案例页显示 `5H 验收项目 A`。
3. 工地页显示 `抖音模板联调测试小区`。
4. 免费咨询页能够正常打开。
5. 未出现“服务配置异常”或“网络开小差了”。

当前租户内部名称为 `5H 验收租户 AAA`，已发布服务商公开名称为
`5H 验收租户 A`。抖音小程序按设计读取
`tenant_service_provider_profiles.public_name`，不读取内部
`tenants.name`；因此内部租户名称变更不会直接修改小程序公开品牌名称。

## 安全边界

- 平台管理员手机号和短生命周期 JWT 仅在单个本机进程内使用，未输出、未落盘。
- 未读取或记录 deployment key、OpenID、session key、AppSecret、Ticket、
  消息 Token 或 AES Key。
- 未删除旧模板 `77538`，未覆盖旧商家 `0.1.1` 发布记录。
- 未操作 IDE 提审、开放平台审核、线上发布或生产环境。
- 所有数据库检查均为只读；没有新增 migration 或直接数据库写入。
