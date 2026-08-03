# 好友助力海报“暂无施工图片”点击回归修复对接

## 结论

小程序项目详情菜单中的“好友助力海报”点击失败不是后端缺少施工图片，也不是
营销活动配置未生效。根因是 Orange 在抽取项目菜单抽屉组件时，把原来的无参
点击包装函数改成了直接传递业务处理函数，导致 Taro 的点击事件对象被误当成
施工日志参数。

该问题只能在 Orange 小程序仓库修复；Gooes 后端接口和数据无需调整。

## 用户现象

1. 租户在营销中心启用好友助力活动。
2. 客户进入小程序项目详情，打开项目菜单。
3. “好友助力海报”展示“去生成”。
4. 点击后提示“暂无可生成海报的施工图片”，没有进入海报页。

## 根因定位

Orange 当前代码：

```tsx
<View
  className={`poster-entry-card poster-entry-card--campaign${posterEntryDisabled ? ' poster-entry-card--disabled' : ''}`}
  onClick={onOpenShareCampaignPage}
>
```

相关文件：

- `src/packageCustomerPortal/pages/customer-project-detail/components/CustomerProjectMenuDrawer.tsx`
- `src/packageCustomerPortal/pages/customer-project-detail/index.tsx`

`CustomerProjectMenuDrawer` 声明的业务回调是 `() => void`，但 Taro 4.1.11 的
`View.onClick` 运行时会传入 `ITouchEvent`。该事件被传入
`handleOpenShareCampaignPage(log?)` 后，以下表达式优先选择了事件对象：

```ts
const targetLog =
  log ?? derived.recommendedPosterLog ?? derived.latestPosterLog;
```

点击事件没有 `log_id` 或 `id`，所以 `targetLogId` 为空并触发错误提示。

回归由 Orange 提交 `f9d5c1f4`（`refactor: extract customer project menu drawer`）
引入。抽取组件前的正确写法是：

```tsx
onClick={() => handleOpenShareCampaignPage()}
```

## Orange 最小修复

将抽屉中的直接回调改回无参包装，阻止 Taro 事件对象进入业务参数：

```diff
- onClick={onOpenShareCampaignPage}
+ onClick={() => onOpenShareCampaignPage()}
```

不要通过后端返回特殊字段、前端硬编码日志 ID 或吞掉空值来绕过问题。

建议同时增加一个组件回归测试：触发“好友助力海报”卡片点击后，断言
`onOpenShareCampaignPage` 被调用一次且没有收到参数。

## 开发环境核查证据

核查时间：2026-07-31。

- 当前启用活动：`10月1日装修助力`，类型 `share_assist`，状态 `active`，范围为
  `all_projects`。
- 对开发租户内 6 个可登录且有施工图片的客户项目逐一调用
  `GET /customer/projects/:projectId/share-campaigns/summary`，均返回 200、
  `display_mode=create_campaign` 和有效 `recommended_log.log_id`。
- 问题项目 `fa32f6dd-b2d0-4efc-a810-347dfe90ec4c` 返回推荐日志
  `a0d54a77-ce4c-4747-8f53-a43cf9b5a7d1`。
- 对该推荐日志调用
  `GET /customer/projects/:projectId/logs/:logId/share-card` 返回 200，包含 3 张图片。
- 第一张图片 Range GET 返回 206，内容类型为 `image/jpeg`。

以上证据证明后端活动匹配、推荐日志选择、施工图片序列化和图片访问链路均正常。

## Orange 验收清单

1. 先写回归测试并确认在旧实现下失败。
2. 应用无参包装修复后，确认测试通过。
3. 使用有施工图片的客户项目进入项目详情，打开项目菜单。
4. 点击“好友助力海报 / 去生成”，确认直接进入海报页，不再出现缺图提示。
5. 确认海报页显示施工主图，可切换图片并保存海报。
6. 使用确实没有施工图片的项目复测，仍应展示“暂无素材”或明确缺图提示。
7. 复测“预约到店有礼”、AI 问答、工地监控等相邻菜单入口，避免抽屉事件回归。

## 仓库边界

- Gooes：完成后端、开发数据和存储访问核查，并记录本对接文档；无代码修改。
- Orange：负责上述一行事件绑定修复、回归测试、构建和微信开发者工具 smoke。
- 本次核查未修改 Orange 仓库。
