# 微信小程序 H5 活动页 web-view 对接文档

日期：2026-05-04

## 一、对接目标

admin 后台已经支持创建、编辑、发布 H5 活动页。小程序端需要新增一个通用 `web-view` 承载页面，用于打开后台发布后的 H5 活动页。

最终链路：

```text
admin 后台创建并发布 H5 页面
  -> 得到 H5 地址 https://h5.goodcms.cn/p/{slug}
  -> 小程序跳转 /pages/webview/index?url=encodeURIComponent(H5地址)
  -> web-view 加载 H5 页面
  -> H5 自己完成页面渲染、表单提交、埋点
```

MVP 阶段小程序端只负责打开 H5 页面，不需要自己调用 H5 营销页接口。

---

## 二、前置条件

小程序后台需要确认：

1. `https://h5.goodcms.cn` 已配置为 `web-view` 业务域名
2. 业务域名校验文件仍保留在 `https://h5.goodcms.cn/` 根目录
3. H5 站点使用 HTTPS 且证书有效
4. 小程序主体支持使用 `web-view`

微信 `web-view` 的关键约束：

- `web-view` 会自动铺满整个小程序页面
- `src` 必填
- 普通网页需要在小程序后台配置业务域名
- H5 向小程序 `postMessage` 只有在特定时机触发，本 MVP 不依赖该能力

参考：

- Taro WebView 文档：https://nervjs.github.io/taro/docs/components/open/web-view/
- 微信官方 web-view 文档：https://developers.weixin.qq.com/miniprogram/dev/component/web-view.html

---

## 三、H5 地址规则

后台发布后的 H5 页面地址格式：

```text
https://h5.goodcms.cn/p/{slug}
```

示例：

```text
https://h5.goodcms.cn/p/spring-sale
```

其中 `{slug}` 是 admin 后台新建 H5 页面时填写的“页面路径”。

小程序跳转时必须 URL 编码：

```text
/pages/webview/index?url=https%3A%2F%2Fh5.goodcms.cn%2Fp%2Fspring-sale
```

---

## 四、推荐小程序页面

建议新增通用页面：

```text
pages/webview/index
```

这个页面不要写业务逻辑，只负责：

1. 接收 `url`
2. 解码
3. 校验是否是允许的 H5 域名
4. 设置给 `web-view`
5. 处理加载失败提示

---

## 五、原生小程序实现示例

## 1. app.json

```json
{
  "pages": [
    "pages/webview/index"
  ]
}
```

如果已有 `pages`，只需要把 `pages/webview/index` 加进去。

## 2. pages/webview/index.wxml

```xml
<web-view
  wx:if="{{src}}"
  src="{{src}}"
  bindload="onWebViewLoad"
  binderror="onWebViewError"
/>

<view wx:else class="webview-error">
  <text>{{errorMessage}}</text>
</view>
```

## 3. pages/webview/index.ts

```ts
const ALLOWED_H5_HOSTS = ["h5.goodcms.cn"];

function decodeUrl(value?: string) {
  if (!value) return "";

  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function isAllowedH5Url(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_H5_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

Page({
  data: {
    src: "",
    errorMessage: "活动页地址无效",
  },

  onLoad(query: { url?: string }) {
    const url = decodeUrl(query.url);

    if (!isAllowedH5Url(url)) {
      this.setData({
        src: "",
        errorMessage: "活动页地址无效或域名未授权",
      });
      return;
    }

    this.setData({
      src: url,
      errorMessage: "",
    });
  },

  onWebViewLoad(event: WechatMiniprogram.WebViewLoad) {
    console.log("[webview] load", event.detail.src);
  },

  onWebViewError(event: WechatMiniprogram.WebViewError) {
    console.error("[webview] error", event.detail.src);
    this.setData({
      errorMessage: "活动页加载失败，请稍后重试",
    });
  },
});
```

## 4. pages/webview/index.wxss

```css
.webview-error {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
  color: #666;
  font-size: 28rpx;
  text-align: center;
}
```

---

## 六、Taro 实现示例

如果小程序端是 Taro，可以用下面写法。

## 1. 路由配置

在 Taro 页面配置里加入：

```ts
"pages/webview/index"
```

## 2. pages/webview/index.tsx

```tsx
import { WebView, View, Text } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";

const ALLOWED_H5_HOSTS = ["h5.goodcms.cn"];

function decodeUrl(value?: string) {
  if (!value) return "";

  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function isAllowedH5Url(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_H5_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

export default function H5WebViewPage() {
  const [src, setSrc] = useState("");
  const [errorMessage, setErrorMessage] = useState("活动页地址无效");

  useLoad((query) => {
    const url = decodeUrl(query.url);

    if (!isAllowedH5Url(url)) {
      setSrc("");
      setErrorMessage("活动页地址无效或域名未授权");
      return;
    }

    setSrc(url);
    setErrorMessage("");
  });

  if (!src) {
    return (
      <View className="webview-error">
        <Text>{errorMessage}</Text>
      </View>
    );
  }

  return (
    <WebView
      src={src}
      onLoad={(event) => {
        console.log("[webview] load", event.detail.src);
      }}
      onError={(event) => {
        console.error("[webview] error", event.detail.src);
        Taro.showToast({
          title: "活动页加载失败",
          icon: "none",
        });
      }}
    />
  );
}
```

