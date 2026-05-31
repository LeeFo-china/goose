"use client";

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { isEmployeeStatus, type EmployeeStatus } from "@gooes/domain";
import { useRouter } from "next/navigation";
import { Loader2, Upload, UserRound, X } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { employeeStatusSelectOptions, EMPTY_SELECT_VALUE, getDepartmentOptionValue, mutateEmployee, uploadEmployeeAvatar, type MutationMode } from "@/components/employees/employee-mutation-shared";
import type {
  EmployeeDepartmentOption,
  EmployeeMutationRecord,
  EmployeePostOption,
} from "@/components/employees/employee-types";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export function EmployeeDialog({
  mode,
  employee,
  departments,
  posts,
  open,
  onOpenChange,
  onSaved,
}: {
  mode: MutationMode;
  employee?: EmployeeMutationRecord;
  departments: EmployeeDepartmentOption[];
  posts: EmployeePostOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
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
    tenantDepartmentId: employee?.tenant_department_id || "",
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
        if (onSaved) {
          onSaved();
        } else {
          refreshAfterDialogClose(router);
        }
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
