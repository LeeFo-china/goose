# 前端对接 `@gooes/domain` 摘要

本文档用于说明前端如何接入共享包 `@gooes/domain`。

目标：

- 前后端共用同一套业务枚举与常量
- 前端不再手写第二套状态值
- 页面选项、接口参数、状态展示统一来自共享包

---

## 1. 前端应该怎么引

如果前端和后端在同一个 monorepo：

```ts
import {
  PROJECT_STATUS_VALUES,
  type ProjectStatus,
  CustomerStatusConfig,
} from "@gooes/domain";
```

不要再从旧路径引：

```ts
// 不推荐
import { PROJECT_STATUS_VALUES } from "@/types/domain";
```

---

## 2. 当前适合前端直接使用的内容

### 项目

```ts
import {
  PROJECT_STATUS_VALUES,
  PROJECT_VISIBILITY_STATUS_VALUES,
  PROJECT_CREATE_EMPLOYEE_SCENE_VALUES,
  type ProjectStatus,
  type ProjectVisibilityStatus,
  type ProjectCreateEmployeeScene,
} from "@gooes/domain";
```

用途：

- 项目状态筛选
- 项目创建页可见性选项
- 项目创建页员工选择器 `scene`

### 客户

```ts
import {
  CUSTOMER_STATUS_VALUES,
  CUSTOMER_SOURCE_VALUES,
  CustomerStatusConfig,
  CustomerSourceConfig,
} from "@gooes/domain";
```

用途：

- 客户状态选项
- 客户来源选项
- 列表页 tag 文案映射

### 员工

```ts
import {
  EMPLOYEE_STATUS_VALUES,
  EMPLOYEE_ROLE_VALUES,
  EmployeeStatusConfig,
  EmployeeRoleConfig,
} from "@gooes/domain";
```

用途：

- 员工状态筛选
- 角色文案展示

### 支付

```ts
import {
  PAYMENT_STATUS_VALUES,
  PAYMENT_TYPE_VALUES,
  PaymentStatusConfig,
  PaymentTypeConfig,
} from "@gooes/domain";
```

用途：

- 收款状态
- 收款类型

### 认证 / 短信

```ts
import {
  SMS_SCENE_VALUES,
  AUTH_TARGET_ROLE_VALUES,
  SMS_VERIFICATION_STATUS_VALUES,
} from "@gooes/domain";
```

用途：

- 短信验证码场景
- 绑定身份角色

---

## 3. 前端常见用法

### 渲染下拉选项

```ts
import {
  PROJECT_STATUS_VALUES,
  ProjectStatusConfig,
} from "@gooes/domain";

const options = PROJECT_STATUS_VALUES.map((value) => ({
  label: ProjectStatusConfig[value].label,
  value,
}));
```

### 接口参数类型

```ts
import type { ProjectCreateEmployeeScene } from "@gooes/domain";

function fetchEmployees(scene: ProjectCreateEmployeeScene) {
  return request.get("/projects/create/employees", { scene });
}
```

### 列表展示文案

```ts
import {
  CustomerStatusConfig,
  type CustomerStatus,
} from "@gooes/domain";

function getCustomerStatusLabel(status: CustomerStatus) {
  return CustomerStatusConfig[status].label;
}
```

---

## 4. 前端不要再做的事

- 不要手写 `"lead" | "signed" | "designing"` 这类 union
- 不要在页面里直接写死 `project_designer`
- 不要再维护单独一份状态中文映射对象
- 不要根据猜测发明新枚举值

---

## 5. 迁移建议

如果前端当前还在写：

```ts
const statusOptions = [
  { label: "设计中", value: "designing" },
  { label: "施工中", value: "constructing" },
];
```

建议改成：

```ts
import {
  PROJECT_STATUS_VALUES,
  ProjectStatusConfig,
} from "@gooes/domain";

const statusOptions = PROJECT_STATUS_VALUES.map((value) => ({
  label: ProjectStatusConfig[value].label,
  value,
}));
```

---

## 6. 当前仓库状态

当前后端已经切到：

```ts
import { ... } from "@gooes/domain";
```

所以前端现在直接接这一个包就行，不需要再参考后端 schema 里的硬编码值。
