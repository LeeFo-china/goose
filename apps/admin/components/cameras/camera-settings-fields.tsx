"use client";

import { Controller, type UseFormReturn } from "react-hook-form";
import { FormSelect } from "@/components/admin/form-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { boolOptions, capabilityOptions, playProtocolOptions, type CameraFormValues } from "@/components/cameras/camera-mutation-shared";

export function CameraSettingsFields({
  form,
  pending,
  selectedCapabilities,
  toggleCapability,
}: {
  form: UseFormReturn<CameraFormValues>;
  pending: boolean;
  selectedCapabilities: CameraFormValues["capabilities"];
  toggleCapability: (capability: CameraFormValues["capabilities"][number]) => void;
}) {
  return (
    <>
      <Controller
        name="name"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="camera-name">摄像头名称</FieldLabel>
            <Input
              {...field}
              id="camera-name"
              disabled={pending}
              aria-invalid={fieldState.invalid}
              placeholder="例如：客厅施工位"
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        name="position"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="camera-position">安装位置</FieldLabel>
            <Input
              {...field}
              id="camera-position"
              disabled={pending}
              aria-invalid={fieldState.invalid}
              placeholder="例如：客厅 / 阳台"
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        name="can_view"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="camera-can-view">客户可查看</FieldLabel>
            <FormSelect
              id="camera-can-view"
              value={field.value}
              disabled={pending}
              invalid={fieldState.invalid}
              options={boolOptions.map(([value, label]) => ({ value, label }))}
              onChange={field.onChange}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        name="can_control"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="camera-can-control">允许控制</FieldLabel>
            <FormSelect
              id="camera-can-control"
              value={field.value}
              disabled={pending}
              invalid={fieldState.invalid}
              options={boolOptions.map(([value, label]) => ({ value, label }))}
              onChange={field.onChange}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Field className="md:col-span-2">
        <FieldLabel>摄像头能力</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {capabilityOptions.map(([value, label]) => (
            <label
              key={value}
              className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm"
            >
              <Checkbox
                checked={selectedCapabilities.includes(value)}
                disabled={pending}
                onCheckedChange={() => toggleCapability(value)}
              />
              {label}
            </label>
          ))}
        </div>
        <FieldError errors={[form.formState.errors.capabilities]} />
      </Field>
      <Controller
        name="video_encrypted"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="camera-video-encrypted">视频加密</FieldLabel>
            <FormSelect
              id="camera-video-encrypted"
              value={field.value}
              disabled={pending}
              invalid={fieldState.invalid}
              options={boolOptions.map(([value, label]) => ({ value, label }))}
              onChange={field.onChange}
            />
            <FieldDescription>开启加密时，客户播放会被后端拒绝。</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        name="play_protocol"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="camera-play-protocol">播放协议</FieldLabel>
            <FormSelect
              id="camera-play-protocol"
              value={field.value}
              disabled={pending}
              invalid={fieldState.invalid}
              options={playProtocolOptions.map(([value, label]) => ({ value, label }))}
              onChange={field.onChange}
            />
            <FieldDescription>腾讯云建议 FLV；萤石当前仍使用 EZPlayer 参数。</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        name="sort_order"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="camera-sort-order">排序</FieldLabel>
            <Input
              {...field}
              id="camera-sort-order"
              type="number"
              min="0"
              max="999999"
              step="1"
              disabled={pending}
              aria-invalid={fieldState.invalid}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        name="cover_url"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="camera-cover-url">封面地址</FieldLabel>
            <Input
              {...field}
              id="camera-cover-url"
              disabled={pending}
              aria-invalid={fieldState.invalid}
              placeholder="可选，https://..."
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        name="remark"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="camera-remark">备注</FieldLabel>
            <Textarea
              {...field}
              id="camera-remark"
              disabled={pending}
              aria-invalid={fieldState.invalid}
              placeholder="内部备注，客户侧不展示"
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    </>
  );
}
