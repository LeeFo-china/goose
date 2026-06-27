"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Database, Loader2, Rocket, ShieldCheck } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ReleaseEnvironment, ReleaseMigrationMode, ReleaseOptionsData, ReleaseRefType } from "@/components/ops/ops-types";
import { ReleaseRefCombobox, ReleaseServiceMultiSelect, getTodayTagPlaceholder } from "@/components/ops/release-deployments-controls";
import { dispatchProductionMigration, REF_TYPE_OPTIONS } from "@/components/ops/release-deployments-shared";

export function ReleaseDispatchCard({ state, actions }: { state: any; actions: any }) {
  const { error, options, latestDispatch, production, productionVersionMode, pending, disabled, creatingProductionTag, currentEnvironment, selectedServiceLabel, confirmRefLabel, environment, serviceOptions, selectedServices, ref, tagName, tagSourceRefType, tagSourceRef, tagMessage, refType, reason, confirmText } = state;
  const { onEnvironmentChange, setDraft, onRefTypeChange, runDispatch } = actions;
  return (
        <section className="space-y-4">
          <div className="border-b pb-3">
            <h2 className="flex items-center gap-2 text-base font-semibold tracking-normal">
              <Rocket data-icon="inline-start" />
              发起发布
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              后台只提交 GitHub Actions，构建、部署和日志仍由 CI/CD 执行。
            </p>
          </div>
          <div className="flex flex-col gap-4">
            {error ? <StatusAlert>{error}</StatusAlert> : null}
            {!options?.configured ? (
              <Alert variant="destructive">
                <ShieldCheck data-icon="inline-start" />
                <AlertTitle>发布令牌未配置</AlertTitle>
                <AlertDescription>后端需要配置 GITHUB_RELEASE_TOKEN 后才能从后台发起发布。</AlertDescription>
              </Alert>
            ) : null}
            {latestDispatch?.run?.html_url ? (
              <Alert>
                <Rocket data-icon="inline-start" />
                <AlertTitle>发布任务已创建</AlertTitle>
                <AlertDescription>
                  {latestDispatch.service_label} · {latestDispatch.ref}
                  <Button asChild variant="link" className="ml-2 h-auto p-0">
                    <Link href={latestDispatch.run.html_url} target="_blank" rel="noreferrer">
                      查看本次发布
                    </Link>
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {production ? (
              <Alert>
                <ShieldCheck data-icon="inline-start" />
                <AlertTitle>生产发布规则</AlertTitle>
                <AlertDescription>
                  生产只允许发布 Tag；可以选择已有 Tag，也可以在本表单中创建新 Tag 后自动发起发布。
                </AlertDescription>
              </Alert>
            ) : null}

          <FieldGroup>
            <Field>
              <FieldLabel>环境</FieldLabel>
              <Select value={environment} onValueChange={(value) => onEnvironmentChange(value as ReleaseEnvironment)}>
                <SelectTrigger>
                  <SelectValue placeholder="选择环境" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {options?.environments.map((item: any) => (
                      <SelectItem key={item.environment} value={item.environment}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>{currentEnvironment?.workflow_id || "-"}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>服务</FieldLabel>
              <ReleaseServiceMultiSelect
                options={serviceOptions}
                value={selectedServices}
                disabled={!options?.configured}
                onChange={(value) => {
                  const nextService = value.includes("all")
                    ? "all"
                    : value[0] || serviceOptions.find((item: any) => item.value !== "all")?.value || serviceOptions[0]?.value || "admin";
                  setDraft({ service: nextService, services: value });
                }}
              />
              <FieldDescription>
                {production ? "生产支持选择全部服务，也支持一次选择多个服务。" : "开发环境按需选择要验证的服务。"}
              </FieldDescription>
            </Field>

            {production ? (
              <>
                <Field>
                  <FieldLabel>生产版本</FieldLabel>
                  <Select
                    value={productionVersionMode}
                    onValueChange={(value) => {
                      const nextMode = value as "existing_tag" | "new_tag";
                      setDraft({
                        productionVersionMode: nextMode,
                        refType: "tag",
                        ref: nextMode === "new_tag" ? "" : ref,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择生产版本方式" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="existing_tag">选择已有 Tag</SelectItem>
                        <SelectItem value="new_tag">创建新 Tag 并发布</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {productionVersionMode === "new_tag"
                      ? "提交时会先创建 Tag，再用这个 Tag 发起生产发布。"
                      : "适合发布已经创建并确认过的生产 Tag。"}
                  </FieldDescription>
                </Field>

                {productionVersionMode === "existing_tag" ? (
                  <Field>
                    <FieldLabel>发布 Tag</FieldLabel>
                    <ReleaseRefCombobox
                      type="tag"
                      value={ref}
                      defaultRef={currentEnvironment?.default_ref || "main"}
                      disabled={!options?.configured}
                      onChange={(value) => setDraft({ ref: value, refType: "tag" })}
                    />
                    <FieldDescription>生产环境只允许选择 Tag 发布。</FieldDescription>
                  </Field>
                ) : (
                  <>
                    <Field>
                      <FieldLabel htmlFor="release-tag-name">Tag 名称</FieldLabel>
                      <Input
                        id="release-tag-name"
                        value={tagName}
                        onChange={(event) => setDraft({ tagName: event.target.value })}
                        placeholder={getTodayTagPlaceholder()}
                      />
                      <FieldDescription>格式固定为 vYYYY.MM.DD.N，例如 {getTodayTagPlaceholder()}。</FieldDescription>
                    </Field>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Field className="sm:w-[140px]">
                        <FieldLabel>来源类型</FieldLabel>
                        <Select
                          value={tagSourceRefType}
                          onValueChange={(value) => {
                            const nextType = value as ReleaseRefType;
                            setDraft({
                              tagSourceRefType: nextType,
                              tagSourceRef: nextType === "branch" ? currentEnvironment?.default_ref || "main" : "",
                            });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择类型" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {REF_TYPE_OPTIONS.map((item: any) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                              <SelectItem value="commit">Commit</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field className="min-w-0 flex-1">
                        <FieldLabel>来源版本</FieldLabel>
                        <ReleaseRefCombobox
                          type={tagSourceRefType}
                          value={tagSourceRef}
                          defaultRef={currentEnvironment?.default_ref || "main"}
                          disabled={!options?.configured}
                          onChange={(value) => setDraft({ tagSourceRef: value })}
                        />
                        <FieldDescription>
                          建议选择已验收通过的 Commit；也可以选择分支或已有 Tag 作为来源。
                        </FieldDescription>
                      </Field>
                    </div>

                    <Field>
                      <FieldLabel htmlFor="release-tag-message">Tag 说明</FieldLabel>
                      <Textarea
                        id="release-tag-message"
                        value={tagMessage}
                        onChange={(event) => setDraft({ tagMessage: event.target.value })}
                        rows={3}
                        placeholder="说明这个生产版本包含的内容"
                      />
                    </Field>
                  </>
                )}
              </>
            ) : (
              <>
                <Field>
                  <FieldLabel>版本来源</FieldLabel>
                  <Select value={refType} onValueChange={(value) => onRefTypeChange(value as ReleaseRefType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择版本来源" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {REF_TYPE_OPTIONS.map((item: any) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {REF_TYPE_OPTIONS.find((item) => item.value === refType)?.description}
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel>发布版本</FieldLabel>
                  <ReleaseRefCombobox
                    type={refType}
                    value={ref}
                    defaultRef={currentEnvironment?.default_ref || "main"}
                    disabled={!options?.configured}
                    onChange={(value) => setDraft({ ref: value })}
                  />
                  <FieldDescription>开发环境默认使用 main，也可以选择 Tag。</FieldDescription>
                </Field>
              </>
            )}

            <Field>
              <FieldLabel htmlFor="release-reason">发布说明</FieldLabel>
              <Textarea
                id="release-reason"
                value={reason}
                onChange={(event) => setDraft({ reason: event.target.value })}
                rows={3}
                placeholder="说明本次发布内容或关联事项"
              />
            </Field>

            {production ? (
              <Field>
                <FieldLabel htmlFor="release-confirm">生产确认</FieldLabel>
                <Input
                  id="release-confirm"
                  value={confirmText}
                  onChange={(event) => setDraft({ confirmText: event.target.value })}
                  placeholder="输入：确认发布生产"
                />
                <FieldDescription>生产发布会触发构建并重建对应生产容器。</FieldDescription>
              </Field>
            ) : null}
          </FieldGroup>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" disabled={disabled}>
                {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Rocket data-icon="inline-start" />}
                {creatingProductionTag ? "创建 Tag 并提交发布" : "提交发布"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{production ? "确认发布生产版本" : "确认发布开发环境"}</AlertDialogTitle>
                <AlertDialogDescription>
                  将提交 {currentEnvironment?.label || "-"} 的 {selectedServiceLabel || "-"} 发布任务，版本为 {confirmRefLabel}。
                  {creatingProductionTag ? " 系统会先创建这个 Tag，再发起生产发布。" : ""}
                  任务提交后请在 GitHub Actions 或发布记录中查看执行状态。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={runDispatch}>确认提交</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </section>
  );
}

export function ProductionMigrationCard({
  options,
  onSubmitted,
}: {
  options: ReleaseOptionsData | null;
  onSubmitted: () => void;
}) {
  const migrationOptions = options?.production_migration;
  const defaultRef = migrationOptions?.default_ref || "main";
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<ReleaseMigrationMode>("plan");
  const [refType, setRefType] = useState<Exclude<ReleaseRefType, "commit">>("branch");
  const [ref, setRef] = useState(defaultRef);
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");

  const disabled = pending
    || !options?.configured
    || !migrationOptions
    || !ref.trim()
    || (mode === "apply" && confirmText !== "确认迁移生产数据库");
  const modeLabel = mode === "apply" ? "执行" : "预检查";

  function runMigrationDispatch() {
    startTransition(async () => {
      try {
        const data = await dispatchProductionMigration({
          mode,
          ref_type: refType,
          ref,
          reason,
          confirm_text: mode === "apply" ? confirmText : undefined,
        });
        toast.success(data.message || "生产数据库迁移任务已提交");
        setConfirmText("");
        onSubmitted();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "生产数据库迁移任务提交失败");
      }
    });
  }

  return (
    <section className="space-y-4">
      <div className="border-b pb-3">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-normal">
          <Database data-icon="inline-start" />
          生产数据库迁移
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          只提交 migration GitHub Actions；默认先预检查 pending migrations。
        </p>
      </div>
      <div className="flex flex-col gap-4">
        {!options?.configured ? (
          <Alert variant="destructive">
            <ShieldCheck data-icon="inline-start" />
            <AlertTitle>发布令牌未配置</AlertTitle>
            <AlertDescription>后端需要配置 GITHUB_RELEASE_TOKEN 后才能发起数据库迁移。</AlertDescription>
          </Alert>
        ) : null}
        <Alert>
          <ShieldCheck data-icon="inline-start" />
          <AlertTitle>生产迁移规则</AlertTitle>
          <AlertDescription>
            apply 会先备份生产 public 与 supabase_migrations schema，再按未执行版本顺序应用 SQL。
          </AlertDescription>
        </Alert>

        <FieldGroup>
          <Field>
            <FieldLabel>Workflow</FieldLabel>
            <Input value={migrationOptions?.workflow_id || "-"} disabled />
          </Field>

          <Field>
            <FieldLabel>模式</FieldLabel>
            <Select
              value={mode}
              onValueChange={(value) => {
                setMode(value as ReleaseMigrationMode);
                setConfirmText("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择模式" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="plan">plan - 只预检查</SelectItem>
                  <SelectItem value="apply">apply - 执行迁移</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              plan 只展示待执行版本；apply 会修改生产数据库。
            </FieldDescription>
          </Field>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Field className="sm:w-[140px]">
              <FieldLabel>来源类型</FieldLabel>
              <Select
                value={refType}
                onValueChange={(value) => {
                  const nextType = value as Exclude<ReleaseRefType, "commit">;
                  setRefType(nextType);
                  setRef(nextType === "branch" ? defaultRef : "");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {REF_TYPE_OPTIONS.filter((item) => item.value !== "commit").map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field className="min-w-0 flex-1">
              <FieldLabel>迁移版本</FieldLabel>
              <ReleaseRefCombobox
                type={refType}
                value={ref}
                defaultRef={defaultRef}
                disabled={!options?.configured}
                onChange={(value) => setRef(value)}
              />
              <FieldDescription>建议先对同一版本执行 plan，确认 pending 列表后再 apply。</FieldDescription>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="production-migration-reason">迁移说明</FieldLabel>
            <Textarea
              id="production-migration-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              placeholder="说明本次生产数据库迁移原因"
            />
          </Field>

          {mode === "apply" ? (
            <Field>
              <FieldLabel htmlFor="production-migration-confirm">生产迁移确认</FieldLabel>
              <Input
                id="production-migration-confirm"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder="输入：确认迁移生产数据库"
              />
              <FieldDescription>执行前会创建备份，但仍需确认 SQL 已完成评审。</FieldDescription>
            </Field>
          ) : null}
        </FieldGroup>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant={mode === "apply" ? "destructive" : "outline"} disabled={disabled}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Database data-icon="inline-start" />}
              {modeLabel}生产数据库迁移
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认{modeLabel}生产数据库迁移</AlertDialogTitle>
              <AlertDialogDescription>
                将提交 {migrationOptions?.label || "生产数据库迁移"} 任务，模式为 {mode}，版本为 {ref}。
                {mode === "apply" ? " 该操作会修改生产数据库。" : " 该操作只生成待迁移清单。"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={runMigrationDispatch}>
                确认提交
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
