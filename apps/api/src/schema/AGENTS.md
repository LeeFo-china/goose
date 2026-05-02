# schema/ - Zod Validation Schemas

## OVERVIEW
Zod validation schemas for API request/response validation with Chinese error messages.

## STRUCTURE
```
schema/
├── customer.ts        # CustomerSchema, CreateCustomerSchema, UpdateCustomerSchema
├── employee.ts        # EmployeeBaseSchema with role/status enums
├── departments.ts     # Department schemas
├── payment.ts         # PaymentBaseSchema with amount coercion
├── projects.ts        # Project schemas
├── post.ts            # Post/feed schemas
├── wechat.ts          # WeChat-related schemas
└── request.ts         # Shared request param schemas (IdParamSchema)
```

## WHERE TO LOOK
| Task | Location | Pattern |
|------|----------|---------|
| Add new entity schema | Create `entity.ts` | BaseSchema + Create/Update variants |
| Shared param validation | request.ts | IdParamSchema for UUID params |
| Phone validation | Copy from customer.ts or employee.ts | `/^1[3-9]\d{9}$/` regex |
| Enum validation | See employee.ts, payment.ts | `z.enum([...], { message: "..." })` |

## CONVENTIONS
- **Three-schema pattern**: `XSchema`, `CreateXSchema`, `UpdateXSchema`
- **Base schema**: Full entity with `.optional()` for server-generated fields (id, created_at)
- **Create schema**: `BaseSchema.omit({ id: true, created_at: true })` or `.extend()` with required fields
- **Update schema**: `CreateXSchema.partial()` for PATCH operations
- **Type exports**: `export type XType = z.infer<typeof XSchema>`
- **Chinese messages**: All validation messages in Chinese
- **UUID validation**: `z.string().uuid("无效的 ID 格式")` or `z.uuid("...")`
- **Phone regex**: `/^1[3-9]\d{9}$/` for mainland China mobile numbers
- **Datetime**: `z.iso.datetime()` or `z.string().datetime()`
- **Coercion**: Use `z.coerce.number()` for numeric inputs from forms/JSON

## ANTI-PATTERNS (THIS DIRECTORY)
- **Inconsistent naming**: Some use `XSchema`, others `XBaseSchema` (follow existing file's style)
- **Mixed UUID APIs**: Some use `z.uuid()`, others `z.string().uuid()` (both work, be consistent within file)
- **Nullable vs optional**: Be explicit - `nullable()` for DB nulls, `optional()` for missing keys
