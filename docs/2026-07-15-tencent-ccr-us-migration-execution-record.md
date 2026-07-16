# 腾讯 CCR 美国仓库迁移执行记录

执行日期：2026-07-15

## 结论

后续 Gooes 应用镜像的构建、候选校验和服务器默认拉取地址已统一为：

```text
useccr.ccs.tencentyun.com/america_goose
```

- 开发环境已完成实际切换：API、Admin、Web、social-video-worker 和
  cos-reconcile-worker 均运行美国 CCR 的不可变 digest 镜像，五个容器健康。
- 生产环境按 Strategy B 执行：API、Admin、Web 和 social-video-worker 候选镜像已构建，
  并由生产 Runner 完成 manifest、digest、revision 和拉取校验。
- 生产环境未部署候选镜像，未执行 Compose pull/up、容器重建或重启，也未修改或 reload
  Nginx。运行中的生产容器仍使用迁移前镜像。
- 生产 active `.env` 和 `.env.admin` 已备份，并仅被动更新后续发布默认镜像地址。
- 未修改数据库、Supabase migration 或 Orange 小程序仓库。

本记录是
[`2026-07-15-tencent-ccr-us-migration-runbook.md`](./2026-07-15-tencent-ccr-us-migration-runbook.md)
的实际执行证据。后续生产部署仍必须按 Runbook 的候选复验和确认门禁执行，不能把本记录
当作生产候选已经部署的证明。

## 代码与发布基线

