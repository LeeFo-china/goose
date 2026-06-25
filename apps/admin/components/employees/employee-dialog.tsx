"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { isEmployeeStatus, type EmployeeStatus } from "@gooes/domain";
import { useRouter } from "next/navigation";
import { Loader2, UserRound } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EmployeeAvatarField,
  EmployeeBaseFields,
  EmployeeDialogFields,
  EmployeeOrgFields,
  EmployeeRoleFields,
} from "@/components/employees/employee-dialog-fields";
import {
  EMPTY_SELECT_VALUE,
  getDepartmentOptionValue,
  mutateEmployee,
  uploadEmployeeAvatar,
  type MutationMode,
  type RoleOption,
} from "@/components/employees/employee-mutation-shared";
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
  roles = [],
  open,
  onOpenChange,
  onSaved,
}: {
  mode: MutationMode;
  employee?: EmployeeMutationRecord;
  departments: EmployeeDepartmentOption[];
  posts: EmployeePostOption[];
  roles?: RoleOption[];
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
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
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
    setSelectedRoleIds(mode === "create" ? [] : (employee?.roles || []).map((role) => role.id));
    setUploadingAvatar(false);
    setAvatarLoadFailed(false);
  }, [defaults.avatar, defaults.postId, defaults.status, defaults.tenantDepartmentId, employee?.roles, mode, open]);

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

  function toggleRole(roleId: string, checked: boolean) {
    setSelectedRoleIds((current) => {
      if (checked) return Array.from(new Set([...current, roleId]));
      return current.filter((id) => id !== roleId);
    });
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
      role_ids?: string[];
    } = {
      name,
      phone: phone || null,
      status,
      tenant_department_id: tenantDepartmentId || null,
      post_id: postId || null,
    };
    if (mode === "create") {
      payload.role_ids = selectedRoleIds;
    }
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
      <DialogContent className="flex max-h-[86vh] max-w-[620px] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
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
        <form className="flex min-h-0 flex-col gap-4" onSubmit={submit}>
          <EmployeeDialogFields className="min-h-0 overflow-y-auto pr-1">
            <EmployeeAvatarField
              mode={mode}
              name={defaults.name}
              avatar={avatar}
              avatarPreviewUrl={avatarPreviewUrl}
              avatarLoadFailed={avatarLoadFailed}
              pending={pending}
              uploadingAvatar={uploadingAvatar}
              avatarInputRef={avatarInputRef}
              handleAvatarChange={handleAvatarChange}
              clearAvatar={() => {
                setAvatar("");
                setAvatarPreviewUrl("");
                setAvatarLoadFailed(false);
                setAvatarDirty(true);
              }}
              markAvatarLoadFailed={() => setAvatarLoadFailed(true)}
            />
            <EmployeeBaseFields
              mode={mode}
              name={defaults.name}
              phone={defaults.phone}
              status={status}
              pending={pending}
              setStatus={setStatus}
            />
            <EmployeeOrgFields
              mode={mode}
              pending={pending}
              tenantDepartmentId={tenantDepartmentId}
              postId={postId}
              departmentOptions={departmentOptions}
              postOptions={postOptions}
              hasSelectablePost={Boolean(selectedDepartment || currentPost)}
              changeDepartment={changeDepartment}
              setPostId={setPostId}
            />
            {mode === "create" ? (
              <EmployeeRoleFields
                mode={mode}
                roles={roles}
                selectedRoleIds={selectedRoleIds}
                pending={pending}
                toggleRole={toggleRole}
              />
            ) : null}
          </EmployeeDialogFields>
          {error ? (
            <StatusAlert>{error}</StatusAlert>
          ) : null}
          <DialogFooter className="shrink-0">
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
