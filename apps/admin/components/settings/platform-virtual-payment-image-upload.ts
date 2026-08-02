export const VIRTUAL_GOODS_IMAGE_MAX_SIZE_BYTES = 2 * 1024 * 1024;
export const VIRTUAL_GOODS_IMAGE_SIZE_PX = 200;

const ALLOWED_VIRTUAL_GOODS_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
]);

type FileDeclaration = {
  type: string;
  size: number;
};

type ImageDimensions = {
  width: number;
  height: number;
};

export function validateVirtualGoodsImageFile(
  file: FileDeclaration,
): string | null {
  if (!ALLOWED_VIRTUAL_GOODS_IMAGE_TYPES.has(file.type)) {
    return "仅支持 JPG、JPEG 或 PNG 图片。";
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    return "图片文件无效，请重新选择。";
  }
  if (file.size > VIRTUAL_GOODS_IMAGE_MAX_SIZE_BYTES) {
    return "图片不能超过 2 MB。";
  }
  return null;
}

export function validateVirtualGoodsImageDimensions(
  dimensions: ImageDimensions,
): string | null {
  if (
    dimensions.width !== VIRTUAL_GOODS_IMAGE_SIZE_PX ||
    dimensions.height !== VIRTUAL_GOODS_IMAGE_SIZE_PX
  ) {
    return "图片尺寸必须为 200×200 像素。";
  }
  return null;
}

export async function validateVirtualGoodsImageForUpload(
  file: File,
  readDimensions: (file: File) => Promise<ImageDimensions> =
    readVirtualGoodsImageDimensions,
): Promise<string | null> {
  const declarationError = validateVirtualGoodsImageFile(file);
  if (declarationError) return declarationError;
  return validateVirtualGoodsImageDimensions(await readDimensions(file));
}

export function readVirtualGoodsImageDimensions(file: File) {
  return new Promise<ImageDimensions>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("图片无法读取，请重新选择。"));
    };
    image.src = objectUrl;
  });
}
