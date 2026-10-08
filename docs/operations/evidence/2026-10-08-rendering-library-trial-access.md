# 试用租户装修效果库加载失败修复

## Root Cause

生产租户 `8440bb1e-8b6c-44cb-9ef0-5558b0460609` 的有效试用包含 core.files。素材列表 `GET /tenant/rendering-library/styles` 被 `/tenant` 通用排除规则归为非试用能力，导致 403 TENANT_SERVICE_CAPABILITY_NOT_INCLUDED。只读生产复现同时确认批量预览也被相同规则拦截。

在现有能力映射中为 `/tenant/rendering-library/(styles|files)(?:/|$)` 补充 core.files，范围仅租户自有素材和文件管理。保留 rendering_library.read/manage 权限、租户隔离、分页、文件资格与存储保护；不为其他效果库设置/用量或 AI 生成接口扩大试用范围。无需 migration 或生产数据修复。

## 验证

- 新增真实控制器注册回归先红后绿：10 个业务路由及其 HEAD 都映射 core.files；试用可读写，缺少文件能力拒绝，服务到期拒绝。
- GET/HEAD 和显式 read 的 POST 批量预览在宽限期可用；上传、创建、修改、发布、隐藏、删除仍作为写操作拒绝。相似路由前缀、设置和用量未被放行。
- 能力/路由/试用及客户线索回归 81/81；效果库 controller、文件与发布业务回归 87/87；合计 168 项通过。
- API 类型检查、构建与文件大小检查通过。
- 发布前只读调用真实 service 并进行 core.files 授权，确认该租户列表查询和分页正常。最终验收将走完整生产 HTTP 链路。

独立审查通过，无阻断问题。生产验收见下文。

## 生产发布验收

- `v2026.10.08.7`，源码 `807c2c96975e9a91f5bfdb349941b22b92fe873d`；[构建 37734542455](https://github.com/LeeFo-china/goose/actions/runs/37734542455) 及 [部署 37735031323](https://github.com/LeeFo-china/goose/actions/runs/37735031323) 均成功，仅更新 API。
- 运行 revision 与源码一致、healthy，公开入口检查通过；镜像 `sha256:3243418b9750fb3449ccf3544a28ec3f9dffd828692f59e2d39824a6a396fcce`。
- 相同租户管理员的真实 HTTP 请求：素材列表发布前 403/TENANT_SERVICE_CAPABILITY_NOT_INCLUDED，发布后 200 且返回 data。
- 批量预览用空 file_ids 做无数据副作用的入口校验：发布前 403，发布后按预期 400/VALIDATION_ERROR，已通过试用访问层。真实文件预览、上传及宽限期边界由上述隔离回归覆盖，未操作生产素材。
- 无生产数据写入、无迁移、无 orange 改动；未宣称进行生产页面视觉验收。代码已合入主分支，隔离 worktree 已清理。
