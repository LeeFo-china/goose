# 阶段 D2.2 手工调整请求契约验证

日期：2026-09-09。设计提交 `259e5aa9`，计划提交 `f4abec9c`，实现提交 `19e64460`。本批仅完成设计、Domain请求契约及API输入校验；数据库原子命令、HTTP接入、Admin、DEV apply/发布和真实租户验收均未实施，不能视为手工调整功能已开放。

## 变更范围

恰好5个代码文件、280行新增：Domain状态、中文标签、展示动作、两类请求DTO及根出口；API六个输入schema、三个推断类型和相邻测试。复用已安装Zod4.4.2和公共分页；无新依赖、权限定义/授权、开关、路由、SQL、响应模型或Admin变化。

独立调整单按带符号非零数量差额录入，不复用盘点实盘数，不允许客户端指定成本或覆盖余额。单仓1–100个SKU，UUID忽略大小写去重，不同SKU可混合调增调减；整单和每行原因必填。快照、成本依据、库存充足性、计价、状态及权限仍由后续数据库命令落实，本批不伪造这些业务检查。

设计同时明确后续非清空金额按 `round(abs(delta)*book_value/book_quantity,2)` 计算，与现有盘点一致；不能以已四舍五入的展示单价计算金额。此为设计澄清，无运行态计价变更。

## RED → GREEN 与独立验证

实施者先动态导入Domain根模块，状态导出 `Reflect.get` 为undefined而断言失败；补齐Domain后GREEN。API先建可加载空模块，六个schema缺失导出断言RED，随后实现真实parse/safeParse测试及schema后GREEN。RED不是模块找不到或依赖解析异常；测试未使用mock。

父代理阅读完整5文件diff，并在linked worktree根目录fresh执行：

```sh
bun test packages/domain/src/warehouse-adjustment.test.ts packages/domain/src/warehouse-stocktake.test.ts packages/domain/src/warehouse-transfer.test.ts packages/domain/src/warehouse-material.test.ts
bun run --cwd packages/domain build
```

在 `apps/api` 执行：

```sh
bun test src/schema/warehouse-adjustments.test.ts src/schema/warehouse-stocktakes.test.ts src/schema/warehouse-transfers.test.ts src/schema/warehouse-materials.test.ts
bunx tsc -p tsconfig.json --noEmit
bun run build
```

在worktree根执行 `bun run check:file-size` 和 `git diff --check`。全部退出0：Domain 5 pass/20 assertions，API 23 pass/582 assertions，合计28项（包含回归；本批新增13项），无失败。Domain构建150031字节，external Zod身份检查通过；API构建979模块、5.12 MB，完整类型检查通过；API/Admin文件大小检查通过。

测试覆盖数量最小/最大正负精度及原文保留，数字JSON、正负零、指数、前导零、精度溢出、CRLF/tab/U+2028/Unicode负号拒绝；1/100行通过、0/101行及大小写重复拒绝；根/行原因缺失、trim、500/501字符及emoji250/251的UTF-16边界；UUID、版本0/正整数/int32上限；严格字段注入拒绝；分页默认值与100上限、四状态、关键词和各查询白名单。Schema输出在类型检查中可赋给Domain DTO。

API测试必须按计划在 `apps/api` 执行；独立规格审查观察到从worktree根合并API和Domain测试会因既有路径解析读到主工作区Domain，不能用该执行方式替代上述命令，也未为此改动项目配置。

## 审查与收尾

独立SPEC审查已通过：逐一核对5个文件，无遗漏或超范围；审查者另跑Domain/API回归、API类型及diff检查通过。随后独立质量审查通过，无Critical/Important/Minor；质量审查者另跑相同28项回归、311项Unicode空白/非法行对象/合法小数探针、Domain/API类型及diff检查，均通过，并核对实际Zod4.4.2类型与长度实现。主代理的构建及类型证据独立于审查。

保留 `feature/warehouse-transfer-admin-mainline` 和既有linked worktree，按既有授权仅推送功能分支；不合并main、不建PR、不移动D1/D2.1固定release分支、不清理工作区。无migration，因此本批不执行apply或migration list；无运行态功能，不重发开发镜像、不运行Chrome或真实租户业务。未触及生产或Orange。

LightRAG查询返回502，未获得额外历史资料；以仓库现有设计/实现确定本批边界，未上传文档或声称RAG同步成功。

下一批另立数据库实施计划，覆盖新migration、原子保存/提交冻结快照/完成/取消、独立权限及默认关闭开关，以及真实SQL冲突、幂等、回滚、精度和财务隔离验证；随后才接入API/Admin及DEV真实租户验收。
