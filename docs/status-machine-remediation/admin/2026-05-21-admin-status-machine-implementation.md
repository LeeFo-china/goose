# Admin 动作化落地记录

日期：2026-05-21

## 已完成

- 客户编辑表单在编辑模式下不再提交 `status`；新增客户仍保留初始状态。
- 项目编辑表单在编辑模式下不再提交 `status`；新增项目仍保留初始状态。
- 客户详情弹窗接入 `GET /customers/:id/status-actions` 和 `GET /customers/:id/status-transitions`。
- 项目详情弹窗接入 `GET /projects/:id/status-actions` 和 `GET /projects/:id/status-transitions`。
- 客户 / 项目状态变更统一调用 `POST /:resource/:id/status-transition`。
- 项目 `sign_contract` 动作在 Admin 弹窗内要求填写有效签约金额。
- Admin 端根据项目状态禁用发起验收入口：
  - 仅 `constructing / acceptance` 允许发起工序验收。
- Admin 端根据项目状态禁用新增摄像头入口：
  - `invalid / completed` 项目不可新增摄像头。

## 验证命令

```bash
pnpm --dir apps/admin exec tsc -p tsconfig.json --noEmit
bun run api:typecheck
bun run api:build
bun run check:permission-boundaries
pnpm --dir apps/admin build
git diff --check
```

## 剩余事项

- 按实际业务数据做浏览器验收：客户详情、项目详情、签约、暂停、作废、验收、摄像头绑定。
- 与微信小程序端对接时，按 `../wechat/README.md` 下的文档执行。
