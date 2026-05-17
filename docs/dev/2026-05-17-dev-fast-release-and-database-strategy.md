# 开发快速发布验证与数据库处理方案

日期：2026-05-17

## 1. 结论

当前生产发布链路已经跑通：GitHub Actions 可以在腾讯云 self-hosted runner 构建 `api`、`admin`、`social-video-worker` 镜像，推送腾讯 CCR，再部署到新服务器。

但这条链路不适合高频开发验证。开发阶段要解决两个问题：

1. 小改动需要快速发布到可访问环境，不应该每次都影响生产。
2. 数据库变更、测试数据、真实业务数据必须隔离，不能为了调试直接改生产库。

建议建立三层环境：

| 环境 | 用途 | API/Admin | 数据库 | 发布方式 |
| --- | --- | --- | --- | --- |
| 本地开发 | 单人编码、自测 | 本机端口 | 本地 Supabase 或远程 dev DB | 本地启动 |
| 共享开发环境 | 前后端、小程序联调 | `api-dev.goodcms.cn` / `admin-dev.goodcms.cn` | 独立 dev Supabase/Postgres | 代码 push 自动按服务部署，必要时手动部署 |
| 生产环境 | 客户真实使用 | `api.goodcms.cn` / `admin.goodcms.cn` | 生产 Supabase/Postgres | 验收后完整发布 |

第一阶段先做“共享开发环境”，这是收益最高的改造。

## 2. 当前问题

### 2.1 高频提交直接触发生产发布

现在 `feature/multi-tenant` push 会触发完整构建和部署。这个链路适合正式上线，但开发过程中会有几个问题：

- 小改动也会重建所有服务。
- 验证失败会影响生产容器版本。
- admin、小程序、后端联调没有稳定的 dev API 地址。
- 数据库变更没有 dev 预演环境时，容易直接推到生产库。

### 2.2 数据库风险比代码风险更高

代码可以通过镜像 tag 回滚，但数据库 migration 不一定能无损回滚。尤其是：

- `drop column/table`、`delete data`、`unique index`、`not null` 这类变更不能直接上生产。
- 兼容期字段删除必须等前后端都切完。
- 测试账号、测试租户、测试业务数据不能混在生产验收里。

## 3. 推荐开发发布链路

### 3.1 Git 分支与发布边界

建议分成三类动作：

| 动作 | 分支/触发 | 目标环境 | 是否自动 |
| --- | --- | --- | --- |
| 普通开发提交 | 任意功能分支 | 不发布 | 否 |
| 开发环境验证 | `push` 代码路径或 `workflow_dispatch` 手动选择服务 | dev | 代码路径自动；必要时手动 |
| 生产发布 | 验收通过后手动触发或受保护分支 | prod | 需要确认 |

短期不建议继续让所有开发 push 自动上生产。更合理的是：

- 生产 workflow 改成手动触发，避免普通开发 push 影响生产。
- `Deploy Dev` workflow 支持自动识别变更路径，也支持手动选择发布服务。
- 开发者修改 API 时自动发布 dev API；修改 admin 时自动发布 dev Admin；修改 worker 时自动发布对应 dev worker。

### 3.2 开发环境域名

建议新增：

```text
api-dev.goodcms.cn
admin-dev.goodcms.cn
h5-dev.goodcms.cn
```

小程序开发版、体验版联调时指向 `api-dev.goodcms.cn`。生产小程序仍指向 `api.goodcms.cn`。

这样可以做到：

- 小程序团队联调不影响线上客户。
- admin 调试不写生产库。
- 后端可以在 dev 环境打开更多日志。
- AI、短信、计费等高风险功能可以在 dev 环境默认试算或 mock。

### 3.3 开发环境容器部署

建议在新服务器或单独轻量服务器上运行一套 dev compose：

```text
/opt/gooes-dev/docker
├── docker-compose.dev.yml
├── .env.dev.api
├── .env.dev.admin
└── .env.dev.workers
```

端口建议：

| 服务 | dev 容器端口 | 宿主机端口 | 域名 |
| --- | --- | --- | --- |
| API | 3000 | 13000 | `api-dev.goodcms.cn` |
| Admin | 3000 | 13010 | `admin-dev.goodcms.cn` |
| H5 | 3000 或静态服务 | 13020 | `h5-dev.goodcms.cn` |
| Worker | 无公网 | 无 | 内部运行 |

dev 镜像 tag 建议：

```text
ccr.ccs.tencentyun.com/gooes-goodcms/goose-api:dev
ccr.ccs.tencentyun.com/gooes-goodcms/goose-admin:dev
ccr.ccs.tencentyun.com/gooes-goodcms/goose-social-video-worker:dev
```

