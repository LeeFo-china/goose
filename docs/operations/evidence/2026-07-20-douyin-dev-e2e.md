# 抖音装修小程序开发环境全链路执行记录

> **范围限定：** 本记录只证明开发环境 `api-dev.goodcms.cn` 的 E2E，最高到 test-qr 和本地发布状态
> `testing`。它不是生产上线、提审或发布批准，不能作为生产变更授权。

**NOT_IN_SCOPE / 禁止操作：** 生产回调或生产数据库变更，以及 `submit-audit`、`sync-status`、
`publish` 调用。本轮如发生任一禁止操作，总体状态必须为 `FAIL`，不得标记 `PASS`。

**总体状态：** NOT_RUN

**允许终态：** PASS / FAIL / BLOCKED / WAITING_FOR_DEVICE_ACCEPTANCE

`PASS` 仅表示本文件全部 13 个阶段均有直接证据且为 `PASS`，Android 与 iOS 真机均验收通过，
发布记录仍为 `testing`，并有只读证据证明未产生 submitted/audited/released 时间及未调用上述三个禁止动作。
任何阶段为 `NOT_RUN`、`FAIL`、`BLOCKED` 或设备待验收时，总体状态不得为 `PASS`。

## 执行与授权身份

| 项目 | 记录规则 | 当前记录 |
| --- | --- | --- |
| 执行窗口 | 北京时间起止时间 | NOT_RECORDED |
| 主执行人 | 姓名或受控账号 + 角色，不记录登录凭证 | NOT_RECORDED |
| 技术复核人 | 姓名或受控账号 + 角色 | NOT_RECORDED |
| 总任务授权 | 工单/会话/审批引用；不能替代逐动作授权 | NOT_RECORDED |

外部写操作必须在下方“阶段执行记录”中分别记录动作时授权引用、执行人/角色和证据引用；
只读检查可将授权引用记为 `N/A（只读）`。证据优先引用不可变的 Actions run ID、受控日志产物 ID、
截图编号或工单记录，不覆盖旧证据；审批引用不得包含登录链接中的票据或其他凭证。

## 固定对象

| 对象 | 记录规则 | 当前状态 |
| --- | --- | --- |
| Git Commit | 完整 SHA | NOT_RECORDED |
| Supabase | 只记录开发 project ref | NOT_RECORDED |
| 开发 API 部署 | `api-dev.goodcms.cn` + 服务标识 + Actions run ID | NOT_RECORDED |
| Component AppID | 只记录尾 4 位 | NOT_RECORDED |
| Template AppID | 只记录尾 4 位 | NOT_RECORDED |
| Authorizer AppID | 只记录尾 4 位 | NOT_RECORDED |
| 主测试租户 | tenant UUID + 名称 | NOT_RECORDED |
| 隔离测试租户 | tenant UUID + 名称 | NOT_RECORDED |
| 模板开发安装 | installation UUID | NOT_RECORDED |
| 测试商户安装 | installation UUID | NOT_RECORDED |
| 模板交付 | template ID / SemVer / release UUID | NOT_RECORDED |
| 测试手机号 | 仅掩码 | NOT_RECORDED |

## 测试数据与收尾规则

- 仅使用获批的开发测试租户、测试商户和由持有人授权的测试手机号；不得使用真实客户或业主数据。
- 主租户与隔离租户、两个 installation、测试 lead/submission/event/release 均记录 UUID，不记录 OpenID、session key 或 provider 原文。
- 测试对象在收尾前不得临时手工删表或改状态；收尾阶段逐项记录“保留 / disabled / 经获批 API 清理 / 待后续清理”及责任引用。
- 若需删除或改变远端对象状态，必须另取动作时授权并使用既有 API/RPC；禁止手工 DDL/DML 修库。

## 阶段取证规则

| 阶段 | PASS 判据 | 允许记录的证据 |
| --- | --- | --- |
| 静态门禁 | 计划内检查全部退出 `0`，扫描已人工复核 | 命令、退出码、测试计数、受控日志引用 |
| 开发 migration 对齐 | 目标确认为开发 project ref，Local/Remote 对齐，dry-run 无待应用项 | project ref、版本结论、受控日志引用 |
| API 开发部署 | 精确 SHA 部署到开发 API 且健康检查通过 | Actions run ID、SHA、服务标识、健康状态 |
| 回调与 Ticket | 开发回调校验通过；两步 Ticket 完成；负向用例无写入 | 控制台截图编号、北京时间、组件尾号、布尔信封状态、安全错误码 |
| 模板开发安装 | 专用模板安装绑定获批主测试租户 | 安装 UUID、租户 UUID、接口状态、授权引用 |
| 模板登录与内容 | 开发/预览只访问开发 API；分页与租户隔离通过 | IDE 版本、截图编号、分页/隔离结论 |
| 测试商户授权/绑定 | 单个获批商户授权并绑定隔离测试租户 | 安装 UUID、租户 UUID、安全错误码、授权引用 |
| 短信与留资 | 掩码测试手机号完成真实短信和单条测试留资 | 掩码手机号、lead/submission/event UUID、授权引用 |
| 模板 upload/test-qr | 上传完成、测试码可用，release 最高为 `testing` | template ID、SemVer、release UUID、截图编号、授权引用 |
| Android 真机 | 目标链路在记录设备上通过 | 设备型号/系统版本、截图编号、验收人 |
| iOS 真机 | 目标链路在记录设备上通过 | 设备型号/系统版本、截图编号、验收人 |
| disable/enable | disabled 拒绝且无越权写入，恢复后链路正常 | 安装 UUID、安全错误码、恢复结论、授权引用 |
| 收尾 | 只读证明 release 仍为 `testing` 且无审计/发布时间；对象处置已记录 | 查询结论、受控日志引用、对象处置、未完成项 |

## 阶段执行记录

| 阶段 | 状态 | 执行时间（北京时间） | 执行人 / 角色 | 动作时授权引用 | 证据引用 | 结果 / 对象处置 |
| --- | --- | --- | --- | --- | --- | --- |
| 静态门禁 | NOT_RUN | NOT_RECORDED | NOT_RECORDED | N/A（只读） | NOT_RECORDED | NOT_RECORDED |
| 开发 migration 对齐 | NOT_RUN | NOT_RECORDED | NOT_RECORDED | N/A（只读） | NOT_RECORDED | NOT_RECORDED |
| API 开发部署 | NOT_RUN | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED |
| 回调与 Ticket | NOT_RUN | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED |
| 模板开发安装 | NOT_RUN | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED |
| 模板登录与内容 | NOT_RUN | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED |
| 测试商户授权/绑定 | NOT_RUN | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED |
| 短信与留资 | NOT_RUN | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED |
| 模板 upload/test-qr | NOT_RUN | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED |
| Android 真机 | NOT_RUN | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED |
| iOS 真机 | NOT_RUN | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED |
| disable/enable | NOT_RUN | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED | NOT_RECORDED |
| 收尾 | NOT_RUN | NOT_RECORDED | NOT_RECORDED | N/A（只读，若仅执行验证） | NOT_RECORDED | NOT_RECORDED |

## 禁止记录

不得写入 AppSecret、Token、Ticket、EncodingAESKey、短信验证码、完整手机号、OpenID、session key、
deployment key、二维码原始响应或 provider 原始响应。

## 最终结论

NOT_RUN
