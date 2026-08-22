export type DouyinAuthorizationState =
  | "unbound"
  | "active"
  | "disabled"
  | "revoked";

export type DouyinReleaseState =
  | "not_uploaded"
  | "created"
  | "uploaded"
  | "testing"
  | "audit_pending"
  | "audit_rejected"
  | "audit_approved"
  | "released"
  | "sync_error";

export type DouyinPublicProfileStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "suspended";

export type DouyinRuntimeConfig = {
  brand: {
    logo_url: string | null;
    qualifications: Array<{
      title: string;
      image_url: string | null;
    }>;
  };
  theme: {
    primary_color: string;
    navigation_text_color: "black" | "white";
  };
  features: {
    cases: boolean;
    sites: boolean;
    sms_lead: boolean;
    douyin_phone: false;
    phone_capture_mode: "sms";
  };
  home_banners: Array<{
    image_url: string;
    title: string;
    subtitle: string;
  }>;
  trust_metrics: Array<{
    label: string;
    value: string;
  }>;
  privacy_policy_version: string;
};

export type TenantDouyinWorkspace = {
  tenant: {
    id: string;
    name: string;
  };
  authorization_state: DouyinAuthorizationState;
  release_state: DouyinReleaseState;
  installation: {
    id: string;
    authorizer_appid: string;
    installation_kind: "merchant";
    authorization_status: Exclude<DouyinAuthorizationState, "unbound">;
    permission_snapshot: unknown[];
    runtime_config: DouyinRuntimeConfig;
    template_version: string | null;
    template_release_id: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  public_profile: {
    public_name: string | null;
    introduction: string | null;
    public_phone: string | null;
    status: DouyinPublicProfileStatus;
    version: number;
    submitted_at: string | null;
    reviewed_at: string | null;
    review_remark: string | null;
    published_at: string | null;
    updated_at: string;
  } | null;
  public_content: {
    cases: number;
    sites: number;
    active_service_areas: number;
  };
  available_template: {
    template_id: string;
    version: string;
    description: string;
    confirmed_at: string;
    state: "new_available" | "in_progress" | "up_to_date" | "stale_version";
  } | null;
  latest_release: {
    id: string;
    installation_id: string;
    template_id: string;
    template_version: string;
    description: string;
    status:
      | "created"
      | "uploaded"
      | "testing"
      | "audit_pending"
      | "audit_rejected"
      | "audit_approved"
      | "released"
      | "failed";
    test_qr_url: string | null;
    audit_host_names?: string[];
    audit_note: string | null;
    audit_result: {
      audit_id?: string;
      status?: "pending" | "approved" | "rejected" | "failed";
      reason?: string;
      error_code?: string;
    } | null;
    submitted_at: string | null;
    audited_at: string | null;
    released_at: string | null;
    created_at: string;
    updated_at: string;
  } | null;
};
