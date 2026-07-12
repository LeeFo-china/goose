# CI 与环境隔离整改实施计划

> 本计划执行已批准的 `2026-07-12-ci-environment-isolation-design.md`。每阶段先写失败的契约测试，再实施最小改动并验证。

## 阶段 1：建立开发部署边界

1. 新增 `apps/web/tests/ci-environment-isolation-contract.test.ts`，断言开发部署、开发迁移和开发 Gate 使用 `gooes-dev-deploy`，且不含生产 Runner 标签、生产 IP 或 SSH 跳板私钥。
2. 在 `43.165.126.30` 安装与现有 GitHub Actions Runner 兼容的官方版本，注册名称 `gooes-dev-vm-0-11`、标签 `gooes-dev-deploy`，以 `ubuntu` 服务账户运行。
3. 修改 `.github/workflows/deploy-dev.yml` 与 `.github/workflows/migrate-dev-database.yml`，改为开发服务器本地操作；保留目标目录、数据库主机和项目 ref 防误用校验。
4. 将官网 Gate 拆为开发与生产入口，开发入口绑定开发 Runner；回执继续携带环境字段。
5. 验证：Bun 契约测试、Runner 在线状态、开发 migration `plan`。

## 阶段 2：构建迁移至 GitHub-hosted Runner

1. 扩展契约测试，断言镜像 build job 使用 `ubuntu-24.04`，部署 job 不执行 `docker build`。
2. 修改 `.github/workflows/build-docker-images.yml`，使用 GitHub-hosted Runner 执行校验、构建和 CCR 推送，按 SHA 推送镜像，并输出服务到 digest 的发布清单 artifact。
3. 将开发工作流改为接收 `commit_sha` 和构建 run 证据，只拉取对应 SHA 镜像；自动 main 发布由构建工作流完成后调用或显式触发部署。
4. 核对 Admin/Web 构建期公开变量；仍需环境差异的镜像保持服务级构建参数，不把生产值注入开发镜像。
5. 验证：静态检查、相关 Bun 测试、一次 GitHub-hosted CCR 构建、CCR manifest inspect。

## 阶段 3：收敛生产部署权限

1. 扩展契约测试，断言生产部署只使用 `gooes-prod-deploy`，不出现开发 IP/目录/密钥、`chmod 666` 或全局 Docker prune。
2. 给生产 Runner 增加部署专用标签，工作流切换并验证后删除构建/开发用途旧标签。
3. 修改 `.github/workflows/deploy-docker-services.yml` 和生产 migration 工作流，保持 manual/`main`/production environment 约束，只拉取并重建指定服务。
4. 删除生产服务器上的开发 SSH 私钥；清除已停用的 GitHub SOCKS 服务和只为源码检出保留的配置前先留存服务状态证据。
5. 审核 GitHub environment 的分支规则、required reviewers 和 secret 范围；无法通过当前仓库权限自动配置的项目记录为明确阻断项。
6. 验证：契约测试、workflow YAML 解析、Runner 标签、生产工作流 dry inspection；不触发生产业务部署。

## 阶段 4：开发环境全链路恢复

1. 运行开发 migration `plan`，确认 Local/Remote migration version 对齐且无 pending。
2. 通过新构建链路构建目标 SHA，依次部署 API、Admin，检查容器健康、revision label 和外部域名响应。
3. 执行开发 Web Gate，校验 migration、API revision、短信 smoke/内容 smoke 与回执 artifact。
4. 部署 Web SHA 镜像，将 `deploy/nginx/gooes-web-dev.conf` 安全安装到开发服务器；备份原配置、运行 `nginx -t` 后再 reload。
5. 验证 `www-dev.goodcms.cn` 首页、城市合伙人入口、静态资源、API 代理与 TLS；确认 `api-dev.goodcms.cn` 路由未被覆盖。
6. 连续复验并采集 Actions run ID、部署 SHA、镜像 digest、容器 revision、HTTP 状态和耗时，形成最终审计摘要。

## 最小验证命令

```bash
bun test apps/web/tests/ci-environment-isolation-contract.test.ts
bun test apps/web/tests/web-deployment-gate-contract.test.ts apps/web/tests/web-gate-workflow-input-safety.test.ts
bun run --cwd apps/web typecheck
git diff --check
gh api repos/LeeFo-china/goose/actions/runners
ssh gooes-dev 'docker ps --format "{{.Names}} {{.Status}}"'
ssh gooes-dev 'sudo nginx -t'
curl -fsS --max-time 15 https://api-dev.goodcms.cn/health
curl -fsSI --max-time 15 https://www-dev.goodcms.cn/
```

