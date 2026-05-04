# 微信小程序 H5 活动页 web-view 对接文档

日期：2026-05-04

## 一、对接目标

admin 后台已经支持创建、编辑、发布 H5 活动页。小程序端需要新增一个通用 `web-view` 承载页面，用于打开后台发布后的 H5 活动页。

最终链路：

```text
admin 后台创建并发布 H5 页面
  -> 小程序调用公开接口获取已发布活动列表
  -> 根据返回的 slug/url 生成活动入口
  -> 用户点击后跳转 /pages/webview/index?url=encodeURIComponent(H5地址)
  -> web-view 加载 H5 页面
  -> H5 自己完成页面渲染、表单提交、埋点
```

MVP 阶段小程序端不应该写死活动页 `slug`。推荐先调用公开列表接口，拿到后台已发布的活动页数组，再由小程序按业务位置生成入口。

---

## 二、前置条件

小程序后台需要确认：

1. `https://h5.goodcms.cn` 已配置为 `web-view` 业务域名
2. 如果小程序通过 `wx.request` 请求 `https://h5.goodcms.cn/public/marketing-pages`，还需要把 `https://h5.goodcms.cn` 加入小程序后台的 `request` 合法域名
3. 业务域名校验文件仍保留在 `https://h5.goodcms.cn/` 根目录
4. H5 站点使用 HTTPS 且证书有效
5. 小程序主体支持使用 `web-view`

微信 `web-view` 的关键约束：

- `web-view` 会自动铺满整个小程序页面
- `src` 必填
- 普通网页需要在小程序后台配置业务域名
- H5 向小程序 `postMessage` 只有在特定时机触发，本 MVP 不依赖该能力

参考：

- Taro WebView 文档：https://nervjs.github.io/taro/docs/components/open/web-view/
- 微信官方 web-view 文档：https://developers.weixin.qq.com/miniprogram/dev/component/web-view.html

---

## 三、活动列表接口

小程序端用于生成活动入口的公开接口：

```text
GET https://h5.goodcms.cn/public/marketing-pages
```

按具体入口场景获取：

```text
GET https://h5.goodcms.cn/public/marketing-pages?scene=home
GET https://h5.goodcms.cn/public/marketing-pages?scene=customer_home
GET https://h5.goodcms.cn/public/marketing-pages?scene=project_detail
GET https://h5.goodcms.cn/public/marketing-pages?scene=marketing_list
```

返回格式：

```json
{
  "data": {
    "list": [
      {
        "id": "7d6c9f7b-9e8f-4a6e-b7b7-3d0c0e4f3f9a",
        "title": "51劳动节到店有礼",
        "slug": "springsale",
        "description": "到店预约可领取专属装修礼包",
        "cover_image": "https://example.com/cover.jpg",
        "display_scene": "home",
        "sort_order": 10,
        "url": "https://h5.goodcms.cn/p/springsale",
        "start_at": "2026-05-01T00:00:00.000Z",
        "end_at": "2026-05-31T23:59:59.000Z",
        "published_at": "2026-05-04T10:30:00.000Z",
        "updated_at": "2026-05-04T10:30:00.000Z"
      }
    ]
  }
}
```

字段说明：

| 字段 | 含义 | 小程序用途 |
| --- | --- | --- |
| `title` | 活动标题 | 卡片标题、入口文案 |
| `slug` | 活动页路径标识 | 拼接或追踪活动页 |
| `description` | 活动简介 | 卡片副标题 |
| `cover_image` | 活动封面图 | 首页 Banner、活动卡片图片 |
| `display_scene` | 后台配置的展示场景 | 判断活动适合展示在哪里 |
| `sort_order` | 排序值 | 数值越小越靠前 |
| `url` | 可直接打开的 H5 完整地址 | 传给通用 `web-view` 页面 |
| `start_at` / `end_at` | 活动展示时间 | 当前接口已经过滤过期和未开始活动 |
| `published_at` | 发布时间 | 排序或展示最新活动 |

接口只返回 `published` 状态、且在展示时间内的活动页。后台下线、结束活动或活动过期后，该活动不会继续出现在列表里，小程序端不需要单独维护开关。

`scene` 过滤规则：

- `scene=home`：返回后台配置为 `home` 或 `all` 的活动
- `scene=customer_home`：返回后台配置为 `customer_home` 或 `all` 的活动
- `scene=project_detail`：返回后台配置为 `project_detail` 或 `all` 的活动
- `scene=marketing_list`：返回后台配置为 `marketing_list` 或 `all` 的活动
- 不传 `scene`：返回所有当前可展示活动

小程序端推荐拉取时机：

1. 首页或营销活动页 `onLoad` / `onShow`
2. 客户首页需要展示活动卡片时
3. 扫码进入但未指定具体活动时

如果返回 `list` 为空，小程序隐藏活动入口即可。

---

## 四、H5 地址规则

后台发布后的 H5 页面地址格式：

```text
https://h5.goodcms.cn/p/{slug}
```

示例：

```text
https://h5.goodcms.cn/p/spring-sale
```

