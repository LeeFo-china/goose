# 新租户管理员微信登录冲突排查

用户报告租户 `8440bb1e-8b6c-44cb-9ef0-5558b0460609`，管理员手机号 `132****5725` 登录提示“绑定员工身份失败”。

## Root Cause

生产日志三次同样失败：WechatEmployeeIdentityRepository.bindEmployeeAuthUser 的条件更新触发 PostgreSQL `23505`、`employees_user_id_unique`。目标租户 active，管理员员工 active、system_admin 角色 active，user_id 尚为空。请求中的微信登录账号已绑定另一名 active 平台超管员工（tenant_id 为空、platform_admin 角色 active）。

该唯一索引自 `20260427193000_enforce_unique_auth_user_bindings.sql` 起存在，限制一个认证账号只能绑定一个员工。当前不支持同一微信同时绑定平台超管和租户管理员。本次失败不是租户试用、企业核验或手机号验证码问题；失败更新已回滚，原超管与目标管理员绑定均未修改。

缺陷在于把可识别的身份占用冲突报告为通用 500，且旧流程存在“绑定后清理其他员工”的步骤，在唯一索引下不能用于身份迁移。修复保持约束及现有绑定，仅对确切的 user_id 唯一冲突返回 409 `WECHAT_EMPLOYEE_BINDING_CONFLICT`，提示使用管理员本人的其他微信登录；不把任意唯一冲突都转换为该业务错误，不暴露底层账号 ID。不得将清理其他绑定移到写入之前。

若用户需要同一微信兼任多个员工身份，必须另行明确身份选择、平台权限与租户权限隔离及会话模型，不能以删除约束或自动解绑处理。本次不实施该扩展。

## 验证

- 新增仓储回归先红后绿：复现原 500，验证改为明确 409，无原始账号信息，其他数据库约束错误仍保留 500；仓储 6 项通过。
- 绑定流程 8 项通过：冲突无 OAuth/成员关系/清理其他绑定/令牌签发副作用，同时保留并发手机号/版本比较。
- 隔离 PostgreSQL + PostgREST + 真实 bindSelectedEmployeeRole：已有平台账号绑定返回 409，原超管绑定不变；另一未绑定员工的认证账号成功绑定管理员并创建 active employee membership。
- 生产只读排查，未执行 DDL/DML、未发送短信、未尝试登录或改绑真实账号。本次无 migration、无 orange 改动。

API 类型检查、构建、文件大小检查及独立代码审查通过。隔离库 smoke 已使用最终脚本重新验证通过。发布结果如下。


## 生产发布

- 标签 `v2026.10.08.5`，源码 `d21cd589a155e796deb72176c764b8c36b8d0688`。
- [构建 37731369042](https://github.com/LeeFo-china/goose/actions/runs/37731369042) 和 [部署 37732038708](https://github.com/LeeFo-china/goose/actions/runs/37732038708) 均成功；范围仅 API。
- 运行容器 revision 与源码相符、healthy，公开入口检查通过。镜像 `sha256:7ebf1265628eac954d20a1dd0b172c282383fd8d870cb51df9dff0c753892765`。
- 部署后以模拟 transport 调用运行镜像中的错误映射，确认 409/稳定错误码且无数据库私有详情；未发起真实改绑。
- 生产只读复查原平台超管绑定保留。目标管理员随后已出现独立认证账号绑定（非原平台账号），active employee membership 存在；尚无 active wechat_mini OAuth 身份。此状态由本任务之外的正常业务操作产生，本任务未写入生产数据，不能据此宣称真实小程序登录已经成功。
- 14 项定向测试、最终 API 静态检查/构建和隔离数据库 smoke 均通过。本地临时容器及 worktree 已清理。
