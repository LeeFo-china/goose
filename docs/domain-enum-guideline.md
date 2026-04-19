# Domain 枚举与常量规范

本文档用于约束项目中所有业务枚举、常量和值域的唯一来源。

结论：

- `types/domain/` 是唯一事实来源
- 前端、后端 schema、controller、service、数据库约束都必须从这里收口
- 禁止在业务代码里重新手写一套相同值域

---

## 1. 唯一来源

所有业务值域必须先定义在：

- `types/domain/*.ts`

定义内容包括：

- `XXX_VALUES`
- `type XXX = (typeof XXX_VALUES)[number]`
- 可选的 `Config`
- 可选的 `isXXX` 类型守卫

例如：

```ts
export const PAYMENT_STATUS_VALUES = [
  "pending",
  "confirmed",
  "rejected",
  "refunded",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUS_VALUES)[number];
```

---

## 2. 使用规则

### schema

Zod schema 必须直接引用 domain 常量：

```ts
z.enum(PAYMENT_STATUS_VALUES)
```

禁止：

```ts
z.enum(["pending", "confirmed", "rejected", "refunded"])
```

### controller / service

类型定义必须直接引用 domain type：

```ts
type Scene = SmsScene;
type Role = AuthTargetRole;
```

禁止在 controller / service 里重新声明：

```ts
type Scene = "bind_customer" | "bind_employee";
```

### 文档

文档可以写示例值，但接口文档不得发明新枚举。

如果文档要描述可选值，必须以 `types/domain` 当前定义为准。

### 数据库

如果该字段属于稳定业务值域，数据库必须补：

- `DEFAULT`
- `CHECK CONSTRAINT`

迁移里的值域必须与 `types/domain` 一致。

---

## 3. 新增枚举的标准流程

新增一个业务枚举时，按这个顺序执行：

1. 在 `types/domain/` 新增常量和类型
2. 在 `types/domain/index.ts` 和 `types/domain/shared.ts` 导出
3. 修改相关 `schema/*`，改为直接引用 domain 常量
4. 修改相关 `controller/*`、`services/*` 类型
5. 如果字段落库，新增 migration 补 `DEFAULT/CHECK`
6. 更新接口文档
7. 跑 `bunx tsc --noEmit --pretty false`
8. 如涉及数据库，执行 `supabase db push`

---

## 4. 可以直接复用 domain 的场景

适合进入 `types/domain` 的内容：

- 状态枚举
- 类型枚举
- 角色枚举
- 场景枚举
- 可见性枚举
- 作者身份枚举
- 岗位/部门编码

不适合放入 `types/domain` 的内容：

- 临时 UI 文案
- 纯页面局部常量
- 单个函数内部的非业务常量

---

## 5. 当前已收口的主要值域

目前已统一到 `types/domain` 的主要业务值域包括：

- customer status / source
- employee status / role
- payment status / type
- project status / visibility / create employee scene
- post code / salary type / status
- expense mode / status
- sms scene / sms verification status
- auth target role
- ai message role
- project log comment author type

---

## 6. 禁止事项

- 禁止在 schema 里重复写业务枚举字面量
- 禁止在 controller 里重新声明同一套 union type
- 禁止数据库值域与 `types/domain` 长期脱节
- 禁止前端自己维护另一套同名但不同值的常量文件

---

## 7. 判断标准

如果一个值域同时满足下面两条，就必须进入 `types/domain`：

1. 它是业务语义，不只是页面实现细节
2. 它会被前端、后端、数据库中的任意两层共同使用
