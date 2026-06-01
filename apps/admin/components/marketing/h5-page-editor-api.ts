import type { ImageUsage, LoadedImageFile, ProjectCaseOption, ProjectCaseOptionPagination } from "@/components/marketing/h5-page-editor-types";
import { EDITOR_IMAGE_ALLOWED_TYPES, EDITOR_IMAGE_DIRECT_UPLOAD_MAX_BYTES, EDITOR_IMAGE_MAX_BYTES, EDITOR_IMAGE_OUTPUT_MAX_WIDTH, PROJECT_CASE_SELECTOR_PAGE_SIZE } from "@/components/marketing/h5-page-editor-types";
import { uploadDirectToCos } from "@/lib/cos-direct-upload";
import { requestBackendJson } from "@/lib/backend-client";

export function getH5BaseUrl() {
  return (process.env.NEXT_PUBLIC_GOOES_H5_BASE_URL || "https://h5.goodcms.cn").replace(/\/+$/, "");
}

export function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function requestEditor<T>(input: {
  path: string;
  method?: "GET" | "POST" | "PUT";
  payload?: unknown;
}) {
  return requestBackendJson<T>(input.path, {
    method: input.method || "GET",
    body: input.payload ? JSON.stringify(input.payload) : undefined,
  });
}

export function getImageRequirement(usage: ImageUsage) {
  if (usage === "hero") {
    return {
      label: "Banner",
      minWidth: 750,
      ratios: [
        { value: "16:9", label: "16:9", ratio: 16 / 9 },
        { value: "3:1", label: "3:1", ratio: 3 },
      ],
    };
  }

  if (usage === "logo") {
    return {
      label: "Logo",
      minWidth: 200,
      ratios: [
        { value: "1:1", label: "1:1", ratio: 1 },
      ],
    };
  }

  return {
    label: "图片",
    minWidth: 750,
    ratios: [
      { value: "16:9", label: "16:9", ratio: 16 / 9 },
      { value: "3:1", label: "3:1", ratio: 3 },
      { value: "free", label: "自由", ratio: null },
    ],
  };
}

export function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  }

  return `${Math.ceil(bytes / 1024)}KB`;
}

export function getImageValidationIssues(
  image: LoadedImageFile,
  usage: ImageUsage,
  options: { skipRatio?: boolean } = {},
) {
  const requirement = getImageRequirement(usage);
  const issues: string[] = [];

  if (!EDITOR_IMAGE_ALLOWED_TYPES.has(image.file.type)) {
    issues.push("格式不符合要求，将转为 WebP");
  }

  if (image.file.size > EDITOR_IMAGE_MAX_BYTES) {
    issues.push(`图片大小 ${formatFileSize(image.file.size)}，超过 5MB`);
  } else if (image.file.size > EDITOR_IMAGE_DIRECT_UPLOAD_MAX_BYTES) {
    issues.push(`图片大小 ${formatFileSize(image.file.size)}，建议压缩后上传`);
  }

  if (image.width < requirement.minWidth) {
    issues.push(`图片宽度 ${image.width}px，低于 ${requirement.minWidth}px`);
  }

  const fixedRatios = options.skipRatio
    ? []
    : requirement.ratios.filter((item) => item.ratio);
  if (fixedRatios.length > 0) {
    const currentRatio = image.width / image.height;
    const ratioMatched = fixedRatios.some((item) =>
      item.ratio ? Math.abs(currentRatio - item.ratio) / item.ratio <= 0.08 : true
    );
    if (!ratioMatched) {
      issues.push(`当前比例 ${currentRatio.toFixed(2)}，不适合 ${requirement.label}`);
    }
  }

  return issues;
}

export function loadImageFile(file: File) {
  return new Promise<LoadedImageFile>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      resolve({
        element: image,
        file,
        height: image.naturalHeight,
        objectUrl,
        width: image.naturalWidth,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("图片无法读取，请重新选择"));
    };
    image.src = objectUrl;
  });
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("图片修正失败"));
        return;
      }
      resolve(blob);
    }, "image/webp", quality);
  });
}

export async function repairImageFile(input: {
  file: File;
  quality: number;
  ratio: number | null;
}) {
  const image = await loadImageFile(input.file);
  try {
    const sourceRatio = image.width / image.height;
    let sx = 0;
    let sy = 0;
    let sw = image.width;
    let sh = image.height;

    if (input.ratio && Math.abs(sourceRatio - input.ratio) > 0.01) {
      if (sourceRatio > input.ratio) {
        sw = Math.round(image.height * input.ratio);
        sx = Math.round((image.width - sw) / 2);
      } else {
        sh = Math.round(image.width / input.ratio);
        sy = Math.round((image.height - sh) / 2);
      }
    }

    const outputWidth = Math.min(sw, EDITOR_IMAGE_OUTPUT_MAX_WIDTH);
    const outputHeight = Math.round(outputWidth / (sw / sh));
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("浏览器不支持图片修正");
    }

    context.drawImage(image.element, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
    const blob = await canvasToBlob(canvas, input.quality);
    return new File(
      [blob],
      `${input.file.name.replace(/\.[^.]+$/, "") || "h5-image"}.webp`,
      { type: "image/webp" },
    );
  } finally {
    URL.revokeObjectURL(image.objectUrl);
  }
}

export async function uploadEditorImage(file: File) {
  const uploaded = await uploadDirectToCos(file, {
      scene: "h5_marketing_page",
      mimetype: file.type,
    uploadErrorLabel: "上传图片",
    missingStorageMessage: "图片上传成功但未返回地址",
  });

  const url = uploaded.url || uploaded.publicUrl;
  if (typeof url !== "string" || !url) {
    throw new Error("图片上传成功但未返回地址");
  }

  return url;
}

export async function fetchProjectCaseOptions(keyword: string, page = 1) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(PROJECT_CASE_SELECTOR_PAGE_SIZE),
  });
  if (keyword.trim()) {
    query.set("keyword", keyword.trim());
  }

  const data = await requestBackendJson<{
    list?: ProjectCaseOption[];
    pagination?: ProjectCaseOptionPagination;
  }>(`/marketing-pages/project-options?${query}`, {
    cache: "no-store",
    fallbackMessage: "项目案例加载失败",
  });

  return {
    list: data?.list || [],
    pagination: {
      page: Number(data?.pagination?.page) || page,
      pageSize: Number(data?.pagination?.pageSize) || PROJECT_CASE_SELECTOR_PAGE_SIZE,
      total: Number(data?.pagination?.total) || 0,
      totalPages: Number(data?.pagination?.totalPages) || 0,
    },
  };
}
