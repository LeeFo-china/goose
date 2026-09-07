# 租户 H5 接入统一客户线索

用户已确认推荐方案：租户 H5 历史线索不复制、不换 ID，统一查看、分配、普通跟进、转客户和标无效；营销活动旧入口保留查看，处理跳转统一客户线索。orange 只读，交付 gooes 代码与微信小程序交接文档，不自动发布或修改远端库。

## 数据与权限

沿用 marketing_leads，通用来源限定 douyin_miniapp/h5，tenant_id 必须匹配员工当前租户。平台无租户 H5 线索不纳入。source 由服务端真实数据决定，不接受客户端命令传来源。列表默认 page=1/pageSize=20，最大100，混合来源同一数据库分页；保持现有员工范围、手机号遮罩、客户查看权限、版本和幂等协议。

H5 detail.source_context 增加可选 h5 对象：page_id/page_version_id/page_title/page_slug，均可空；page 元数据仅同租户必要字段单次查询。预算/AI为null，不伪造抖音归因。原 form_data 不透传，普通需求只读 demand（字符串长度上限1000）。历史 follow_remark 保留摘要，不伪造历史跟进流水。

H5 没有抖音预约，返回空分页和 latest_appointment=null；普通跟进 appointment_id/status/confirmed_visit_at 均null。跨来源预约拒绝。跟进物理表可复用已有可空预约能力，扩展严格来源校验，不移除租户与不可变审计约束。客户转化记录真实h5来源与活动ID，重复转化不重复创建。

## 兼容

旧抖音HTTP/RPC只处理抖音，不能因为共享核心扩容而越界。旧H5 Admin移除直接写操作，链接统一入口并定位该线索；旧租户H5写接口返回明确迁移错误，避免旧客户端绕过并发/权限校验。旧权限不自动赋予新命令权限，未获customer_lead权限应提示管理员配置。

H5提交采集接口继续使用原URL与表单协议。重复提交不得将已转客户记录转回new或覆盖已确立客户关联。新增migration负责来源扩展、历史version兼容、索引与guard，禁止手工远端修库。

## 验证

先写失败测试，验证共享source schema、列表和详情来源、作用域和旧入口兼容；数据库在固定本地容器单一事务应用前置及本次migration并smoke后ROLLBACK，覆盖历史/新H5、四命令、重放、版本冲突、跨租户/旧抖音拒绝、不可变来源、分页及EXPLAIN。API/domain/Admin类型检查及构建、针对性测试和本地mock浏览器验证后记录证据。文档明确“本地验证”和“远端上线”区别。
