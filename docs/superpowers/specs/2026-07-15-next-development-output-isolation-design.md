# Next.js 开发产物隔离设计

## 背景

`apps/admin` 与 `apps/web` 的日常 `next dev` 默认写入 `.next`，与生产
`next build` 和 standalone 启动使用同一目录。开发服务与生产构建并行或先后运行时，
开发缓存可能覆盖生产产物，造成 standalone 文件缺失或内容不一致。

`apps/admin` 的 Playwright 服务已通过 `NEXT_DIST_DIR=.next-e2e` 隔离，说明现有
`distDir` 扩展点可复用；问题只存在于普通开发入口以及尚未配置 `distDir` 的
`apps/web`。

## 目标

- `apps/admin` 与 `apps/web` 的开发服务统一写入 `.next-dev`。
- 生产构建与 standalone 启动继续固定使用 `.next`。
- `apps/admin` Playwright 开发服务继续写入 `.next-e2e`。
- 通过自动化契约阻止日常开发再次退回生产目录。

## 非目标

- 不调整端口、部署方式或 Docker 镜像路径。
- 不改变 web 的生产模式 Playwright 构建流程。
- 不新增依赖，也不重构现有 Next.js 启动脚本。

## 设计

两个 `next.config.ts` 均导出接收 Next.js phase 的配置函数，并使用已安装
Next.js 15.5.20 公开导出的 `PHASE_DEVELOPMENT_SERVER` 判断开发模式。

目录选择规则：

1. 开发 phase：优先使用 `NEXT_DIST_DIR`，未设置时使用 `.next-dev`。
2. 其他 phase：始终使用 `.next`，不接受开发目录环境变量覆盖。

因此普通 `next dev` 无论由根脚本、包脚本还是直接执行，都会写入 `.next-dev`；
admin E2E 仍可在开发 phase 覆盖为 `.next-e2e`；`next build` 始终写入生产 `.next`，
与现有同步静态资源脚本、standalone 启动脚本和 Dockerfile 保持一致。

`.gitignore` 增加 `apps/*/.next-dev`。现有 `.next` 与 `.next-e2e` 忽略规则保留。

## 类型文件行为

Next.js 会依据当前 `distDir` 自动更新 `next-env.d.ts` 和 `tsconfig.json` 的生成类型
引用。本次不改变这些文件的跟踪策略，也不增加常驻包装进程。验证开发服务时会保存并
恢复这两个文件，避免验证过程产生无关改动；生产构建最终会恢复 `.next` 类型引用。

## 验证

1. 先更新并运行 web 的 release quality contract，验证开发、生产目录规则。
2. 运行 admin 与 web 类型检查。
3. 分别短暂启动两个开发服务，确认生成 `.next-dev`，且未改写已有 `.next` 标记。
4. 运行生产构建，确认 `.next/BUILD_ID` 与 standalone 产物存在，且未写入
   `.next-dev`。
5. 检查 Git diff，确认没有意外修改生成类型文件或其他用户文件。

## 回滚

回滚两个 `next.config.ts` 的 phase-aware `distDir`、相应契约测试和 `.gitignore`
规则即可。生产目录和部署路径从未改变，无需迁移或清理生产数据。
