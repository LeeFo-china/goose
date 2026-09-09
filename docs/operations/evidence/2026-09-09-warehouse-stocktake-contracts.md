# 阶段 D2.1 盘点请求契约验证

日期：2026-09-09。设计提交 `d0fa6d0f`，计划提交 `c0315a18`，实现提交 `0f472f05`。本批仅为盘点请求契约，D2.1原子数据库命令/API/Admin及D2.2手工调整尚未实施，不表示盘点已上线。

## 变更范围

恰好5个代码文件、279行新增：Domain盘点状态、中文标签、展示动作、3类请求DTO及根出口；API盘点7个输入schema、4个推导类型及相邻测试。复用现有Zod4.4.2与PaginationQuerySchema，无依赖、权限定义/授权、开关、路由、SQL、响应模型或Admin变化。

实盘数量保留十进制字符串，显式0与未录入严格区分；1–100个SKU，UUID忽略大小写去重。草稿只接收仓库/范围/原因，录入只接收已知形状的SKU/实盘数/可选行原因；不接收客户端身份、快照、成本、计算差额或force参数。条件原因校验、选定范围和快照是否过期必须由后续数据库命令验证，未在此处伪造实现。

## RED → GREEN

实施者先运行Domain根出口测试：0 pass/1 fail，期望盘点状态而实际undefined，模块正常导入。补齐Domain后通过测试和build。API先用可导入空模块运行测试：0 pass/6 fail，首个显式schema导出断言收到undefined；其余用例因相同缺失schema无法执行。随后才实现schema，不把依赖/模块解析异常当RED。测试未使用mock，Schema输出在类型检查中可赋给对应Domain DTO。

父代理阅读最终diff并独立执行，全部exit0：

```sh
bun test packages/domain/src/warehouse-stocktake.test.ts packages/domain/src/warehouse-material.test.ts packages/domain/src/warehouse-transfer.test.ts packages/domain/src/inventory.test.ts
bun run --cwd packages/domain build
```

在 `apps/api`：

```sh
bun test src/schema/warehouse-stocktakes.test.ts src/schema/warehouse-materials.test.ts src/schema/warehouse-transfers.test.ts
bun run typecheck
```

结果：Domain4 pass、0 fail、19 assertions；API11 pass、0 fail、339 assertions（合计15项，含原8项回归和新7项，不是15个新测试）。Domain构建输出149147字节，external Zod身份验证通过；API完整typecheck通过。额外只读执行验证了编译后Domain根出口、合法大写UUID以及CRLF/tab/U+2028/+1/01.0格式拒绝，未替代正式测试。

覆盖草稿/录入1与100条通过、0与101拒绝、大小写重复、缺失/null/非法UUID、数量0/最小/最大精度与非法输入、行原因缺省/null/空白/500/501、根/明细注入、草稿版本0/1/MAX和已有单据正整数边界、分页默认1/20与上限100、全部合法状态和筛选白名单、明细与严格空设置（含拒绝page）。主代理补查并要求补齐草稿正版本/MAX、正JSON数值1及设置page拒绝测试，均已纳入最终提交。

## 审查与收尾

独立SPEC审查确认无缺项或超范围；之后的独立质量审查无Critical/Important/Minor，并另跑Domain4项和API11项通过。主代理构建/typecheck证据独立于审查。代码、缓存差异及最终文档 `git diff --check` 均通过。

保留 `feature/warehouse-transfer-admin-mainline` 和既有linked worktree供下一批继续，推送功能分支，不合并main、不移动D1固定发布分支、不创建PR或清理工作区。无migration因此不执行apply/list，无运行态功能因此不重发开发镜像，不运行Chrome、Docker或真实租户业务操作。未触及生产或Orange。

知识库查询返回502，设计已明确依本仓库MVP/D1事实制定安全默认方案，未上传资料或声称RAG同步成功。下一批细化盘点原子数据库命令：快照/计价/冲突/幂等/权限及SQL真实验收，不直接覆盖库存余额。
