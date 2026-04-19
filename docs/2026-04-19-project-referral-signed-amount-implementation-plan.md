# 项目介绍人提成与 `signed_amount` 落地执行方案

日期：2026-04-19

## 背景

当前业务新增了一条明确规则：

- 如果一个项目由外部人员介绍成交
- 当项目状态变为 `signed` 时
- 系统应自动计算介绍人提成
- 提成比例范围为 `1% ~ 4%`

同时需要新增一个明确字段：

- `projects.signed_amount`

原因是当前 `projects.budget` 更像预算，不适合作为签约提成的稳定计算基数。  
介绍费应当按“签约金额”计算，而不是按预算或后续回款动态计算。

---

## 一、目标

本次方案目标：

1. 给 `projects` 增加 `signed_amount`
2. 支持项目绑定外部介绍人和提成比例
3. 在项目状态首次变为 `signed` 时自动计算介绍费
4. 将计算结果持久化，避免重复计算
5. 保持符合当前项目分层规范：
   - controller 只处理 HTTP
   - service 处理业务逻辑
   - repository / gateway 负责数据库访问
6. 保证“项目签约 + 介绍费计算”具备原子性和并发安全
7. 为后续修改、重算、支付留出完整审计字段

---

## 二、核心结论

本次不要把介绍费逻辑放进 `payments`。

原因：

- 当前 `payments` 语义是项目收款，不是介绍费支出
- 现在的业务触发点也不是“收款确认”，而是“项目签约”
- 介绍费应该在项目维度一次性计算并落账

因此建议新增独立的介绍费模型，而不是复用 `payments` 表。

---

## 三、数据模型设计

## 1. 给 `projects` 增加 `signed_amount`

建议新增字段：

```sql
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS signed_amount numeric(12,2);
```

字段说明：

- `signed_amount`：项目正式签约金额
- 允许为空：因为不是所有项目一开始都已签约

建议补充注释：

```sql
COMMENT ON COLUMN public.projects.signed_amount IS '项目正式签约金额，用于签约后提成计算';
```

### 为什么不能直接复用 `budget`

- `budget` 在业务上可能是意向预算、估算金额或前期报价
- 签约后真正用于结算的金额应独立存储
- 后续文档、报表、对账、提成追溯都更清晰

---

## 2. 新增外部介绍人主档表

建议新增表：`public.external_referrers`

```sql
CREATE TABLE IF NOT EXISTS public.external_referrers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  bank_name text,
  bank_account text,
  wechat_account text,
  alipay_account text,
  status text NOT NULL DEFAULT 'active',
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

建议约束：

```sql
ALTER TABLE public.external_referrers
DROP CONSTRAINT IF EXISTS external_referrers_status_check;

ALTER TABLE public.external_referrers
ADD CONSTRAINT external_referrers_status_check
CHECK (
  status = ANY (
    ARRAY[
      'active'::text,
      'inactive'::text
    ]
  )
);
```

### 说明

这张表只存“外部介绍人”，不要混进 `customers` 或 `employees`。

---

## 3. 新增项目介绍费规则与结果表

建议新增表：`public.project_referrals`

```sql
CREATE TABLE IF NOT EXISTS public.project_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES public.external_referrers(id) ON DELETE RESTRICT,
  rate_bps integer NOT NULL,
  base_amount numeric(12,2),
  commission_amount numeric(12,2),
  status text NOT NULL DEFAULT 'pending',
  calculated_at timestamptz,
  recalculated_at timestamptz,
  paid_at timestamptz,
  paid_evidence_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  paid_remark text,
  paid_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

建议索引与约束：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS project_referrals_project_id_unique
ON public.project_referrals(project_id);

ALTER TABLE public.project_referrals
ADD CONSTRAINT project_referrals_rate_bps_check
CHECK (rate_bps >= 100 AND rate_bps <= 400);

ALTER TABLE public.project_referrals
DROP CONSTRAINT IF EXISTS project_referrals_status_check;

