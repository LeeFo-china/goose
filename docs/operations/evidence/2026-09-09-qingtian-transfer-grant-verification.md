# 晴天租户定向调拨授权验证

2026-09-09，用户已明确确认仅为既有目标租户 system_admin 初始化两项实际角色权限。修复提交 `1e4f0c3ba52b5b7d35283055ee0f127313973638`，migration `20260909045512`，SHA-256 `3712b420aa654a0d6c07e6537310f201338c7166d4ff1cd60742b4a4ea3754ca`。

## 本地验证

实现者先在空 migration 下运行真实数据库测试，观察 helper 期望 true、实际 false 的 RED；授权前两项缺失和拒绝断言已通过。随后才填入迁移 SQL。主代理对最终文件独立重跑以下检查，全部退出 0：

```sh
bun -e 'import ts from "typescript"; const c=ts.readConfigFile("tsconfig.json",ts.sys.readFile); const p=ts.parseJsonConfigFileContent(c.config,ts.sys,process.cwd()); const program=ts.createProgram(["scripts/verify-warehouse-stage-b-database.ts"],{...p.options,target:ts.ScriptTarget.ES2022}); const d=ts.getPreEmitDiagnostics(program); console.log(ts.formatDiagnosticsWithColorAndContext(d,{getCurrentDirectory:ts.sys.getCurrentDirectory,getCanonicalFileName:x=>x,getNewLine:()=>"\n"})); process.exit(d.length?1:0);'
bun scripts/verify-warehouse-stage-b-database.ts scripts/fixtures/warehouse-stage-b/transfer-tenant-grant.sql
bun scripts/verify-warehouse-stage-b-database.ts scripts/fixtures/warehouse-stage-b/material-workflow.sql scripts/fixtures/warehouse-stage-b/transfer-contract.sql scripts/fixtures/warehouse-stage-b/transfer-workflow.sql scripts/fixtures/warehouse-stage-b/transfer-security.sql scripts/fixtures/warehouse-stage-b/transfer-inventory-sources.sql scripts/fixtures/warehouse-stage-b/transfer-concurrency.sql scripts/fixtures/warehouse-stage-b/transfer-read-performance.sql scripts/fixtures/warehouse-stage-b/transfer-rollout.sql
```

静态检查复用已安装 TypeScript 和根配置，仅在检查进程使用 ES2022 以支持 runner 原有顶层 await，没有更改项目配置。API 系统管理员辅助回归在 `apps/api` 执行 `bun test src/services/authorization/system-admin-warehouse-transfer-permissions.test.ts`：9 pass、0 fail、43 assertions，不作为真实 SQL 授权测试替代。

定向授权测试直接执行同一迁移文件，未替换目标 UUID。无目标环境原字节执行快照不变；目标初始无授权，迁移后恰好两条 all，重复执行快照不变。真实 helper／assertion 验证 allow、deny、停用员工／角色／权限、普通角色和外租户隔离。11 个无效元数据／已有窄 scope／提交前注入失败均整体回滚，保留角色／员工绑定与覆盖、开关、仓库、库存财务、public 函数定义和 ACL。

既有八组回归包括领退料、调拨契约／原子计价／安全、历史来源、五种持锁等待并发、分页计划及开关回执。分页每次20单据／40明细，库存来源关联受1／20／100条页面边界控制。均在 schema-only 本机基线527条后的采购领域迁移、随机无网络临时 PostgreSQL 17 容器内运行，非真实租户 UI 验收或全历史数据升级验收。

测试组合中的前置问题已明确：授权夹具不能与要求全局无授权的旧 contract 共用容器；inventory-sources 固定工作流基线为每方向5条事实，须在会新增事实的 concurrency 之前运行。初次组合不当造成对应断言失败，未修改旧断言或实现；按上述顺序独立重跑通过。从仓库根目录运行 API 单测还会因 @ 别名解析失败，应从 apps/api 执行。

独立 SPEC 审查与其后的质量／安全审查均无阻断项，主代理核对实际 diff 和运行结果。没有引入依赖、修改 API/Admin/Domain/公共鉴权或既有 migration。

## DEV 前置及回退边界

05:07Z 基线见 `2026-09-09-qingtian-transfer-grant-preapply.json`。目标角色／租户均 active，两项授权原始不存在；其他角色授权1593条、员工绑定34条、员工覆盖6条的完整摘要已记录。开关 false／版本18，测试库存1箱／88元，调拨单及事实为0。

完整 `supabase migration list` 返回605行，其中604条 Local/Remote相同，唯一 pending 为20260909045512。main仍为43cb38bf；实际DEV API/Admin均healthy、revision240e7a78、run34307897288，磁盘剩余约9.5GB。应用代码及workflow相对当前镜像无差异，本次只发布数据库授权，不重建相同镜像。

仅使用既有 DEV workflow 固定ref plan/apply；不操作生产、不合并main、不移动既有发布分支。必要回退先关闭目标开关、保留所有库存财务和审计，再经新前向migration仅撤销本次新增的精确两条角色权限。不直接SQL修库，不修改已应用迁移。应用成功及真实验收结果须另附证据，不由本记录预先推断。
