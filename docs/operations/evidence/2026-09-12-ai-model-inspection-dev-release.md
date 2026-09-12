# 未接通场景模型浏览 DEV 发布

状态：开发 API/Admin 发布成功，独立版本、镜像摘要与健康检查通过；开发超管登录态页面尚未实测。

## 固定范围与版本

- 用户授权“开发发布”，仅发布开发 API/Admin，不操作生产、Orange 或 main。
- 功能源码：`01980de98d6bddb3b34cc028eebced87b2b7c76f`。
- 固定发布分支：`release/ai-model-inspection-dev-20260912`。
- 固定发布 SHA：`e7a96f14e9f3a1aef47948fe58db0c2b2f41a4e9`。
- 发布快照父提交：已部署的 `7ec16c8d92ef3612f5019ecda5f0454828e92b4b`。
- 源码与发布快照 tree 均为 `edda6530f76c55316a613c073c01b1ce42e5800c`，`git diff --exit-code` 无差异。
- 与旧发布比较，没有 migration 或 GitHub workflow 改动。保留旧功能/发布历史，无 force push 或共享分支改写。

## 发布前验证

- 开发主机校验为 `VM-0-11-ubuntu`（`43.165.126.30`）。API/Admin 均 running/healthy，revision 为旧发布 SHA，run 为 `34656502048`。
- 开发磁盘可用 9.2 GB，使用率 84%；未执行清理。
- 记录 Web、H5、social-video/cos/billing worker 的容器 ID、digest、revision、run 与健康状态，用于发布后确认未被重建。
- 新鲜 API 回归：34 pass / 144 assertions；API typecheck 通过。
- 新鲜 Admin check：文件大小、Next 路由类型生成、TypeScript 通过。
- 发布编排/开发部署合同：165 pass / 5112 assertions。
- 功能组件及完整浏览器回归见 [实现验证](2026-09-12-ai-disconnected-model-inspection.md)，均为本地模拟 API 验证，不冒充开发登录态联调。

## 执行与证据

[Release Dev 34662059027](https://github.com/LeeFo-china/goose/actions/runs/34662059027)，请求 `service=api,admin`、`operation=release`。

已下载并用仓库 verifier 独立验证 dev-build-plan：固定本次 SHA/run，development，`migration_changed=false`，build/deploy services 均精确为 `api,admin`。其他 matrix job 名称不表示对应服务实际被构建或部署。

工作流最终 `completed / success`。构建、迁移历史门禁、API 发布/readiness、Admin 发布/readiness 及最终汇总均成功。

迁移门禁调用 `supabase@2.99.0 migration list` 并验证完整 Local/Remote 集合；下载的证据经本地 `verify-dev-migration-evidence.mjs` 复验通过，绑定本次 SHA/development，`migration_history_aligned=true`。工作流目标仍为既定 `20260711120000`，另用数据库容器 READ ONLY 查询确认总数 616、latest `20260911151225`；未执行 migration 或业务数据写入。

独立下载两个 image-manifest 并对照实际容器：

| 服务 | manifest 与实际镜像 digest | 状态 |
| --- | --- | --- |
| API | `sha256:c658eb66a9e0c48cdc577af4cf0596de5539cdf286a1f5c7727a3d105a126261` | running / healthy |
| Admin | `sha256:fbc3af32a37097194eb3cfa23c8b5428088357cd307db12df14b9818f4a42278` | running / healthy |

两容器 revision 均为本次固定 SHA，run label 均为 `34662059027`，Config.Image 为各自 manifest 对应的 repository@digest。Web、H5 和 social-video/cos/billing 三个 worker 的容器 ID、镜像、revision、run 和健康状态与发布前逐项一致。

发布后 HTTP 检查：

- `https://api-dev.goodcms.cn/`：200。
- `https://admin-dev.goodcms.cn/login`：200。
- API 与 Admin 代理的 `route-model-options?page=1&pageSize=20&view=inspect` 未认证请求：均 401 / `TOKEN_MISSING`。

未取得开发超管登录态，本次没有执行真实登录后的模型浏览或保存验收；未认证 smoke 和本地 mock E2E 不替代此验收。未同步方舟目录、调用生图或修改供应商/模型/路由数据；生图仍为未接通，仅模型信息浏览能力更新。

回退应用版本为上轮稳定 `7ec16c8d92ef3612f5019ecda5f0454828e92b4b`，如有需要走同一开发发布入口；无新增数据库回退事项。本地原功能工作区与发布分支保留，旧未提交 readiness 文档不纳入本次记录提交。

发布后磁盘可用 5.1 GB、使用率 92%。服务健康正常，但容量需另行维护；本次未擅自清理镜像、构建缓存或备份。
