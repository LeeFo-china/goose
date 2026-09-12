# 客户装修生图 Ark 真实能力验证

日期：2026-09-12（Asia/Shanghai）

## 结论

开发环境已完成一次真实的“双图输入 → Seedream 5.0 Pro 单图生成 → 受控下载
→ WebP 规范化 → 私有 COS 写入与 HEAD 校验 → 临时对象清理”验证。调用返回
一张 2672×1504 的装修效果图，链路成功且没有自动重试。

本次只证明供应商、配置解析、输入可访问性、结果下载和私有转存链路可用；测试图
不是客户家庭照片，不能替代后续真实户型样本的结构一致性、稳定性、费用及内容审核
验收。

## 安全配置摘要

- 场景：`decoration_raw_drawing`
- 协议：`openai_compatible`
- 供应商系统编码：`openai_compatible_2`
- 模型系统编码：
  `manual.openai_compatible_2.doubao_seedream_5_0_pro_260628`
- 调用模型：`doubao-seedream-5-0-pro-260628`
- 输入：仓库内两张非客户 PNG；原始空间图在前，风格参考图在后
- 输出：URL 响应，经 Ark 输出主机白名单下载并规范化为 WebP
- API Key、COS 密钥和输入/输出签名 URL 未写入日志、本文或 Git

## 根因与修复

第一次真实请求被上游以 HTTP 400 / `InvalidParameter` 明确拒绝，安全诊断将问题
定位到 `sequential_image_generation`。当前已开通的 Seedream 5.0 Pro 模型不接受
该字段，因此请求构造器不再发送它。回归测试先观察到字段仍存在，再移除字段并转绿。

移除该字段后的 60 秒调用不再收到参数拒绝，但在本地超时前没有确定响应，按
`submission_unknown` 处理且未自动重试。最终验证命令显式使用 300 秒等待上限，
同一请求在约 93.6 秒返回成功。这证明当前场景路由的 60 秒配置不足；正式客户流程
应使用持久化异步任务，短期同步验证至少需要覆盖已观测耗时。

火山方舟官方图片生成文档确认该接口支持图文/多图输入，结果 URL 有限期有效；本地
因此不把 Ark URL 直接持久化为客户结果，而是在允许主机范围内下载后转存私有 COS：
<https://www.volcengine.com/docs/82379/1541523>。

## 真实调用结果

| 项目 | 结果 |
| --- | --- |
| Request ID | `021789218767022de2cfbc22a0f44ef1f4fdf213841a20e191a1a` |
| 输入图片 | 2 |
| 生成图片 | 1 |
| output tokens | 15698 |
| total tokens | 15698 |
| 服务端链路耗时 | 93556 ms |
| 输出格式 | WebP，单帧，无 Alpha |
| 输出尺寸 | 2672×1504 |
| 输出字节 | 372424 |
| SHA-256 | `c618ec21da0c9bf23c389f6cbccb477117e14a0b054eb8edc7171321475041cd` |
| 临时对象清理 | 3/3；结果返回前全部删除成功 |

本地输出为 `/tmp/customer-rendering-ark-smoke-20260912-final.webp`，仅用于本机视觉
检查，不纳入版本控制。

## 视觉检查

- 生成内容为现代简约客厅，暖白、浅木色、深色金属点缀与柔和自然光明确。
- 原空间中的施工人员和杂物已移除，未出现额外文字或品牌标识。
- 右下角保留“AI生成”水印，符合请求参数。
- 生成图保留了大窗、开口和柱体等主要空间线索，但家具布局和局部结构存在明显
  再创作；后续必须用更贴近真实用户上传的空房/户型样本建立结构一致性验收集。

## 执行记录

只读预检：

```sh
GOOES_ENV_FILE=/Users/leefo/Public/work/gooes/apps/api/.env \
  bun run api:customer-rendering-ark-smoke
```

结果：配置与私有存储均 ready，未调用供应商。

显式付费执行：

```sh
GOOES_ENV_FILE=/Users/leefo/Public/work/gooes/apps/api/.env \
  bun run api:customer-rendering-ark-smoke --execute \
  --output=/tmp/customer-rendering-ark-smoke-20260912-final.webp \
  --timeout-ms=300000
```

结果：退出码 0，生成 1 张图片；私有结果完成 HEAD 长度校验，三个临时对象均清理。

文件复核：

```sh
file /tmp/customer-rendering-ark-smoke-20260912-final.webp
shasum -a 256 /tmp/customer-rendering-ark-smoke-20260912-final.webp
```

结果：WebP 2672×1504，字节数与 SHA-256 均和命令返回一致。

## 后续门禁

1. 客户入口不得直接同步等待本接口，需实现数据库额度预占和持久化异步任务。
2. 上游超时、网络中断和 5xx 继续按提交状态未知处理，禁止自动重试扣费调用。
3. 客户结果必须转存私有对象并经过内容审核，不能长期依赖 Ark 临时 URL。
4. 另配视觉理解模型，结构化建议必须通过 `RenderingAdviceSchema` 校验后保存。
5. 面向客户开放前补充真实空房、局部房间、户型图和低质量输入的质量/成本样本。
