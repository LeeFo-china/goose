# 员工摄像头接入生产发布

发布标签：`v2026.10.14.3`。API 源提交：`4cfce19922ce5a7493111f8fd79bb7ccf1f6d475`。本轮只部署 API；后台与各 worker 保持现有镜像。

## 客户端反馈与修复

只读核对 orange `docs/miniprogram/2026-10-14-employee-camera-onboarding-client-receipt.md`。确认登记服务完成本地资产后，getPassword 抛错直接传播，绕过空密码分支的恢复提示。

已将云端读取密码异常转换为与空密码相同的 `503 TENCENT_IOT_VIDEO_API_ERROR`，返回 `details.tenant_device_id`。不传播可能含密码的上游异常。客户端保存该资产 ID，调用 `GET /tenant-devices/:id/tencent-access` 恢复，不重新创建云设备。

新增测试先复现两项失败，再验证通过：已完成登记重放，以及 cloud_created 回执恢复并完成资产后读取密码抛错。两者保留 completed 回执和原资产，重试不会再次 CreateDevice。修复前 16 pass / 2 fail；修复后定向 18 pass / 0 fail，集成 108 pass / 0 fail / 637 assertions；API 类型检查与构建通过。HTTP error-handler 原有 AppError 分支保留 details。

## 迁移范围与回滚

- `20261014090000`：腾讯登记占位、回执、历史 SN 与原子更名。
- `20261014091000`：摄像头/资产绑定及解绑事务。
- `20261014092000`：单设备通道同步、旧同步原子写入与分页索引。

发布前暂停 API 直连及后台代理的 `/tenant-devices/tencent`，验证均返回 503；旧 Nginx workers 已退出，API 近 10 分钟无登记请求。暂停仅涉及设备登记入口。

API 回滚前仍需暂停登记并核对在途请求；保留登记表、历史 SN 和 pending 记录。不可将旧版无占位创建逻辑直接恢复给用户，也不能手工 DML 清除记录后重建。若必须数据库回退，应另立 migration；本次新增表与函数可以保留。

## 发布证据

证据目录：[employee-camera-onboarding-release](./evidence/2026-10-14-employee-camera-onboarding-release/)。

- [迁移预检](https://github.com/LeeFo-china/goose/actions/runs/38514545657)：成功；663 条既有历史一致，仅本次 3 项待执行。
- [API 候选](https://github.com/LeeFo-china/goose/actions/runs/38514543907)。
- [迁移应用](https://github.com/LeeFo-china/goose/actions/runs/38514797026)。

- [API 部署](https://github.com/LeeFo-china/goose/actions/runs/38515988385)：成功，完成时间 2026-10-14 13:20:56（北京时间）。
- migration 663 → 666；`supabase migration list` 666 条 Local/Remote 全部对齐；8 个 RPC 均 anon/authenticated 不可执行、service_role 可执行，登记表启用 RLS，两个查询索引存在。
- API revision 与候选一致，digest `sha256:c824a033874a74e87b26d04e200fc7c22bd89f5e844bf7e063c5b2e9ebe2e7ca`，healthy、restart=0；admin 与 social-video-worker 原 revision 未变且健康。
- 生产 smoke：资产列表及设备通道第 1/2 页 200，设备匹配及分页无重复；channels pageSize=101、sync pageSize=51 返回 400；未登录 GET/POST 返回 401；不存在及跨租户资产 GET/POST 返回 404；原项目摄像头列表 200。
- smoke 首次将用户 UUID 当作员工主键，导致验收账号查找失败；只读核对 user_id 与员工记录后修正脚本，完整 smoke 通过。没有为此修改员工或权限数据。
- 临时拦截已移除；Nginx 校验通过，API 和后台代理登记入口均恢复原鉴权 401 TOKEN_MISSING（未登录探测），不再返回维护 503。
- 候选镜像首次拉取超时，限时重试恢复成功。慢速层完整拉取、固定 digest 校验通过后才部署，未绕过发布流程。

## 验收边界

生产 smoke 只包含真实读取和应拒绝的写请求；没有创建云设备、配置实体硬件、执行成功同步/绑定/解绑，也没有制造真实厂商密码读取失败。503 恢复契约由行为回归及原 HTTP 错误序列化路径验证，不宣称厂商异常已在生产实测。手机布局、实际播放、弱网、员工/客户/访客切换及撤权仍需指定对象联合真机验收。

未修改 orange。客户端需收到生产回执后上传、绑定体验包，再确认操作人、项目与测试 SN 联合真机验收；本轮不安排微信提审。
