# 试用租户客户线索加载失败修复

## Root Cause

生产租户 `8440bb1e-8b6c-44cb-9ef0-5558b0460609` 试用 active，scope_snapshot 已包含 core.customers 等六项核心能力，管理员具有客户线索权限。客户线索接口 `/tenant/customer-leads` 及其 assignee-filter-options、assignee-candidates 均被 `/tenant` 通用排除规则归为非试用能力，requiredCapability=null，统一服务访问校验返回 403 TENANT_SERVICE_CAPABILITY_NOT_INCLUDED。页面因此显示线索与负责人加载失败。

已通过生产只读请求复现三项 403，并读取试用事实确认授权存在；不是没有线索数据或试用到期。修复仅在现有能力映射中增加精确 `/tenant/customer-leads(?:/|$)` → core.customers 规则，其优先级高于通用排除规则。既有租户范围、员工权限、数据权限、分页及服务到期判定保持执行。无需 migration，不修改租户试用快照，不放开其他 /tenant 模块。

## 验证

新增回归先红后绿：实际注册的 10 个客户线索路由（含附加 HEAD）均继承 core.customers；试用可读写，缺少客户能力仍拒绝，宽限期只读、写操作拒绝，完全到期拒绝。相似路径与独立模块保持排除。

- 能力映射、路由访问、试用判定及新回归：79/79，通过。
- 客户线索 controller/service 回归：14/14，通过。发现并修正既有 HTTP 测试夹具使用裸认证令牌的过时假设；改用正式 admin_web 令牌及数据库安全快照夹具，并增加裸认证令牌 401 断言，认证实现未变。
- API 类型检查、构建、文件大小检查及独立代码审查通过。

## 生产验收

- `v2026.10.08.6`，源码 `94d980d510de5ac3a214e7ec7f901a0ef7342e62`；[构建 37733001069](https://github.com/LeeFo-china/goose/actions/runs/37733001069) 与 [部署 37733499258](https://github.com/LeeFo-china/goose/actions/runs/37733499258) 均成功，仅更新 API。
- 容器实际 revision 与源码一致、healthy，公开入口检查通过。镜像 `sha256:bab448b8d263db9ec254790044ad472c7e77e4480dbfea1dc735c8e3799e69f3`。
- 同一真实租户管理员、同样分页参数的只读 HTTP 请求，发布前上述三个接口均 403/TENANT_SERVICE_CAPABILITY_NOT_INCLUDED，发布后均 200 且有 data。
- 发布前另用 core.customers 显式授权调用真实 service 确认三个底层查询均成功；发布后最终验收走完整已部署 HTTP/auth/controller/service 链路。
- 无生产数据写入，无迁移，无短信发送，无 orange 修改。页面浏览器自动化连接超时，未声称已做生产视觉验收；接口故障闭环已验证，刷新页面即可重新请求。

