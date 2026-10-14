# 员工摄像头接入后端本地验证

日期：2026-10-14。实现基线：8d5d8486e。

- tests.txt：106 pass、0 fail、622 expect，23 个文件。
- typecheck.txt：API tsc --noEmit，退出码 0。
- build.txt：API 构建，退出码 0。
- 文件大小检查、权限边界检查及 git diff --check 通过。

测试从 apps/api 执行，启用 CAMERA_WORKSPACE_SQL_TEST=1、CAMERA_ONBOARDING_SQL_TEST=1、TENCENT_REGISTRATION_SQL_TEST=1。PostgreSQL 使用无网络临时 Docker 容器；未使用生产数据库凭证。

覆盖持久登记占位/恢复、旧 SN 历史归属与更名回滚、租户及权限隔离、单设备分页同步、当前 SN 保留、绑定/解绑事务与并发冲突、绑定同步交错、查询索引。云端 HTTP 使用可控替身；不代表真实设备接入或真机验收通过。

生产 migration 未应用，未执行生产部署或 orange 修改。待执行 migration 为 20261014090000、20261014091000、20261014092000；正式部署前核对待执行清单，部署后验证 Local/Remote 对齐。