其中 `{slug}` 是 admin 后台新建 H5 页面时填写的“页面路径”。

小程序端优先使用活动列表接口返回的 `url`。如果只拿到了 `slug`，再按上面的规则拼接 H5 地址。

小程序跳转时必须 URL 编码：

```text
/pages/webview/index?url=https%3A%2F%2Fh5.goodcms.cn%2Fp%2Fspring-sale
```

---

## 五、推荐小程序页面

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

## 六、原生小程序实现示例

### 1. app.json

```json
{
  "pages": [
    "pages/webview/index"
  ]
}
```

如果已有 `pages`，只需要把 `pages/webview/index` 加进去。

### 2. pages/webview/index.wxml

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

### 3. pages/webview/index.ts

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

### 4. pages/webview/index.wxss

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

## 七、Taro 实现示例

如果小程序端是 Taro，可以用下面写法。

### 1. 路由配置

在 Taro 页面配置里加入：

```ts
"pages/webview/index"
```

### 2. pages/webview/index.tsx

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

## 八、活动列表拉取与跳转封装

建议统一封装两类方法：

1. `fetchH5Activities()`：获取后台已发布活动
2. `openH5ActivityUrl(url)`：打开活动页

不要在首页、客户页、项目页里写死 `slug`。

### 原生小程序

```ts
type H5ActivityEntry = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_image: string | null;
  display_scene: "all" | "home" | "customer_home" | "project_detail" | "marketing_list";
  sort_order: number;
  url: string;
  start_at: string | null;
  end_at: string | null;
  published_at: string | null;
  updated_at: string | null;
};

const ALLOWED_H5_HOSTS = ["h5.goodcms.cn"];

function isAllowedH5Url(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_H5_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

export function fetchH5Activities(scene?: H5ActivityEntry["display_scene"]): Promise<H5ActivityEntry[]> {
  const query = scene ? `?scene=${encodeURIComponent(scene)}` : "";

  return new Promise((resolve, reject) => {
    wx.request({
      url: `https://h5.goodcms.cn/public/marketing-pages${query}`,
      method: "GET",
      success(response) {
        const body = response.data as {
          data?: {
            list?: H5ActivityEntry[];
          };
        };

        resolve(Array.isArray(body.data?.list) ? body.data.list : []);
      },
      fail(error) {
        reject(error);
      },
    });
  });
}

export function openH5ActivityUrl(url: string) {
  if (!isAllowedH5Url(url)) {
    wx.showToast({
      title: "活动页地址无效",
      icon: "none",
    });
    return;
  }

  wx.navigateTo({
    url: `/pages/webview/index?url=${encodeURIComponent(url)}`,
  });
}
```

页面使用示例：

```ts
Page({
  data: {
    activities: [] as H5ActivityEntry[],
  },

  async onLoad() {
    const activities = await fetchH5Activities();
    this.setData({ activities });
  },

  onActivityTap(event: WechatMiniprogram.TouchEvent) {
    const activity = event.currentTarget.dataset.activity as H5ActivityEntry;
    openH5ActivityUrl(activity.url);
  },
});
```

### Taro

```ts
import Taro from "@tarojs/taro";

export type H5ActivityEntry = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_image: string | null;
  display_scene: "all" | "home" | "customer_home" | "project_detail" | "marketing_list";
  sort_order: number;
  url: string;
  start_at: string | null;
  end_at: string | null;
  published_at: string | null;
  updated_at: string | null;
};

const ALLOWED_H5_HOSTS = ["h5.goodcms.cn"];

