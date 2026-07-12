# CI 与环境隔离整改设计

**日期：** 2026-07-12  
**状态：** 已批准  
**范围：** GitHub Actions、腾讯云开发/生产服务器、CCR 镜像交付、官网开发环境上线

## 背景

当前开发部署、开发数据库迁移和官网部署 Gate 均由生产服务器 `1.13.20.39` 上的自托管 Runner 执行，再通过 SSH 操作开发服务器 `43.165.126.30`。生产 Runner 同时承担源码检出、Docker 构建、CCR 推送和生产部署，并存在全局 Docker 清理与放宽 Docker socket 权限的行为。

这造成四类风险：生产服务器 GitHub 网络波动会阻断开发发布；开发凭据进入生产服务器；构建负载和清理命令会影响生产容器；开发与生产的审计证据混在同一个 Runner 上。

## 目标

- 不新增独立 CI 构建机，构建和测试使用 GitHub-hosted Runner。
- 开发服务器仅运行开发部署专用 Runner，生产服务器仅运行生产部署专用 Runner。
- 构建产物以提交 SHA 标记并推送 CCR，部署侧只拉取不可变镜像。
- 开发迁移、开发 Gate、开发部署均在开发服务器本地执行，不再经生产服务器跳转。
- 生产部署保持受保护环境、人工批准和 `main` 分支约束。
- 取消生产 Runner 的全局 Docker prune、`chmod 666 /var/run/docker.sock` 和开发 SSH 私钥。

## 非目标

- 本次不新增自建 CI 构建机。
- 本次不发布生产业务服务、不执行生产数据库 migration。
- 本次不引入缓存、队列、Redis 或新的应用依赖。
- 本次不修改 orange 仓库。

## 目标架构

```text
GitHub-hosted Runner
  ├─ 静态检查 / 测试
  ├─ 构建 API / Admin / Web / Worker 镜像
  └─ 推送 CCR：<service>:<commit-sha>

CCR
  ├─ 开发部署读取同一 SHA 镜像
  └─ 生产部署仅在批准后读取已验证 SHA 镜像

43.165.126.30（开发）
  └─ gooes-dev-deploy Runner
     ├─ 开发 migration plan/apply
     ├─ 拉取 CCR 镜像并重建开发服务
     └─ 开发 Gate / smoke / Nginx

1.13.20.39（生产）
  └─ gooes-prod-deploy Runner
     ├─ 仅受保护 production 环境可调度
     └─ 拉取批准的 CCR 镜像并重建指定生产服务
```

## 关键决策

### 构建与部署解耦

GitHub-hosted Runner 负责可重复的 CPU、磁盘和公网密集型任务。开发与生产服务器不执行 Docker build，只验证请求、拉取镜像、更新编排文件并重建指定服务。每个镜像必须包含 OCI revision 标签，并至少推送提交 SHA 标签；环境别名标签只用于人工观察，部署不能以可变标签作为唯一依据。

### Runner 最小权限

开发 Runner 只带 `gooes-dev-deploy` 自定义标签，工作目录独立，服务账户加入 docker 组。生产 Runner 只带 `gooes-prod-deploy` 自定义标签。工作流同时校验 Runner 名称、目标目录和环境身份，防止标签误配。

开发工作流不得出现生产主机、生产目录、生产 Runner 标签或开发 SSH 跳板私钥。生产工作流不得出现开发主机、开发目录或开发数据库标识。

### 环境与凭据边界

CCR 推送凭据仅提供给 GitHub-hosted 构建工作流。部署环境只需要 CCR 拉取能力和本环境应用密钥。若现阶段腾讯云账号无法立即签发独立的只读凭据，允许短期复用现有 CCR 账号，但工作流必须先完成环境隔离，并把凭据拆分与轮换记录为上线前安全项。

开发数据库连接只存在开发服务器的 `/opt/gooes-dev/docker/.env.dev.db`，迁移工作流必须同时验证项目 ref、解析后的数据库主机和生产阻断列表。

### Gate 分离

开发与生产使用独立工作流名称和独立 Runner。Gate 回执包含目标环境、提交 SHA、migration version、API revision 和检查结果。部署工作流只接受相同环境、相同 SHA、成功结论的回执。

### Docker 安全与空间回收

Runner 服务账户通过 docker 组访问 daemon，不修改 socket 为 world-writable。部署只操作明确列出的 compose service。清理仅删除当前发布产生的临时文件和明确可识别的过期镜像；禁止 `docker container prune`、无过滤 `docker image prune` 和全局 builder prune 出现在生产部署链路。

## 分阶段交付

1. 在开发服务器安装并注册部署专用 Runner，迁移开发部署、开发 migration 和开发 Gate；保留生产 Runner 旧标签作为短暂回滚窗口。
2. 将测试和镜像构建迁到 GitHub-hosted Runner，输出 SHA/digest 清单，开发部署只消费清单中的镜像。
3. 将生产 Runner 收敛为部署专用标签，强化 production 环境与分支审批，删除开发跳板凭据及危险 Docker 操作。
4. 依次验证开发 migration、API、Admin、Web Gate、Web 部署、Nginx 与 `www-dev.goodcms.cn` 域名 smoke，完成审计后关闭旧路径。

## 回滚

- Runner/工作流切换前保留旧 workflow commit 和现有 compose 备份；出现调度故障时只回滚工作流，不回滚业务数据。
- 开发部署失败时使用上一提交 SHA 的 CCR 镜像重建指定服务。
- Nginx 变更前保存原配置，`nginx -t` 失败不 reload；域名异常时恢复备份并 reload。
- 不在本整改中执行生产 migration，因此不存在数据库回滚动作。

## 验收标准

- GitHub Runner 列表显示在线的开发、生产部署专用 Runner，标签不交叉。
- 契约测试证明构建运行于 GitHub-hosted Runner，开发/生产部署分别绑定专用标签。
- 生产部署工作流不包含开发 SSH 私钥、全局 prune 或 Docker socket 666。
- 开发 migration plan 无待执行版本，API/Admin/Web 返回健康状态且 revision 与目标 SHA 一致。
- `https://www-dev.goodcms.cn` 由 Web 服务响应，API 域名仍由 API 服务响应。

