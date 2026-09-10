# Douyin Customer Login Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将抖音小程序客户登录页改为一键登录优先、短信登录按需展开的可信移动端界面。

**Architecture:** 保留现有客户认证 API 和结果处理，仅在页面定义中增加品牌、展开、倒计时及局部错误状态。TTML 使用现有页面和表单语义，TTSS 建立单一主操作与紧凑欢迎区，不引入新组件或依赖。

**Tech Stack:** Bun、TypeScript、抖音小程序 TTML/TTSS、现有 `ApiClient` 和页面单元测试。

---

### Task 1: 页面状态测试

**Files:**
- Modify: `apps/douyin-mini/src/pages/customer-login/page.test.ts`

- [x] **Step 1: 写入短信展开、主题初始化、倒计时和候选选择失败测试**

```ts
page.onToggleSms();
expect(page.data.smsExpanded).toBe(true);
await page.onLoad();
expect(page.data.brandName).toBe("青禾装饰");
await page.onSendCode();
expect(page.data.smsCooldown).toBe(60);
```

- [x] **Step 2: 运行测试并确认因新状态尚不存在而失败**

Run: `bun test apps/douyin-mini/src/pages/customer-login/page.test.ts`

Expected: FAIL，提示 `onToggleSms` 或新增 data 字段不存在。

### Task 2: 页面状态实现

**Files:**
- Modify: `apps/douyin-mini/src/pages/customer-login/page.ts`

- [x] **Step 1: 增加主题、展开、错误和倒计时状态**

```ts
data: {
  brandName: "装修服务",
  primaryColor: "#191817",
  primaryTextColor: "#FFFFFF",
  smsExpanded: false,
  smsCooldown: 0,
  loginError: "",
}
```

- [x] **Step 2: 从 `getApp().startup` 初始化租户品牌，并提供安全回退**

```ts
const bootstrap = await dependencies.getApp().startup;
if (bootstrap) {
  const theme = resolveThemeColor(bootstrap.theme.primary_color);
  this.setData({
    brandName: bootstrap.company.name,
    logoUrl: bootstrap.company.logo_url || "",
    primaryColor: theme.primaryColor,
    primaryTextColor: theme.primaryTextColor,
  });
}
```

- [x] **Step 3: 完成短信展开、发送倒计时和局部错误状态**

```ts
onToggleSms() {
  if (this.data.status === "idle") {
    this.setData({ smsExpanded: !this.data.smsExpanded, loginError: "" });
  }
}
```

- [x] **Step 4: 保持身份候选选择失败后仍停留在候选列表**

```ts
await this.runAuth(operation, "selecting");
```

- [x] **Step 5: 运行页面测试并确认通过**

Run: `bun test apps/douyin-mini/src/pages/customer-login/page.test.ts`

Expected: PASS。

### Task 3: 页面结构与视觉

**Files:**
- Modify: `apps/douyin-mini/src/pages/customer-login/index.ttml`
- Modify: `apps/douyin-mini/src/pages/customer-login/index.ttss`

- [x] **Step 1: 将页面改为欢迎区、唯一主按钮和可展开短信表单**

```xml
<button open-type="getPhoneNumber" bindgetphonenumber="onDouyinPhone">
  使用抖音手机号登录
</button>
<button bindtap="onToggleSms">使用短信验证码登录</button>
<view tt:if="{{smsExpanded}}" class="sms-form">...</view>
```

- [x] **Step 2: 候选列表替换登录区并补充加载、禁用和内联错误状态**

```xml
<view tt:if="{{status === 'selecting' || status === 'choosing'}}">...</view>
<view tt:else class="login-actions">...</view>
```

- [x] **Step 3: 使用冷灰背景、租户主题色、8px 内圆角和稳定控件尺寸完成响应式样式**

```css
.primary-action { min-height: 92rpx; border-radius: 16rpx; }
.sms-send { width: 220rpx; }
@media (prefers-reduced-motion: reduce) { .sms-form { animation: none; } }
```

### Task 4: 验证与提交

**Files:**
- Modify: `docs/superpowers/plans/2026-09-10-douyin-customer-login-redesign.md`

- [x] **Step 1: 运行客户登录页测试**

Run: `bun test apps/douyin-mini/src/pages/customer-login/page.test.ts`

Expected: PASS。

- [x] **Step 2: 运行小程序完整测试和类型检查**

Run: `bun test apps/douyin-mini/src`

Expected: PASS。

Run: `bunx tsc --noEmit -p apps/douyin-mini/tsconfig.json`

Expected: exit 0。

- [x] **Step 3: 检查提交边界并提交**

```bash
git diff --check
git add apps/douyin-mini/src/pages/customer-login docs/superpowers/plans/2026-09-10-douyin-customer-login-redesign.md
git commit -m "feat(douyin): 重构客户登录页"
```
