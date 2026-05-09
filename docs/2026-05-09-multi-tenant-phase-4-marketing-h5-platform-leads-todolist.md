# 多租户改造阶段 4 Todo：营销、H5 与平台线索

日期：2026-05-09

## 目标

完成营销活动、H5 页面、H5 表单线索、平台访客态、平台线索分配的租户化设计与 MVP 落地。

## 前置条件

- 阶段 2 完成。
- 客户、项目、员工租户隔离稳定。
- 产品确认平台访客态小程序交互。
- 产品确认“老客户新线索”展示逻辑。

## Todo

### 1. 营销活动租户化

- [x] `marketing_campaigns` 增加或回填 `tenant_id`。
- [x] 活动列表按租户过滤。
- [x] 活动创建自动写入当前租户。
- [x] 活动包含项目只允许选择当前租户项目。
- [x] 活动统计按租户统计。
- [ ] 活动模板区分平台模板和租户活动。

### 2. H5 页面租户化

- [x] `marketing_pages` 增加或回填 `tenant_id`。
- [x] H5 页面创建写入当前租户。
- [x] H5 页面编辑、发布、预览校验租户边界。
- [x] `/p/:slug` 查询页面时反查 `tenant_id`。
- [ ] slug MVP 阶段继续全局唯一。
- [ ] 后续预留 `/t/:tenantSlug/p/:slug`。

### 3. H5 表单线索

- [x] `marketing_leads` 增加或回填 `tenant_id`。
- [x] H5 提交时不信任前端传 `tenant_id`。
- [x] 根据 page slug 得到 `tenant_id`。
- [x] 根据页面租户创建线索。
- [x] 线索去重改为租户内去重。
- [x] 同手机号允许在不同租户分别存在。

### 4. 平台访客态

- [ ] 设计未归属客户登录响应：
  - `mode = platform_visitor`
- [ ] 小程序平台访客页展示装修需求入口。
- [ ] 平台访客不能访问项目、日志、验收、摄像头。
- [ ] 新增 `platform_leads`。
- [ ] 平台访客提交需求后创建 `platform_leads`。
- [ ] 提交成功后显示等待分配或顾问联系提示。

### 5. 多租户客户选择态

- [ ] 客户手机号命中多个租户时返回：
  - `mode = select_tenant`
  - `tenants`
- [ ] 小程序展示公司选择页。
- [ ] 新增 `POST /customer/auth/select-tenant`。
- [ ] 后端校验客户归属。
- [ ] 签发带 `tenant_id/customer_id` 的客户会话。
- [ ] “我的”页支持切换装修公司。

### 6. 员工拓客直绑定

- [ ] 设计员工分享小程序码参数。
- [ ] 优先使用 `share_token` 反查租户和分享员工。
- [ ] 设计 H5 分享链接参数：
  - `share_token`
  - 或 `tenant + share_employee_id`
- [ ] 新增 `tenant_share_links`。
- [ ] `tenant_share_links` 预留 `expires_at`。
- [ ] MVP 可先不强制二维码过期。
- [ ] 后续活动页、报价表单、临时推广码可启用过期时间。
- [ ] 客户扫码或打开链接后缓存分享上下文。
- [ ] 客户登录/注册后校验分享上下文。
- [ ] 在目标租户下按手机号查找客户。
- [ ] 客户已存在：
  - 不重复创建客户。
  - 追加 `customer_sources`。
  - 记录分享员工 ID。
- [ ] 客户不存在：
  - 创建目标租户客户。
  - 写入首次来源。
  - 关联分享员工 ID。
- [ ] 同手机号已存在其他租户时，不影响本次绑定。
- [ ] 本链路不进入 `platform_leads`。
- [ ] 通知租户管理员和分享员工。

### 7. 平台线索手动分配

- [ ] 新增平台线索列表接口。
- [ ] 新增平台线索分配接口：
  - `POST /platform/leads/:id/assign`
- [ ] 分配接口仅平台超管可用。
- [ ] 分配请求包含目标租户和备注。
- [ ] 分配逻辑使用事务。

### 8. 平台线索客户去重

- [ ] 根据 `platform_leads.phone + target_tenant_id` 查询目标租户客户。
- [ ] 客户已存在：
  - 不创建新客户。
  - 写入 `assigned_customer_id`。
  - 追加 `customer_sources`。
  - 标记“老客户新线索”。
- [ ] 客户不存在：
  - 创建新客户。
  - 写入 `tenant_id`。
  - 来源为 `platform_lead` 或 `platform_assigned`。
  - 写入 `assigned_customer_id`。
  - 标记“平台新线索”。

### 9. 平台线索状态与审计

- [ ] `platform_leads.status` 更新为 `assigned`。
- [ ] 写入：
  - `assigned_tenant_id`
  - `assigned_customer_id`
  - `assigned_at`
  - `assigned_by_employee_id`
  - `assigned_note`
- [ ] 新增 `platform_lead_assign_logs`。
- [ ] 记录查重、创建、绑定、幂等命中。
- [ ] 分配接口重复提交必须幂等。

### 10. 通知

- [ ] 分配成功后发送站内信给目标租户管理员。
- [ ] 租户短信配置可用时发送短信。
- [ ] 通知文案：
  - `平台为您分配了一条来自【地区】的新线索：【客户姓名】【手机号】，请及时跟进。`
- [ ] 通知记录带：
  - `tenant_id`
  - `platform_lead_id`
  - `assigned_customer_id`
  - `notification_scene = platform_lead_assigned`

### 11. 租户 admin 展示

- [ ] 客户详情增加“线索来源时间线”。
- [ ] `customers.source` 保留首次来源。
- [ ] `customer_sources` 展示后续所有触达来源。
- [ ] 线索/客户列表显示：
  - 老客户新线索
  - 平台新线索
- [ ] 支持按标记筛选。

## 验收标准

- [ ] 不同租户营销活动互不可见。
- [ ] H5 页面提交线索进入正确租户。
- [ ] 平台访客可提交装修需求。
- [ ] 员工分享路径能直接绑定客户到目标租户。
- [ ] 平台超管可手动分配线索。
- [ ] 分配时同租户客户去重正确。
- [ ] 老客户新线索和平台新线索可在租户 admin 中识别。
- [ ] 分配通知成功。

## 不做事项

- 不做自动分配。
- 不做租户拒收/退回。
- 不做复杂结算。
- 不做独立 H5 域名。
