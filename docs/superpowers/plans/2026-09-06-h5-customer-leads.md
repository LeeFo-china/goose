# H5 Customer Leads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** 租户H5接入统一客户线索，提供微信小程序交接和转发话术。

**Architecture:** 扩展现有同表/共享命令模式，不新增采集系统。通用repository按内部profile接受两种来源，旧抖音保持单来源；数据库事务、权限和幂等保持同一实现。旧H5界面导航统一，旧写接口明确拒绝。

**Tech Stack:** Bun、Fastify、TypeScript、Zod、Supabase/Postgres、Next.js、现有shadcn、Playwright。

### Task 1 数据库

- [x] 使用 `supabase migration new tenant_h5_customer_leads` 创建增量migration；保留既有migration。
- [x] 新建 `scripts/smoke-h5-customer-leads.sql` 先证明H5命令当前404；本地Docker事务回滚，不碰远端。
- [x] 扩展通用四命令、列表、来源guard/metadata/索引，保留原幂等ledger和locknamespace。列表增加source/page_id/page_version_id，旧RPC限制douyin；来源事实h5标签为“H5活动”。
- [x] H5数据允许无installation/预约，保持tenant/员工/客户范围，禁止跨来源预约。
- [x] 补本地runner与smoke：历史、新采集、普通跟进、分配、转客户、无效、版本冲突、重放、旧抖音拒绝、来源不可变、分页与EXPLAIN；全程ROLLBACK。

### Task 2 API / domain

- [x] 在 `packages/domain/src/customer-lead.ts` 先测试再增加source和可选h5上下文；更新离线smoke来源断言。
- [x] `tenant-douyin-leads-contract.ts`/`tenant-douyin-lead-list.ts` 添加真实来源和活动ID的白名单投影；generic强制来源正确，legacy只接受抖音；`tenant-douyin-leads.ts` 按内部profile过滤detail/access/preflight。
- [x] `tenant-customer-leads-serializer.ts`按真实source输出标签；新H5详情适配器返回安全活动字段，不返回原表单/手机号/敏感参数。
- [x] `marketing-pages/legacy/leads-events.ts` 旧租户H5更新/转客户在写入前用Errors包装稳定409错误并提示统一入口，不更改公开提交API。
- [x] 定向Bun测试、domain build、API typecheck/build和文件大小校验。

### Task 3 Admin / 文档

- [x] `h5-leads-table.tsx`操作列改链接 `/customer-leads?source=h5&leadId=...`，统一workbench支持安全ID自动打开，不把leadId传列表schema。
- [x] 源筛选支持h5，解析并展示H5活动详情，普通跟进不强制预约。旧抖音界面不出现H5。
- [x] 回归用例验证旧H5表仅保留统一处理链接，单测及typecheck；本地mock E2E验证混合列表/筛选/无预约跟进/深链接/旧入口跳转。
- [x] `docs/2026-09-06-h5-customer-leads-miniprogram-handoff.md` 写API、字段、动作、权限、分页、历史处理、错误、客户端路径、发布顺序、验收和转发话术。
- [x] 规格审查后质量审查，修复重要问题；提交仅本次文件，不推送/远端migration/部署。
