# 列表状态过滤后端跟进简版

日期：2026-04-21

## 结论

后端这轮已经把核心列表接口的状态过滤链路收稳：

- `GET /customers`：已修复
- `GET /employees`：已修复
- `GET /projects`：已复核，原本正常

现在这 3 条接口都应满足：

- `status` 生效
- `status + keyword` 可同时生效
- `pagination.total` 是过滤后的总数
- `pagination.totalPages` 基于过滤后总数计算
- 翻页后不会混入其他状态数据

## 本次后端改动

### customers

之前问题：

- 只解析了 `page / pageSize`
- 没有真正解析 `status`
- 没有真正解析 `keyword`

本次已补：

- `CustomerListQuerySchema`
- `status` 过滤
- `keyword` 过滤
- 过滤后的分页计数

关键词匹配字段：

- `name`
- `phone`

### employees

之前问题：

- 只解析了 `page / pageSize`
- 没有真正解析 `status`
- 没有真正解析 `keyword`

本次已补：

- `EmployeeListQuerySchema`
- `status` 过滤
- `keyword` 过滤
- 过滤后的分页计数

关键词匹配字段：

- `name`
- `phone`

### projects

本次核查时确认：

- `status` 已支持
- `keyword` 已支持
- 过滤后的 `count / totalPages` 正常

所以这次没有再改 `projects` 列表代码。

## 验证结果

### customers

- `status=following`：通过
- `status=following&keyword=奔驰`：通过
- 第 2 页状态纯净性：通过

### employees

- `status=active`：通过
- `status=active&keyword=固始`：通过
- 第 2 页状态纯净性：通过

### projects

- `status=constructing`：通过
- `status=constructing&keyword=项目`：通过

另外本地构建已通过：

```bash
bun build app.ts --outdir dist --target node
```

## 对前端的影响

前端当前保留本地状态过滤兜底没有问题。

但从后端现状看，这 3 条核心列表接口已经具备作为单一数据源的条件。后续如果前端要移除本地二次过滤，建议先：

1. 选一两个页面灰度观察真实请求结果
2. 重点看翻页、切 tab、搜索联动
3. 确认线上请求参数名仍然是 `status` 和 `keyword`

## 参考

完整排查与落地记录见：

- [列表状态过滤后端排查摘要](/Users/leefo/Public/work/gooes/docs/2026-04-21-backend-list-status-filter-troubleshooting-summary.md:1)
