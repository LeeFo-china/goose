# 本机快速开发与 dev 环境联调

## 目标

减少 Admin 小改动等待 dev Docker 镜像构建的时间。日常按钮、布局、表格、弹窗、tooltip 等 UI 调整，优先在本机热更新验证；通过后再 push 触发 dev 部署，供多人和小程序团队联调。

## 推荐分层

| 场景 | 推荐方式 | 是否需要 push |
| --- | --- | --- |
| Admin 纯 UI 调整 | 本机 Admin + 远端 dev API | 否，验收后再 push |
| Admin 调接口但后端未变 | 本机 Admin + 远端 dev API | 否，验收后再 push |
| API 业务逻辑调整 | 本机 API + 本机 Admin | 不一定，接口自测通过后再 push |
| Worker、上传、COS、计费、权限等链路 | 本机初测 + 共享 dev 环境验收 | 是 |
| 数据库 migration | local/dev DB 逐级验收 | 是，且需单独 migrate |

## Admin 本机连接 dev API

最快启动方式：

```bash
pnpm admin:dev:remote-api
```

访问：

```text
http://localhost:3010/login
```

dev 登录账号：

```text
平台超管：19900000003
租户管理员：19900000001、19900000002
验证码：dev 环境免验证码
```

该命令等价于：

```bash
GOOES_API_BASE_URL=https://api-dev.goodcms.cn \
NEXT_PUBLIC_GOOES_API_BASE_URL=https://api-dev.goodcms.cn \
NEXT_PUBLIC_GOOES_H5_BASE_URL=https://h5-dev.goodcms.cn \
pnpm --dir apps/admin dev
```

也可以复制示例 env：

```bash
cp apps/admin/.env.local.example apps/admin/.env.local
pnpm --dir apps/admin dev
```

`apps/admin/.env.local` 已被 `.gitignore` 忽略，不能提交真实本地配置。

## API 本机开发

改后端接口时，先本机跑 API：

```bash
bun run api:dev
```

当前本机 API 环境文件位置：

```text
apps/api/.env
```

该文件从 dev 服务器 `/opt/gooes-dev/docker/.env.dev.common` 和 `.env.dev.api` 合并生成，并追加了本机覆盖项：

```text
NODE_ENV=development
PORT=3000
SERVICE_NAME=gooes-api-local
LOG_LEVEL=debug
```

然后让本机 Admin 指向本机 API：

```bash
GOOES_API_BASE_URL=http://localhost:3000 \
NEXT_PUBLIC_GOOES_API_BASE_URL=http://localhost:3000 \
NEXT_PUBLIC_GOOES_H5_BASE_URL=https://h5-dev.goodcms.cn \
pnpm --dir apps/admin dev
```

注意：

- 本机 API 需要完整 dev 环境变量，例如 Supabase、JWT、COS、配置加密 key。
- 不要把生产 Supabase、生产 COS 或生产密钥复制到本机开发 env。
- 如果接口涉及短信、AI 扣费、视频转文本等成本型能力，本机优先使用 dev/mock/试算配置。

本机 Admin 环境文件位置：

```text
apps/admin/.env.local
```

该文件默认指向本机 API：

```text
GOOES_API_BASE_URL=http://localhost:3000
NEXT_PUBLIC_GOOES_API_BASE_URL=http://localhost:3000
NEXT_PUBLIC_GOOES_H5_BASE_URL=https://h5-dev.goodcms.cn
```

如只想本机调 Admin UI，不启动本机 API，仍然使用：

```bash
pnpm admin:dev:remote-api
```

数据库连接辅助信息保存在根目录 `.env.local`，用于本机 psql、migration 预检查等场景。该文件也被 git 忽略。

## 什么时候必须推 dev 环境

以下情况本机通过后还必须 push，让 `api-dev.goodcms.cn` 或 `admin-dev.goodcms.cn` 完整跑一次：

1. 需要小程序团队联调。
2. 改了 API、worker、权限、上传、签名 URL、COS、计费。
3. 改了 `packages/domain`、workspace 依赖、Dockerfile、部署脚本。
4. 改了数据库 migration 或 seed。
5. 要验收 GitHub Actions、容器健康检查、Nginx 域名和真实 dev 环境变量。

## 验收口径

本机 Admin 验收：

```bash
pnpm --dir apps/admin exec tsc -p tsconfig.json --noEmit
pnpm --dir apps/admin build
```

dev 部署后验收：

```bash
curl -I https://admin-dev.goodcms.cn/login
curl -I https://api-dev.goodcms.cn/health
```

`/health` 返回 401 不代表服务挂了，当前该接口需要鉴权；关键是域名、Nginx 和 API 服务可达。

## 工作流建议

1. 本机启动 `pnpm admin:dev:remote-api`。
2. 修改 Admin 页面，浏览器热更新查看。
3. 本机跑 typecheck/build。
4. 提交代码。
5. 需要共享验收时再 push，触发 dev 自动部署。
6. dev 部署成功后，再通知其他端验证。