ALTER TABLE public.project_referrals
ADD CONSTRAINT project_referrals_status_check
CHECK (
  status = ANY (
    ARRAY[
      'pending'::text,
      'calculated'::text,
      'paid'::text,
      'cancelled'::text
    ]
  )
);
```

字段说明：

- `rate_bps`：提成比例，按基点存储
  - `100` = `1%`
  - `400` = `4%`
- `base_amount`：计算基数，取项目签约金额
- `commission_amount`：实际介绍费金额
- `status`：
  - `pending`：已配置但未计算
  - `calculated`：已在签约时自动算出
  - `paid`：已支付给介绍人
  - `cancelled`：作废
- `recalculated_at`：已计算但未支付情况下，被重新计算的时间
- `paid_evidence_images`：支付凭证图片数组
- `paid_remark`：支付备注
- `paid_by`：执行支付登记的员工

### 审计字段说明

对于资金相关业务，建议至少保留：

- `created_at`
- `updated_at`
- `calculated_at`
- `recalculated_at`
- `paid_at`
- `paid_by`

这样后续排查“谁改了比例、什么时候重算、什么时候支付”更稳。

### 为什么用 `bps`

不要直接存浮点比例。

例如：

- `1.5%` 存成 `150`
- `2.75%` 存成 `275`

这样计算和对账更稳定。

---

## 四、计算规则

## 1. 触发时机

唯一触发点：

- 项目状态从“非 `signed`”变成 `signed`

不是：

- 创建项目时
- 更新预算时
- 收款确认时

---

## 2. 计算公式

```text
commission_amount = signed_amount * rate_bps / 10000
```

例如：

- `signed_amount = 200000`
- `rate_bps = 150`

则：

```text
commission_amount = 200000 * 150 / 10000 = 3000
```

---

## 3. 计算前置条件

当项目更新为 `signed` 时，首次自动计算的前置条件为：

1. 项目存在 `project_referrals` 记录
2. `project_referrals.status = pending`
3. 项目 `signed_amount` 不为空
4. `signed_amount > 0`
5. 当前这条介绍费还未计算过

否则：

- 不计算
- 返回明确业务错误，或根据接口语义阻止状态变更

推荐口径：

- 如果传入 `status = signed` 但缺少 `signed_amount`
- 直接阻止更新，并返回业务错误
- `signed_amount` 只要求在“签约补录”时必填，不要求在普通创建项目时必填

原因：

- “签约成功但签约金额为空”本身就是脏状态

如果项目已经是 `signed` 且介绍费已 `calculated`，则不属于“首次自动计算”，而是进入“已计算后变更并重算”的规则，见下文。

---

## 4. 幂等要求

同一个项目不能重复计算介绍费。

推荐保障方式：

1. `project_referrals.project_id` 唯一索引，保证一个项目只对应一条外部介绍费记录
2. 计算必须使用条件更新，而不是“先查后改”
3. 只有 `pending -> calculated` 可以执行首次自动计算
4. 已 `calculated` 但未 `paid` 时，允许重算
5. 已 `paid` 时，不允许再修改 `referrer_id` / `rate_bps` / `signed_amount`

推荐实现方式：

```sql
update public.project_referrals
set
  base_amount = :signed_amount,
  commission_amount = :commission_amount,
  status = 'calculated',
  calculated_at = coalesce(calculated_at, now()),
  recalculated_at = case
    when status = 'calculated' then now()
    else recalculated_at
  end,
  updated_at = now()
where project_id = :project_id
  and status in ('pending', 'calculated');
