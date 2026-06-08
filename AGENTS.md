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
