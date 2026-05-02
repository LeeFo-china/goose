# controllers/

## OVERVIEW
11 domain controllers + BaseController providing CRUD operations via generic inheritance and decorator-based custom routes.

## STRUCTURE
```
controllers/
├── BaseController.ts           # Generic CRUD: list, getById, create, update
├── customer/index.ts           # customers table CRUD
├── employee/index.ts           # employees table + join queries
├── departments/index.ts        # departments table CRUD
├── projects/index.ts           # projects table CRUD
├── payment/index.ts            # payments table CRUD
├── posts/index.ts              # posts table CRUD
├── wechat/index.ts             # WeChat auth integration
└── common/rpc/get_home_dashboard_stats/  # Supabase RPC wrapper
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Add CRUD for new table | Create `controllers/{name}/index.ts` | Extend BaseController with Zod schemas |
| Custom routes | Use `@Get("/path")` or `@Post("/path")` | Decorators auto-register via registerRoutes() |
| Complex joins | See employee/index.ts | Supabase select with relationships |
| RPC calls | controllers/common/rpc/ | Supabase RPC via getClient().rpc() |
| Validation errors | Errors.fromZod(), Errors.dbError() | Consistent error handling |

## CONVENTIONS
- **Generic signature**: `BaseController<TCreateSchema, TUpdateSchema, TResponseType>`
- **Table name**: Pass as first constructor arg, matches Supabase table
- **Zod schemas**: Import from `@/schema/{domain}` - CreateXxxSchema, UpdateXxxSchema
- **Export pattern**: `export default new XxxController()` singleton instance
- **Custom routes**: Use `@Get("/path")` / `@Post("/path")` decorators on class methods
- **Response helper**: `ResponseHandler.success<T>(data)` / `.error(message, data)`
- **Param validation**: `this.idParamSchema.safeParse(request.params)` for UUID params
- **Body validation**: Schema `.safeParse(request.body)` before DB operations

## ANTI-PATTERNS
- **DON'T** use `as any` for request bodies (see wechat/index.ts:35)
- **DON'T** export class instead of instance - routes/factory.ts expects singleton
- **DON'T** forget to pass schemas to BaseController constructor or validation breaks
- **DON'T** use double `await await` (BaseController.ts:55, 72, 98 - typo pattern)
- **DON'T** call SupabaseDB directly without error handling - always wrap with Errors.dbError()
