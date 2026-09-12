# AI 供应商受限删除

用户已确认：列表补删除与二次确认；仅无关联模型、目录同步记录的供应商可删除，有关联时提示停用；不删除共用密钥；后端校验管理权限和版本并审计。本轮实现与验证，不自动应用远端 migration、发布或删除真实供应商。

## 根因与边界

ProviderTable 只有编辑操作，controller/service/repository 均没有删除链路。历史 ai_models.provider_id 使用 ON DELETE CASCADE，直接补按钮会有连带删除模型、清空路由的风险。目录同步批次和条目已使用 RESTRICT。

通过新 migration 把 ai_models_provider_id_fkey 改为 ON DELETE RESTRICT，保持非空、现有索引和数据不变。依赖数据库外键原子保护并发新增关联，不使用先查询后删除的竞态保护。没有关联模型意味着没有通过这些模型绑定的路由；存在目录批次或条目同样由外键阻止。

## API

DELETE /platform/ai-config/providers/:id，请求 strict JSON { expected_version: 正整数 }，拒绝多余 query。先校验平台身份和 platform.ai_config.manage，再验证 UUID/body。service 调 repository 按 id/version 删除，只返回 id/name 用于审计；HTTP 返回 { id, deleted: true }。23503 映射 409/AI_PROVIDER_IN_USE，固定中文说明关联模型或目录记录未清理，请改用停用；零行返回 409/AI_CONFIG_VERSION_STALE（包括记录已被删除）；其他错误经 error-factory 固定包装，不输出密钥引用、数据库 details。复用现有审计事件，不写密钥配置。

## Admin

复用本地 Button、AlertDialog、StatusAlert。列表行提供删除；有管理权限才展示。弹窗显示供应商名称、不可恢复和密钥保留说明，取消不发请求。确认时发送当前版本；进行中禁止重复提交和关闭；失败保持弹窗并显示固定业务提示，不自动重试，版本冲突提示刷新。

成功后清理当前供应商编辑表单/相关未保存路由候选、从本地列表和选项移除目标，刷新分页列表、供应商选项及页面汇总。删除末页最后一条回退上一页。刷新失败与删除失败分开呈现，不诱导再次发送已成功的删除。

## 验证与发布要求

失败先行测试覆盖路由权限/参数、版本过滤、关联冲突/错误脱敏、删除确认/取消/失败/重复点击、列表与末页回退。运行 API/Admin 类型检查和聚焦测试，静态检查通过后运行浏览器 mock。数据库使用隔离本地 PostgreSQL 验证 RESTRICT 和并发，不写远端。发布前必须先应用新 migration 并 CLI 验证对齐，旧 CASCADE 约束下不得发布新删除接口。回退保留更安全的 RESTRICT 约束，回退应用即可；不恢复级联删除、不恢复已主动删除的空供应商。
