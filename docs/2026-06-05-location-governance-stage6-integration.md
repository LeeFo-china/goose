# 阶段 6 对接：定位运营、风控和隐私治理

更新时间：2026-06-05

阶段 6 第一版目标是让定位匹配能力可观察、可清理、可审计。小程序端不需要新增业务接口，但需要按本文补充埋点和复测回写。

## 后端能力

### 统计接口

平台超管接口：

```http
GET /admin/ops/location-metrics
Authorization: Bearer <admin_token>
```

返回最近 24 小时和最近 7 天两个窗口：

| 字段 | 说明 |
| --- | --- |
| `total` | 定位上下文总数 |
| `active` | 仍未过期的上下文 |
| `expired_unconfirmed` | 已过期且未确认的上下文 |
| `confirmed` | 已确认装修公司的上下文 |
| `confirmation_rate` | 确认率 |
| `single_tenant` | 单装修公司命中数 |
| `multi_tenant` | 多装修公司命中数 |
| `no_match` | 无装修公司候选数 |
| `identity_match` | 已绑定身份保护命中数 |
| `raw_coordinate_stored` | 已保存原始经纬度的上下文数量 |
| `low_accuracy` | 定位精度大于 500 米的上下文数量 |
| `source_counts` | `gps` / `manual_city` / `manual_address` 计数 |
| `match_reason_counts` | `identity` / `adcode` / `district` / `city` / `province` / `distance` 计数 |
| `fallback_reason_counts` | 兜底原因计数 |
| `recent_no_match` | 最近无服务区域记录，用于运营补服务区域 |

### Admin 运维入口

路径：

```text
/ops?tab=health
```

健康监控 tab 顶部新增“定位匹配治理”卡：

- 最近 24 小时和 7 天定位上下文。
- 多装修公司候选数和占比。
- 无服务区域数和占比。
- 过期未确认上下文数量。
- 原始坐标保存数量。
- 最近无服务区域列表。

### 清理脚本

本地或服务器命令：

```bash
bun run api:location-context-cleanup
```

默认 dry-run，不删除数据。实际清理：

```bash
bun run api:location-context-cleanup -- --apply
```

清理规则：

```sql
expires_at < now AND confirmed_at IS NULL
```

已确认的定位上下文不会被删除，用于保留用户选择装修公司的审计线索。

admin 运维脚本白名单也新增：

```text
清理定位上下文
```

## 隐私策略

- 默认 `LOCATION_STORE_RAW_COORDINATE=false`。
- 后端默认不保存 `latitude`、`longitude`、`accuracy`。
- 统计卡里的 `raw_coordinate_stored` 应长期保持 0。
- 如果未来开启原始坐标保存，必须先补隐私说明、保留期限和清理策略。

## 小程序埋点建议

小程序端无需新增接口，但建议对以下事件补埋点：

| 事件 | 触发点 |
| --- | --- |
| `location_permission_granted` | 用户授权 GPS |
| `location_permission_denied` | 用户拒绝 GPS |
| `location_manual_city_selected` | 用户手动选择城市/区县 |
| `location_bootstrap_success` | bootstrap 成功返回 |
| `location_single_tenant_auto_enter` | 单装修公司自动进入 |
| `location_multi_tenant_shown` | 多装修公司选择页展示 |
| `location_tenant_confirm_success` | confirm 成功 |
| `location_no_service_area` | 无服务区域兜底 |
| `location_identity_protected` | 已绑定身份优先 |

埋点不要包含用户 token、腾讯 Key、原始经纬度。可记录省/市/区县、adcode、候选数量、`fallback_reason` 和 `match_reason`。

## 运营处理规则

- `NO_SERVICE_AREA_MATCHED` 增多：优先在 admin 给对应城市/区县配置服务区域。
- 多候选率升高：检查同一区域装修公司的 `priority` 是否符合运营策略。
- 手动城市选择率升高：检查小程序定位授权文案和腾讯 LBS Key 配置。
- 原始坐标保存数大于 0：确认是否主动开启隐私开关，否则需要排查配置。
- 低精度定位增多：小程序侧检查定位类型、授权、网络和设备环境。

## 验收标准

1. `GET /admin/ops/location-metrics` 返回 24h 和 7d 统计。
2. admin `/ops?tab=health` 能看到定位匹配治理卡。
3. 清理脚本 dry-run 输出 matched/deleted，且 deleted 为 0。
4. `--apply` 只删除过期且未确认上下文。
5. 已确认上下文不会被清理。
6. 小程序侧完成埋点后，把事件名、触发场景和复测结果回写到本文。