同时保留 SHA tag：

```text
ccr.ccs.tencentyun.com/gooes-goodcms/goose-api:<GITHUB_SHA>
```

`dev` 用于快速覆盖，`<GITHUB_SHA>` 用于排查和临时回退。

### 3.4 Dev workflow 触发

已新增 `.github/workflows/deploy-dev.yml`。

push 自动发布规则：

| 变更路径 | 自动发布 dev 服务 |
| --- | --- |
| `apps/api/**`、`docker/api.Dockerfile` | `api` |
| `apps/admin/**`、`docker/admin.Dockerfile` | `admin` |
| `apps/api` 中短视频 worker 相关代码、`docker/social-video-worker.Dockerfile` | `social-video-worker` |
| COS 对账 worker、上传/文件服务相关代码 | `cos-reconcile-worker` |
| `packages/domain/**`、lockfile、workspace 配置、`.dockerignore`、`deploy/docker-compose.dev.yml` | 全部 dev 服务 |
| `docs/**`、`scripts/dev/**`、`supabase/migrations/**` | 不自动部署 |

手动触发仍保留，用于强制重发单个服务：

```yaml
workflow_dispatch:
  inputs:
    service:
      description: "发布服务"
      type: choice
      options:
        - api
        - admin
        - social-video-worker
        - cos-reconcile-worker
```

行为：

- `service=api`：只构建并重启 dev API。
- `service=admin`：只构建并重启 dev admin。
- `service=social-video-worker`：只构建并重启 dev 短视频 worker。
- `service=cos-reconcile-worker`：复用 API 镜像并重启 dev COS 对账 worker。

第一阶段不开放手动 `all`。开发验证应该明确选择单个服务，避免一次性全量重启导致排查边界变大。自动路径命中共享构建文件时才会发布全部 dev 服务。

这样开发验证通常可以控制在：

| 类型 | 预期耗时 |
| --- | --- |
| 只发 API | 1 到 2 分钟 |
| 只发 Worker | 1 到 2 分钟 |
| 只发 Admin | 5 到 10 分钟 |

### 3.5 Dev 镜像更新规则

dev 镜像可以使用 `dev` 覆盖 tag，但部署时不能只 `restart` 容器。

错误方式：

```bash
docker restart gooes-api-dev
```

这种方式不会拉取新镜像，容器仍然可能运行旧版本。

正确方式：

```bash
cd /opt/gooes-dev/docker
docker compose -f docker-compose.dev.yml pull gooes-api-dev
docker compose -f docker-compose.dev.yml up -d --no-deps --force-recreate gooes-api-dev
```

workflow 必须明确执行 `pull && up -d --force-recreate`。如果使用 SHA tag 回退，也要先修改 dev compose 的镜像 tag，再执行同样的 `pull && up -d --force-recreate`。

## 4. 数据库处理策略

### 4.1 必须区分三类数据库

| 数据库 | 用途 | 是否允许脏数据 | 是否允许破坏性 migration |
| --- | --- | --- | --- |
| local | 开发者本机验证 migration | 允许 | 允许 reset |
| dev | 多端联调、验收前验证 | 允许可控测试数据 | 不允许无评审破坏 |
| prod | 真实业务 | 不允许 | 原则上禁止 |

生产库只接受已经在 local 和 dev 验证过的 migration。

### 4.2 Migration 规则

新增或修改数据库结构，统一走：

```bash
supabase migration new xxx
```

禁止：

- 直接在生产控制台手写 SQL 后不落 migration。
- 修改已经执行过的历史 migration。
- 在同一个 migration 里混入无关表结构调整。
- 上生产时直接 `drop table`、`drop column`、批量 `delete`。

推荐 migration 分级：

| 类型 | 示例 | 上线要求 |
| --- | --- | --- |
| 安全新增 | 新表、新 nullable 字段、新索引 | local + dev 验证后可上 |
| 兼容改造 | 新旧字段并存、双写、回填 | 必须有灰度期 |
| 约束收紧 | `not null`、唯一索引、check | 先清洗数据，再加约束 |
| 破坏性变更 | 删除字段、删表、删旧兼容逻辑 | 单独阶段，确认无引用后执行 |

### 4.3 数据库发布顺序

每个涉及 DB 的功能按这个顺序走：

1. 本地创建 migration。
2. 本地 `supabase db reset` 或连接 local DB 执行验证。
3. 在 dev DB 执行 migration。
4. dev 环境 API/Admin/小程序联调验收。
5. 生产发布前备份生产库。
6. 生产执行 migration。
7. 生产发布应用镜像。
8. 执行生产 smoke test。

