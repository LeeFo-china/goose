# Dev 环境小程序端与 Admin 端开发对接文档

日期：2026-05-17

## 1. 目的

本文面向微信小程序团队和 Admin 前端团队，用于统一 dev 环境联调口径。

dev 环境用于日常开发、跨端联调、数据库 migration 预演和上线前验收，不得承载真实客户业务。

## 2. 环境地址

| 服务 | Dev 地址 | 说明 |
| --- | --- | --- |
| API | `https://api-dev.goodcms.cn` | 小程序开发版、Admin dev 统一调用 |
| Admin | `https://admin-dev.goodcms.cn` | Admin dev 访问入口 |
| H5 | `https://h5-dev.goodcms.cn` | 预留给 H5 dev，当前按功能需要启用 |
| 生产 API | `https://api.goodcms.cn` | 仅生产端使用，开发联调禁止误连 |
| 生产 Admin | `https://admin.goodcms.cn` | 仅生产端使用 |

当前 dev smoke test：

| 检查项 | 结果 |
| --- | --- |
| `https://api-dev.goodcms.cn/` | `200 OK` |
| `https://admin-dev.goodcms.cn/login` | `200 OK` |
| API dev 容器 | `gooes-api-dev` healthy |
| Admin dev 容器 | `gooes-admin-dev` healthy |

## 3. 测试账号与基础数据

dev 数据库已从空库执行完整 migration，并导入幂等 seed。

| 数据 | 值 |
| --- | --- |
| 默认租户 | 默认装修公司 |
| 后台 dev 管理员手机号 | `19900000001` |
| 后台验证码 | dev 环境开启免验证码登录 |
| dev 客户手机号 | `19900001001`、`19900001002` |
| 租户积分账户 | 测试账户，`is_test=true`，初始测试积分 `1000000` |

后台 dev 登录验证结果：

```text
手机号：19900000001
角色：system_admin、platform_admin
权限数：53
```

seed 脚本位置：

```text
scripts/dev/seed-dev.sql
```

后端或运维需要重置 dev 基础数据时执行：

```bash
ssh -i docs/360video/goose.pem ubuntu@43.165.126.30 \
  'set -a; . /opt/gooes-dev/docker/.env.dev.db; psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1' \
  < scripts/dev/seed-dev.sql
```

## 4. 微信小程序端对接

### 4.1 基础配置

小程序开发版、体验版联调时，API base URL 必须切到：

```text
https://api-dev.goodcms.cn
```

生产小程序仍使用：

```text
https://api.goodcms.cn
```

建议小程序端按环境维护配置，不要在业务代码里硬编码：

```text
dev:  https://api-dev.goodcms.cn
prod: https://api.goodcms.cn
```

### 4.2 微信后台域名配置

小程序开发版如需要真机联调，需要在微信公众平台的开发配置中加入 dev 域名：

```text
request 合法域名：https://api-dev.goodcms.cn
downloadFile 合法域名：https://api-dev.goodcms.cn
uploadFile 合法域名：https://api-dev.goodcms.cn
```

如某些上传链路使用 COS 直传，还需要按后端返回的签名 URL 域名补充合法域名。小程序端不要手写 COS 域名，也不要拼接对象路径。

### 4.3 登录与租户上下文

小程序端仍按现有登录流程调用 dev API。后端会根据 dev 数据库中的身份、OAuth 和业务身份关系返回对应登录态。

联调要求：

- 不要传生产 token 到 dev API。
- 不要把 dev token 用到生产 API。
- 不要在小程序端额外传 `tenant_id` 绕过后端租户上下文。
- 如果需要绑定微信、解绑微信、换绑申请等测试，应使用 dev 微信开发版环境，不复用生产 openid 数据。

### 4.4 文件上传与图片预览

小程序端文件上传应继续使用后端提供的上传入口或签名 URL 流程。

对接原则：

- 上传前由后端生成上传策略、对象 key 或签名 URL。
- 上传完成后调用后端 complete 接口，让后端登记文件对象和业务归属。
- 图片展示使用后端返回的可访问 URL。
- 不要在小程序端拼接 COS 公网域名、CDN 域名、bucket 名或对象 key。

这样可以保证 dev/prod 存储策略、签名有效期和访问权限由平台统一控制。

### 4.5 小程序联调验收

每次切到 dev 环境后，小程序团队至少验证：

1. 打开小程序开发版，所有请求命中 `api-dev.goodcms.cn`。
2. 登录后能进入正确的员工态、客户态或访客态。
3. 项目、施工日志、工序验收、评论、图片上传等业务不访问生产 API。
4. 图片上传后能立即预览，刷新页面后仍可展示。
5. 无权限场景能展示后端返回的业务错误，不吞掉错误码。

## 5. Admin 端对接

### 5.1 访问入口

Admin dev 地址：

```text
https://admin-dev.goodcms.cn/login
```

登录测试账号：