```

然后结合业务层判断：

- `pending`：首次计算
- `calculated` 且未支付：允许重算
- `paid`：禁止重算

### 为什么要这样做

因为单纯的“先读取状态，再更新”在并发下不安全。  
条件更新或行锁才是更稳的做法。

---

## 5. 已计算后变更规则

你已经确认的业务口径如下：

- 已计算但未支付时，允许修改 `referrer_id`
- 已计算但未支付时，允许修改 `rate_bps`
- 已计算但未支付时，如果 `signed_amount` 被修改，也允许重新计算

因此建议规则明确为：

1. `status = calculated` 且 `paid_at is null`
   - 允许修改 `referrer_id`
   - 允许修改 `rate_bps`
   - 允许修改 `signed_amount`
   - 但修改后必须立即重算 `base_amount / commission_amount`
2. `status = paid`
   - 禁止修改 `referrer_id`
   - 禁止修改 `rate_bps`
   - 禁止修改 `signed_amount`
   - 如确需调整，只能走“作废原记录 + 新建新记录”的人工流程

### 重算推荐口径

重算时不要新建第二条 `project_referrals`，继续复用当前项目唯一那条记录即可。  
但必须更新：

- `base_amount`
- `commission_amount`
- `recalculated_at`
- `updated_at`

如果后续审计要求更严格，可以再补一张：

- `project_referral_change_logs`

用于记录每次修改前后的 `referrer_id / rate_bps / signed_amount / commission_amount`。

---

## 五、接口与分层改造方案

## 1. 当前代码现状

当前 `projects` 更新仍走 `BaseController.update` 的通用更新逻辑。

这意味着：

- 只会做 schema 校验
- 直接更新数据库
- 不会处理“状态变更触发提成计算”的业务逻辑

而根据项目规则，这类逻辑必须放在 `service` 层，不应继续留在基类通用 `update` 中。

---

## 2. 建议新增模块

建议新增：

- `services/project-referrals.ts`
- `services/projects.ts`
- `controllers/project-referrals/index.ts`
- 如有需要，再补 `schema/project-referrals.ts`
- `repositories/project-referrals.ts`
- `repositories/projects.ts`

职责建议：

### `ProjectReferralService`

负责：

- 创建 / 更新项目介绍人配置
- 计算签约介绍费
- 标记介绍费已支付
- 查询项目介绍费详情

核心方法建议：

```ts
createProjectReferral(...)
updateProjectReferral(...)
calculateOnProjectSigned(projectId: string)
markReferralPaid(referralId: string)
getProjectReferral(projectId: string)
```

### `ProjectRepository / ProjectReferralRepository`

负责：

- 直接访问 Supabase / SQL
- 提供事务/RPC需要的底层能力
- 避免在 service 里散落查询细节

这一步是为了符合当前项目规范里“repository / gateway 直接访问数据库”的要求。

---

## 3. `projects` 更新逻辑必须从基类抽离

建议在 `controllers/projects/index.ts` 中显式重写 `update`，不要继续直接用基类的通用实现。

原因：

- 项目状态变更属于领域逻辑
- `signed_amount` 与 `status=signed` 之间有联动校验
- 介绍费自动计算也依赖状态变化前后的对比

推荐流程：

1. controller 读取 `params.id` 和 `body`
2. controller 校验入参
3. controller 调用 `ProjectService.updateProject(...)`
4. `ProjectService` 读取项目原状态
5. 在同一个事务中执行：
   - 更新项目
   - 如有需要，计算或重算介绍费
6. 事务全部成功后返回更新结果

### 原子性要求

这一步必须明确：

- “项目状态改成 `signed`”
- “介绍费计算成功并落库”

必须是一个原子操作。

不能接受的状态：

- 项目已 `signed`
- 但 `project_referrals` 还停留在 `pending`

推荐实现方式有两种：

1. 使用数据库事务
2. 使用 Supabase RPC / PostgreSQL function，把“更新项目 + 计算介绍费”收敛成一次原子调用

如果当前 Bun + Supabase 直接事务能力不方便，优先考虑 RPC。

---

## 4. 推荐服务层伪代码

```ts
async updateProject(id: string, input: UpdateProjectInput) {
  const existing = await projectRepository.findById(id);

  if (!existing) {
    throw Errors.badRequest("项目不存在");
  }

  if (input.status === "signed") {
    if (input.signed_amount == null || Number(input.signed_amount) <= 0) {
      throw Errors.badRequest("项目签约时必须提供有效的 signed_amount");
    }
  }

  return await projectRepository.runInTransaction(async (tx) => {
    const updated = await projectRepository.update(tx, id, input);

    const signedNow =
      existing.status !== "signed" && updated.status === "signed";

    const signedRecalculate =
      updated.status === "signed" &&
      existing.status === "signed" &&
      input.signed_amount != null;

    if (signedNow || signedRecalculate) {
      await projectReferralService.calculateOnProjectSigned(tx, updated.id);
    }

    return updated;
  });
}
```

---

## 六、Schema 与类型改造

## 1. `schema/projects.ts`

需要新增：

```ts
signed_amount: z.coerce
  .number("签约金额必须是数字")
  .min(0, "签约金额不能为负数")
  .nullable()
  .optional(),
