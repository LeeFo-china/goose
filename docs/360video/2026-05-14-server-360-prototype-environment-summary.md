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
├── viewer.html
└── smoke/
```

已从仓库同步到服务器：

- `docs/360video/prototype/stitch_panorama.py`
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
```

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
- `vips dzsave` 生成 Deep Zoom 瓦片，用于验证大图切片能力；`viewer.html` 默认读取脚本生成的 PSV 网格瓦片。
- PEM 密钥仅用于本次 SSH 连接，不应提交到 Git。
