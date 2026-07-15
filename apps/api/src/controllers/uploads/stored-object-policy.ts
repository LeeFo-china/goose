const PUBLIC_STORED_FILE_SCENES = new Set([
  "h5_marketing_page",
  "panorama_tiles",
  "picture_library",
  "picture_comment",
]);

export type ParsedStoredObjectKey = {
  tenantId: string | null;
  scene: string | null;
  projectId: string | null;
  isPlatformObjectKey: boolean;
  isPrivateObjectKey: boolean;
};

function normalizeSceneCode(value: string | null | undefined) {
  return value?.trim().replace(/-/g, "_") || null;
}

export function parseStoredObjectKey(path: string): ParsedStoredObjectKey {
  const parts = path.trim().replace(/^\/+/, "").split("/").filter(Boolean);
  if (parts[0] === "tenants" && parts.length >= 3) {
    return {
      tenantId: parts[1] || null,
      scene: normalizeSceneCode(parts[2]),
      projectId: parts[3] === "projects" && parts[4] ? parts[4] : null,
      isPlatformObjectKey: true,
      isPrivateObjectKey: false,
    };
  }
  if ((parts[0] === "public" || parts[0] === "system") && parts.length >= 2) {
    return {
      tenantId: null,
      scene: normalizeSceneCode(parts[1]),
      projectId: parts[2] === "projects" && parts[3] ? parts[3] : null,
      isPlatformObjectKey: true,
      isPrivateObjectKey: false,
    };
  }
  if (parts[0] === "private" && parts.length >= 2) {
    return {
      tenantId: null,
      scene: normalizeSceneCode(parts[1]),
      projectId: null,
      isPlatformObjectKey: true,
      isPrivateObjectKey: true,
    };
  }
  return {
    tenantId: null,
    scene: null,
    projectId: null,
    isPlatformObjectKey: false,
    isPrivateObjectKey: false,
  };
}

export function isPublicStoredFileScene(scene: string | null) {
  return Boolean(scene && PUBLIC_STORED_FILE_SCENES.has(scene));
}