function isAllowedH5Url(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_H5_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

export async function fetchH5Activities(scene?: H5ActivityEntry["display_scene"]) {
  const query = scene ? `?scene=${encodeURIComponent(scene)}` : "";
  const response = await Taro.request<{
    data?: {
      list?: H5ActivityEntry[];
    };
  }>({
    url: `https://h5.goodcms.cn/public/marketing-pages${query}`,
    method: "GET",
  });

  return Array.isArray(response.data.data?.list)
    ? response.data.data.list
    : [];
}

export function openH5ActivityUrl(url: string) {
  if (!isAllowedH5Url(url)) {
    return Taro.showToast({
      title: "活动页地址无效",
      icon: "none",
    });
  }

  return Taro.navigateTo({
    url: `/pages/webview/index?url=${encodeURIComponent(url)}`,
  });
}
```

---

## 九、兼容 slug 的跳转方法

建议统一封装一个跳转函数，不要在各业务页面手写 URL 拼接。

### 原生小程序

```ts
export function openH5Activity(slug: string) {
  const h5Url = `https://h5.goodcms.cn/p/${encodeURIComponent(slug)}`;
  const pageUrl = `/pages/webview/index?url=${encodeURIComponent(h5Url)}`;

  wx.navigateTo({
    url: pageUrl,
  });
}
```

### Taro

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

这个方法只作为兼容能力保留。新入口优先使用 `fetchH5Activities()` 返回的 `url`，不要把 `spring-sale` 这类测试 slug 写死在线上业务页面。

---

## 十、活动入口建议

小程序端可以从以下入口跳转 H5 活动页：

1. 首页 Banner
2. 营销活动列表
3. 客户首页活动卡片
4. 项目详情里的活动入口
5. 扫码进入指定活动

入口数据建议直接使用公开接口返回的数据，不要在小程序端维护静态数组。

推荐数据结构：

```ts
type H5ActivityEntry = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_image: string | null;
  display_scene: "all" | "home" | "customer_home" | "project_detail" | "marketing_list";
  sort_order: number;
  url: string;
};
```

渲染时：

```ts
openH5ActivityUrl(entry.url);
```

如果小程序端某些模块只能保存轻量配置，最多保存 `slug`，页面展示时仍建议先拉列表做一次匹配，避免活动已经下线但入口仍然可见。

---

## 十一、客户身份传递方案

### MVP 阶段

H5 页面已经可以自己完成：

- 页面渲染
- 表单提交
- 页面访问埋点
- 按钮点击埋点

线索会通过用户主动填写的手机号进入后端。

### 推荐接入 H5 短期 token

如果要把 H5 线索自动绑定当前小程序客户，不要在 URL 里直接传：

- 手机号
- openid
- customer_id
- user_id

小程序登录后调用该接口换取短期 token：

```text
POST /wechat/h5-session
```

请求头：

```text
Authorization: Bearer {小程序登录 token}
```

请求体：

```json
{
  "slug": "spring-sale",
  "scene": "marketing_list"
}
```

返回：

```json
{
  "data": {
    "token": "short_lived_token",
    "expires_at": "2026-05-04T10:30:00.000Z",
    "identity_status": "identified",
    "customer_id": "customer-id-or-null"
  }
}
```

然后打开：

```text
https://h5.goodcms.cn/p/spring-sale?token=short_lived_token&returnPath=%2Fpages%2Findex%2Findex&returnMethod=switchTab
```

H5 会自动读取 token 并在提交线索、记录埋点时带给后端。token 过期或申请失败时，小程序可以降级打开原始 `url`，H5 会按匿名链路继续提交。

`returnPath` 和 `returnMethod` 用于 H5 成功态里的“返回小程序”按钮。体验版二维码直达 H5 承载页时，页面栈可能没有上一页，只靠 `navigateBack` 会失败，因此建议小程序端始终传一个明确返回页。

推荐规则：

- 返回 tabBar 页面：`returnMethod=switchTab`
- 返回普通页面：`returnMethod=redirectTo`
- 只需要回到打开 H5 的上一页：`returnMethod=navigateBack`，可不传 `returnPath`
- 需要重置小程序页面栈：`returnMethod=reLaunch`

---

## 十二、扫码和体验版注意事项

如果体验版二维码和真机调试行为不一致，优先排查：

1. 二维码配置的页面路径是否是最新的
2. 二维码进入时传的 `slug` 或 `url` 是否正确
3. 体验版是否是最新上传版本
4. 小程序缓存是否清理
5. `web-view` 页面是否已经加入 `app.json`
6. `url` 是否做了 `encodeURIComponent`
7. `https://h5.goodcms.cn` 是否仍在业务域名列表
8. 如果调用活动列表接口，`https://h5.goodcms.cn` 是否也配置在 `request` 合法域名
9. H5 页面是否已经在 admin 后台发布
10. H5 地址在微信外浏览器是否能打开
11. 开发者工具和真机里 `onWebViewError` 打印的 `src`

---

## 十三、验收清单

前端完成后按这个清单验收：

1. 小程序存在 `/pages/webview/index`
2. `app.json` 已注册 web-view 页面
3. 小程序能调用 `GET https://h5.goodcms.cn/public/marketing-pages`
4. 活动入口来自接口返回的 `list`，不是前端写死数组
5. 首页或测试入口点击后能打开 `https://h5.goodcms.cn/p/{slug}`
6. `url` 参数经过 `encodeURIComponent`
7. 非 `h5.goodcms.cn` 域名会被拒绝打开
8. 已发布 H5 页面能正常展示
9. 后台下线或结束活动后，小程序刷新列表不再展示该活动
10. 未发布或错误 slug 有合理错误提示
11. H5 表单提交成功
12. 后台能看到营销线索
13. 后台能看到页面访问、按钮点击、表单提交埋点
14. 微信开发者工具可打开
15. 真机调试可打开
16. 体验版二维码可打开

---

## 十四、后端与 H5 当前状态

当前已经完成：

- admin 可创建 H5 活动页
- admin 可编辑模块、保存草稿、发布
- 公开接口可返回已发布 H5 活动页列表
- H5 地址格式：`https://h5.goodcms.cn/p/{slug}`
- H5 自动调用公开接口读取页面配置
- H5 自动提交线索和埋点

小程序端本次只需要完成：

```text
新增通用 web-view 页面
封装 fetchH5Activities()
封装 openH5ActivityUrl(url)
在业务入口按接口返回的 list 渲染活动入口
完成真机和体验版验证
```