```

放进：

- `ProjectBaseSchema`
- `CreateProjectSchema`
- `UpdateProjectSchema`

---

## 2. `types/database.ts`

执行 migration 后重新生成 Supabase 类型：

```bash
supabase gen types typescript --project-id <project-id> > types/database.ts
```

需要体现在：

- `projects.signed_amount`
- `external_referrers`
- `project_referrals`

---

## 3. `schema/project-referrals.ts`

建议新增并直接引用 `packages/domain` 中的状态枚举。

例如：

```ts
z.enum(PROJECT_REFERRAL_STATUS_VALUES)
z.enum(EXTERNAL_REFERRER_STATUS_VALUES)
```

不要在 schema 里重新手写：

```ts
z.enum(["pending", "calculated", "paid", "cancelled"])
```

---

## 七、数据库迁移建议顺序

建议拆成 3 个 migration：

### migration 1

给 `projects` 加 `signed_amount`

### migration 2

新增 `external_referrers`

### migration 3

新增 `project_referrals`，补唯一约束、检查约束、索引

这样做的好处：

- 回滚更容易
- 类型变化更清晰
- 每一步上线风险更可控

---

## 八、前端联动点

虽然这份方案主要面向后端，但前端也会受影响。

前端需要新增或调整：

1. 项目编辑 / 创建表单新增 `signed_amount`
2. `signed_amount` 不是创建项目阶段必填，而是在状态切换为 `signed` 时必须补录
3. 项目详情页可展示：
   - 外部介绍人
   - 提成比例
   - 已计算介绍费
   - 是否已支付
   - 支付凭证
   - 支付备注

但注意：

- 即使前端做了必填限制，后端也必须再次校验

---

## 九、验收标准

满足以下条件即可认为本次落地完成：

1. `projects` 表存在 `signed_amount`
2. 可以为项目绑定一个外部介绍人和提成比例
3. 当项目状态第一次变为 `signed` 时，自动计算介绍费
4. 未提供 `signed_amount` 时，不允许项目签约
5. 相同输入不会重复落账；已计算但未支付时允许显式重算
6. 已计算但未支付时，可以修改介绍人 / 比例 / `signed_amount` 并重新计算
7. 已支付后，不允许再改介绍人 / 比例 / `signed_amount`
8. 可以查询到项目对应的介绍费记录
9. 可以手工标记介绍费已支付，并保存支付凭证和备注

---

## 十、建议实施顺序

建议按下面顺序开发：

1. `packages/domain`：新增 referral 相关状态枚举与导出
2. migration：给 `projects` 增加 `signed_amount`
3. migration：新增 `external_referrers`
4. migration：新增 `project_referrals`
5. schema：补 `signed_amount` 与 referral schema，并直接引用 domain 常量
6. repository：新增 `projects` / `project-referrals` 数据访问层
7. service：新增 `ProjectReferralService`
8. service：重构 `ProjectService.updateProject`
9. controller：重写 `projects.update`
10. controller：新增 `project-referrals` 路由
11. 文档：补接口说明与前端联调摘要

---

## 十一、需要同步更新 `packages/domain` 的内容

本次方案里，不是所有新增内容都需要进入 `packages/domain`。

判断标准：

- 属于稳定业务值域，需要前端 / 后端 / 数据库共同遵守的，必须进入 `packages/domain`
- 普通数值字段、数据库字段本身，不需要进入 `packages/domain`

### 1. 需要进入 `packages/domain` 的内容

#### `external_referrers.status`

建议新增：

```ts
export const EXTERNAL_REFERRER_STATUS_VALUES = [
  'active',
  'inactive',
] as const;

export type ExternalReferrerStatus =
  (typeof EXTERNAL_REFERRER_STATUS_VALUES)[number];
```

#### `project_referrals.status`

建议新增：

```ts
export const PROJECT_REFERRAL_STATUS_VALUES = [
  'pending',
  'calculated',
  'paid',
  'cancelled',
] as const;

export type ProjectReferralStatus =
  (typeof PROJECT_REFERRAL_STATUS_VALUES)[number];
```

如果前端会直接展示状态文案，建议顺手补 `Config`：

```ts
export const ProjectReferralStatusConfig = {
  pending: { label: '待计算', type: 'warning' },
  calculated: { label: '已计算', type: 'primary' },
  paid: { label: '已支付', type: 'success' },
  cancelled: { label: '已作废', type: 'danger' },
};
```

### 2. 不需要进入 `packages/domain` 的内容

#### `signed_amount`

`signed_amount` 是业务字段，不是业务枚举，不需要放进 `packages/domain`。

#### `rate_bps`

`rate_bps` 是数值字段，不是稳定值域，也不需要放进 `packages/domain`。

如果后续前后端都要共用比例边界，可以再补普通常量：

```ts
export const PROJECT_REFERRAL_RATE_BPS_MIN = 100;
export const PROJECT_REFERRAL_RATE_BPS_MAX = 400;
```

但这不是本次必须项。

### 3. 建议文件位置

建议新增：

- `packages/domain/src/referral.ts`

并同步更新导出：

- `packages/domain/src/index.ts`
- `packages/domain/src/shared.ts`

### 4. 推荐执行顺序

在本次方案中，`packages/domain` 的更新建议放在 schema 和 migration 之前：

1. `packages/domain`：补 referral 相关枚举
2. schema：引用 domain 常量
3. migration：新增表和字段，并补数据库默认值与 check constraint
4. repository / service / controller：引用 domain type

---

## 十二、一句话结论

本次正确的落地方式是：

- 给 `projects` 增加 `signed_amount`
- 新增独立的外部介绍人与项目介绍费表
- 在项目状态首次进入 `signed` 时，按 `signed_amount * rate_bps / 10000` 自动计算介绍费
- 不再把介绍费逻辑挂到 `payments` 上
