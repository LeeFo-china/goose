import type {
  ProjectAcceptanceProjectRow,
  ProjectAcceptanceRow,
} from "@/repositories/project-acceptances";

export function buildSummaryDetail(this: any,
    row: ProjectAcceptanceRow,
    project: ProjectAcceptanceProjectRow | null,
  ) {
    const progress = {
      total: 0,
      checked: 0,
      passed: 0,
      failed: 0,
      not_applicable: 0,
      required_incomplete: 0,
    };

    return {
      ...row,
      stage_label: this.getStageLabel(row.stage_code),
      status_label: this.getStatusLabel(row.status),
      customer_status_label: this.getStatusLabel(row.status),
      has_customer_dispute: row.reject_source === "customer",
      sections: [],
      progress,
      failed_count: 0,
      required_incomplete_count: 0,
      can_submit: false,
      blocked_reason: null,
      items: [],
      actions: [],
      project,
      initiator: null,
      reviewer: null,
      customer: null,
      latest_customer_notification: null,
    };
  }
