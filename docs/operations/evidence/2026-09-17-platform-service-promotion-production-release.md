# 平台技术服务限时活动生产发布证据

日期：2026-09-17。范围：平台超管限时活动管理、租户平台技术服务三档套餐活动价读取，以及本批次随主干发布的采购收货送货单附件能力。未创建或发布生产活动，未发起真实支付。

## 固定候选

- 主干提交：`c02056f0c34830c7cadb7109326225c80982fe07`。
- 生产 Tag：`v2026.09.17.1`，解析到同一主干提交。
- [生产候选构建](https://github.com/LeeFo-china/goose/actions/runs/35175140880)成功；请求服务为 `api,admin`，生产机完成不可变镜像拉取与清单核验。

## 生产数据库

- [迁移只读计划](https://github.com/LeeFo-china/goose/actions/runs/35174743666)成功：生产历史 629 条，最新 `20260915092804`；仅待以下两条主干 migration：
  - `20260916133000_supplier_purchase_receipt_delivery_note_attachments.sql`
  - `20260916170000_create_platform_service_promotions.sql`
- [正式迁移](https://github.com/LeeFo-china/goose/actions/runs/35174846213)成功：629→631，两条 migration 均已应用，最新版本为 `20260916170000`。工作流先生成生产备份 `/opt/supabase/docker/backups/prod-migrate-35174846213-20260917103428.sql`。
- [迁移后只读复核](https://github.com/LeeFo-china/goose/actions/runs/35174979024)成功：生产历史 631 条，待执行 0，最新版本仍为 `20260916170000`。

## API/Admin 发布

- [生产部署](https://github.com/LeeFo-china/goose/actions/runs/35175754784)成功；部署回执绑定候选构建 `35175140880`、Tag `v2026.09.17.1`、完整提交 SHA 和服务 `api,admin`。
- 工作流按 API、Admin 顺序重建容器。`gooes-api` 与 `gooes-admin` 均为 `running/healthy`，运行时 revision、镜像 digest、服务标签和构建运行号均通过校验。
- 工作流公网检查通过：`https://api.goodcms.cn/` 与 `https://admin.goodcms.cn/login` 可用。发布后独立复核仍分别返回 200；未登录访问限时活动管理页返回 307 并跳转 `/login`。
- 新接口 `GET /platform/billing/service-promotions?page=1&pageSize=20` 未携带登录凭证时返回 401、`TOKEN_MISSING`，证明路由可达且鉴权边界生效。

## 验收边界

- 本轮没有创建草稿、发布活动或修改套餐价格，因此生产默认价格保持不变；运营需在超管 Admin 明确创建并发布活动后，小程序才会读取活动价。
- 未使用生产超管或租户会话做登录后数据 smoke，也未发起真实支付。正式启用活动前应由运营在 Admin 核对 1 年、2 年、3 年预览价格，再用小程序真机验证展示和下单确认页；支付回调仍按独立支付验收执行。
- 数据库回滚采用前向 migration；如限时活动能力需停用，应先停止已发布活动，再通过后续 migration 撤销函数、表、约束与权限。镜像可按生产发布回执回滚到上一候选。
