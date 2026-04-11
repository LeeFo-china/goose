# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-08
**Commit:** 7d52722
**Branch:** feature/customer

## OVERVIEW
Bun + TypeScript + Fastify REST API with Supabase backend. Provides CRUD for customers, employees, departments, payments, projects, posts via resource factory pattern.

## STRUCTURE
```
gooes/
├── app.ts                 # Fastify entry point (port from env)
├── controllers/           # BaseController + domain controllers
├── routes/                # Autoload registry + resource factory
├── schema/                # Zod validation schemas
├── supabase/              # Migrations + Edge functions (Deno)
├── types/                 # TypeScript definitions
├── utils/                 # Decorators, response helpers, DB client
├── errors/                # AppError, error factory, error codes
└── plugins/               # Fastify plugins (error handler)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Add new CRUD | controllers/X/index.ts + schema/X.ts | Extend BaseController |
| Route registration | routes/index.ts | AutoLoad registers all |
| Custom routes | routes/factory.ts | createResourceRoutes() |
| Validation | schema/*.ts | Zod schemas |
| Supabase client | utils/supabase/index.ts | Static from() API |
| Error handling | errors/error-factory.ts | Errors.badRequest(), .dbError() |

## CONVENTIONS
- Path alias: `@/*` → `./*`
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
bun --watch app.ts     # dev
bun app.ts            # start
bun build app.ts --outdir dist --target node  # build
supabase gen types typescript --project-id X > types/database.ts  # gen types
```

## NOTES
- Hybrid runtime: Bun (main app) + Deno (Supabase Edge functions)
- No src/ directory - files at root level
- package.json "module": "index.ts" but entry is app.ts (mismatch)
- Both bun.lock and pnpm-lock.yaml present (use bun)

## STRICT RULES
1. 禁止在 `controllers/` 以外的地方直接编写数据库逻辑。
2. 错误响应必须经过 `error-factory.ts` 包装，严禁直接 `throw new Error()`。

## MCP TOOLS MAPPING
- Database Queries: `mcp:supabase:query`