```text
手机号：19900000001
验证码：dev 环境免验证码
```

### 5.2 API 地址

Admin dev 镜像构建时已经注入：

```text
NEXT_PUBLIC_GOOES_API_BASE_URL=https://api-dev.goodcms.cn
NEXT_PUBLIC_GOOES_H5_BASE_URL=https://h5-dev.goodcms.cn
```

容器内服务端请求使用 Docker 内网：

```text
GOOES_API_BASE_URL=http://gooes-api-dev:3000
```

Admin 端开发要求：

- dev 页面所有浏览器侧 API 请求必须命中 `https://api-dev.goodcms.cn`。
- 不要在 dev 构建中引用 `https://api.goodcms.cn`。
- 如果新增 H5 预览、活动链接或 web-view 链接，dev 环境优先使用 `https://h5-dev.goodcms.cn`。

### 5.3 发布 Admin dev

通过 GitHub Actions 手动触发：

```text
Workflow: Deploy Dev
Branch: feature/multi-tenant
service: admin
```

当前 workflow 会：

1. 在腾讯云 self-hosted runner 构建 `goose-admin:dev`。
2. 推送到腾讯 CCR。
3. 登录 dev 服务器。
4. 执行 `docker compose pull && up -d --force-recreate`。
5. 检查 `https://admin-dev.goodcms.cn/login`。

不要只在服务器上执行 `docker restart gooes-admin-dev`，这样不会拉取新镜像。

### 5.4 Admin 联调验收

Admin 每次发布 dev 后至少验证：

1. `https://admin-dev.goodcms.cn/login` 返回 200。
2. 使用 `19900000001` 可登录。
3. 登录后租户为默认装修公司。
4. 平台页可见平台超管入口。
5. 租户页、客户页、员工页、计费页等请求不误打生产 API。
6. 图片上传、预览、签名 URL 展示等文件能力正常。

## 6. 后端与数据库协作口径

### 6.1 Migration

涉及数据库结构变化时，顺序必须是：

1. 本地新增 migration。
2. 本地验证。
3. 推送到 dev Supabase。
4. Admin、小程序、后端在 dev 环境验收。
5. 验收通过后再考虑生产 migration。

不要直接在生产 Supabase 控制台修改结构后不落 migration。

### 6.2 Seed

dev seed 必须满足：

- 可重复执行。
- 不插入真实客户手机号、openid、合同、凭证等敏感数据。
- 固定测试账号方便跨团队复现问题。
- 新增测试数据优先加到 `scripts/dev/seed-dev.sql`，不要只手动插库。

### 6.3 外部服务

dev 环境原则：

| 服务 | Dev 口径 |
| --- | --- |
| 短信 | 默认免验证码或 mock，不触发真实短信成本 |
| AI 计费 | 默认不真扣生产积分 |
| COS | 通过后端签名和文件对象登记控制，不在前端硬编码 |
| 微信 | 使用开发版/体验版，数据不复用生产 openid |
| 支付/打款 | 只做流程验证，不做真实付款 |

## 7. 常见问题

### 7.1 小程序为什么登录到了旧数据？

优先检查：

- 当前 base URL 是否仍指向 `api.goodcms.cn`。
- 本地缓存 token 是否来自生产环境。
- 开发版微信 openid 是否已经在 dev DB 里绑定过旧身份。

处理方式：

- 清理小程序本地 token。
- 确认请求域名是 `api-dev.goodcms.cn`。
- 如是绑定关系问题，由后端在 dev DB 排查 OAuth 和业务身份关系。

### 7.2 Admin 页面能打开但接口失败？

优先检查：

- 浏览器 Network 中接口是否请求 `api-dev.goodcms.cn`。
- API dev 容器是否 healthy。
- 当前登录 token 是否来自 dev API。
- 最近是否有 migration 未推到 dev DB。

### 7.3 图片上传成功但预览失败？

优先检查：

- 前端展示是否使用后端返回 URL。
- complete 接口是否调用成功。
- 文件对象是否登记到 dev DB。
- COS 签名 URL 是否过期。
- 小程序合法域名是否覆盖后端返回的 URL 域名。

## 8. 分工边界

| 事项 | 负责人 |
| --- | --- |
| dev API/Admin/Worker 部署 | 后端/运维 |
| dev DB migration 与 seed | 后端 |
| 小程序开发版切换 API base URL | 小程序团队 |
| 小程序合法域名配置 | 小程序团队 |
| Admin 页面联调与发布 | Admin 团队 |
| COS、短信、AI、微信等平台配置 | 后端/平台运维 |

## 9. 当前状态

截至 2026-05-17：

- `api-dev.goodcms.cn` 已可用。
- `admin-dev.goodcms.cn` 已可用。
- dev Supabase migration 已完成。
- dev seed 已完成并验证可重复执行。
- 小程序端不需要本仓库改代码，只需要按本文切换开发版配置并验收。
