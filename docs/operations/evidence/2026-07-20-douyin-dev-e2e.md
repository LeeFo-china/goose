# 抖音装修小程序开发环境全链路执行记录

**总体状态：** NOT_RUN

**允许终态：** PASS / FAIL / BLOCKED / WAITING_FOR_DEVICE_ACCEPTANCE

## 固定对象

| 对象 | 记录规则 | 当前状态 |
| --- | --- | --- |
| Git Commit | 完整 SHA | NOT_RECORDED |
| Supabase | 只记录开发 project ref | NOT_RECORDED |
| Component AppID | 只记录尾 4 位 | NOT_RECORDED |
| Template AppID | 只记录尾 4 位 | NOT_RECORDED |
| Authorizer AppID | 只记录尾 4 位 | NOT_RECORDED |
| 主测试租户 | tenant UUID + 名称 | NOT_RECORDED |
| 隔离测试租户 | tenant UUID + 名称 | NOT_RECORDED |
| 模板开发安装 | installation UUID | NOT_RECORDED |
| 测试商户安装 | installation UUID | NOT_RECORDED |
| 模板交付 | template ID / SemVer / release UUID | NOT_RECORDED |
| 测试手机号 | 仅掩码 | NOT_RECORDED |

## 阶段证据

| 阶段 | 状态 | 允许记录的证据 |
| --- | --- | --- |
| 静态门禁 | NOT_RUN | 命令、退出码、测试计数 |
| 开发 migration 对齐 | NOT_RUN | project ref、Local/Remote 版本结论 |
| API 开发部署 | NOT_RUN | Actions run ID、SHA、健康状态 |
| 回调与 Ticket | NOT_RUN | 控制台校验、时间、组件尾号、布尔信封状态 |
| 模板开发安装 | NOT_RUN | 安装 UUID、租户 UUID、接口状态 |
| 模板登录与内容 | NOT_RUN | IDE 版本、截图编号、分页结论 |
| 测试商户授权/绑定 | NOT_RUN | 安装 UUID、租户 UUID、安全错误码 |
| 短信与留资 | NOT_RUN | 掩码手机号、lead/submission/event UUID |
| 模板 upload/test-qr | NOT_RUN | template ID、SemVer、release UUID、截图编号 |
| Android 真机 | NOT_RUN | 设备/系统版本、截图编号 |
| iOS 真机 | NOT_RUN | 设备/系统版本、截图编号 |
| disable/enable | NOT_RUN | 安装 UUID、安全错误码、恢复结论 |
| 收尾 | NOT_RUN | 保留/停用对象和未完成项 |

## 禁止记录

不得写入 AppSecret、Token、Ticket、EncodingAESKey、短信验证码、完整手机号、OpenID、session key、
deployment key、二维码原始响应或 provider 原始响应。

## 最终结论

NOT_RUN
