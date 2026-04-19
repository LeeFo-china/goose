# `@gooes/domain` 升级与前端对接说明

## 1. 结论

这次需要给前端同步新的 `@gooes/domain` 版本。

原因：

- 本次新增了介绍人 / 项目介绍费相关的稳定业务值域
- 前端如果继续使用旧版 `@gooes/domain`，拿不到新的 referral 常量和状态配置

本次已准备好的版本：

- 包名：`@gooes/domain`
- 新版本：`1.2.0`
- 打包产物：[packages/domain/gooes-domain-1.2.0.tgz](/Users/leefo/Public/work/gooes/packages/domain/gooes-domain-1.2.0.tgz)

---

## 2. 这次 `domain` 包新增了什么

新增文件：

- [packages/domain/src/referral.ts](/Users/leefo/Public/work/gooes/packages/domain/src/referral.ts:1)

主要新增导出：

- `EXTERNAL_REFERRER_STATUS_VALUES`
- `PROJECT_REFERRAL_STATUS_VALUES`
- `ExternalReferrerStatusConfig`
- `ProjectReferralStatusConfig`
- `PROJECT_REFERRAL_RATE_BPS_MIN`
- `PROJECT_REFERRAL_RATE_BPS_MAX`
- `isExternalReferrerStatus`
- `isProjectReferralStatus`

前端适合直接用这些内容做：

- 状态筛选
- 状态标签文案
- 状态颜色映射
- `rate_bps` 范围校验

---

## 3. 哪些数据库变动需要前端对接

数据库这次有很多实现层变动，但前端真正要对接的是下面这些“外显变化”。

### 3.1 `projects.signed_amount`

前端要点：

- 创建项目时不是必填
- 项目状态切到 `signed` 时必填
- 已支付介绍费后，这个字段必须只读

### 3.2 新资源 `external_referrers`

前端要接：

- 介绍人列表
- 新建介绍人
- 编辑介绍人

前端要识别的状态：

- `active`
- `inactive`

### 3.3 新资源 `project_referrals`

前端要接：

- 创建介绍费配置
- 查询介绍费详情
- 按项目查询介绍费
- 修改介绍人 / 比例
- 标记已支付

关键约束：

- 一个项目只有一条介绍费记录
- 前端不要按“一项目多条介绍费”理解

### 3.4 `project_referrals.status`

状态值：

- `pending`
- `calculated`
- `paid`
- `cancelled`

这是前端控制按钮显隐、字段只读和状态标签的核心字段。

### 3.5 `rate_bps`

前端要点：

- 按整数基点传
- `100 = 1%`
- `150 = 1.5%`
- 范围 `100 ~ 400`

不要传：

- `"1.5%"`
- `1.5`

### 3.6 支付相关字段

前端要接：

- `paid_evidence_images`
- `paid_by`
- `paid_remark`
- `paid_at`

规则：

- `paid_evidence_images` 至少一张
- `paid_by` 必传
- `paid_at` 可传，不传则后端自动写当前时间

### 3.7 查询返回结构

前端要特别注意：

`GET /project-referrals/project?project_id=...`

可能返回：

```json
{
  "data": null,
  "message": "success"
}
```

这表示“当前项目还没有配置介绍费”，不是异常。

### 3.8 联查字段

当前介绍费接口返回里有这些联查对象：

- `project`
- `referrer`
- `paid_operator`

前端展示时优先读这些联查对象，不要自己再二次拼装。

---

## 4. 哪些数据库变动不需要前端直接关心

下面这些属于后端 / 数据库内部实现，前端不用直接对接：

- trigger
- RPC / 自动重算函数
- 索引
- 外键
- check constraint
- `updated_at` 自动更新时间逻辑

前端只要按接口行为和文档约定走即可。

---

## 5. 前端应该看哪两份文档

前端联调请直接看：

1. [2026-04-19-frontend-project-referrals-integration-summary.md](/Users/leefo/Public/work/gooes/docs/2026-04-19-frontend-project-referrals-integration-summary.md:1)
2. [2026-04-19-frontend-project-referrals-code-examples.md](/Users/leefo/Public/work/gooes/docs/2026-04-19-frontend-project-referrals-code-examples.md:1)

---

## 6. 推荐给前端的同步话术

可以直接这样发：

```text
这次需要前端升级 @gooes/domain 到 1.2.0。

主要新增了介绍人 / 项目介绍费相关的 domain 常量和状态配置，另外后端已经上线 signed_amount、external_referrers、project_referrals 相关接口。

前端重点改动：
1. 项目签约时补 signed_amount
2. 对接 external-referrers / project-referrals
3. paid 后把 signed_amount / referrer_id / rate_bps 改成只读

联调文档看：
- 2026-04-19-frontend-project-referrals-integration-summary.md
- 2026-04-19-frontend-project-referrals-code-examples.md
```
