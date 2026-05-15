"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  EMPLOYEE_STATUS_VALUES,
  EmployeeStatusConfig,
  isEmployeeStatus,
  type EmployeeStatus,
  RoleStatusConfig,
  type RoleStatus,
} from "@gooes/domain";
import { useRouter } from "next/navigation";
import { Edit3, KeyRound, Loader2, Plus, Trash2, Upload, UserRound, X } from "lucide-react";
import { ConfirmActionDialog } from "@/components/admin/action-dialogs";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export type EmployeeMutationRecord = {
  id: string;
  name: string | null;
  phone: string | null;
  status: EmployeeStatus | string | null;
  department_id: string | null;
  tenant_department_id?: string | null;
  department_name?: string | null;
  department_code?: string | null;
  post_id: string | null;
  avatar: string | null;
};

export type EmployeeDepartmentOption = {
  id: string;
  tenant_department_id?: string | null;
  code: string;
  name: string;
  selected_post_codes?: string[];
};

export type EmployeePostOption = {
  id: string;
  code: string;
  name: string;
  status: number | null;
  sort: number | null;
};

type MutationMode = "create" | "edit";

type RoleOption = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: RoleStatus | string;
};

type EmployeePermissionContext = {
  roles: RoleOption[];
};

const statusOptions: Array<{ label: string; value: EmployeeStatus }> =
  EMPLOYEE_STATUS_VALUES.map((value) => ({
    value,
    label: EmployeeStatusConfig[value].label,
  }));

const employeeStatusSelectOptions = statusOptions.map((item) => ({
  value: item.value,
  label: item.label,
}));

const EMPTY_SELECT_VALUE = "__empty__";
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const DIRECT_COS_UPLOAD_ENABLED = true;

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

function getDepartmentOptionValue(department: EmployeeDepartmentOption) {
  return department.tenant_department_id || "";
}

function buildAvatarPreviewUrl(value: string) {
  return `/api/backend/uploads/public-url?path=${encodeURIComponent(value)}`;
}

async function requestJson(input: {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  payload?: unknown;
  fallbackMessage: string;
}) {
  const response = await fetch(input.path, {
    method: input.method || "GET",
    headers: input.payload ? { "content-type": "application/json" } : undefined,
    body: input.payload ? JSON.stringify(input.payload) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, input.fallbackMessage));
  }

  return payload.data;
}

async function uploadEmployeeAvatarDirect(file: File) {
  const init = await requestJson({
    path: "/api/backend/uploads/cos/direct-init",
    method: "POST",
    payload: {
      scene: "employee_avatar",
      filename: file.name,
      mimetype: file.type,
      size_bytes: file.size,
    },
    fallbackMessage: "初始化头像直传失败",
  });

  const uploadResponse = await fetch(init.upload_url, {
    method: init.method || "PUT",
    headers: init.headers || { "content-type": file.type },
    body: file,
  });
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => "");
    throw new Error(
      `上传头像到 COS 失败(${uploadResponse.status})${
        detail.trim() ? `：${detail.trim().slice(0, 120)}` : ""
      }`,
    );
  }

  const completed = await requestJson({
    path: "/api/backend/uploads/cos/direct-complete",
    method: "POST",
    payload: {
      scene: "employee_avatar",
      filename: file.name,
      mimetype: file.type,
      size_bytes: file.size,
      object_key: init.object_key,
      etag: uploadResponse.headers.get("etag") || undefined,
    },
    fallbackMessage: "登记头像直传结果失败",
  });

  const storageValue = completed.storage_path || completed.object_key || init.storage_path ||
    init.object_key;
  if (typeof storageValue !== "string" || !storageValue) {
    throw new Error("头像上传成功但未返回图片地址");
  }

  return {
    value: storageValue,
    previewUrl: buildAvatarPreviewUrl(storageValue),
  };
}

async function uploadEmployeeAvatarFallback(file: File) {
  const formData = new FormData();
  formData.append("scene", "employee_avatar");
  formData.append("files", file);

  const response = await fetch("/api/backend/uploads/images", {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "上传头像失败"));
  }

  const uploaded = payload.data?.list?.[0] || {};
  const storageValue = uploaded.storage_path || uploaded.object_key || uploaded.path || uploaded.url;
  const previewUrl = uploaded.url || storageValue;
  if (typeof storageValue !== "string" || !storageValue) {
    throw new Error("头像上传成功但未返回图片地址");
  }

  return {
    value: storageValue,
    previewUrl: buildAvatarPreviewUrl(
      typeof previewUrl === "string" ? previewUrl : storageValue,
    ),
  };
}

