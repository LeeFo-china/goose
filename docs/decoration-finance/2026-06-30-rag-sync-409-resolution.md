# RAG sync 409 修复记录

日期：2026-06-30

## 背景

Phase 7.6 记录过 RAG sync 失败，根因是实际 upload 阶段被 LightRAG 返回 409：

- `docs/decoration-finance/2026-06-30-phase7-5-finance-correction-audit.md`
- `docs/decoration-finance/README.md`

失败不是 dry-run 问题，而是 LightRAG 文档存储中已存在同名 processed 文档，原同步工具没有 upsert 或删除后重插能力。

## 根因确认

OpenAPI 查询确认 LightRAG 提供：

```text
DELETE /documents/delete_document
```

该接口按文档 ID 删除，支持 `delete_file` 和 `delete_llm_cache`。因此可以在同步工具侧实现受控 replace。

同名文件不能直接按 `file_path` 删除，原因是 `README.md` 这类 basename 在多个目录中都存在。安全匹配必须使用文本 payload 里的来源头：

```text
Source-Repo: gooes
Source-Path: docs/decoration-finance/README.md
```

## 修复策略

已在本机共享 RAG 工具 `/Users/leefo/Public/work/mcp/rag` 中补齐：

- `LightRagClient.deleteDocuments()`：
  - 调用 `DELETE /documents/delete_document`。
- `sync-repo-docs.mjs`：
  - upload/insert 遇到 409 时，不按 filename 删除。
  - 分页读取 `/documents/paginated`。
  - 只匹配 `Source-Repo` 和 `Source-Path` 都一致的旧文档。
  - 删除旧文档并等待 pipeline 空闲。
  - 若 delete 返回 busy，则等待 pipeline 空闲后重试。
  - 删除成功后重新 insert/upload。
- `sync-repo-docs-conflict-utils.mjs`：
  - 提供 409 判断、同源文档匹配、分页查找和 pipeline idle 判断。

## 验证

共享 RAG 工具验证：

```bash
cd /Users/leefo/Public/work/mcp/rag
node --test tests/sync-repo-docs-conflict-utils.test.mjs
npm run build
```

结果：

- 单测 4 pass。
- TypeScript build 通过。

gooes wrapper 验证：

```bash
pnpm run sync:rag-docs:dry-run -- --force
```

修复前：

```text
[gooes-rag-sync] dry-run: 2/571 docs need upload
```

实际同步：

```bash
pnpm run sync:rag-docs -- --force
```

结果：

```text
[gooes-rag-sync] done: uploaded=1, failed=0, changed=1
```

再次 dry-run：

```text
[gooes-rag-sync] skip: dry-run found no changed docs to upload
```

## 后续注意

- RAG 同步仍保持非阻塞，不作为业务提交阻塞项。
- 后续如继续出现 409，应先确认是否能通过 `Source-Repo` + `Source-Path` 找到同源旧文档。
- 不允许按 basename 批量删除，避免误删其他目录的 `README.md`。
- 共享工具当前不属于 gooes 版本控制范围，本记录用于说明本机同步工具修复和验证结果。
