export type PictureAssetBasePayload = {
  title: string;
  description: string | null;
  sort_order: number;
  status: string;
  category_ids: string[];
};

export type PictureAssetCreatePayload = PictureAssetBasePayload & {
  file_object_id: string;
};

const FALLBACK_ASSET_TITLE = "资料库图片";
const MAX_ASSET_TITLE_LENGTH = 120;

export function resolvePictureAssetCreateTitle(input: {
  formTitle: string;
  fileName: string;
  index: number;
  total: number;
}) {
  const formTitle = input.formTitle.trim();
  if (!formTitle) {
    return normalizePictureAssetTitle(stripFileExtension(input.fileName));
  }

  if (input.total <= 1) {
    return normalizePictureAssetTitle(formTitle);
  }

  const suffix = ` ${input.index + 1}`;
  const baseLength = Math.max(1, MAX_ASSET_TITLE_LENGTH - suffix.length);
  return normalizePictureAssetTitle(`${formTitle.slice(0, baseLength).trim()}${suffix}`);
}

export function buildPictureAssetCreatePayload(input: {
  basePayload: PictureAssetBasePayload;
  fileName: string;
  fileObjectId: string;
  index: number;
  total: number;
}): PictureAssetCreatePayload {
  return {
    ...input.basePayload,
    title: resolvePictureAssetCreateTitle({
      formTitle: input.basePayload.title,
      fileName: input.fileName,
      index: input.index,
      total: input.total,
    }),
    file_object_id: input.fileObjectId,
  };
}

function stripFileExtension(fileName: string) {
  const normalizedName = fileName.trim();
  const separatorIndex = Math.max(normalizedName.lastIndexOf("/"), normalizedName.lastIndexOf("\\"));
  const baseName = normalizedName.slice(separatorIndex + 1).trim() || normalizedName;
  const extensionIndex = baseName.lastIndexOf(".");
  if (extensionIndex > 0) {
    return baseName.slice(0, extensionIndex);
  }

  return baseName;
}

function normalizePictureAssetTitle(title: string) {
  const normalizedTitle = title.trim().slice(0, MAX_ASSET_TITLE_LENGTH).trim();
  return normalizedTitle || FALLBACK_ASSET_TITLE;
}
