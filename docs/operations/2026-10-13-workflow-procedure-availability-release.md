# 工序类型占用提示生产发布

- 用户授权：执行，完成后直接生产发布。
- 范围：仅管理后台 admin；无 API、worker、数据库或小程序改动。
- 源提交：`f0a9595a014ba08f960326a7d67d557982fe5cd6`。
- Release tag：`v2026.10.13.1`。
- 候选构建：[38363811768](https://github.com/LeeFo-china/goose/actions/runs/38363811768)。
- [改动、只读评估与验证](2026-10-13-workflow-procedure-availability.md)。
- [部署前版本及健康状态](evidence/2026-10-13-workflow-procedure-availability/runtime-before.json)。

发布过程：使用候选构建产物绑定同一提交及 tag，以 `service=admin` 触发生产部署。生产验收采用版本／镜像摘要／健康检查和公开登录页资源检查；不创建或修改生产工作流。

回滚依据：原 admin revision 为 `8112d16362285c1c36c90f9dd1c6ff1b1e669394`，镜像摘要见部署前证据。如需回滚，仅恢复该 admin 镜像并复核健康，不变更 API 或业务数据。

## 发布结果

- 候选构建成功，包含编译、类型验证、101 页静态页面生成以及生产执行器镜像拉取验证。
- [生产部署 38365055996](https://github.com/LeeFo-china/goose/actions/runs/38365055996) 成功；回执时间：2026-10-13 15:55:17（北京时间）。
- [部署回执](evidence/2026-10-13-workflow-procedure-availability/production-deployment-receipt.json) 确认服务仅 `admin`，提交、tag 和 build run 与候选一致。
- 线上 admin revision：`f0a9595a014ba08f960326a7d67d557982fe5cd6`；digest：`sha256:b1bedcbebee21381d0445df99ae13deaef2d5ef62f7c37dffa8390422f74517e`，与构建 manifest 一致。
- [运行状态](evidence/2026-10-13-workflow-procedure-availability/runtime-after.txt)：admin、API、cos-reconcile-worker 均 healthy、restart=0；API 与 worker 保持发布前 revision／digest。
- [公开页面 smoke](evidence/2026-10-13-workflow-procedure-availability/public-smoke.json)：`https://admin.goodcms.cn/login` 及该页面 15 个静态资源均为 HTTP 200，资源非空。
- 线上容器 JS bundle 只读检查确认包含“6种工序均已配置”“已用于：”“每种工序只能使用一次”三项新提示。
- 生产未进行工作流写入。交互验证来自本地实际属性面板，见关联验证文档和截图；没有把登录页检查称为生产租户编辑操作验收。
