import {
  buildUploadPreviewUrl,
  uploadDirectToCos,
  validateUploadFile,
} from "@/lib/cos-direct-upload";
import { requestBackendJson } from "@/lib/backend-client";

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function buildAvatarPreviewUrl(value: string) {
  return buildUploadPreviewUrl(value);
}

export async function requestCustomer<T = any>(input: {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  payload?: unknown;
}) {
  return requestBackendJson<T>(input.path, {
    method: input.method || "GET",
    body: input.payload ? JSON.stringify(input.payload) : undefined,
  });
}

type ProjectPrimaryRoleCode = "designer" | "supervisor";

type ProjectMemberRecord = {
  id: string;
  employee_id: string;
  role_code: string;
  is_primary?: boolean;
  is_virtual?: boolean;
};

export async function syncProjectPrimaryMember(input: {
  projectId: string;
  roleCode: ProjectPrimaryRoleCode;
  employeeId: string | null;
}) {
  const members = await requestCustomer({
    path: `/projects/${input.projectId}/members`,
  }) as ProjectMemberRecord[];
  const roleMembers = members.filter((item) =>
    !item.is_virtual && item.role_code === input.roleCode
  );
  const primaryMembers = roleMembers.filter((item) => item.is_primary);

  if (!input.employeeId) {
    await Promise.all(primaryMembers.map((item) =>
      requestCustomer({
        path: `/projects/${input.projectId}/members/${item.id}`,
        method: "DELETE",
      })
    ));
    return;
  }

  const existing = roleMembers.find((item) => item.employee_id === input.employeeId);
  if (existing) {
    if (!existing.is_primary) {
      await requestCustomer({
        path: `/projects/${input.projectId}/members/${existing.id}`,
        method: "PATCH",
        payload: { is_primary: true },
      });
    }
    return;
  }

  await requestCustomer({
    path: `/projects/${input.projectId}/members`,
    method: "POST",
    payload: {
      employee_id: input.employeeId,
      role_code: input.roleCode,
      is_primary: true,
    },
  });
}

export async function syncProjectPrimaryMembers(input: {
  projectId: string;
  designerId: string | null;
  supervisorId: string | null;
}) {
  await syncProjectPrimaryMember({
    projectId: input.projectId,
    roleCode: "designer",
    employeeId: input.designerId,
  });
  await syncProjectPrimaryMember({
    projectId: input.projectId,
    roleCode: "supervisor",
    employeeId: input.supervisorId,
  });
}

export async function uploadCustomerAvatarDirect(file: File) {
  const uploaded = await uploadDirectToCos(file, {
    scene: "customer_avatar",
    uploadErrorLabel: "上传头像",
    missingStorageMessage: "头像上传成功但未返回图片地址",
  });

  return {
    value: uploaded.storagePath,
    previewUrl: buildAvatarPreviewUrl(uploaded.storagePath),
  };
}

export async function uploadCustomerAvatar(file: File) {
  validateUploadFile(file, {
    allowedTypes: ALLOWED_AVATAR_TYPES,
    maxSizeBytes: MAX_AVATAR_SIZE,
    typeMessage: "头像仅支持 JPG、PNG、WebP、HEIC、HEIF",
    sizeMessage: "头像图片不能超过 2MB",
  });

  return uploadCustomerAvatarDirect(file);
}
