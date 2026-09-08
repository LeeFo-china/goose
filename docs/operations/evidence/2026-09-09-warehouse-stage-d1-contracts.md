# 阶段 D1 调拨请求契约验证

日期：2026-09-09。分支：`feature/warehouse-project-material-stage-c`。

设计：[D1 调拨](../../superpowers/specs/2026-09-09-warehouse-transfer-stage-d1-design.md)。
实施批次：[请求契约](../../superpowers/plans/2026-09-09-warehouse-transfer-stage-d1-contracts.md)。

## 范围

只新增调拨的 Domain 状态／动作／DTO 和 API 严格请求校验。不注册路由、不改库存流水枚举、不创建 migration、不调整权限、不开放租户开关、不部署服务。此批次完成不代表调拨已经可用，更不代表盘点、手工调整或整个阶段 D 完成。

已完成单据和已取消单据的展示动作均为空；动作表不是授权依据。数据库权限、跨租户隔离、原子计价和并发最终门禁仍需在后续批次实现并验收。

## 验证检查点

主代理独立运行：

```bash
bun test packages/domain/src/warehouse-transfer.test.ts packages/domain/src/warehouse-material.test.ts
bun run --cwd packages/domain build
```

Domain 测试 2 pass、0 fail、11 断言；共享包构建退出 0。

协作交接确认最初未执行 Domain RED，因此没有把该步骤记为已运行。主代理删除本批未提交的 Domain 实现并撤下其 barrel 导出，保留测试，实际观察到 0 pass／1 fail（新状态导出为 undefined）；随后根据测试和既定契约重新实现，得到上述 2 pass／11 断言及构建通过。未删除用户数据或历史代码；最终公开契约不变，展示边界注释改为中文。

API 先写真实 Zod 边界测试，以空导出骨架运行：2 fail，均为新 schema 尚未定义的断言失败，不是路径错误或语法错误。在骨架阶段补充缺失版本、Domain 输入类型兼容、明细接口拒绝列表过滤后再次确认同样的 2 个红灯；随后实施最终 schema，完整测试转绿。

从 `apps/api` 执行：

```bash
bun test src/schema/warehouse-transfers.test.ts
bun test src/schema/warehouse-transfers.test.ts src/schema/warehouse-materials.test.ts
bun run typecheck
bun run check
```

- 新调拨 API 契约：2 pass、0 fail、77 断言。
- 加上原领退料契约：5 pass、0 fail、134 断言。
- API 类型检查及完整 `check`（类型、构建、文件大小门禁）退出 0；构建 977 模块，API bundle 5.12 MB；`git diff --check` 通过。
- 测试覆盖同仓／大小写重复 SKU、数量最小／最大和非法精度、1／100 行及越界、必填原因及长度、客户端成本／身份／项目字段、版本、严格参数与分页；数量没有经过 JavaScript 浮点转换。
- 独立规格审查与最终代码质量审查均通过，无 Critical／Important／Minor 缺陷。质量审查另行运行 API 测试，得到 5 pass／134 断言，并检查末尾换行、Unicode 行分隔符、尾随空格、`+1`、`.1`、`1.` 均被拒绝。审查后的 Domain 重建不改变公开契约，主代理再次复跑 Domain／API 测试、Domain 构建和 API 类型检查通过。

## 执行边界与一次误用命令

额外复核时误从 worktree 根目录使用 API 的 `src/schema/...` 相对过滤，Bun 将共享 Domain 解析到了主工作区的旧源码，报新导出不存在。从当前 worktree 的 `apps/api` 按既有约定执行上述完整路径测试即通过。没有修改主工作区、Bun 配置或既有模块解析规则；不能把错误目录下的输出当作本分支功能失败或成功证据。

协作实现未及时返回后，由主代理接手 API 校验与证据整理。规格与质量审查独立完成，不以实现者自审替代。
