# Phase 7.6 RAG sync dry-run / upload 失败核查

日期：2026-06-30

## 背景

`merge: finance reconciliation operating stats` 合并时，post-commit RAG runner 输出：

```text
[gooes-rag-sync] dry-run: 5/568 docs need upload
[gooes-rag-sync] non-blocking failure: sync command exited with code 1
```

本次按 GoodCMS RAG 同步流程复核，确认失败发生在 dry-run 之后的实际 upload 阶段。

## 当前复现

在隔离 worktree 执行：

```bash
pnpm run sync:rag-docs:dry-run
```

结果：

```text
[gooes-rag-sync] skip: HEAD does not touch gooes-curated docs
```

原因：当前 worktree HEAD 尚未提交本轮文档，且 `.codex/rag-sync.config.json` 的 `repoRoot` 固定为 `/Users/leefo/Public/work/gooes`，因此 wrapper 扫描 main 工作区，而不是当前 worktree 未提交文件。

强制 dry-run：

```bash
pnpm run sync:rag-docs:dry-run -- --force
```

结果：

```text
[gooes-rag-sync] dry-run: 2/568 docs need upload
```

底层 dry-run：

```bash
cd /Users/leefo/Public/work/mcp/rag
node scripts/sync-repo-docs.mjs \
  --repo /Users/leefo/Public/work/gooes \
  --profile gooes-curated \
  --dry-run
```

结果：

- `selectedCount = 568`
- `changedCount = 2`
- 待同步文档：
  - `docs/decoration-finance/2026-06-30-phase7-5-finance-correction-audit.md`
  - `docs/decoration-finance/README.md`

## 实际失败原因

执行实际同步：

```bash
pnpm run sync:rag-docs -- --force
```

结果：

```text
[gooes-rag-sync] dry-run: 2/568 docs need upload
[gooes-rag-sync] non-blocking failure: sync command exited with code 1
```

绕过 wrapper 保留底层输出后，失败明细为：

```json
{
  "uploadedCount": 0,
  "failedCount": 2,
  "failed": [
    {
      "path": "docs/decoration-finance/2026-06-30-phase7-5-finance-correction-audit.md",
      "error": "LightRAG API request failed: HTTP 409. Document storage already contains '2026-06-30-phase7-5-finance-correction-audit.md' (Status: processed). Delete the existing record before re-inserting."
    },
    {
      "path": "docs/decoration-finance/README.md",
      "error": "LightRAG API request failed: HTTP 409. Document storage already contains 'README.md' (Status: processed). Delete the existing record before re-inserting."
    }
  ]
}
```

结论：

- dry-run 本身正常。
- 失败发生在 upload 阶段。
- LightRAG 当前 insert/upload 对已存在 processed 文档返回 409。
- 同步工具当前没有“更新已有文档”或“删除后重插”的自动能力。
- 对 `README.md` 这类 basename，LightRAG 端按文件名判重会更容易和不同目录文档冲突。

## 处理结论

本仓库业务代码不应直接绕过 RAG 服务端 409 约束，也不应在业务提交里硬改 `/Users/leefo/Public/work/mcp/rag` 共享工具。

建议后续在 RAG 工具侧单独处理：

1. 为文本同步实现稳定的 upsert 流程：
   - 根据 manifest 或 LightRAG 文档列表找到旧记录。
   - 删除旧记录后重新插入。
   - 或调用服务端提供的 update API。
2. 保留 repo-relative `file_source`，但上传文件名也应避免只用 basename。
3. wrapper 在失败时保留底层 JSON 到 `reports/` 或 `/tmp`，避免错误细节被临时目录删除。
4. worktree 场景下允许通过环境变量覆盖 `repoRoot`，避免固定 main 路径造成排查混淆。

当前业务仓库处理：

- 记录根因。
- 保持 RAG sync 非阻塞。
- 后续提交后如再次出现 409，按该文档判断为 RAG 工具 upsert 能力缺失，不作为 gooes 业务代码阻塞。
