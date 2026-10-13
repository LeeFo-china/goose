# 项目摄像头工作区发布记录

用户已授权实现后直接生产部署。API 与首轮后台发布版本 `v2026.10.14.1`，源提交 `710fd4cd615db2121752288c6cc45194303ac03b`；后台长文本展示修正版 `v2026.10.14.2`，源提交 `400df2e11aeb3452494ea0464b88d7d9e693330e`。

## 行为

- 删除全局添加摄像头。未绑定项目行提供“添加首台摄像头”，已有设备提供“增加摄像头”；两者都锁定当前项目并在提交前验证项目权限及可绑定状态。
- 项目表按已绑定（默认）、未绑定、全部项目筛选，支持项目状态和关键词搜索；默认每页 20 项。展示项目地址、客户、状态、摄像头数及最近记录的监控状态。
- 点击摄像头数量展开独立分页的设备表，每页最多 20 台。状态、客户可见性和操作保留；移除厂商、能力、加密、排序等低频列及误导性“可播放”标签。解绑放入更多操作，仍有确认。
- 空设备引导到设备管理并关闭弹窗；解绑末页最后一台后回到有效页；错误可重试。
- 不更改小程序摄像头列表契约，无需小程序配套发版。

## API 与数据库

- `GET /project-cameras/projects`：`page/pageSize/keyword/binding/project_status`，数据库项目分页。分组 `cameras: []`，以 `summary` 汇总全部有效设备；顶层统计覆盖全部筛选结果。
- `GET /project-cameras/projects/:projectId/devices`：员工 `project.read` 和项目可见范围校验，租户内设备分页，保留服务权益校验。
- 唯一新增 migration：`20261013160058_camera_project_workspace.sql`。新增限定 service_role 可调用的查询函数及分页索引，不重写摄像头数据。
- 迁移前已执行 `supabase migration list`：662 条远端记录与本地既有记录一致，仅该新增 migration 待执行。生产现有摄像头表 16 行。
- 回滚先恢复旧 API/admin 镜像；新增函数和索引可保留，与旧代码兼容。如需删除，另立 migration，不手工改库。

## 验证

- Admin 类型检查、21 个相关单元/组件测试通过。
- 11 项 Playwright 实际 Next 页面验收通过：两个入口提交的项目 ID 与资产 ID、权限撤销、状态回退仍可尝试预览、分页、重试、空设备跳转、末页解绑回退、1440/720/390 像素布局。
- 页面与绑定弹窗截图及测试输出见 [evidence](./evidence/2026-10-14-camera-project-workspace/)。浏览器测试使用本地模拟 API，不在生产新增测试设备或绑定。
- API 类型检查、构建通过；最终整合运行 75 个相关测试全部通过（含新增状态回归及 SQL 夹具）。SQL 独立 PostgreSQL 夹具通过（20,005 项目 / 101,506 摄像头）：项目查询约 10.9ms，20 行设备分页命中新增索引约 0.06ms。
- 状态刷新限定当前页、20 次供应商请求预算、4 并发、8 秒取消；复用已有状态时间戳 30 秒。腾讯设备按 DeviceId 查询通道，不扫描全部设备；未取得最新结果保留最近记录。非腾讯设备继续使用持久化状态。状态按最多三组批量回写并限定租户和项目。
- 独立审查发现并修复重复导航页签、完整刷新等待超时和乱序状态覆盖。新增 19 项状态回归通过；使用请求开始时间及相机/资产时间戳条件更新，超时取消当前请求并阻止后续回写。URL 作为页签唯一来源，重复入口浏览器回归通过。
- 最终独立定向复审通过：原阻塞等待在约 8003ms 返回回退结果，迟到结果不触发后续写入；乱序相机和资产状态保留较新记录，无剩余审查阻塞。

## 生产迁移

- [预检 38431576877](https://github.com/LeeFo-china/goose/actions/runs/38431576877) 成功，仅待执行 `20261013160058`。
- [应用 38431933953](https://github.com/LeeFo-china/goose/actions/runs/38431933953) 完成备份并成功应用唯一 migration，历史记录 662 → 663。
- `supabase migration list` 返回 663 条 Local/Remote 全部对齐，见 `migration-list-after.txt`。
- 生产只读 SQL：晴天租户已绑定 1、未绑定 19、全部 20；空项目权限范围返回 0；RPC 仅 service_role 可执行，anon/authenticated 无执行权限；索引存在。实际 RPC 执行约 1.36ms。

## 生产发布

- [候选构建 38431574171](https://github.com/LeeFo-china/goose/actions/runs/38431574171)，API + admin，绑定同一提交和标签。
- [部署 38433808047](https://github.com/LeeFo-china/goose/actions/runs/38433808047) 成功，API/admin revision 与候选一致且 healthy、restart=0；worker 保持原镜像且健康。
- 生产认证请求：已绑定/未绑定/全部分别 1/19/20，分页与汇总一致、地址搜索通过、设备明细返回 200 且状态来源 live、超出设备页大小返回 400、未登录返回 401。后台返回新工作区与两个项目级入口。
- 真实页面首次视觉核查发现超长客户名导致自动表格压缩状态列（原始截图保留于 `initial-layout-check`）。已定位并修复为固定列宽、客户单行/项目两行截断及完整 title、状态不拆字；不改业务规则。
- 展示修正提交 `400df2e11aeb3452494ea0464b88d7d9e693330e`，标签 `v2026.10.14.2`，只构建/发布 admin。新增长名称 geometry 回归，最终 12 项浏览器验收通过，类型检查及独立审查通过。
- [v2 后台候选构建 38435144166](https://github.com/LeeFo-china/goose/actions/runs/38435144166)，仅 admin。[v2 部署 38436191873](https://github.com/LeeFo-china/goose/actions/runs/38436191873) 成功（北京时间 2026-10-14 01:09:30）。
- 最终运行：admin revision `400df2e11aeb3452494ea0464b88d7d9e693330e`、digest `sha256:daf2d0e0119b83bc53b56481c6e19f719f8a9f21ec2090369befd75760338245`；API 仍为本轮已验收的 `710fd4cd6`。API/admin/worker 均 healthy、restart=0，与候选清单一致。
- 最终真实页面浏览器检查通过：全局添加按钮不存在、项目级首台/追加入口存在、设备可展开；监控列宽约 190px、表头高 40px，长名称不再挤压列宽；页面无浏览器错误。
- 已人工查看最终 [项目列表截图](evidence/2026-10-14-camera-project-workspace/production-projects.png) 和 [设备展开截图](evidence/2026-10-14-camera-project-workspace/production-devices.png)，布局正常。没有在生产新增测试设备或绑定，也未触发视频播放。
- 本轮无遗留发布阻塞。用户原有未提交文档保留。
