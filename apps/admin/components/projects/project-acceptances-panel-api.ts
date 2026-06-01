import {
  PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
  type ProjectLogStageCode,
} from "@gooes/domain";
import type {
  AcceptanceListData,
  AcceptanceTemplate,
  AcceptanceTemplateListData,
  ConstructionStagePayload,
  EditableItem,
  EditableState,
  NotifyCustomerResult,
  ProjectAcceptance,
} from "@/components/projects/project-acceptance-types";
import { requestBackend } from "@/components/projects/project-acceptance-utils";

export async function loadProjectAcceptanceData(projectId: string) {
  return Promise.all([
    requestBackend<AcceptanceListData>(
      `/project-acceptances?project_id=${projectId}&page=1&pageSize=20`,
    ),
    requestBackend<ConstructionStagePayload>(
      `/projects/${projectId}/construction-stages`,
    ),
  ]);
}

export async function createStageAcceptance(input: {
  projectId: string;
  stageCode: ProjectLogStageCode;
}) {
  return requestBackend<ProjectAcceptance>("/project-acceptances", {
    method: "POST",
    payload: {
      project_id: input.projectId,
      stage_code: input.stageCode,
    },
  });
}

export async function createFinalProjectAcceptance(projectId: string) {
  return requestBackend<ProjectAcceptance>("/project-acceptances", {
    method: "POST",
    payload: {
      project_id: projectId,
      acceptance_type: "final",
      stage_code: PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
    },
  });
}

export async function loadFinalAcceptanceTemplate() {
  const data = await requestBackend<AcceptanceTemplateListData>(
    `/project-acceptance-templates?acceptance_type=final&stage_code=${PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE}&status=active`,
  );

  return {
    template: data.list?.[0] as AcceptanceTemplate | undefined,
    hasTemplate: Boolean(data.list?.length),
  };
}

export function buildAcceptanceSavePayload(editable: EditableState) {
  return {
    summary: editable.summary,
    items: Object.values(editable.items).map((item) => ({
      id: item.id,
      result: item.result,
      remark: item.remark,
      images: item.images,
      rectification_remark: item.rectification_remark,
      rectification_images: item.rectification_images,
    })),
  };
}

export async function saveProjectAcceptance(input: {
  acceptanceId: string;
  editable: EditableState;
  submit?: boolean;
}) {
  const payload = buildAcceptanceSavePayload(input.editable);
  if (input.submit) {
    await requestBackend(`/project-acceptances/${input.acceptanceId}/submit`, {
      method: "POST",
      payload,
    });
    return;
  }

  await requestBackend(`/project-acceptances/${input.acceptanceId}`, {
    method: "PATCH",
    payload,
  });
}

export async function approveProjectAcceptance(input: {
  acceptanceId: string;
  comment: string;
}) {
  await requestBackend(`/project-acceptances/${input.acceptanceId}/approve`, {
    method: "POST",
    payload: { comment: input.comment.trim() || "复核通过" },
  });
}

export async function rejectProjectAcceptance(input: {
  acceptanceId: string;
  comment: string;
}) {
  await requestBackend(`/project-acceptances/${input.acceptanceId}/reject`, {
    method: "POST",
    payload: { comment: input.comment },
  });
}

export function notifyProjectAcceptanceCustomer(input: {
  acceptanceId: string;
  force?: boolean;
}) {
  return requestBackend<NotifyCustomerResult>(
    `/project-acceptances/${input.acceptanceId}/notify-customer`,
    {
      method: "POST",
      payload: { scene: "customer_review", force: Boolean(input.force) },
    },
  );
}

export async function deleteProjectAcceptanceDraft(acceptanceId: string) {
  await requestBackend(`/project-acceptances/${acceptanceId}`, {
    method: "DELETE",
  });
}

export function buildUploadedImagePatch(input: {
  currentItem: EditableItem | undefined;
  target: "images" | "rectification_images";
  uploaded: Array<{ path: string; preview: string }>;
}) {
  return {
    [input.target]: [
      ...(input.currentItem?.[input.target] || []),
      ...input.uploaded.map((item) => item.path),
    ],
    [input.target === "images" ? "imagePreviews" : "rectificationImagePreviews"]: [
      ...(input.target === "images"
        ? input.currentItem?.imagePreviews || []
        : input.currentItem?.rectificationImagePreviews || []),
      ...input.uploaded.map((item) => item.preview),
    ],
  } as Partial<EditableItem>;
}
