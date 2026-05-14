# 360 全景阶段 0 服务器环境配置摘要

日期：2026-05-14

## 服务器

- Host：`43.165.126.30`
- User：`ubuntu`
- Hostname：`VM-0-11-ubuntu`
- OS：`Ubuntu 24.04.4 LTS (Noble Numbat)`
- Kernel：`Linux 6.8.0-101-generic x86_64`
- 权限：`ubuntu` 具备免密 `sudo`

## 已安装依赖

系统包：

```bash
sudo apt-get update
sudo apt-get install -y \
  python3-pip \
  python3-venv \
  libgl1 \
  libglib2.0-0 \
  libvips-tools
```

安装过程中系统同时安装了 `libvips42t64`、`python3-dev`、`build-essential` 等依赖。

Python 虚拟环境：

```text
/home/ubuntu/goose-360-prototype/.venv
```

Python 包：

```bash
/home/ubuntu/goose-360-prototype/.venv/bin/pip install opencv-python-headless
```

## 当前版本

```text
Python: 3.12.3
vips: vips-8.15.1
OpenCV: 4.13.0
numpy: 2.4.4
```

OpenCV 验证：

```text
has Stitcher_create: True
has Stitcher: True
Stitcher_OK: 0
```

## 原型目录

```text
/home/ubuntu/goose-360-prototype/
├── .venv/
├── README.md
├── stitch_panorama.py
├── upload_server.py
├── viewer.html
└── smoke/
```

已从仓库同步到服务器：

- `docs/360video/prototype/stitch_panorama.py`
- `docs/360video/prototype/upload_server.py`
- `docs/360video/prototype/viewer.html`
- `docs/360video/prototype/README.md`

服务器脚本已设置可执行：

```bash
chmod +x /home/ubuntu/goose-360-prototype/stitch_panorama.py
```

并通过编译检查：

```bash
/home/ubuntu/goose-360-prototype/.venv/bin/python \
  -m py_compile /home/ubuntu/goose-360-prototype/stitch_panorama.py

/home/ubuntu/goose-360-prototype/.venv/bin/python \
  -m py_compile /home/ubuntu/goose-360-prototype/upload_server.py
```

## 临时 H5 上传服务

访问地址：

```text
https://h5.goodcms.cn/__360-upload/
```

本机服务：

```text
0.0.0.0:5179
```

进程：

```bash
/home/ubuntu/goose-360-prototype/.venv/bin/python \
  /home/ubuntu/goose-360-prototype/upload_server.py
```

启动方式：

```bash
nohup /home/ubuntu/goose-360-prototype/.venv/bin/python \
  /home/ubuntu/goose-360-prototype/upload_server.py \
  > /home/ubuntu/goose-360-prototype/upload_server.log 2>&1 &
```

健康检查：

```bash
curl http://127.0.0.1:5179/health
curl https://h5.goodcms.cn/__360-upload/health
```

当前 nginx 已在 `h5.goodcms.cn` 增加临时反代：

```nginx
client_max_body_size 900m;

location ^~ /__360-upload/ {
    proxy_pass http://127.0.0.1:5179/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 480s;
    proxy_send_timeout 480s;
    proxy_request_buffering off;
}
```

页面能力：

- 多图拖拽上传。
- 缩略图排序。
- 保存到 `/home/ubuntu/goose-360-prototype/input/<case-name>/`。
- 可选择“只上传”或“上传并拼接”。
- “上传并拼接”会创建后台任务，页面轮询任务状态，不再长时间阻塞等待。
- 页面展示最近验证记录，成功任务可以重新打开预览和预览图。
- 拼接成功后打开 `viewer.html` 预览。

注意：这是阶段 0 临时验证入口，不是正式生产业务 API。

当前上传服务的拼接参数：

- 上传上限：最多 `30` 张，单次总量不超过 `800MB`。
- 拼接前默认将每张图等比例压缩到长边 `1600px`。
- 后端拼接超时：`420s`。
- nginx 反代等待：`480s`，需要高于后端拼接超时。

阶段 0 MVP 临时接口：

```text
GET  /__360-upload/health
GET  /__360-upload/api/jobs
GET  /__360-upload/api/jobs/<case-name>
POST /__360-upload/api/upload
GET  /__360-upload/viewer?manifest=output/<case-name>/manifest.json
GET  /__360-upload/output/<case-name>/manifest.json
```

任务状态：

| 状态 | 含义 |
| --- | --- |
| `uploaded` | 已上传，仅保存原图，未触发拼接。 |
| `queued` | 等待后台线程开始拼接。 |
| `running` | 拼接中。 |
| `succeeded` | 拼接成功，已生成 manifest、预览图、全景图和瓦片。 |
| `failed` | 拼接失败，返回 `error_code` 和中文 `error_hint`。 |
 
任务记录保存位置：

```text
/home/ubuntu/goose-360-prototype/jobs.json
```

说明：阶段 0 仍然是单进程临时服务，任务状态只用于验证链路；正式版需要迁移到 `tenant_panorama_jobs` 表和 worker。

## 验证记录

已验证 `vips dzsave` 可执行：

```bash
vips dzsave \
  /home/ubuntu/goose-360-prototype/smoke/smoke.jpg \
  /home/ubuntu/goose-360-prototype/smoke/dz_smoke
```

输出：

```text
/home/ubuntu/goose-360-prototype/smoke/dz_smoke.dzi
/home/ubuntu/goose-360-prototype/smoke/dz_smoke_files/vips-properties.xml
```

用户实测 `case-20260514-124850`：

- 上传：`16` 张手机原图。
- 原图尺寸：`3024x4032`。
- 原图总量：约 `42MB`。
- 直接使用原图拼接超过阶段 0 服务超时，返回 `STITCH_TIMEOUT`。
- 改为长边 `1600px` 后重跑成功，耗时约 `40s`。
- 输出全景：`7285x1594`。
- 预览地址：

```text
https://h5.goodcms.cn/__360-upload/viewer?manifest=output/case-20260514-124850/manifest.json
```

## 后续使用方式

上传一组按顺序命名的样例图片到：

```text
/home/ubuntu/goose-360-prototype/input/<case-name>/
```

建议命名：

```text
001.jpg
002.jpg
003.jpg
...
```

执行：

```bash
cd /home/ubuntu/goose-360-prototype
.venv/bin/python stitch_panorama.py \
  ./input/<case-name> \
  ./output/<case-name> \
  --make-tiles \
  --run-dzsave
```

输出：

```text
/home/ubuntu/goose-360-prototype/output/<case-name>/
├── panorama.jpg
├── preview.jpg
├── manifest.json
├── tiles/
└── dz_tiles/
```

## 注意事项

- 本次只配置阶段 0 原型环境，没有创建 `tenant_panorama_jobs`，没有启动正式 worker。
- 没有修改生产 PM2 进程。
- 没有接入 API、Admin、小程序或 H5 正式业务链路。
- 当前 `jobs.json` 只是临时验证记录，不作为正式业务数据源。
- `vips dzsave` 生成 Deep Zoom 瓦片，用于验证大图切片能力；`viewer.html` 默认读取脚本生成的 PSV 网格瓦片。
- PEM 密钥仅用于本次 SSH 连接，不应提交到 Git。
