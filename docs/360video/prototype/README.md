# 360 全景多图拼接阶段 0 原型

目标：在正式开发 `tenant_panorama_jobs` 和 worker 前，用最小脚本验证核心链路。

## 环境准备

```bash
python3 -m venv .venv-360
source .venv-360/bin/activate
pip install opencv-python
```

可选安装 libvips：

```bash
brew install vips
```

说明：

- `opencv-python` 用于多图拼接。
- `vips dzsave` 用于验证大图切片链路。
- `viewer.html` 使用 Photo Sphere Viewer CDN，需要本地浏览器能访问外网。

## 输入图片要求

第一版建议用同一房间、同一站位、顺时针连续拍摄的图片：

- 默认 `12` 张。
- 最低 `8` 张。
- 最多 `30` 张。
- 每张约 `30°`。
- 相邻照片重叠 `30%-50%`。
- 文件名按拍摄顺序命名，例如 `001.jpg`、`002.jpg`、`003.jpg`。

## 执行拼接

```bash
python3 docs/360video/prototype/stitch_panorama.py \
  ./tmp/360-input/living-room \
  ./tmp/360-output/living-room \
  --make-tiles \
  --run-dzsave
```

输出：

```text
tmp/360-output/living-room/
├── panorama.jpg
├── preview.jpg
├── manifest.json
├── tiles/
│   ├── 0_0.jpg
│   └── ...
└── dz_tiles/        # 仅安装 vips 并传 --run-dzsave 时生成
```

## 本地预览

因为浏览器直接打开本地 HTML 会遇到 `fetch manifest.json` 限制，建议起一个静态服务器：

```bash
cd tmp/360-output/living-room
python3 -m http.server 5177
```

把 `viewer.html` 复制或软链到输出目录，或从仓库目录指定 manifest：

```bash
python3 -m http.server 5178
```

打开：

```text
http://127.0.0.1:5178/docs/360video/prototype/viewer.html?manifest=/tmp/360-output/living-room/manifest.json
```

如果静态服务的根目录不是仓库根目录，需要按实际路径调整 `manifest` 参数。

## 验收标准

- OpenCV 能读取输入目录全部图片。
- `status = cv2.Stitcher_OK` 时输出 `panorama.jpg`。
- 失败时能看到明确错误码，例如 `ERR_NEED_MORE_IMGS`。
- 能生成 `manifest.json`。
- `--make-tiles` 能生成 Photo Sphere Viewer 可加载的简单网格瓦片。
- `--run-dzsave` 在安装 vips 后能生成 Deep Zoom 瓦片。
- `viewer.html` 能拖拽预览。

## 注意

`vips dzsave` 生成的是 Deep Zoom 瓦片，主要用于验证大图切片能力；Photo Sphere Viewer 的 equirectangular tiles adapter 使用的是经纬网格瓦片。因此脚本里 `--make-tiles` 会额外生成 PSV 可直接加载的 `tiles/{col}_{row}.jpg`。