---

## 七、跳转方法封装

建议统一封装一个跳转函数，不要在各业务页面手写 URL 拼接。

## 原生小程序

```ts
export function openH5Activity(slug: string) {
  const h5Url = `https://h5.goodcms.cn/p/${encodeURIComponent(slug)}`;
  const pageUrl = `/pages/webview/index?url=${encodeURIComponent(h5Url)}`;

  wx.navigateTo({
    url: pageUrl,
  });
}
```

## Taro

```ts
import Taro from "@tarojs/taro";

export function openH5Activity(slug: string) {
  const h5Url = `https://h5.goodcms.cn/p/${encodeURIComponent(slug)}`;
  const pageUrl = `/pages/webview/index?url=${encodeURIComponent(h5Url)}`;

  return Taro.navigateTo({
    url: pageUrl,
  });
}
```

使用示例：

```ts
openH5Activity("spring-sale");
```

---

## 八、活动入口建议

小程序端可以从以下入口跳转 H5 活动页：

1. 首页 Banner
2. 营销活动列表
3. 客户首页活动卡片
4. 项目详情里的活动入口
5. 扫码进入指定活动

入口配置建议只保存 `slug`，不要保存完整 URL。

推荐数据结构：

```ts
type H5ActivityEntry = {
  title: string;
  slug: string;
  coverImage?: string;
};
```

渲染时：

```ts
openH5Activity(entry.slug);
```

这样后续 H5 域名变更时，只需要改统一封装。

---

## 九、客户身份传递方案

## MVP 阶段

当前 MVP 不要求小程序向 H5 传客户身份。

H5 页面已经可以自己完成：

- 页面渲染
- 表单提交
- 页面访问埋点
- 按钮点击埋点

线索会通过用户主动填写的手机号进入后端。

## 后续增强

如果后续要把 H5 线索自动绑定当前小程序客户，不要在 URL 里直接传：

- 手机号
- openid
- customer_id
- user_id

推荐后续新增接口：

```text
POST /auth/h5-session
```

小程序登录后调用该接口换取短期 token：

```json
{
  "scene": "marketing_page",
  "slug": "spring-sale"
}
```

返回：

```json
{
  "token": "short_lived_token",
  "expires_in": 600
}
```

然后打开：

```text
https://h5.goodcms.cn/p/spring-sale?t=short_lived_token
```

注意：这个 token 接口目前还不是 MVP 必需项，前端不要阻塞在这里。

---

## 十、扫码和体验版注意事项

如果体验版二维码和真机调试行为不一致，优先排查：

1. 二维码配置的页面路径是否是最新的
2. 二维码进入时传的 `slug` 是否正确
3. 体验版是否是最新上传版本
4. 小程序缓存是否清理
5. `web-view` 页面是否已经加入 `app.json`
6. `url` 是否做了 `encodeURIComponent`
7. `https://h5.goodcms.cn` 是否仍在业务域名列表
8. H5 页面是否已经在 admin 后台发布
9. H5 地址在微信外浏览器是否能打开
10. 开发者工具和真机里 `onWebViewError` 打印的 `src`

---

## 十一、验收清单

前端完成后按这个清单验收：

1. 小程序存在 `/pages/webview/index`
2. `app.json` 已注册 web-view 页面
3. 首页或测试入口点击后能打开 `https://h5.goodcms.cn/p/{slug}`
4. `url` 参数经过 `encodeURIComponent`
5. 非 `h5.goodcms.cn` 域名会被拒绝打开
6. 已发布 H5 页面能正常展示
7. 未发布或错误 slug 有合理错误提示
8. H5 表单提交成功
9. 后台能看到营销线索
10. 后台能看到页面访问、按钮点击、表单提交埋点
11. 微信开发者工具可打开
12. 真机调试可打开
13. 体验版二维码可打开

---

## 十二、后端与 H5 当前状态

当前已经完成：

- admin 可创建 H5 活动页
- admin 可编辑模块、保存草稿、发布
- H5 地址格式：`https://h5.goodcms.cn/p/{slug}`
- H5 自动调用公开接口读取页面配置
- H5 自动提交线索和埋点

小程序端本次只需要完成：

```text
新增通用 web-view 页面
封装 openH5Activity(slug)
在业务入口调用 openH5Activity
完成真机和体验版验证
```