| 项目 | 结果 |
| --- | --- |
| CCR 迁移 PR | [#2](https://github.com/LeeFo-china/goose/pull/2)，merge `cc6e1faa42b6c3c8cf00dda61e6d21ffc7124b75` |
| 统一手机号登录 PR | [#3](https://github.com/LeeFo-china/goose/pull/3)，merge `6210a74bad4e7946481e1d9e8936dd4159335365` |
| CCR 推送重试修复 PR | [#4](https://github.com/LeeFo-china/goose/pull/4)，merge `e6e7721bbdc7216b0756337dcabc5d40ab8c347f` |
| 最终候选 SHA | `e6e7721bbdc7216b0756337dcabc5d40ab8c347f` |
| Annotated release Tag | `v2026.07.15.1`，peel 到最终候选 SHA |

CCR 推送重试修复对 branch、SHA 和 run-scoped Tag 使用最多五次重试与退避，不重新构建
镜像；远端 digest 解析也最多重试五次，且只有 inspect 退出码为 0、digest 格式合法时才接受。
对应契约测试覆盖第五次成功、连续五次失败和“输出看似合法但命令失败”的情况。

GitHub Repository 配置核验结果：

```text
TENCENT_CCR_REGISTRY=useccr.ccs.tencentyun.com
TENCENT_CCR_NAMESPACE=america_goose
```

Repository Secret 只核验到名称 `TENCENT_CCR_USERNAME` 和 `TENCENT_CCR_PASSWORD` 存在；
本次执行未读取、输出或写入 Secret 值。

## 开发环境

开发服务器：`43.165.126.30`，部署目录：`/opt/gooes-dev/docker`。

### 发布运行

| 用途 | GitHub Actions Run | 结果 |
| --- | --- | --- |
| API、Admin、social-video-worker、cos-reconcile-worker 发布 | [29455952643](https://github.com/LeeFo-china/goose/actions/runs/29455952643) | success |
| Web 镜像构建 | [29456355990](https://github.com/LeeFo-china/goose/actions/runs/29456355990) | success |
| Web 开发部署门禁 | [29456521690](https://github.com/LeeFo-china/goose/actions/runs/29456521690) | success |
| Web 开发部署 | [29456572416](https://github.com/LeeFo-china/goose/actions/runs/29456572416) | success |

### 已部署镜像

| 服务 | Build Run | Digest |
| --- | --- | --- |
| API | `29455952643` | `sha256:988e51881a252609f978b507e933ca238d0deb137820cc4856b0eb1bab4a086a` |
| Admin | `29455952643` | `sha256:fc34cd9accdffe11cd48383f2b859ccb39205e54c9c8d32ef773bb189322b062` |
| Web | `29456355990` | `sha256:6671ee71af773943cf773a528d92df50f8deaccfed53f890cd58063e4fd8cc20` |
| social-video-worker | `29455952643` | `sha256:b759e80290f9c44272ca694680e5fdc58292b7862857ce5c657ce4f5363eb8f5` |
| cos-reconcile-worker | `29455952643` | 复用 API digest |

五个容器的 `org.opencontainers.image.revision` 均为最终候选 SHA，状态均为 running/healthy，
`RestartCount=0`。公开检查结果：

```text
https://api-dev.goodcms.cn/          HTTP 200
https://admin-dev.goodcms.cn/login   HTTP 200
https://h5-dev.goodcms.cn/           HTTP 200
X-Gooes-Service: web
X-Gooes-Revision: e6e7721bbdc7216b0756337dcabc5d40ab8c347f
```

开发 active `.env` 备份为：

```text
/opt/gooes-dev/docker/.env.bak.ccr-us-20260715T225039Z
```

active `.env` 的 API、Admin、Web 和 social-video-worker 默认镜像均已更新为美国 CCR 的
`:dev` 引用；cos-reconcile-worker 继续复用 API 镜像。

## 生产候选

生产服务器：`1.13.20.39`，部署目录：`/opt/supabase/docker`。

### 成功运行与候选制品

非 Web 生产候选运行
[29458391920](https://github.com/LeeFo-china/goose/actions/runs/29458391920) 成功；独立 Web
候选运行 [29458693617](https://github.com/LeeFo-china/goose/actions/runs/29458693617) 成功。
两个运行均在最终候选 SHA 和 `v2026.07.15.1` 上执行，生产 Runner 拉取验证成功，未运行部署
Job。

| 服务 | Run-scoped image | Digest |
| --- | --- | --- |
| API | `goose-api:run-29458391920-e6e7721bbdc7216b0756337dcabc5d40ab8c347f` | `sha256:947853c425ea9e9d4999bc89f81c0d240e96e2b1153a686952813c81d6b3e498` |
| Admin | `goose-admin:run-29458391920-e6e7721bbdc7216b0756337dcabc5d40ab8c347f` | `sha256:6353f641b918b3eebf57b4f3c379c1889ad7ab7d5aa243657341c0d9b3255ee6` |
| social-video-worker | `goose-social-video-worker:run-29458391920-e6e7721bbdc7216b0756337dcabc5d40ab8c347f` | `sha256:dadfb57d988c7f351bf28085f9af93157aac1640053f32a0fdf0143c941c45e6` |
| Web | `goose-web:run-29458693617-e6e7721bbdc7216b0756337dcabc5d40ab8c347f` | `sha256:e21180556bc5df46b7b52af8d26023f68777b4cd6bd35fe9243ae9bdd7a7f33a` |

cos-reconcile-worker 没有独立镜像，未来部署继续复用 API 候选。生产 Web 只完成独立 Build 和
pull verification，未执行 Web Gate、Digest Deploy 或 Nginx cutover。

### 失败运行与根因

以下失败均通过新的 workflow dispatch 重新发起，没有使用 GitHub Actions Re-run：

| Run | 根因 | 处理 |
| --- | --- | --- |
| [29456810710](https://github.com/LeeFo-china/goose/actions/runs/29456810710) | production Environment 仅允许 `main` branch，release Tag 未获准进入环境 | 保留 `main` branch policy，新增最小范围 `v*` tag policy |
| [29456989876](https://github.com/LeeFo-china/goose/actions/runs/29456989876) | 生产 Runner 缺少 Docker Buildx | 安装并校验官方 Buildx `v0.35.0` linux-amd64 二进制 |
| [29457321916](https://github.com/LeeFo-china/goose/actions/runs/29457321916) | 生产 Runner 缺少 `gh` | 通过 apt 安装 `gh 2.4.0+dfsg1-2` |
| [29457616382](https://github.com/LeeFo-china/goose/actions/runs/29457616382) | 生产 Runner 缺少 `jq` | 通过 apt 安装 `jq 1.6` |
| [29457913573](https://github.com/LeeFo-china/goose/actions/runs/29457913573) | Docker daemon 指向 `socks5h://127.0.0.1:18080`，但端口无服务 | 安装并启用仅监听 loopback 的 `docker-registry-proxy.service` |

Environment 最终 deployment branch policies 为：

```text
branch main
tag    v*
```

没有放开任意 branch 或任意 tag。

### 生产 Runner 调整

生产 Runner `gooes-prod-vm-0-3` 当前发布前置工具：

```text
Docker Buildx v0.35.0
gh 2.4.0+dfsg1-2
jq 1.6
docker-registry-proxy.service: enabled, active
proxy listen: 127.0.0.1:18080
```

Buildx 安装文件位于 `/usr/libexec/docker/cli-plugins/docker-buildx`。安装前核对的官方 release
asset SHA-256 为：

```text
d41ece72044243b4f58b343441ae37446d9c29a7d6b5e11c61847bbcf8f7dfda
```

Docker 当前 `live-restore=false`，因此本次未重启 Docker daemon，也未直接改动其 `NO_PROXY`
后重启。临时兼容方式是启用 `microsocks 1.0.1-2` 的 systemd 服务，仅绑定
`127.0.0.1:18080`，恢复 daemon 已配置的 SOCKS5 出口。安装过程没有重启业务容器。

## 生产运行态不变性

候选构建前、候选验证后和 active 环境变量更新后的快照一致：

本次快照通过操作会话中的 `docker inspect` 输出完成比较，最终核查时生产服务器没有保留
Runbook 示例中的 `/tmp/gooes-prod-*-ccr-migration.*` 快照文件。这是证据留存偏差；下次生产
变更必须把前后快照和差异结果作为持久 artifact 保存。下表记录了本次实际比较的稳定字段。

| 容器 | Container ID | 当前镜像 revision | Build Run | StartedAt | Restart |
| --- | --- | --- | --- | --- | --- |
| gooes-api | `ff2c36e6bfd4...` | `aaabdc6e2dc98f4dacaddfb8c15ac9aa34f543a7` | `28938930887` | `2026-07-08T11:46:04.629140778Z` | 0 |
| gooes-admin | `5b57cbfbea38...` | `aaabdc6e2dc98f4dacaddfb8c15ac9aa34f543a7` | `28938930887` | `2026-07-08T11:46:06.478641778Z` | 0 |
| gooes-social-video-worker | `d27393dee5ab...` | `12866ebaeccc2036fa78ab4ea579577f528d6120` | `26928178934` | `2026-06-04T03:25:17.842505659Z` | 0 |
| gooes-cos-reconcile-worker | `35561caa0e55...` | `12866ebaeccc2036fa78ab4ea579577f528d6120` | `26928178934` | `2026-06-04T03:25:28.917525857Z` | 0 |

四个业务容器最终均为 running/healthy，`Config.Image` 仍是迁移前旧 CCR 引用。这证明本次只更新
后续默认配置，没有把生产运行态切换到候选镜像。

Nginx 稳定证据：

```text
container ID: 15cbc757156e...
StartedAt: 2026-05-16T11:40:13.230199758Z
RestartCount: 1
nginx -t: successful
/etc/nginx/conf.d/redirector.conf sha256:
82408424a9d64acf7dc46cca4ba1bd3d7c1125eaf5b81b0589cedd707be2ef6a
```

公开检查结果：

```text
https://api.goodcms.cn/          HTTP 200
https://admin.goodcms.cn/login   HTTP 200
```

生产环境当前没有 Gooes Web 容器，因此没有写入生产 Web active 镜像变量，也没有执行 Web
部署或 Nginx 切流。

## 生产 active 配置

修改前生成的备份：

```text
/opt/supabase/docker/.env.bak.ccr-us-20260715T233458Z
/opt/supabase/docker/.env.admin.bak.ccr-us-20260715T233458Z
```

实际执行使用 UTC 审计时间戳格式 `date -u +%Y%m%dT%H%M%SZ`，因此文件名与 Runbook 示例的
纯数字本地时间格式不同。两份备份已在生产服务器通过 `stat` 确认存在，`cp -p` 保留了源文件
时间属性。

active 配置已更新为：

```text
# .env
GOOES_API_IMAGE=useccr.ccs.tencentyun.com/america_goose/goose-api:main
GOOES_ADMIN_IMAGE=useccr.ccs.tencentyun.com/america_goose/goose-admin:main
GOOES_SOCIAL_VIDEO_WORKER_IMAGE=useccr.ccs.tencentyun.com/america_goose/goose-social-video-worker:main

# .env.admin
GOOES_ADMIN_IMAGE=useccr.ccs.tencentyun.com/america_goose/goose-admin:main
```

带 `--profile workers` 的 Compose 配置解析结果依次包含 API、social-video-worker、复用 API
的 cos-reconcile-worker 和 Admin，全部指向美国 CCR。该检查只运行 `config --images`，没有
拉取或启动镜像。

## 后续维护与发布约束

1. 若部署本次非 Web 候选，必须使用 `release-production.yml operation=deploy`，提供
   `build_run_id=29458391920` 和最终候选 SHA，并通过候选复验和二次确认；若重新构建候选，
   必须改用新 Run ID。两种情况都不能直接依赖可变 `:main` Tag。
2. Web 生产发布必须单独执行 Runbook 定义的 Build -> Wrapper Gate -> Digest Deploy ->
   Manual Nginx cutover；本次 Web 候选 `build_run_id=29458693617` 只完成第一步。
3. Buildx 是固定版本的手动安装二进制，需要纳入 Runner 的定期安全更新清单。
4. 安排独立维护窗口，把 `useccr.ccs.tencentyun.com` 加入 Docker daemon 的 `NO_PROXY`，评估
   移除本地 SOCKS5 兼容服务。由于当前 `live-restore=false`，该操作必须按生产 Docker daemon
   重启变更处理，并提前验证容器连续性和回滚方案。
5. 在生产实际切换并稳定前，保留旧 CCR 镜像和本次时间戳备份，不得覆盖或删除。
