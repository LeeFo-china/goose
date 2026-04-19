# 前端仓库接入 `@gooes/domain`

本文档用于说明当前前端不在同一个仓库时，如何接入共享包 `@gooes/domain`。

当前后端仓库已经准备好可发布包：

- 包目录： [packages/domain](/Users/leefo/Public/work/gooes/packages/domain)
- 本地打包产物： [gooes-domain-1.0.0.tgz](/Users/leefo/Public/work/gooes/packages/domain/gooes-domain-1.0.0.tgz)

---

## 1. 推荐接入顺序

建议按这个顺序：

1. 前端先用本地 tarball 接入验证
2. 验证没问题后，再发布到私有 registry
3. 前端把依赖切到正式版本号

这样风险最低。

---

## 2. 本地 tarball 安装方式

在前端仓库里执行：

```bash
npm install /Users/leefo/Public/work/gooes/packages/domain/gooes-domain-1.0.0.tgz
```

或：

```bash
pnpm add /Users/leefo/Public/work/gooes/packages/domain/gooes-domain-1.0.0.tgz
```

安装后就可以直接：

```ts
import {
  PROJECT_STATUS_VALUES,
  CustomerStatusConfig,
  type ProjectStatus,
} from "@gooes/domain";
```

---

## 3. 私有 registry 方式

如果后续发布到私有 npm / GitHub Packages，前端仓库安装方式会变成：

```bash
npm install @gooes/domain
```

或指定版本：

```bash
npm install @gooes/domain@1.0.0
```

---

## 4. 前端改造建议

前端仓库里，把所有手写业务枚举逐步替换成：

```ts
import { ... } from "@gooes/domain";
```

优先替换这几类：

- 项目状态
- 客户状态 / 来源
- 员工状态 / 角色
- 支付状态 / 类型
- 短信场景
- 项目创建员工选择器场景

---

## 5. 示例

### 渲染项目状态选项

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

### 给接口参数加类型

```ts
import type { ProjectCreateEmployeeScene } from "@gooes/domain";

function fetchEmployees(scene: ProjectCreateEmployeeScene) {
  return request.get("/projects/create/employees", { scene });
}
```

---

## 6. 当前包状态

当前包已经验证通过：

- 可构建
- 可 `npm pack`
- 可被 Bun 运行时直接 import

包内只包含：

- 业务枚举
- literal union
- config map
- type guard

不包含：

- 数据库逻辑
- Fastify 代码
- Supabase client
- 环境变量相关逻辑
