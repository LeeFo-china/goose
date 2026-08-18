# PR #71/#72 回退前审计报告

**审计时间：** 2026-08-18 10:31:05 CST
**目标环境：** development（Supabase project ref `fclnkyatvfvmzgzdqlba`）
**审计方式：** Git/GitHub 只读查询、开发库只读 SQL
**结论：** 允许进入 Git 应用代码回退；保留已执行 migration，不执行破坏性数据库回退。

## Git 与 PR 边界

- 当前 `main`/`origin/main`：`631b741de12b8c4351f75ca221fb484747a718a2`。
- PR #72 合并提交：`631b741de12b8c4351f75ca221fb484747a718a2`。
- PR #71 合并提交：`447196bb680e4ccce51f5c82d235b0bd524b22de`。
- 回退后保留的前置提交：PR #66，`b5b048a1a9da3fde9e51f77fc49b86ccaafafc77`。
- 回退顺序固定为先 #72、后 #71，不 force push `main`。

## 开发库 migration 状态

开发库 `supabase_migrations.schema_migrations` 已包含：

```text
20260813170000
20260813180000
20260813185000
20260813195000
```

因此这四个 migration 文件必须永久保留在仓库中，不能随 Git revert 删除或改写。

## 开发库新增数据计数

| 资源 | 数量 |
| --- | ---: |
| `catalog_spec_definitions` | 0 |
| `catalog_unit_suggestions` | 0 |
| `supplier_sku_unit_conversions` | 0 |
| 平台所有权 `supplier_products` | 0 |
| 平台所有权 `supplier_skus` | 0 |
| 租户所有权 `catalog_categories` | 0 |
| 租户所有权 `catalog_brands` | 0 |

分类和品牌按 `upper(btrim(code))` 检查均无全局重复编码。

无敏感信息的原始结果摘要：

```text
migration|20260813170000
migration|20260813180000
migration|20260813185000
migration|20260813195000
counts|0|0|0|0|0|0|0
category_duplicate: no rows
brand_duplicate: no rows
```

审计查询只返回 migration 版本、计数和规范化编码，没有读取联系人、合同、价格或其他敏感业务明细。

## 部署与生产边界

- #71 已自动部署到 development：
  <https://github.com/LeeFo-china/goose/actions/runs/31883940824>
- #72 已自动部署到 development：
  <https://github.com/LeeFo-china/goose/actions/runs/31892734859>
- 开发库最终 migration apply 成功记录：
  <https://github.com/LeeFo-china/goose/actions/runs/31883163265>
- GitHub Actions 可见的 Production Database Migration 最近一次 apply 为 2026-07-22，早于 #71/#72；该工作流历史未发现本批四个 migration 的生产执行记录。此结论证明工作流执行边界，不替代生产库直接 migration history 核查。

## 回退决策

1. 可以回退 #71/#72 的 API、Admin 和 Domain 应用代码。
2. 保留四个已执行 migration 文件和开发库 schema；不新增破坏性补偿 migration，但必须增加一个最小前向兼容 migration，保证回退后的旧价格写路径继续显式写入租户归属。
3. 因七类新增业务数据均为 0，不需要业务数据导出、克隆或清理。
4. 前向兼容 migration 必须由 RED migration contract 驱动，并在本地数据库通过事务回滚 smoke；远端只通过受控 workflow 应用和只读核验。
5. 不对生产数据库执行任何动作。
6. 在前向兼容 migration 与计划 3 v2 均合并、开发环境验收通过，且 Production Database Migration 的 plan 输出经过审查前，生产 migration apply 状态为 `HOLD`，不得执行。

## 审计命令摘要

```bash
git status --short --branch
git log --oneline --decorate -5 main
gh pr view 71 --json number,state,mergedAt,mergeCommit,headRefName,baseRefName,url
gh pr view 72 --json number,state,mergedAt,mergeCommit,headRefName,baseRefName,url
gh run list --workflow "Migrate Production Database" --limit 10
gh run list --workflow "Auto Deploy Dev" --limit 5
```

开发库 SQL 通过 `gooes-dev` 上受保护的开发数据库环境文件执行，只使用 `SELECT`，没有 DDL/DML。
