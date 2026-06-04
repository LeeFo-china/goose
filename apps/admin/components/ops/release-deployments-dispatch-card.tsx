"use client";

import Link from "next/link";
import { Loader2, Rocket, ShieldCheck } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ReleaseEnvironment, ReleaseRefType } from "@/components/ops/ops-types";
import { ReleaseRefCombobox, ReleaseServiceMultiSelect, getTodayTagPlaceholder } from "@/components/ops/release-deployments-controls";
import { REF_TYPE_OPTIONS } from "@/components/ops/release-deployments-shared";

export function ReleaseDispatchCard({ state, actions }: { state: any; actions: any }) {
  const { error, options, latestDispatch, production, productionVersionMode, pending, disabled, creatingProductionTag, currentEnvironment, selectedServiceLabel, confirmRefLabel, environment, serviceOptions, selectedServices, ref, tagName, tagSourceRefType, tagSourceRef, tagMessage, refType, reason, confirmText } = state;
  const { onEnvironmentChange, setDraft, onRefTypeChange, runDispatch } = actions;
  return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket data-icon="inline-start" />
              发起发布
            </CardTitle>
            <CardDescription>
              后台只提交 GitHub Actions，构建、部署和日志仍由 CI/CD 执行。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
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

                    <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
                      <Field>
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
                      <Field>
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
        </CardContent>
      </Card>
  );
}
