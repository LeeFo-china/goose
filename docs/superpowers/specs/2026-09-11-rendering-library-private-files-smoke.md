# 私有素材上传与预览：发布前验证清单

本文件是待执行清单，不是上线或真实存储验证报告。范围仅装修公司的风格素材；不包含客户家庭照片、模型调用或公开发布。

## 迁移与运行前置

- [ ] 在隔离数据库应用经确认的 `20260911053027_add_ark_api_key_setting.sql` 和 `20260911054819_create_tenant_rendering_library.sql`，先核对是否还有其他待执行 migration，禁止直接把全部未知待执行项推送远端。
- [ ] 执行 `supabase/tests/tenant_rendering_library.sql`；另用真实租户 A/B 及员工角色验证复合外键、唯一文件绑定、RLS/ACL、并发版本更新。
- [ ] 应用后执行 `supabase migration list`，保存 Local/Remote 对齐证据。本批未执行以上步骤。
- [ ] 通过既有加密系统设置配置腾讯 COS；不在聊天、SQL、日志或 Git 中放凭据。私有专用入口不回退到公开 Supabase 存储。
- [ ] 准备授权的非客户样本（PNG/JPEG/WebP），以及不含真实个人信息的错误/超限样本。

## 员工 API 流程

新增接口均在租户员工会话下使用，不接受 body/query 声明的租户、owner、存储路径或模型配置。

| 步骤 | 请求 | 预期 |
| --- | --- | --- |
| 上传 | POST `/tenant/rendering-library/files`；multipart 只含一个名为 `file` 的文件 | 返回 file_id、规范化后的 WebP MIME/大小/尺寸，不返回存储路径或公开 URL |
| 预览 | GET `/tenant/rendering-library/files/:id/preview` | 同租户 read:all；仅返回短时签名 URL、file_id、expires_at；响应 no-store |
| 保存草稿 | POST `/tenant/rendering-library/styles`，提交上述 file_id 和元数据/明确授权声明 | 只生成私有 draft，不自动发布或审核通过 |
| 浏览草稿 | GET `/tenant/rendering-library/styles?page=1&pageSize=20` | 分页、明确字段；不附原图或永久 URL |
| 隐藏/软删 | 既有 hide/DELETE，提交 expected_version | 素材不可继续作为存活记录读取；不删除源文件，也不改变用户生成次数 |

手机号授权、次数配额、小程序图片上传、内容审核和 AI 调用都不在此链路中。不得把此员工接口交给小程序直接使用。

后续 Admin 图片列表须另行提供有界批量预览/联查（仅当前页文件，最大 100），避免逐卡片读取文件索引和存储配置造成 N+1。当前单文件预览用于上传确认和详情，不表示列表缩略图链路已经优化或交付。

## 隔离、内容与缓存

- [ ] 未登录 401、权限不足 403，均在读取 multipart 文件流前拒绝。上传必须同时 read:all/manage:all；预览 read:all。
- [ ] 租户 B 对 A 的 file_id、素材 ID 均失败；平台运维身份没有默认绕过。租户同权限员工可预览公司的素材，不限制为上传本人。
- [ ] 非 active、public/signed、错误 scene/provider/owner、非规范化路径、带 public/legacy URL 的记录不能预览或创建草稿。
- [ ] 两文件、附加字段、错误字段名、额外 query、截断 multipart、10 MiB+1、伪造 MIME、损坏像素、动画以及解码像素超限都失败；请求结束且全部校验通过之前没有存储写入。
- [ ] EXIF 定位等元数据移除，orientation=6 样本正确旋转；输出是真实可解码 WebP，不是仅修改后缀。
- [ ] 客户端不持久化签名 URL；120 秒链接过期后重新鉴权获取，不能由请求传入更长 TTL。
- [ ] 用真实授权对象验证：无签名 COS URL 失败、CDN 回源访问失败、通用公开路径入口和按 file_id 取公开 URL 都失败。
- [ ] 验证 bucket policy 没有覆盖对象 ACL 的公共读取授权。仅看到 SDK 请求带 `ACL: private` 不能勾选此项。

## 失败与恢复

- [ ] 文件先以既有 `migrating` 状态登记为不可用，再写 COS，再激活为 active。数据库登记失败时不写 COS。
- [ ] 写 COS 失败或返回状态不确定时不激活，不重试生成新的公开链接、不自动删除可能已写入对象。
- [ ] COS 成功但激活明确未执行时，保留未激活行与私有对象核查。若激活已提交但响应丢失，数据库可能已为 active；不能推断为未激活、自动重试或删除对象，也不能在没有确认响应时向客户端报告成功。
- [ ] 清理只针对经核对的未绑定、过期、未激活对象，并另行实现有界回收流程。本批没有自动回收，不承诺 24 小时删除。
- [ ] 草稿软删除只撤销素材记录，拥有素材读取权限的员工仍可通过源文件 ID 预览。若后续需要撤销文件访问，须实现文件生命周期操作，不能把软删除当作销毁文件。
- [ ] 发布与内容审核保持关闭。公开副本和 AI 来源标识、原图保留策略、Admin 批量上传界面需独立完成后再发布。

回退先下线专用上传/预览入口，保留文件索引与对象进行核查；不要删除新增表或清除审计事实。上述检查完成前，本分支只能视为离线验证的实现。