注意：如果应用代码依赖新字段，推荐先执行“兼容性 migration”，再发布应用。字段删除和旧逻辑清理放到后续版本。

### 4.4 Dev 数据库数据来源

dev 数据库不建议长期直接复制完整生产数据，原因是：

- 客户手机号、openid、业务图片、合同费用等属于敏感数据。
- 联调会产生脏数据，容易和真实业务混淆。
- AI、短信、COS、微信登录等外部服务会误触发真实行为。

推荐第一版：

- dev DB 从空库执行全部 migration。
- 用 seed 脚本创建固定测试租户、员工、客户、项目。
- 必要时从生产抽样数据，但必须脱敏。
- seed 脚本必须可重复执行，不能因为重复插入导致失败。

当前已落地的 dev seed：

```text
scripts/dev/seed-dev.sql
```

固定登录与测试数据：

| 数据 | 值 |
| --- | --- |
| 默认租户 | 默认装修公司 |
| 平台超管手机号 | `19900000001` |
| 租户管理员手机号 | `19900000002` |
| dev 客户手机号 | `19900001001`、`19900001002` |
| dev 积分账户 | `is_test=true`，测试积分 `1000000` |

执行 seed：

```bash
ssh -i docs/360video/goose.pem ubuntu@43.165.126.30 \
  'set -a; . /opt/gooes-dev/docker/.env.dev.db; psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1' \
  < scripts/dev/seed-dev.sql
```

seed 已验证可重复执行。后台 dev 环境开启 `AUTH_PHONE_LOGIN_WITHOUT_CODE=true`，首次用 `19900000001` 或 `19900000002` 登录时 API 会自动创建后台登录用的 `auth.users`，不需要 seed 直接写入 Supabase Auth 表。

后续扩展固定测试数据建议：

| 数据 | 建议 |
| --- | --- |
| 租户 | 第一版复用 migration 创建的 `gooes_default`；如需多租户联调，再增加 `dev_decoration_a` |
| 员工手机号 | 使用 `190/191` 段内部测试号 |
| 客户手机号 | 使用内部测试号，不使用真实客户手机号 |
| 微信 openid | dev 环境单独绑定，不复用生产映射 |
| COS 路径 | `dev/tenants/...` 前缀，和生产隔离 |

seed 推荐写成幂等脚本。原则是“先清理 dev 前缀数据，再插入固定数据”，或者全部使用 `ON CONFLICT DO UPDATE`。例如：

```sql
delete from tenants
where slug like 'dev_%';

insert into tenants (id, name, slug, status)
values
  ('00000000-0000-4000-8000-000000000101', '开发默认租户', 'dev_default', 'active'),
  ('00000000-0000-4000-8000-000000000102', '开发装修租户A', 'dev_decoration_a', 'active')
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  status = excluded.status;
```

测试账号要固定，方便 admin、小程序和后端共同排查。密码可以使用 dev 专用固定值，但禁止复用生产账号密码。

### 4.5 外部服务配置隔离

dev 环境必须和生产环境隔离这些配置：

| 配置 | dev 策略 |
| --- | --- |
| 短信 | 默认 mock 或只允许白名单手机号 |
| AI 计费 | 默认 shadow billing，不真扣积分 |
| COS | 使用 dev 前缀或 dev bucket |
| 微信小程序 | 使用开发版/体验版 app 配置 |
| 腾讯云视频设备 | 不自动操作生产设备 |
| 支付/打款 | 禁止真实付款，只保留模拟状态 |

## 5. 快速验证标准

### 5.1 API 快速验证

dev API 发布后至少验证：

```bash
curl -fsS https://api-dev.goodcms.cn/
curl -fsS https://api-dev.goodcms.cn/health
```

如果没有统一 health endpoint，建议补一个：

```text
GET /health
```

返回内容：

```json
{
  "ok": true,
  "service": "gooes-api",
  "env": "development",
  "version": "dev",
  "sha": "a1b2c3d4e5f6",
  "db": {
    "connected": true,
    "migration": "202605170001",
    "tenant_count": 2
  },
  "time": "ISO time"
}
```

`/health` 不应该泄露数据库连接串、密钥、token、供应商 secret。DB 信息只返回可观测状态，例如是否连通、当前 migration 版本、测试租户数量。

### 5.2 Admin 快速验证

dev admin 发布后验证：

- `https://admin-dev.goodcms.cn/login` 返回 200。
- 登录后能访问首页。
- 页面请求指向 `api-dev.goodcms.cn`，不能误打生产 API。

