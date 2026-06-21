import { ProjectAcceptanceStatusConfig, type ProjectAcceptanceStatus } from "@gooes/domain";
import type {
  AcceptanceAction,
  AcceptanceImageItem,
  AcceptanceItem,
  AcceptanceItemResult,
  AcceptanceNotification,
  ProjectAcceptance,
} from "@/components/projects/project-acceptance-types";
import { getPreviewImageSrc } from "@/components/projects/project-acceptance-io";

export type AcceptanceEvidenceSummary = {
  acceptanceImages: AcceptanceImageItem[];
  rectificationImages: AcceptanceImageItem[];
  actionImages: AcceptanceImageItem[];
  total: number;
};

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function canEdit(status: ProjectAcceptanceStatus) {
  return status === "draft" || status === "rejected";
}

export function statusVariant(status: ProjectAcceptanceStatus) {
  return ProjectAcceptanceStatusConfig[status]?.type === "danger"
    ? "danger"
    : ProjectAcceptanceStatusConfig[status]?.type === "success"
      ? "success"
      : ProjectAcceptanceStatusConfig[status]?.type === "warning"
        ? "warning"
        : ProjectAcceptanceStatusConfig[status]?.type === "primary"
          ? "default"
          : "secondary";
}

export function resultLabel(result: AcceptanceItemResult | null | undefined) {
  if (result === "pass") return "通过";
  if (result === "fail") return "不通过";
  if (result === "not_applicable") return "不适用";
  return "未填写";
}

export function resultVariant(result: AcceptanceItemResult | null | undefined) {
  if (result === "pass") return "success";
  if (result === "fail") return "danger";
  if (result === "not_applicable") return "secondary";
  return "outline";
}

export function getAcceptanceItemStats(acceptance: ProjectAcceptance | null) {
  if (acceptance?.progress) {
    return {
      total: acceptance.progress.total,
      pass: acceptance.progress.passed,
      fail: acceptance.progress.failed,
      pending: acceptance.progress.required_incomplete,
    };
  }

  const items = acceptance?.items || [];
  return {
    total: items.length,
    pass: items.filter((item) => item.result === "pass").length,
    fail: items.filter((item) => item.result === "fail").length,
    pending: items.filter((item) => !item.result).length,
  };
}

export function isFinalAcceptance(acceptance: ProjectAcceptance | null | undefined) {
  return acceptance?.acceptance_type === "final";
}

export function getAcceptanceDisplayTitle(acceptance: ProjectAcceptance) {
  if (isFinalAcceptance(acceptance)) return "竣工交付验收";
  return acceptance.stage_label || acceptance.title;
}

export function getAcceptanceDisplaySections(acceptance: ProjectAcceptance) {
  if (isFinalAcceptance(acceptance) && acceptance.sections?.length) {
    return acceptance.sections;
  }

  return [{
    id: null,
    title: acceptance.stage_label || "验收项",
    description: null,
    sort_order: 0,
    items: acceptance.items || [],
  }];
}

function imageItemsFromPaths(input: {
  paths: string[];
  source: AcceptanceImageItem["source"];
  itemId?: string | null;
  itemTitle?: string | null;
}): AcceptanceImageItem[] {
  return input.paths.map((path) => ({
    item_id: input.itemId ?? null,
    item_title: input.itemTitle ?? null,
    path,
    url: path,
    thumb_url: path,
    source: input.source,
  }));
}

export function getAcceptanceEvidenceSummary(
  acceptance: ProjectAcceptance | null,
): AcceptanceEvidenceSummary {
  if (!acceptance) {
    return {
      acceptanceImages: [],
      rectificationImages: [],
      actionImages: [],
      total: 0,
    };
  }

  const acceptanceImages = acceptance.items.flatMap((item) =>
    item.image_items?.length
      ? item.image_items
      : imageItemsFromPaths({
        paths: item.images || [],
        source: "acceptance_item",
        itemId: item.id,
        itemTitle: item.title,
      })
  );
  const rectificationImages = acceptance.items.flatMap((item) =>
    item.rectification_image_items?.length
      ? item.rectification_image_items
      : imageItemsFromPaths({
        paths: item.rectification_images || [],
        source: "rectification_item",
        itemId: item.id,
        itemTitle: item.title,
      })
  );
  const actionImages = (acceptance.actions || []).flatMap((action) =>
    action.image_items?.length
      ? action.image_items
      : imageItemsFromPaths({
        paths: action.images || [],
        source: action.action,
      })
  );

  return {
    acceptanceImages,
    rectificationImages,
    actionImages,
    total: acceptanceImages.length + rectificationImages.length + actionImages.length,
  };
}

