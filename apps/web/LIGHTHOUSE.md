# 官网 Lighthouse 发布质量门

质量门固定使用 Lighthouse 12.8.2 mobile，检查首页、城市合伙人页、文章、案例和城市详情。城市详情连续运行三次，并以最差结果计分。

硬门为 Performance 85、Accessibility 95、SEO 95、LCP 2500ms、TBT 200ms、CLS 0.1。完整报告写入系统临时目录，仓库只保存紧凑汇总 `lighthouse-summary.json`。

## Metadata 输出策略

Next.js 15 默认只对部分爬虫等待动态 metadata，普通 Chrome 和 Lighthouse mobile User-Agent 仍可能收到流式 metadata。官网通过 `htmlLimitedBots: /.*/` 统一等待 metadata，使 description、canonical 和 Open Graph 标签稳定出现在 `<head>`。

该设置只影响需要动态 metadata 的内容页等待。production mobile 实测文章、案例和城市详情的最差 LCP 约 2.02 秒，仍低于 2.5 秒目标。首页 metadata 为静态，实测 LCP 2.465 秒，不由该选项延迟。

质量门脚本会检查 3020/3900 端口、启动固定上游 fixture、清理并构建 production standalone、校验运行 revision，完成后关闭临时服务。macOS 可显式指定 Chrome，一条命令即可执行：

```bash
cd apps/web
LIGHTHOUSE_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
pnpm lighthouse:gate
```

脚本会核对 `pnpm-lock.yaml` 和 `bun.lock` 前后哈希，并把生成时间、base URL、运行源码摘要、fixture 摘要、Next build ID 与响应 revision 写入汇总。`pnpm check:lighthouse-summary` 会重新计算摘要，拒绝与当前源码或 fixture 不匹配的旧结果。