### 5.3 小程序联调验证

小程序开发版应配置：

```text
API_BASE_URL=https://api-dev.goodcms.cn
```

验证：

- 登录命中 dev 数据库。
- 施工日志、评论、图片上传走 dev COS 前缀。
- 不影响生产用户绑定关系。

### 5.4 数据库验收

每个 migration 至少记录：

- migration 文件名。
- local 是否执行成功。
- dev 是否执行成功。
- 是否有数据回填。
- 是否有破坏性操作。
- 是否需要前端/admin/小程序配合。
- 是否需要生产备份。

## 6. 建议分阶段落地

### 阶段 1：建立 dev 环境边界

目标：

- 新增 dev 域名：`api-dev.goodcms.cn`、`admin-dev.goodcms.cn`。
- 新增 dev compose 目录。
- 准备 dev 数据库连接。
- dev 环境配置独立 `.env`。

验收：

- dev API 和 prod API 可以同时访问。
- dev admin 页面不会请求 prod API。
- dev 数据库能独立写入测试数据。

配置管理要求：

```text
.env.dev.common
.env.dev.api
.env.dev.admin
.env.dev.workers
.env.production
```

同一份代码通过不同 env 文件区分环境，不维护 `dev` 和 `prod` 两套代码分支。`docker-compose.dev.yml` 中使用：

```yaml
services:
  api:
    env_file:
      - .env.dev.common
      - .env.dev.api
```

生产 compose 继续使用生产 env 文件。dev env 必须包含明确的环境标识，例如 `APP_ENV=development`、`NODE_ENV=development`、`BILLING_CHARGE_ENABLED=false`。

API 环境还必须包含 `APP_CONFIG_ENCRYPTION_KEY`。这个变量用于超管后台系统配置中的密钥类字段加密，必须在保存 WeChat、COS、短信、AI 等密钥前固定下来；如果已经存在密文配置，更换该变量会导致旧密文无法解密。

### 阶段 2：新增 dev 发布 workflow

目标：

- 新增 `Deploy Dev` workflow。
- 支持 push 自动按路径发布 `api/admin/worker`。
- 支持手动选择 `api/admin/worker`，第一阶段不开放 `all`。
- dev 镜像 tag 使用 `dev` + `GITHUB_SHA`。

验收：

- 只改 API 时，可以只发布 API。
- 只改 admin 时，可以只发布 admin。
- 只改 docs、seed、migration 时，不触发 dev 部署。
- workflow 日志能看到部署的 commit sha。
- GitHub Actions Summary 能看到本次服务、commit、镜像 tag、健康状态、部署耗时、磁盘清理前后空间。

清理策略：

- dev 构建仍发生在 `gooes-prod-vm-0-3` runner，因此构建后必须清理退出容器、dangling 镜像和 24 小时以前的 build cache。
- dev 服务器 `VM-0-11-ubuntu` 只负责运行和拉取镜像，每次部署验收后清理未被运行容器引用的旧镜像和旧 build cache。
- 两端都不执行 `docker volume prune`，避免误删持久化数据。
- dev 回滚如果需要旧 SHA 镜像，优先从腾讯 CCR 重新拉取，不依赖服务器本地长期保留镜像。

### 阶段 3：数据库 migration dev 预演

目标：

- dev DB 可以执行 migration。
- migration 执行不影响生产。
- 建立 dev seed 数据。

验收：

- 从空 dev DB 执行全部 migration 成功。
- seed 后能登录 dev admin。
- 小程序开发版能登录 dev API。

### 阶段 4：生产发布收口

目标：

- 生产发布改为验收后手动触发。
- 生产 migration 必须先 dev 验收。
- 发布记录中包含镜像 SHA、migration 文件、验收人。

验收：

- 普通开发 push 不会自动影响生产，只会按代码路径影响 dev。
- 生产发布有明确版本和回滚点。
- 生产 DB 操作有备份和执行记录。

## 7. 我的建议

最优先做这三件事：

1. 先开 `api-dev.goodcms.cn` 和 `admin-dev.goodcms.cn`，让 admin、小程序、后端有稳定联调地址。
2. 新增 dev 数据库，禁止开发调试直接写生产库。
3. 新增 `Deploy Dev` workflow，支持按服务自动发布和手动补发，生产 workflow 改为验收后触发。

这样开发速度会明显提升，同时不会牺牲生产稳定性。

不建议第一版就做复杂的多套 Kubernetes、自动 preview environment 或数据库分支。当前项目最需要的是稳定、简单、可控的 dev 环境和数据库纪律。
