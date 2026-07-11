# 官网 Lighthouse 发布质量门

质量门固定使用 Lighthouse 12.8.2 mobile，检查首页、城市合伙人页、文章、案例和城市详情。城市详情连续运行三次，并以最差结果计分。

硬门为 Performance 85、Accessibility 95、SEO 95、LCP 2500ms、TBT 200ms、CLS 0.1。完整报告写入系统临时目录，仓库只保存紧凑汇总 `lighthouse-summary.json`。

先构建并启动本地 production standalone：

```bash
# 终端一
cd apps/web
node e2e/upstream-stub.mjs

# 终端二
cd apps/web
GOOES_API_BASE_URL=http://127.0.0.1:3900 pnpm build
GOOES_API_BASE_URL=http://127.0.0.1:3900 \
GOOES_WEB_PROXY_SHARED_SECRET=e2e-shared-secret \
GOOES_PREVIEW_SHARED_SECRET=e2e-preview-shared-secret-that-is-long \
GOOES_PREVIEW_SESSION_SECRET=e2e-preview-session-secret-that-is-long \
pnpm start
```

再执行质量门。macOS 可显式指定 Chrome：

```bash
cd apps/web
LIGHTHOUSE_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
pnpm lighthouse:gate
```

脚本会核对 `pnpm-lock.yaml` 和 `bun.lock` 前后哈希。只校验已提交汇总时执行 `pnpm check:lighthouse-summary`。
