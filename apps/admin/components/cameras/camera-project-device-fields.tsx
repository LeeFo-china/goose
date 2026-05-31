"use client";

import { Controller, type UseFormReturn } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { CameraDeviceChannel, CameraProjectOption } from "@/components/cameras/camera-types";
import { cn } from "@/lib/utils";
import { buildDeviceKey, canBindCameraToProject, formatDeviceLabel, getProjectOptionDescription, getProjectOptionLabel, type CameraFormValues, vendorOptions } from "@/components/cameras/camera-mutation-shared";

export function CameraProjectDeviceFields({
  form,
  pending,
  activeProjectId,
  projectKeyword,
  projectOptions,
  selectedProjectId,
  selectedProject,
  projectLoading,
  projectSelectError,
  deviceLoading,
  availableDevices,
  firstDeviceKeyByVendor,
  setProjectKeyword,
  setSelectedProjectId,
  setSelectedProject,
}: {
  form: UseFormReturn<CameraFormValues>;
  pending: boolean;
  activeProjectId: string;
  projectKeyword: string;
  projectOptions: CameraProjectOption[];
  selectedProjectId: string;
  selectedProject: CameraProjectOption | null;
  projectLoading: boolean;
  projectSelectError: string;
  deviceLoading: boolean;
  availableDevices: CameraDeviceChannel[];
  firstDeviceKeyByVendor: Record<CameraFormValues["vendor"], string>;
  setProjectKeyword: (value: string) => void;
  setSelectedProjectId: (value: string) => void;
  setSelectedProject: (value: CameraProjectOption | null) => void;
}) {
  return (
    <>
      <Field className="md:col-span-2" data-invalid={Boolean(projectSelectError)}>
        <FieldLabel htmlFor="camera-project-search">房产 / 项目</FieldLabel>
        <Input
          id="camera-project-search"
          value={projectKeyword}
          disabled={pending}
          aria-invalid={Boolean(projectSelectError)}
          placeholder="搜索客户、手机号、小区、房号或项目名"
          onChange={(event) => {
            setProjectKeyword(event.target.value);
            setSelectedProjectId("");
            setSelectedProject(null);
          }}
        />
        <div className="rounded-md border bg-background">
          <div className="max-h-48 overflow-y-auto p-1">
            {projectOptions.map((project) => {
              const selected = project.id === selectedProjectId;
              const description = getProjectOptionDescription(project);
              const disabled = pending || !canBindCameraToProject(project);
              return (
                <Button
                  key={project.id}
                  type="button"
                  variant="ghost"
                  disabled={disabled}
                  className={cn(
                    "h-auto w-full flex-col items-start gap-1 rounded-sm px-3 py-2 text-left font-normal",
                    selected && "bg-accent text-accent-foreground",
                  )}
                  onClick={() => {
                    setSelectedProjectId(project.id);
                    setSelectedProject(project);
                    setProjectKeyword(getProjectOptionLabel(project));
                  }}
                >
                  <span className="font-medium">{getProjectOptionLabel(project)}</span>
                  {description ? (
                    <span className="text-xs text-muted-foreground">{description}</span>
                  ) : null}
                </Button>
              );
            })}
            {!projectLoading && projectOptions.length === 0 ? (
              <div className="px-3 py-5 text-center text-sm text-muted-foreground">
                {projectKeyword.trim() ? "暂无匹配房产项目" : "请输入关键词搜索房产项目"}
              </div>
            ) : null}
            {projectLoading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-5 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在加载
              </div>
            ) : null}
          </div>
        </div>
        <FieldDescription>
          {selectedProject
            ? `当前绑定到：${getProjectOptionLabel(selectedProject)}`
            : "请先选择要绑定的房产项目，再选择设备厂商和通道。"}
        </FieldDescription>
        {projectSelectError ? <StatusAlert>{projectSelectError}</StatusAlert> : null}
      </Field>
      <Controller
        name="vendor"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="camera-vendor">设备厂商</FieldLabel>
            <FormSelect
              id="camera-vendor"
              value={field.value}
              disabled={pending || !activeProjectId}
              invalid={fieldState.invalid}
              options={vendorOptions.map(([value, label]) => ({ value, label }))}
              onChange={(value) => {
                const nextVendor = value as CameraFormValues["vendor"];
                field.onChange(nextVendor);
                form.setValue("device_key", firstDeviceKeyByVendor[nextVendor], {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        name="device_key"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="camera-device">设备通道</FieldLabel>
            <FormSelect
              id="camera-device"
              value={field.value}
              disabled={pending || !activeProjectId || deviceLoading || availableDevices.length === 0}
              invalid={fieldState.invalid}
              placeholder={
                !activeProjectId
                  ? "请先选择房产项目"
                  : deviceLoading
                    ? "设备通道加载中"
                    : availableDevices.length
                      ? "请选择设备通道"
                      : "暂无未绑定设备"
              }
              options={availableDevices.map((device) => ({
                value: buildDeviceKey(device),
                label: formatDeviceLabel(device),
              }))}
              onChange={field.onChange}
            />
            <FieldDescription>
              {deviceLoading
                ? "正在加载当前租户未绑定设备资产。"
                : activeProjectId
                  ? "只展示当前租户资产池中未绑定到项目的设备通道。"
                  : "选择房产项目后才会加载可绑定设备资产。"}
            </FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    </>
  );
}
