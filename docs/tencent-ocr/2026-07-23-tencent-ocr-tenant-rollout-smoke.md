# 腾讯云 OCR 租户灰度发布前验收记录

日期：2026-07-23

范围：OCR 租户灰度控制面、运行时拦截、平台 Admin 配置入口。

## 安全边界

- 未开启 `TENCENT_OCR_ENABLED`。
- 未开启 `TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED`。
- 未创建或更新任何租户灰度策略。
- 未发起真实 OCR 识别，未上传证照，未产生腾讯云计费调用。
- 临时 API/Admin 分别运行在 worktree 独立端口 `3100`、`3110`，验收后已停止。

## Migration

执行前 dry-run 仅包含：

```text
20260723110000_create_ocr_tenant_policies.sql
```

通过 `supabase db push --db-url ... --yes` 应用后，`supabase migration list` 显示：

```text
20260723110000 | 20260723110000 | 2026-07-23 11:00:00
```

数据库只读核对：

- `ocr_tenant_policies` 当前为 `0` 行，未预置任何租户白名单。
- `platform_ocr_tenant_policy_overview` 返回 `6` 个租户，样本均为 `configured=false`、`enabled=false`。
- `platform.ocr.tenant_policy.manage` 权限存在，并以 `all` 范围授予平台 `platform_admin`。
- 平台 OCR 总开关和加密身份证开关均为 `false`。

## API Smoke

使用真实平台超管测试账号，只读请求：

```http
GET /platform/ocr/tenant-policies?page=1&pageSize=2&enabled=false
```

结果：

- HTTP `200`。
- `pagination.page=1`、`pageSize=2`、`total=6`、`totalPages=3`。
- 当前页返回 `2` 个租户，均为 `configured=false`、`enabled=false`。

使用租户系统管理员测试账号，只读请求：

```http
GET /ocr/capabilities?scene=wechat_pay_applyment
```

结果：HTTP `200`，能力列表长度为 `0`，符合平台总开关关闭和租户默认拒绝策略。

权限负例：普通财务账号请求能力接口返回 HTTP `403 FORBIDDEN`；租户系统管理员请求平台租户策略接口返回 HTTP `403 FORBIDDEN`。两项均符合既有权限边界。

## Admin Smoke

临时 Admin：`http://127.0.0.1:3110/platform/ocr?view=tenants&pageSize=20`

只读核对结果：

- 平台超管登录和平台模式识别正常。
- “证照识别 / 租户灰度”显示 `6` 个租户，全部为“未启用 / 未配置 / 平台默认”。
- 页面明确提示平台总开关优先。
- 配置弹窗包含 shadcn 开关、四类证照复选框、每日额度和运营备注。
- 未点击“保存策略”，关闭弹窗后无数据变化。
- 页面无浏览器 console warning/error；表格、筛选区和配置弹窗未发现重叠或内容溢出。

## 结论

租户灰度控制面具备发布条件，且默认状态为关闭。后续正式灰度必须按“先确认平台密钥和加密配置，再选择租户和证照类型，最后开启平台总开关”的顺序执行；当前验收不包含开启动作。
