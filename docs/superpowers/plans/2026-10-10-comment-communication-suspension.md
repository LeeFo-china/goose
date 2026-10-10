# 评论交流停用实施计划

用户已明确当前没有相关类目资质，采用 orange 整改交接文档路径 B；不实施保留评论的审核发布链路。

**目标：** 停止三类评论交流及其图片上传，阻断旧客户端，并回传准确的停用契约。

**架构：** 复用现有 service 入口和 Errors.business，使用统一、与客户端版本无关的停用策略；既有鉴权继续执行，停止用户端列表与发布，历史数据库记录不删除。平台历史治理保留，但禁止 show 恢复公开。同步关闭嵌入摘要和专用图片上传/完成/URL 转换入口，不引入依赖或 migration。

## 实施顺序

- [x] 在 `apps/api/src/services/comment-communication.test.ts` 先验证实际服务入口、摘要、存储边界；原实现不能满足停用条件，测试应失败且不能连接真实数据库。
- [x] 新建 `apps/api/src/services/comment-communication.ts`，统一抛出 `Errors.business(403, "交流功能暂未开放", "COMMENT_COMMUNICATION_DISABLED")`。三个专用场景为 project_log_comment、customer_follow_up_comment、picture_comment；不按身份、环境或审核版本放行。
- [x] 在 project-log-comments、customer-follow-up-comments、visitor-picture-library、customer-self-service 服务的评论读取/创建入口调用停用策略；picture-library 的 showComment 也阻止公开。回复及附图共用创建入口；不存在独立编辑 API，不新增编辑能力。
- [x] 隐藏客户跟进最新预览及评论权限；项目日志评论摘要/计数不再读取历史内容，客户与员工快速加载路径、图库计数同步屏蔽。
- [x] 在存储服务 uploadImage、供应商上传实现、createDirectUpload、completeDirectUpload、registerExistingCosObject 入口按 scene 阻止专用评论上传。URL 转换按存储 scene 拒绝；不宣称已撤销此前签发的对象存储 URL/凭证。
- [x] 跑目标测试、API 类型检查、构建、文件行数与 diff 检查；保留未涉及的业务上传及分页接口行为。
- [x] 写 gooes 小程序对接回执：当前真实返回为 disabled；违规/待审/暂不可审尚未实现，不伪装审核通过或待审核。列明客户端需移除的组件、缓存、跳转和验收步骤，列明未部署、历史图片直链及其他发布场景的剩余检查。

## 发布条件与边界

本轮交付可验证的后端代码和对接文档；生产状态需经过部署后验证，不能以本地通过代替线上关闭。orange 只读，微信提审由小程序团队执行。重新开放需同时满足内容安全、类目资质与重新提审要求；不可仅修改策略常量恢复服务。

其余施工日志、昵称、头像、公司/项目展示、客服工单与验收文本不是本次三类评论接口，不擅自删除核心业务功能；必须由提审团队按实际可见范围继续核验，不能声称关闭评论后已免除内容安全要求。

实施结果：见 [后端对接回执](../../miniprogram/2026-10-10-wechat-review-comment-suspension-backend-feedback.md)。本地82项相关测试、API/Admin类型检查、API构建、文件行数与diff检查通过。API/Admin已部署 `v2026.10.10.1`，37项生产接口检查通过；[生产验收回执](../../miniprogram/2026-10-10-comment-suspension-production-acceptance.md)记录镜像/发布凭据、签名直链残留、公开内容缺口与截图。联合真机及整体内容安全验收尚未通过，未安排提审。
