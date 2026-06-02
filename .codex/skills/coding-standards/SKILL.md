---
name: coding-standards
description: |
  Enforce repository-aware TypeScript/JavaScript coding standards, code review checks,
  project structure guidance, AI collaboration constraints, and Conventional Commit
  messages. Use when writing, modifying, reviewing, or committing TS/JS code, especially
  when the user asks to follow team coding standards or project conventions.
---

# 编码规范

## 优先级

执行本技能时按以下顺序决策：

1. 安全
2. 正确性
3. 项目现有约定
4. 可维护性
5. 本规范的风格偏好

如果本规范与项目已有的 ESLint、Prettier、TypeScript 配置、框架约定、
目录结构或邻近代码风格冲突，优先遵循项目现有约定。

## 工作流程

修改代码前：

1. 先阅读相关文件、邻近实现和项目配置。
2. 复用项目已有模式，不为单次需求引入新架构。
3. 不新增 `package.json` 之外的依赖，除非用户明确同意。
4. 保持改动聚焦，不顺手重构无关代码。
5. 涉及认证、权限、数据库、支付、密钥或生产数据时，先明确风险。

修改代码后：

1. 运行最小必要验证，例如 lint、类型检查、单测或构建。
2. 如果无法验证，向用户说明原因和剩余风险。
3. 不保留无上下文的占位注释，例如 `TODO: implement`。
4. 不保留调试输出，除非该输出是 CLI、脚本或诊断工具的设计行为。

## TypeScript/JavaScript

### 命名

- 变量和函数使用 `camelCase`。
- 类、接口和类型使用 `PascalCase`。
- 常量使用 `UPPER_SNAKE_CASE`，但只用于真正的全局常量或配置常量。
- 布尔变量优先使用 `is`、`has`、`should`、`can` 前缀。
- 事件处理函数优先使用 `handle` 或 `on` 前缀。
- 文件名遵循项目约定；没有约定时优先使用 `kebab-case`。

### 格式

- 优先使用 `const`；需要重新赋值时使用 `let`；禁止 `var`。
- 使用严格相等 `===` 和 `!==`。
- 优先使用模板字符串、解构、可选链和空值合并。
- 使用单引号和分号，除非项目格式化配置另有规定。
- 避免魔法数字和魔法字符串；有业务含义时提取为命名常量。

### 类型

- 避免 `any`；外部输入、动态数据和不确定值使用 `unknown`，再做类型收窄。
- 优先使用 `interface` 描述对象形状，使用 `type` 描述联合类型、映射类型和工具类型。
- 导出的函数、共享工具和公共 API 明确声明返回类型。
- 泛型命名应表达语义；只有含义确实通用时才使用 `T`、`K`、`V`。
- 对不可变配置和只读输入使用 `readonly` 或 `as const`。
- 不使用不必要的类型断言；断言必须有明确边界原因。

### 模块

- 导入顺序保持为：第三方依赖、内部别名模块、相对路径、样式。
- 优先使用 named export；框架要求或项目约定需要时允许 default export。
- 避免制造新的 barrel 循环引用；已有 barrel 是否使用取决于项目约定。
- `index.ts` 只做 re-export，不放业务逻辑。

### 函数设计

- 函数保持单一职责。
- 参数超过 3 个时优先改为对象参数。
- 优先提前返回，避免深层嵌套。
- 大多数函数控制在 40 行以内；配置声明、映射表、switch 分支和编排函数可合理例外。
- 单文件超过 300 行时，先判断是否需要拆分职责；不要为了行数机械拆文件。
- React render 路径中避免创建不稳定对象和函数；必要时使用 memoization，但不要过度优化。

### 错误处理

- 不吞掉异常；要么处理，要么补充上下文后继续抛出。
- 禁止空 `catch`。
- async 调用链必须有明确错误处理边界。
- 自定义错误类应包含稳定的错误码；不要把敏感信息写入错误消息或日志。

## 项目结构

优先遵循当前仓库结构。新建结构时采用以下原则：

- 按业务领域或功能模块组织代码。
- 类型定义就近放置；跨模块共享后再提升到公共 `types`。
- 测试文件与被测文件同目录，除非项目已有集中测试目录。
- 配置文件遵循工具和框架惯例；不要强行移动根目录标准配置文件。
- 一个文件默认只承载一个主要职责。

前端常见结构：

```text
src/
  components/
  features/
  hooks/
  services/
  stores/
  utils/
  types/
  constants/
```

后端常见结构：

```text
src/
  modules/
  common/
  config/
  types/
```

## 代码审查清单

审查代码时优先报告会导致 bug、风险或维护成本上升的问题：

- 类型安全：是否存在 `any`、不必要断言或错误的类型收窄。
- 错误处理：异常是否被吞掉，调用方是否有处理边界。
- 边界情况：空值、空数组、并发、超时、重复提交、权限缺失。
- 安全性：XSS、注入、越权、敏感信息泄露、日志泄密。
- 性能：不必要重渲染、无限循环、重复请求、内存泄漏。
- 测试：关键路径是否缺少测试或验证。
- 命名：是否能直接表达业务意图。

报告问题时按严重程度排序，并引用具体文件和行号。

## Git 提交

提交信息遵循 Conventional Commits：

```text
<type>(<scope>): <subject>

[body]

[footer]
```

允许的 `type`：

- `feat`：新功能
- `fix`：修复 bug
- `refactor`：不改变行为的重构
- `perf`：性能优化
- `style`：格式或样式调整，不影响逻辑
- `docs`：文档变更
- `test`：测试相关
- `chore`：工具、构建或依赖
- `ci`：CI/CD 变更
- `revert`：回滚

提交规则：

- subject 使用中文，不超过 50 个字符，不加句号。
- body 说明 WHY 和 WHAT，每行不超过 72 个字符。
- 一次提交只做一件事。
- 破坏性变更在 type 后加 `!`，或在 footer 写 `BREAKING CHANGE:`。
- 提交前确认 lint、类型检查和测试已通过；无法运行时说明原因。

示例：

```text
feat(user): 增加手机号登录功能

fix(order): 修复并发下单导致的库存负数

refactor(auth)!: 重构认证中间件，移除 session 模式

BREAKING CHANGE: 所有接口必须使用 JWT Bearer Token
```
