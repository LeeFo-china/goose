# 微信虚拟商品图片本地上传实施计划

> **执行要求：** 按任务顺序测试先行；每个任务先看到目标测试失败，再写最小实现并验证。不得修改 Orange 仓库，不新增依赖，不执行数据库变更。

**目标：** 在 Admin 虚拟支付映射表单中增加严格 200×200 的 JPG/PNG 本地上传，并通过 API 专用 COS 直传场景完成可信服务端校验和公网 URL 回填。

**架构：** 复用现有 COS 三段式直传基础设施，新增 `branding_virtual_goods` 场景、平台支付配置权限处理器、带签名的上传意图和真实 COS 图片校验。Admin 复用 `uploadDirectToCos`，把文件选择、客户端元数据校验和上传状态封装成小型字段组件，成功后仅更新映射草稿。

**技术栈：** Bun、TypeScript、Fastify、Next.js、React、shadcn/ui、Tailwind CSS、Tencent COS、Sharp、Bun Test。

---

## 任务 1：定义共享图片规则与客户端校验

**文件：**

- 新增：`apps/admin/components/settings/platform-virtual-payment-image-upload.ts`
- 新增：`apps/admin/components/settings/platform-virtual-payment-image-upload.test.ts`

**步骤：**

1. 为 MIME、2 MB 上限和 200×200 元数据校验编写失败测试。
2. 运行单文件测试，确认因实现缺失失败。
3. 实现纯函数 `validateVirtualGoodsImageFile` 与 `validateVirtualGoodsImageDimensions`，返回稳定中文错误。
4. 再次运行单文件测试并确认通过。

## 任务 2：新增 API 声明策略与平台权限边界

**文件：**

- 修改：`apps/api/src/controllers/uploads/direct-upload-file-policy.ts`
- 修改：`apps/api/src/controllers/uploads/direct-upload-file-policy.test.ts`
- 新增：`apps/api/src/controllers/uploads/virtual-goods-upload-access.ts`
- 新增：`apps/api/src/controllers/uploads/virtual-goods-upload-access.test.ts`
- 修改：`apps/api/src/controllers/uploads/index.ts`
- 修改：`apps/api/src/controllers/uploads/index.brand-logo.test.ts` 或新增相邻路由契约测试

**步骤：**

1. 添加新场景声明校验测试：仅公开 JPG/PNG、2 MB 内、存在员工上下文。
2. 添加权限测试：仅 `tenant_id=null` 的平台超管且具备 `platform.payment.config.manage`。
3. 运行目标测试并确认失败。
4. 实现策略、权限处理器并把 init/complete 接入现有访问链。
5. 将新场景加入公开场景、Zod 枚举和 complete 上传凭证要求。
6. 运行目标测试并确认通过。

## 任务 3：实现专用上传意图与对象路径

**文件：**

- 修改：`apps/api/src/services/files/platform-file-storage/legacy/shared.ts`
- 修改：`apps/api/src/services/files/platform-file-storage/legacy/paths.ts`
- 修改：`apps/api/src/services/files/platform-file-storage/legacy/paths.test.ts`
- 新增：`apps/api/src/services/files/platform-file-storage/legacy/virtual-goods-upload-intent.ts`
- 新增：`apps/api/src/services/files/platform-file-storage/legacy/virtual-goods-upload-intent.test.ts`

**步骤：**

1. 添加路径测试，期望 `public/branding-virtual-goods/YYYY/MM/DD/<uuid>.<ext>` 且扩展名由 MIME 决定。
2. 添加上传意图签发/验证及各字段篡改、过期测试。
3. 运行目标测试并确认失败。
4. 扩展场景联合类型与路径映射，实现专用 HMAC 上传意图。
5. 运行目标测试并确认通过。

## 任务 4：服务端校验真实 COS 图片

**文件：**

- 新增：`apps/api/src/services/files/platform-file-storage/virtual-goods-image-policy.ts`
- 新增：`apps/api/src/services/files/platform-file-storage/virtual-goods-cos-verifier.ts`
- 新增：`apps/api/src/services/files/platform-file-storage/virtual-goods-cos-verifier.test.ts`
- 修改：`apps/api/src/services/files/platform-file-storage/legacy/direct-upload.ts`
- 新增：`apps/api/src/services/files/platform-file-storage/legacy/direct-upload-virtual-goods.test.ts`

**步骤：**

1. 添加声明规则、HEAD/ETag、真实 MIME、解码、精确尺寸和成功元数据测试。
2. 添加直传创建必须签发凭证、完成必须验证凭证并保存宽高的测试。
3. 运行目标测试并确认失败。
4. 实现图片策略和有界 COS 校验器；使用项目已安装 Sharp 的真实类型/API。
5. 接入 create/complete/register 流程：签名请求头、上传意图、HEAD+GET 二次校验、宽高入库。
6. 运行目标测试并确认通过，同时回归品牌 Logo 直传测试。

## 任务 5：实现 Admin 图片上传字段

**文件：**

- 新增：`apps/admin/components/settings/platform-virtual-payment-image-field.tsx`
- 新增：`apps/admin/components/settings/platform-virtual-payment-image-field.test.ts`
- 修改：`apps/admin/components/settings/platform-virtual-payment-mapping-card.tsx`
- 修改：`apps/admin/components/settings/platform-virtual-payment-settings.test.ts`

**步骤：**

1. 查询项目现有 shadcn Button/Input 用法和文档，不修改基础组件。
2. 添加组件契约测试：accept、专用场景、尺寸读取、预览、上传状态、成功 URL 回填、只读门禁、URL 高级入口。
3. 运行目标测试并确认失败。
4. 实现紧凑的图片预览/选择组件，复用 `Button`、`Input`、`Spinner`、`StatusAlert` 和 `uploadDirectToCos`。
5. 在映射卡中接入组件；把上传 pending 合并进保存门禁，成功只调用 `updateDraft({ itemUrl })`。
6. 运行目标测试并确认通过。

## 任务 6：回归、构建与交付检查

**文件：**

- 仅在验证发现真实缺陷时修改相关文件。

**步骤：**

1. 运行新增及相邻 API 测试。
2. 运行新增及相邻 Admin 测试。
3. 运行 API 与 Admin 类型检查。
4. 运行 API 与 Admin 生产构建。
5. 运行仓库文件大小检查和 `git diff --check`。
6. 检查 `git status`，确认没有 Orange 改动、数据库 migration 或无关文件。
7. 汇总交互入口、校验规范、验证证据和仍需人工执行的真实 COS 上传验收步骤。