export function notificationVariant(notification: AcceptanceNotification | null | undefined) {
  if (!notification) return "secondary";
  if (notification.send_status === "failed") return "danger";
  if (notification.status === "revoked" || notification.status === "expired") return "secondary";
  if (new Date(notification.expire_at).getTime() <= Date.now()) return "secondary";
  return notification.send_status === "sent" ? "success" : "warning";
}

export function notificationLabel(notification: AcceptanceNotification | null | undefined) {
  if (!notification) return "未发送";
  if (notification.send_status === "failed") return "发送失败";
  if (notification.status === "revoked") return "已撤销";
  if (notification.status === "expired") return "已过期";
  if (new Date(notification.expire_at).getTime() <= Date.now()) return "已过期";
  if (notification.send_status === "sent") return "已发送";
  return "待发送";
}

export function getImageItemSrc(image: AcceptanceImageItem) {
  return getPreviewImageSrc(image.thumb_url || image.url || image.path || "");
}

export function getImageItemHref(image: AcceptanceImageItem) {
  return getPreviewImageSrc(image.url || image.path || image.thumb_url || "");
}

export function getActionLabel(action: string) {
  const labels: Record<string, string> = {
    create: "创建验收",
    update: "保存草稿",
    submit: "提交验收",
    leader_approve: "主管复核通过",
    leader_reject: "主管退回整改",
    customer_confirm: "业主确认通过",
    customer_dispute: "业主提出疑问",
    cancel: "作废验收",
  };
  return labels[action] || action;
}

export function getActionVariant(action: string) {
  if (action === "customer_dispute" || action === "leader_reject") return "warning";
  if (action === "leader_approve" || action === "customer_confirm") return "success";
  if (action === "submit") return "default";
  return "secondary";
}

export function getActionOperator(action: AcceptanceAction) {
  if (action.operator?.name) return action.operator.name;
  if (action.operator?.phone) return action.operator.phone;
  if (action.operator_type === "customer") return "业主";
  if (action.operator_type === "employee") return "员工";
  return "系统";
}

export function getLatestCustomerDispute(acceptance: ProjectAcceptance | null) {
  return (acceptance?.actions || [])
    .filter((item) => item.action === "customer_dispute")
    .slice()
    .sort((left, right) =>
      new Date(right.created_at || 0).getTime() -
      new Date(left.created_at || 0).getTime()
    )[0] || null;
}

export function getCustomerDisputeItemIds(action: AcceptanceAction | null) {
  return new Set(
    (action?.referenced_images || [])
      .map((image) => image.item_id)
      .filter((item): item is string => Boolean(item)),
  );
}

export function isRejectAction(action: AcceptanceAction) {
  return action.action === "customer_dispute" || action.action === "leader_reject";
}

export function getLatestRejectAction(acceptance: ProjectAcceptance | null) {
  return (acceptance?.actions || [])
    .filter(isRejectAction)
    .slice()
    .sort((left, right) =>
      new Date(right.created_at || 0).getTime() -
      new Date(left.created_at || 0).getTime()
    )[0] || null;
}

export function getRectificationItemsForAction(
  acceptance: ProjectAcceptance,
  action: AcceptanceAction,
) {
  if (action.action === "customer_dispute") {
    const disputedItemIds = getCustomerDisputeItemIds(action);
    if (disputedItemIds.size > 0) {
      const matchedItems = acceptance.items.filter((item) =>
        disputedItemIds.has(item.id)
      );
      return matchedItems.length ? matchedItems : acceptance.items;
    }
    return acceptance.items;
  }

  if (action.action === "leader_reject") {
    const failedItems = acceptance.items.filter((item) => item.result === "fail");
    return failedItems.length ? failedItems : acceptance.items;
  }

  return [] as AcceptanceItem[];
}

export function hasRectificationContent(items: AcceptanceItem[]) {
  return items.some((item) =>
    Boolean(
      item.rectification_remark?.trim() ||
        item.rectification_images?.length ||
        item.rectification_image_items?.length,
    )
  );
}
