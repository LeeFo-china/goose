const CATALOG_CONFLICT_MESSAGES = [
  "只能移动叶子目录分类",
  "目录分类不能将自身设为父分类",
  "目录分类层级不能形成环",
  "父目录分类不存在",
  "目录分类层级不能超过 6 级",
  "存在启用的子分类，当前目录分类不能停用",
  "启用的目录分类必须属于启用的父分类",
  "目录单位不能将自身设为基准单位",
  "已有派生单位引用的基准单位不能改为派生单位",
  "基准单位不存在",
  "派生单位只能引用基准单位",
  "派生单位只能引用启用的基准单位",
  "有派生单位引用的基准单位不能停用",
] as const;

export function isCatalogConflict(error: unknown): boolean {
  if (typeof error === "string") {
    return error === "23505" ||
      CATALOG_CONFLICT_MESSAGES.some((message) => error.includes(message));
  }
  if (Array.isArray(error)) {
    return error.some((value) => isCatalogConflict(value));
  }
  if (typeof error !== "object" || error === null) return false;
  return Object.entries(error).some(([key, value]) =>
    (key === "code" && value === "23505") || isCatalogConflict(value)
  );
}