async function uploadEmployeeAvatar(file: File) {
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    throw new Error("头像仅支持 JPG、PNG、WebP、HEIC、HEIF");
  }

  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error("头像图片不能超过 2MB");
  }

  if (DIRECT_COS_UPLOAD_ENABLED) {
    return uploadEmployeeAvatarDirect(file);
  }

  return uploadEmployeeAvatarFallback(file);
}

async function mutateEmployee(input: {
  method: "POST" | "PATCH" | "DELETE";
  id?: string;
  payload?: unknown;
}) {
  const response = await fetch(
    input.id ? `/api/backend/employees/${input.id}` : "/api/backend/employees",
    {
      method: input.method,
      headers: input.payload ? { "content-type": "application/json" } : undefined,
      body: input.payload ? JSON.stringify(input.payload) : undefined,
    },
  );
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "操作失败"));
  }

  return payload;
}

async function requestBackend<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "操作失败"));
  }

  return payload.data as T;
}

function EmployeeDialog({
  mode,
  employee,
  departments,
  posts,
  open,
  onOpenChange,
}: {
  mode: MutationMode;
  employee?: EmployeeMutationRecord;
  departments: EmployeeDepartmentOption[];
  posts: EmployeePostOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const title = mode === "create" ? "新增员工" : "编辑员工";
  const submitText = mode === "create" ? "创建员工" : "保存修改";

  const defaults = useMemo(() => ({
    name: employee?.name || "",
    phone: employee?.phone || "",
    avatar: employee?.avatar || "",
    status: isEmployeeStatus(employee?.status) ? employee.status : "active",
    tenantDepartmentId: employee?.tenant_department_id ||
      departments.find((department) => department.id === employee?.department_id)
        ?.tenant_department_id ||
      "",
    postId: employee?.post_id || "",
  }), [departments, employee]);
  const [status, setStatus] = useState<EmployeeStatus>(defaults.status);
  const [avatar, setAvatar] = useState(defaults.avatar);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(defaults.avatar);
  const [avatarDirty, setAvatarDirty] = useState(false);
  const [tenantDepartmentId, setTenantDepartmentId] = useState(defaults.tenantDepartmentId);
  const [postId, setPostId] = useState(defaults.postId);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const selectedDepartment = departments.find((item) =>
    getDepartmentOptionValue(item) === tenantDepartmentId
  ) || null;
  const currentPost = posts.find((item) => item.id === postId) || null;
  const availablePosts = useMemo(() => {
    if (!selectedDepartment) {
      return currentPost ? [currentPost] : [];
    }

    const allowedCodes = new Set(selectedDepartment.selected_post_codes || []);
    const scopedPosts = posts.filter((post) => allowedCodes.has(post.code));
    if (currentPost && !scopedPosts.some((post) => post.id === currentPost.id)) {
      return [...scopedPosts, currentPost];
    }

    return scopedPosts;
  }, [currentPost, posts, selectedDepartment]);

  const departmentOptions = useMemo(() => [
    { value: EMPTY_SELECT_VALUE, label: "不分配部门" },
    ...departments
      .map((department) => ({
        value: getDepartmentOptionValue(department),
        label: `${department.name} · ${department.code}`,
      }))
      .filter((option) => option.value),
  ], [departments]);

  const postOptions = useMemo(() => [
    { value: EMPTY_SELECT_VALUE, label: selectedDepartment ? "不分配职位" : "请先选择部门" },
    ...availablePosts.map((post) => ({
      value: post.id,
      label: `${post.name} · ${post.code}${post.status === 0 ? "（已停用）" : ""}`,
    })),
  ], [availablePosts, selectedDepartment]);

  useEffect(() => {
    if (!open) return;
    setStatus(defaults.status);
    setAvatar(defaults.avatar);
    setAvatarPreviewUrl(defaults.avatar);
    setAvatarDirty(false);
    setTenantDepartmentId(defaults.tenantDepartmentId);
    setPostId(defaults.postId);
    setUploadingAvatar(false);
    setAvatarLoadFailed(false);
  }, [defaults.avatar, defaults.postId, defaults.status, defaults.tenantDepartmentId, open]);

  function close() {
    if (pending || uploadingAvatar) return;
    setError("");
    onOpenChange(false);
  }

  function changeDepartment(value: string) {
    const nextTenantDepartmentId = value === EMPTY_SELECT_VALUE ? "" : value;
    setTenantDepartmentId(nextTenantDepartmentId);

    const nextDepartment = departments.find((item) =>
      getDepartmentOptionValue(item) === nextTenantDepartmentId
    );
    if (!nextDepartment) {
      setPostId("");
      return;
    }

    const allowedCodes = new Set(nextDepartment.selected_post_codes || []);
    const nextPost = posts.find((post) => post.id === postId);
    if (!nextPost || !allowedCodes.has(nextPost.code)) {
      setPostId("");
    }
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setUploadingAvatar(true);
    try {
      const uploaded = await uploadEmployeeAvatar(file);
      setAvatar(uploaded.value);
      setAvatarPreviewUrl(uploaded.previewUrl);
      setAvatarLoadFailed(false);
      setAvatarDirty(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传头像失败");
    } finally {
      setUploadingAvatar(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const phone = String(formData.get("phone") || "").trim();
    const status = String(formData.get("status") || "active");

    const payload: {
      name: string;
      phone: string | null;
      avatar?: string | null;
      status: string;
      tenant_department_id: string | null;
      post_id: string | null;
    } = {
      name,
      phone: phone || null,
      status,
      tenant_department_id: tenantDepartmentId || null,
      post_id: postId || null,
    };
    if (mode === "create" || avatarDirty) {
      payload.avatar = avatar || null;
    }

    setError("");
    startTransition(async () => {
      try {
        await mutateEmployee({
          method: mode === "create" ? "POST" : "PATCH",
          id: employee?.id,
          payload,
        });
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "操作失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <UserRound className="size-4" />
            </div>
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                {mode === "create" ? "创建可登录后台或小程序员工身份的完整档案。" : "调整员工档案、组织归属和在职状态。"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${mode}-employee-avatar-file`}>头像</FieldLabel>
              <input type="hidden" name="avatar" value={avatar} />
              <div className="flex gap-3">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
                  {avatarPreviewUrl && !avatarLoadFailed ? (
                    <img
                      src={avatarPreviewUrl}
                      alt={`${defaults.name || "员工"}头像预览`}
                      className="size-full object-cover"
                      onError={() => setAvatarLoadFailed(true)}
                    />
                  ) : (
                    <UserRound className="size-6" />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending || uploadingAvatar}
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      {uploadingAvatar
                        ? <Loader2 className="animate-spin" data-icon="inline-start" />
                        : <Upload data-icon="inline-start" />}
                      上传头像
                    </Button>
                    {avatar ? (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={pending || uploadingAvatar}
                        onClick={() => {
                          setAvatar("");
                          setAvatarPreviewUrl("");
                          setAvatarLoadFailed(false);
                          setAvatarDirty(true);
                        }}
                      >
                        <X data-icon="inline-start" />
                        清除
                      </Button>
                    ) : null}
                  </div>
                  <Input
                    id={`${mode}-employee-avatar-file`}
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    className="sr-only"
                    disabled={pending || uploadingAvatar}
                    onChange={handleAvatarChange}
                  />
                  <p className="text-xs text-muted-foreground">
                    {avatar
                      ? avatarLoadFailed
                        ? "头像图片加载失败，请重新上传"
                        : "已上传头像"
                      : "支持 JPG、PNG、WebP、HEIC，单张不超过 2MB"}
                  </p>
                </div>
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-employee-name`}>姓名</FieldLabel>
              <Input
                id={`${mode}-employee-name`}
                name="name"
                defaultValue={defaults.name}
                minLength={2}
                maxLength={50}
                required
                placeholder="请输入员工姓名"
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-employee-phone`}>手机号</FieldLabel>
              <Input
                id={`${mode}-employee-phone`}
                name="phone"
                defaultValue={defaults.phone}
                inputMode="tel"
                maxLength={11}
                required
                placeholder="请输入 11 位手机号"
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-employee-status`}>状态</FieldLabel>
              <input type="hidden" name="status" value={status} />
              <FormSelect
                id={`${mode}-employee-status`}
                disabled={pending}
                value={status}
                options={employeeStatusSelectOptions}
                onChange={(value) => setStatus(value as EmployeeStatus)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-employee-department`}>部门</FieldLabel>
              <FormSelect
                id={`${mode}-employee-department`}
                disabled={pending}
                value={tenantDepartmentId || EMPTY_SELECT_VALUE}
                options={departmentOptions}
                onChange={changeDepartment}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-employee-post`}>职位</FieldLabel>
              <FormSelect
                id={`${mode}-employee-post`}
                disabled={pending || (!selectedDepartment && !currentPost)}
                value={postId || EMPTY_SELECT_VALUE}
                options={postOptions}
                onChange={(value) => setPostId(value === EMPTY_SELECT_VALUE ? "" : value)}
              />
            </Field>
          </FieldGroup>
          {error ? (
            <StatusAlert>{error}</StatusAlert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={pending || uploadingAvatar}>
              取消
            </Button>
            <Button type="submit" disabled={pending || uploadingAvatar}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {submitText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManageEmployeeRolesButton({
  employee,
}: {
  employee: EmployeeMutationRecord;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      requestBackend<{ list: RoleOption[] }>("/api/backend/roles?page=1&pageSize=100&status=active"),
      requestBackend<EmployeePermissionContext>(`/api/backend/employees/${employee.id}/permissions`),
    ])
      .then(([roleData, context]) => {
        if (cancelled) return;
        const currentRoleIds = new Set((context.roles || []).map((item) => item.id));
        const currentInactiveRoles = (context.roles || []).filter(
          (item) => item.status !== "active",
        );
        const mergedRoles = [
          ...(roleData.list || []),
          ...currentInactiveRoles.filter(
            (item) => !(roleData.list || []).some((role) => role.id === item.id),
          ),
        ];
        setRoles(mergedRoles);
        setSelectedRoleIds([...currentRoleIds]);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "角色数据加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [employee.id, open]);

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function onOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
  }

  function toggleRole(roleId: string, checked: boolean) {
    setSelectedRoleIds((current) => {
      if (checked) return Array.from(new Set([...current, roleId]));
      return current.filter((id) => id !== roleId);
    });
  }

  function save() {
    setError("");
    startTransition(async () => {
      try {
        await requestBackend(`/api/backend/employees/${employee.id}/roles`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role_ids: selectedRoleIds }),
        });
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存员工角色失败");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <KeyRound />
        角色
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : close())}>
        <DialogContent className="flex h-[82vh] max-w-[620px] flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <KeyRound className="size-4" />
              </div>
              <div>
                <DialogTitle>配置员工角色</DialogTitle>
                <DialogDescription>
                  {employee.name || "未命名员工"} · 已选择 {selectedRoleIds.length} 个角色
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {loading ? (
              <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                正在加载角色
              </div>
            ) : (
              <div className="divide-y rounded-md border">
                {roles.length > 0 ? roles.map((role) => {
                  const checked = selectedRoleIds.includes(role.id);
                  const statusMeta = role.status === "active"
                    ? { label: RoleStatusConfig.active.label, variant: "success" as const }
                    : { label: RoleStatusConfig.inactive.label, variant: "secondary" as const };

                  return (
                    <label
                      key={role.id}
                      className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={pending}
                        className="mt-1"
                        onCheckedChange={(value) => toggleRole(role.id, value === true)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{role.name}</span>
                          <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                        </span>
                        <span className="mt-1 block break-all text-xs text-muted-foreground">
                          {role.code}
                        </span>
                        {role.description ? (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {role.description}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                }) : (
                  <div className="p-6 text-sm text-muted-foreground">
                    还没有可分配的角色，请先到角色管理页面创建角色。
                  </div>
                )}
              </div>
            )}
          </div>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              取消
            </Button>
            <Button type="button" onClick={save} disabled={loading || pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              保存角色
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CreateEmployeeButton({
  departments,
  posts,
}: {
  departments: EmployeeDepartmentOption[];
  posts: EmployeePostOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus />
        新增员工
      </Button>
      <EmployeeDialog
        mode="create"
        departments={departments}
        posts={posts}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function EmployeeRowActions({
  employee,
  departments,
  posts,
}: {
  employee: EmployeeMutationRecord;
  departments: EmployeeDepartmentOption[];
  posts: EmployeePostOption[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, startDeleting] = useTransition();
  const [error, setError] = useState("");

  function remove() {
    setError("");
    startDeleting(async () => {
      try {
        await mutateEmployee({
          method: "DELETE",
          id: employee.id,
        });
        setDeleteOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "删除失败");
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <ManageEmployeeRolesButton employee={employee} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setEditOpen(true)}
      >
        <Edit3 />
        编辑
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setDeleteOpen(true)}
        disabled={deleting || employee.status === "leaved"}
        title={employee.status === "leaved" ? "员工已离职" : "删除员工"}
      >
        {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
        删除
      </Button>
      <EmployeeDialog
        mode="edit"
        employee={employee}
        departments={departments}
        posts={posts}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <ConfirmActionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="删除员工"
        description={`确认删除员工「${employee.name || "未命名员工"}」？该操作会将员工置为已离职并解绑登录账号。`}
        confirmLabel="确认删除"
        destructive
        pending={deleting}
        onConfirm={remove}
      />
      {error ? (
        <div className="absolute right-5 mt-10 rounded-md border border-destructive/50 bg-background px-3 py-2 text-xs text-destructive shadow-sm">
          {error}
        </div>
      ) : null}
    </div>
  );
}
