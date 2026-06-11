# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-08
**Commit:** 7d52722
**Branch:** feature/customer

## OVERVIEW
Bun + TypeScript + Fastify REST API with Supabase backend. Provides CRUD for customers, employees, departments, payments, projects, posts via resource factory pattern.

## STRUCTURE
```
gooes/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── app.ts        # Fastify entry point (port from env)
│   │   │   ├── controllers/  # BaseController + domain controllers
│   │   │   ├── routes/       # Autoload registry + resource factory
│   │   │   ├── schema/       # Zod validation schemas
│   │   │   └── services/     # Business orchestration
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── admin/              # Next.js admin console
├── packages/
│   └── domain/             # Shared domain types/constants used by api/admin
├── supabase/              # Migrations + Edge functions (Deno)
├── tsconfig.base.json
└── pnpm-workspace.yaml
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Add new CRUD | apps/api/src/controllers/X/index.ts + apps/api/src/schema/X.ts | Extend BaseController |
| Route registration | apps/api/src/routes/index.ts | AutoLoad registers all |
| Custom routes | apps/api/src/routes/factory.ts | createResourceRoutes() |
| Validation | apps/api/src/schema/*.ts | Zod schemas |
| Supabase client | apps/api/src/utils/supabase/index.ts | Static from() API |
| Error handling | apps/api/src/errors/error-factory.ts | Errors.badRequest(), .dbError() |

## CONVENTIONS
- API package alias: `@/*` → `apps/api/src/*`
- Shared domain imports should use `@gooes/domain` from both API and admin.
- File naming: kebab-case (except BaseController.ts)
- ES modules with `"type": "module"`
- Decorator metadata: `reflect-metadata` import first in app.ts
- Controller extends BaseController<TCreate, TUpdate>
- Schema files: `XSchema`, `CreateXSchema`, `UpdateXSchema` + types

## ANTI-PATTERNS (THIS PROJECT)
- **NO tests** - zero test infrastructure
- `as any` type assertions in wechat controller, error handler, decorators
- `any` type in BaseController generics and route decorators
- Non-null assertions on env vars (utils/supabase/index.ts:18-19)
- console.log in production code (app.ts:21, rpc controller)

## UNIQUE STYLES
- Resource factory: `createResourceRoutes("plural", Controller)`
- BaseController generic: `BaseController<TCreate, TUpdate>`
- Zod UUID validation: `z.uuid("无效的 ID 格式")`
- Chinese error messages throughout

## COMMANDS
```bash
bun run api:dev       # dev
bun run api:start     # start
bun run api:build     # build
supabase gen types typescript --project-id X > apps/api/src/types/database.ts  # gen types
```

## NOTES
- Hybrid runtime: Bun (main app) + Deno (Supabase Edge functions)
- Backend runtime lives in apps/api/src
- Both bun.lock and pnpm-lock.yaml present (use bun)

## STRICT RULES

- **数据库变更必须使用 migration。**
  任何表结构、索引、约束、RLS/policy、函数、触发器、枚举、字典/初始化数据变更，
  都必须通过 `supabase/migrations/` 下的 migration 文件完成并纳入版本控制。
  禁止手动在远端数据库执行 DDL/DML 修库。应用前需确认待执行 migration，
  应用后需用 `supabase migration list` 验证 Local/Remote 对齐；破坏性变更必须说明回滚方案。

- **禁止改动 orange 仓库内容。**
  Agent 只负责 gooes 仓库的代码、文档、Git 和服务操作。`/Users/leefo/Public/work/orange`
  仅允许只读参考，禁止修改其中任何文件、运行格式化/生成脚本、执行 git add/commit/push
  或其他会改变 orange 工作区状态的操作。需要 orange 变更时，只能说明应由小程序团队处理。

- **列表接口必须分页。**
  所有返回列表的接口必须支持分页，禁止无上限返回全量数据。默认使用
  `page=1&pageSize=20`，`pageSize` 最大值不得超过 `100`。大数据量或高频列表
  优先使用游标分页。仅当数据源明确保证总量 `<= 50` 且属于内部/辅助功能时可豁免，
  但必须在代码注释中说明原因。

- **后端查询必须考虑性能边界。**
  新增或修改列表、搜索、统计、高频读写接口时，必须避免 N+1 查询，Supabase
  查询必须限定必要字段，列表查询必须使用 `.range()`、`.limit()` 或游标分页。
  涉及大表过滤、排序、JOIN、RPC 或新增索引时，必须通过 migration 管理索引，
  并在必要时用 `EXPLAIN ANALYZE` 验证执行计划。禁止为了性能规则随意引入缓存、
  队列、Redis 或新依赖；确需引入时必须先说明原因和替代方案。

- **AI 代码改动必须小步、守边界、可验证。**
  修改代码前必须先阅读相关文件、邻近实现和项目配置，复用现有模式，禁止凭空引入新架构。
  每次改动只解决一个明确目标，禁止顺手重构无关文件、复制一套相似实现或新增未获确认的依赖。
  后端必须遵守 controller/service/repository 分层，前端必须优先复用现有 shadcn/ui 和本地业务组件。
  完成后必须运行最小必要验证（类型检查、构建、smoke 或 migration 状态检查），无法验证时必须说明原因和剩余风险。

- **缺陷修复必须定位根因。**
  对任何 bug、异常、测试失败或线上问题，修复前必须先复现问题、阅读错误信息、
  追踪数据流并说明 Root Cause。禁止提交只掩盖表面现象的补丁式修复，
  例如无依据判空、硬编码特殊值、吞掉异常、绕过校验或跳过权限检查。
  如因紧急情况需要先止血，必须在代码、提交说明或任务记录中标记
  `[HOTFIX]` 或 `[WORKAROUND]`，说明临时方案的风险，并记录后续根因修复事项。
  修复完成后必须提供验证方式：自动化测试、复现步骤、接口 smoke、日志证据或
  其他能证明根因已消除的检查。

- **禁止猜测第三方库 API 和类型名。**
  使用或修改第三方库代码前，必须先核对本项目已安装版本的真实导出、类型定义和示例用法。
  优先检查 `node_modules` 类型文件、包内文档、现有项目用法或官方文档，禁止按通用命名习惯猜测
  类型名、事件名、配置项或导入路径。涉及第三方库类型错误时，必须先用 `rg`、`tsc`、
  package exports 或 IDE 类型定义定位真实 API，再修改代码。启动 E2E、浏览器 smoke、
  dev server 等耗时验证前，必须先通过最小静态检查；禁止在类型、导入或第三方 API
  尚未确认时直接启动长耗时验证。

错误响应必须经过 `error-factory.ts` 包装，严禁直接 `throw new Error()`。
 - controller
      - 只处理 HTTP
      - 读 request
      - 校验参数
      - 调用 service
      - 包装 ResponseHandler.success
  - service
      - 编排业务逻辑
      - 组合查询条件
      - 调 repository / rpc client
      - 做领域层数据转换
  - repository / gateway
      - 直接访问 Supabase / SQL / RPC

## MCP TOOLS MAPPING
- Database Queries: `mcp:supabase:query`
