# SUPABASE KNOWLEDGE BASE

**Domain:** Deno Edge functions + database migrations (separate from Bun main app)

## OVERVIEW
Supabase local development with Deno-based Edge functions and timestamped SQL migrations.

## STRUCTURE
```
supabase/
├── functions/
│   ├── wechat-login/
│   │   ├── index.ts          # WeChat code-to-openid exchange
│   │   └── deno.json         # Import map
│   └── hello-gushi/
│       ├── index.ts          # Hello world example
│       └── deno.json
├── migrations/
│   └── YYYYMMDDHHMMSS_*.sql  # Timestamped SQL migrations
└── config.toml               # Supabase CLI configuration
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Add Edge function | functions/[name]/index.ts | Use `Deno.serve(async (req) => {...})` |
| Function config | config.toml [functions.X] | Set verify_jwt, import_map, entrypoint |
| Environment vars | Deno.env.get("KEY") | Secrets from .env or Supabase dashboard |
| New migration | migrations/YYYYMMDDHHMMSS_name.sql | Timestamp prefix required |
| WeChat auth | functions/wechat-login/index.ts | Calls api.weixin.qq.com/sns/jscode2session |

## CONVENTIONS
- **Runtime:** Deno 2 (not Bun). Import from `jsr:@supabase/functions-js`
- **Entry pattern:** `Deno.serve(async (req: Request) => { ... })`
- **Response:** `new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } })`
- **Migrations:** SQL files named `YYYYMMDDHHMMSS_description.sql`
- **Local testing:** `curl -X POST http://127.0.0.1:54321/functions/v1/FUNCTION_NAME`
- **Import maps:** Each function has its own `deno.json` for dependencies

## ANTI-PATTERNS
- **NO Bun APIs** in Edge functions. Use Deno standard library only
- **NO direct Supabase client imports** without import map configuration
- **NO unverified JWTs** in production (config.toml: verify_jwt = true)
- **NO secrets in code** - always use `Deno.env.get()`
- **NO manual migration numbering** - use `supabase migration new`
