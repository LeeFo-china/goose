# SKU 清理脚本修复：开发 API 独立发布验收

2026-09-08，15:20–15:24（Asia/Shanghai）。本次执行用户确认的“单独发布清理脚本修复”，不是阶段 C 发布。

## 发布结果

- [Release Dev #34198800908](https://github.com/LeeFo-china/goose/actions/runs/34198800908)：`completed / success`，07:20:01–07:22:47 UTC。
- 分支：`fix/warehouse-orphan-remediation`；不可变发布提交：`678dd4a33e1fd5f58e0619b84d8ce3f44a56c30c`。
- dispatch 参数：`service=api`、`operation=release`、reason=`Publish warehouse-aware SKU smoke cleanup only; Stage C excluded`。
- 实际镜像：`useccr.ccs.tencentyun.com/america_goose/goose-api@sha256:be8cbe11071ef9ffb2d4d3feb12904c43d15a7e3e731fbc24b970c9e6a91605c`。
- 已独立核对运行容器的 revision、run ID、镜像 digest 与同一次 workflow 的 `image-manifest-api` 一致；容器 running / healthy，开发 API 根路径 HTTP 200。

`dev-build-plan` 中 build_services / deploy_services 均仅为 `["api"]`。复用 workflow 的其他矩阵 job 只运行 runner 守卫，checkout / build / push / manifest 全部跳过；deploy-rest 跳过。没有发布 Admin、H5、Web 或 worker，没有触碰生产或 Orange。

## 为什么使用专用分支

API Dockerfile 会把 `apps/api` 源码复制到运行镜像，因此本次 API 发布确实更新了 smoke fixture。发布前 API revision 为 `65d1ed282bcfbbf608b6b8f6d49c288e1fa032e8`；从此版本到 main `ad22e9e7f73833e01986654ae73b4a2ea925734a`，API、domain、scripts、API Dockerfile 和根依赖清单无差异。候选只带独立清理修复及其验证、迁移和证据文件，不含 C。

当前 main push 的自动分类会将辅助脚本变更扩展到多服务发布。本轮使用现有 Release Dev 显式仅发布 API，不修改工作流、不绕过迁移或权限门禁、不合并或推送 main。验收时远端 main 仍为 `ad22e9e7f73833e01986654ae73b4a2ea925734a`。

## 清理保护验证

发布前本轮重新执行并通过：五个 SKU 相关测试文件共 69 pass / 0 fail / 272 assertions，API `bun run check`（类型检查、构建、文件大小检查），根 `bun run check:permission-boundaries`，`git diff --check`。

发布后收尾曾误在仓库根目录执行这五个测试，两个文件因 `@/` 别名无法解析而加载失败（27 pass / 2 fail）；`@/*` 只配置于 `apps/api/tsconfig.json`，不是发布代码回归。仅将工作目录改回 `apps/api` 后，同五文件重新得到 69 pass / 0 fail / 272 assertions，未改代码、未跳过测试。可复现的正确命令：

```bash
# 工作目录：apps/api
bun test src/scripts/supplier-purchasable-sku-smoke-cleanup.test.ts src/scripts/supplier-purchasable-sku-smoke.test.ts src/scripts/supplier-purchasable-sku-explain.test.ts src/scripts/supplier-purchasable-sku-development-database.test.ts src/scripts/supplier-purchasable-sku-dev-direct.test.ts
```

运行容器内脚本 `/app/apps/api/src/scripts/supplier-purchasable-sku-smoke-fixture.ts` 的 SHA-256：

- 发布前：`8f1549a00749b0bda14908a1f473beb7379c5cb8815a43b3dc9c182c7fc5d4f9`。
- 发布后：`806e07c2fb5a8a8afb3bd2abb40478ed57238219c80a57034f49913ddb73cb98`，与本地候选完全相同。

在实际运行容器执行 `bun test src/scripts/supplier-purchasable-sku-smoke-cleanup.test.ts`：4 pass / 0 fail / 15 assertions。该测试只读取源码，不连接或写入数据库，核对恢复 FK 检查的顺序、默认仓库精确删除条件、两个 fixture 租户的 warehouse / command 残留计数。真实 seed / cleanup 数据库回归沿用修复应用前的隔离数据库验证；本次没有在真实开发库额外运行写入型 SKU smoke。

## 数据库与其他服务核对

发布门禁使用 Supabase CLI 2.99.0 `migration list` 并严格比较完整本地 / 远端历史，结果 aligned=true。候选含 595 条迁移；发布仅核对历史，没有再次应用修复 migration，也没有应用 C 的 4 条迁移。

07:23:26 UTC 以显式 `BEGIN READ ONLY` 和 15 秒语句超时核对：

- migration 595，最新 `20260908062915`；仓库 1，孤儿 0，修复审计 4。
- WH-000001 整行 MD5 仍为 `e4d4603c47cdd509b4ee01a4e9916588`。
- Admin revision 仍为 `ad22e9e7f73833e01986654ae73b4a2ea925734a`，image digest `sha256:e378e0b92cf3611b6c96ed69728403360694be09a91c8bb58ac7acb7ec6c0b3a`。
- social-video-worker revision 仍为 `65d1ed282bcfbbf608b6b8f6d49c288e1fa032e8`，image digest `sha256:8a8f3065a3645aec4e56bbcc3fd42efc25bee78a75feb622a1f76036c1c8a26d`。
- cos / billing worker revision 仍为 `65d1ed282bcfbbf608b6b8f6d49c288e1fa032e8`，均保持原 API image digest `sha256:75ceabd9585b0593f2bf6d61c833deb4efca97646ff0d3162ae6d7693c73f43e`。
- 上述容器全部 running / healthy。

开发机最后采样可用磁盘 3,800,838,144 bytes（94% 已用）。本轮未主动删除镜像、日志或备份；磁盘容量仍需单独治理。

## 边界与后续

修复分支已推送，修复已在开发 API 生效，但 main 尚未合并。使用旧 main、本地旧 checkout 或旧 worker 镜像手工运行 smoke，不会自动获得此次清理保护；应使用上述修复提交或已核验的开发 API 容器，不能宣称所有旧副本均已修复。

阶段 C 原分支及其 4 条待应用迁移保留，本轮没有启用任何租户开关。后续 main 集成和 C 发布应分别评审；不得将本次修复发布等同于 C 验收。

若需回退 API，应按现有不可变版本发布流程另行确认；旧 API 版本不具备本次清理保护。数据库修复的审计快照和完整备份仍保留，不能通过服务回退逆向插回孤儿行。数据库应用与恢复证据见[前序验收记录](2026-09-08-warehouse-orphan-dev-apply.md)。
