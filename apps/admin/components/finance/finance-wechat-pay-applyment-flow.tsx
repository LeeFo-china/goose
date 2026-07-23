"use client";

import type { ReactNode } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Save,
  SendHorizontal,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

import {
  APPLYMENT_STAGE_KEYS,
  getApplymentProgress,
  type ApplymentStageKey,
} from "./finance-wechat-pay-applyment-flow-model";
import { SelectField } from "./finance-wechat-pay-applyment-form-fields";

const STAGE_LABELS: Record<ApplymentStageKey, string> = {
  materials: "上传资料",
  recognition: "核对识别",
  supplement: "补充信息",
  submit: "确认提交",
};

const SUBJECT_TYPE_OPTIONS = [
  { value: "SUBJECT_TYPE_ENTERPRISE", label: "企业" },
  { value: "SUBJECT_TYPE_INDIVIDUAL", label: "个体工商户" },
];

const CONTACT_TYPE_OPTIONS = [
  { value: "LEGAL", label: "法人本人" },
  { value: "SUPER", label: "经办人" },
];

type ApplymentFlowProps = {
  activeStage: ApplymentStageKey;
  highestAvailableStage: ApplymentStageKey;
  subjectType: string;
  contactType: string;
  disabled: boolean;
  navigationDisabled: boolean;
  materialsContent: ReactNode;
  recognitionContent: ReactNode;
  supplementContent: ReactNode;
  submitContent: ReactNode;
  onStageChange: (stage: ApplymentStageKey) => void;
  onNextStage: () => void;
  onSubjectTypeChange: (value: string) => void;
  onContactTypeChange: (value: string) => void;
};

export function FinanceWechatPayApplymentFlow(
  props: ApplymentFlowProps,
) {
  const activeIndex = APPLYMENT_STAGE_KEYS.indexOf(props.activeStage);
  const highestAvailableIndex = APPLYMENT_STAGE_KEYS.indexOf(
    props.highestAvailableStage,
  );
  const progress = getApplymentProgress(props.activeStage);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3">
        <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {APPLYMENT_STAGE_KEYS.map((stage, index) => {
            const isCompleted = index < highestAvailableIndex;
            const isActive = stage === props.activeStage;
            return (
              <li key={stage}>
                <Button
                  type="button"
                  variant={isActive ? "default" : "outline"}
                  className="h-auto min-h-10 w-full justify-start whitespace-normal"
                  disabled={
                    props.navigationDisabled || index > highestAvailableIndex
                  }
                  aria-current={isActive ? "step" : undefined}
                  onClick={() => props.onStageChange(stage)}
                >
                  {isCompleted ? <Check data-icon="inline-start" /> : null}
                  <span className="tabular-nums">{index + 1}.</span>
                  {STAGE_LABELS[stage]}
                </Button>
              </li>
            );
          })}
        </ol>
        <div className="flex items-center gap-3">
          <Progress
            value={progress}
            aria-label="微信支付开通资料填写进度"
          />
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {Math.round(progress)}%
          </span>
        </div>
      </div>

      <ApplymentStagePanel
        stage="materials"
        activeStage={props.activeStage}
      >
        <div className="flex flex-col gap-4">
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="主体类型"
              name="subject_type"
              defaultValue={props.subjectType}
              options={SUBJECT_TYPE_OPTIONS}
              requirement="required"
              disabled={props.disabled}
              onValueChange={props.onSubjectTypeChange}
            />
            <SelectField
              label="超级管理员身份"
              name="contact_type"
              defaultValue={props.contactType}
              options={CONTACT_TYPE_OPTIONS}
              requirement="required"
              disabled={props.disabled}
              onValueChange={props.onContactTypeChange}
            />
          </FieldGroup>
          {props.materialsContent}
        </div>
      </ApplymentStagePanel>

      <ApplymentStagePanel
        stage="recognition"
        activeStage={props.activeStage}
      >
        {props.recognitionContent}
      </ApplymentStagePanel>

      <ApplymentStagePanel
        stage="supplement"
        activeStage={props.activeStage}
      >
        {props.supplementContent}
      </ApplymentStagePanel>

      <ApplymentStagePanel stage="submit" activeStage={props.activeStage}>
        {props.submitContent}
      </ApplymentStagePanel>

      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={props.navigationDisabled || activeIndex === 0}
          onClick={() =>
            props.onStageChange(APPLYMENT_STAGE_KEYS[activeIndex - 1])
          }
        >
          <ChevronLeft data-icon="inline-start" />
          上一步
        </Button>
        <span className="text-xs tabular-nums text-muted-foreground">
          {activeIndex + 1} / {APPLYMENT_STAGE_KEYS.length}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={
            props.navigationDisabled ||
            activeIndex === APPLYMENT_STAGE_KEYS.length - 1
          }
          onClick={props.onNextStage}
        >
          下一步
          <ChevronRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}

export function ApplymentStagePanel(props: {
  stage: ApplymentStageKey;
  activeStage: ApplymentStageKey;
  children: ReactNode;
}) {
  return (
    <section
      data-applyment-stage={props.stage}
      hidden={props.stage !== props.activeStage}
      className={cn(
        "min-h-[30rem]",
        props.stage !== props.activeStage && "hidden",
      )}
    >
      {props.children}
    </section>
  );
}

export function FinanceWechatPayApplymentActions({
  activeStage,
  updatedAtLabel,
  pending,
  materialsPending,
  hasApplyment,
  editable,
  canSubmit,
  reviewConfirmed,
  onSubmitApplyment,
}: {
  activeStage: ApplymentStageKey;
  updatedAtLabel: string;
  pending: boolean;
  materialsPending: boolean;
  hasApplyment: boolean;
  editable: boolean;
  canSubmit: boolean;
  reviewConfirmed: boolean;
  onSubmitApplyment: () => void;
}) {
  const busy = pending || materialsPending;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <div className="text-xs text-muted-foreground">
        最近更新：{updatedAtLabel}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="outline"
          disabled={busy || !editable}
        >
          {pending
            ? <Loader2 className="animate-spin" data-icon="inline-start" />
            : <Save data-icon="inline-start" />}
          保存申请
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              disabled={
                busy ||
                !hasApplyment ||
                !editable ||
                !canSubmit ||
                !reviewConfirmed ||
                activeStage !== "submit"
              }
            >
              <SendHorizontal data-icon="inline-start" />
              提交平台审核
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>提交微信支付开通申请？</AlertDialogTitle>
              <AlertDialogDescription>
                提交后租户侧资料将进入只读状态，由平台审核并决定是否发送微信正式进件。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>继续检查</AlertDialogCancel>
              <AlertDialogAction type="button" onClick={onSubmitApplyment}>
                确认提交
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
