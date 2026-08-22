"use client";

import { CheckCircle2, Loader2, Rocket, Send, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  AuditChecklist,
  TenantDouyinWorkspaceAction,
} from "./workspace-actions";
import type { TenantDouyinWorkspace } from "./workspace-types";

type Release = NonNullable<TenantDouyinWorkspace["latest_release"]>;
type ReleaseMutation = (
  action: Exclude<
    TenantDouyinWorkspaceAction,
    "authorize" | "create_test_version"
  >,
  path: string,
  body: string,
  successMessage: string,
) => Promise<void>;

export function WorkspaceReleaseDialogs({
  auditNote,
  auditOpen,
  auditReady,
  canPublish,
  canSubmitAudit,
  checklist,
  hostNames,
  hostNamesInput,
  mutateRelease,
  onAuditNoteChange,
  onAuditOpenChange,
  onHostNamesInputChange,
  onPublishOpenChange,
  pending,
  publishOpen,
  release,
  releaseBasePath,
}: {
  auditNote: string;
  auditOpen: boolean;
  auditReady: boolean;
  canPublish: boolean;
  canSubmitAudit: boolean;
  checklist: AuditChecklist;
  hostNames: string[];
  hostNamesInput: string;
  mutateRelease: ReleaseMutation;
  onAuditNoteChange(value: string): void;
  onAuditOpenChange(value: boolean): void;
  onHostNamesInputChange(value: string): void;
  onPublishOpenChange(value: boolean): void;
  pending: TenantDouyinWorkspaceAction | null;
  publishOpen: boolean;
  release: Release | null;
  releaseBasePath: string;
}) {
  return (
    <>
      <Dialog open={auditOpen} onOpenChange={onAuditOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>提交抖音小程序审核</DialogTitle>
            <DialogDescription>
              填写审核宿主名称和版本说明，提交后可在工作台同步审核结果。
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="douyin-audit-host-names">宿主名称</FieldLabel>
              <Input
                aria-invalid={hostNamesInput.length > 0 && hostNames.length === 0}
                id="douyin-audit-host-names"
                onChange={(event) => onHostNamesInputChange(event.target.value)}
                placeholder="douyin，可使用逗号或换行分隔"
                value={hostNamesInput}
              />
              <FieldDescription>
                最多 20 个，仅支持字母、数字、点和连字符。
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="douyin-audit-note">审核说明</FieldLabel>
              <Textarea
                id="douyin-audit-note"
                maxLength={1000}
                onChange={(event) => onAuditNoteChange(event.target.value)}
                placeholder="说明本版本的品牌、案例、工地和咨询能力"
                value={auditNote}
              />
              <FieldDescription>
                {auditNote.trim().length}/1000 字符
              </FieldDescription>
            </Field>
          </FieldGroup>

          <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
            <p className="text-sm font-semibold">提交前检查</p>
            <ChecklistItem
              complete={checklist.authorizationActive}
              label="租户小程序授权有效"
            />
            <ChecklistItem
              complete={checklist.profilePublished}
              label="公开资料已发布"
            />
            <ChecklistItem
              complete={checklist.testQrReady}
              label="体验二维码已生成"
            />
            <ChecklistItem
              complete={checklist.readinessReady}
              label="提审就绪检查无阻断"
            />
            <ChecklistItem
              complete={checklist.auditFieldsComplete}
              label="审核信息填写完整"
            />
          </div>

          <DialogFooter>
            <Button
              onClick={() => onAuditOpenChange(false)}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button
              disabled={!canSubmitAudit || !auditReady || pending !== null}
              onClick={() => mutateRelease(
                "submit_audit",
                `${releaseBasePath}/submit-audit`,
                JSON.stringify({
                  host_names: hostNames,
                  audit_note: auditNote.trim(),
                }),
                "审核已提交",
              )}
              type="button"
            >
              {pending === "submit_audit"
                ? <Loader2 className="animate-spin" data-icon="inline-start" />
                : <Send data-icon="inline-start" />}
              确认提交
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={publishOpen} onOpenChange={onPublishOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认正式发布</DialogTitle>
            <DialogDescription>
              发布后该版本将成为租户抖音小程序的线上版本，请确认已完成体验验收且审核通过。
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/20 p-4 text-sm">
            <p className="font-medium">
              {release?.template_version ?? "当前审核版本"}
            </p>
            <p className="mt-1 break-words text-muted-foreground">
              {release?.description ?? ""}
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={() => onPublishOpenChange(false)}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button
              disabled={!canPublish || pending !== null}
              onClick={() => {
                onPublishOpenChange(false);
                void mutateRelease(
                  "publish",
                  `${releaseBasePath}/publish`,
                  "{}",
                  "小程序已正式发布",
                );
              }}
              type="button"
            >
              {pending === "publish"
                ? <Loader2 className="animate-spin" data-icon="inline-start" />
                : <Rocket data-icon="inline-start" />}
              确认发布
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChecklistItem({
  complete,
  label,
}: {
  complete: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {complete
        ? <CheckCircle2 className="text-success" aria-hidden="true" />
        : <XCircle className="text-muted-foreground" aria-hidden="true" />}
      <span>{label}</span>
      <Badge variant={complete ? "success" : "secondary"}>
        {complete ? "已完成" : "待完成"}
      </Badge>
    </div>
  );
}
