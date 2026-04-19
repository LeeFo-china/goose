# `@gooes/domain` 更新与前端同步流程

本文档用于说明：

- 后端修改 `packages/domain` 后，如何同步给前端
- 当前未接私有 registry 时怎么做
- 后续接私有 registry 后怎么做

---

## 1. 基本原则

`packages/domain` 是共享源码。

只要这里发生变更：

- `packages/domain/src/*`
- `packages/domain/package.json`

前端就不应该继续使用旧版本包。

正确做法不是手工复制文件，而是：

- 重新打包
- 升级版本
- 前端重新安装

---

## 2. 当前阶段推荐流程

当前最适合使用：

- **本地 tarball 安装**

也就是后端每次改完 `packages/domain` 后，重新生成 `.tgz`，前端重新安装。

---

## 3. 后端更新步骤

假设后端已经修改了：

- `packages/domain/src/*`

### 第一步：进入共享包目录

```bash
cd /Users/leefo/Public/work/gooes/packages/domain
```

### 第二步：升级版本号

推荐至少升一个 `patch` 版本：

```bash
npm version patch --no-git-tag-version
```

例如：

- `1.0.0 -> 1.0.1`

### 第三步：重新打包

```bash
npm pack
```

会生成一个新文件，例如：

```bash
gooes-domain-1.0.1.tgz
```

### 第四步：把源码提交到 git

需要提交：

- `packages/domain/src/*`
- `packages/domain/package.json`

不需要提交：

- `packages/domain/dist/`
- `packages/domain/*.tgz`

---

## 4. 前端更新步骤

前端仓库里执行：

```bash
pnpm add "/Users/leefo/Public/work/gooes/packages/domain/gooes-domain-1.0.1.tgz"
```

或：

```bash
npm install "/Users/leefo/Public/work/gooes/packages/domain/gooes-domain-1.0.1.tgz"
```

安装后前端代码就会拿到最新的共享包内容。

---

## 5. 前端代码使用方式

安装完以后直接：

```ts
import {
  PROJECT_STATUS_VALUES,
  CustomerStatusConfig,
  type ProjectStatus,
} from "@gooes/domain";
```

不要再：

- 手写状态枚举
- 手写中文映射
- 复制 `packages/domain/src/*` 到前端仓库

---

## 6. 版本号建议

### `patch`

适用于：

- 新增 config
- 修正文案
- 新增兼容导出
- 不影响旧前端调用方式的小改动

例如：

- `1.0.0 -> 1.0.1`

### `minor`

适用于：

- 新增前端可用的新枚举
- 新增新模块导出

例如：

- `1.0.1 -> 1.1.0`

### `major`

适用于：

- 删除旧导出
- 修改已有枚举值
- 改坏兼容性

例如：

- `1.1.0 -> 2.0.0`

---

## 7. 当前推荐协作约定

建议团队约定：

1. 只要 `packages/domain` 变了，就必须升级版本号
2. 后端在接口联调说明里明确共享包版本
3. 前端不要基于猜测补枚举值
4. 前端发现缺值域时，回到 `packages/domain` 补，不在前端本地修

---

## 8. 后续正式方案

当前用 `.tgz` 适合联调阶段。

长期更推荐：

- 发布到私有 npm registry
- 或 GitHub Packages

到时候前端更新方式会变成：

```bash
pnpm add @gooes/domain@1.0.1
```

这样会比本地路径安装更稳定，也更适合多人协作。

---

## 9. 当前可直接执行的命令模板

### 后端打新包

```bash
cd /Users/leefo/Public/work/gooes/packages/domain
npm version patch --no-git-tag-version
npm pack
```

### 前端安装新包

```bash
pnpm add "/Users/leefo/Public/work/gooes/packages/domain/gooes-domain-1.0.1.tgz"
```

---

## 10. 相关文档

- 包安装说明：
  [frontend-domain-package-install.md](/Users/leefo/Public/work/gooes/docs/frontend-domain-package-install.md)
- 包使用摘要：
  [frontend-domain-package-summary.md](/Users/leefo/Public/work/gooes/docs/frontend-domain-package-summary.md)
- 枚举规范：
  [domain-enum-guideline.md](/Users/leefo/Public/work/gooes/docs/domain-enum-guideline.md)
