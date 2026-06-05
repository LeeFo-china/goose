export type RelationPerson = {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  avatar?: string | null;
  department_name?: string | null;
  post_name?: string | null;
};

export type CustomerRelation = {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  phone_masked?: string | null;
  status?: string | null;
  owner?: RelationPerson | RelationPerson[] | null;
};

export type PropertyRelation = {
  id?: string | null;
  community?: string | null;
  building_info?: string | null;
  area?: number | null;
  layout?: string | null;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  adcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_status?: string | null;
  location_source?: string | null;
  location_confidence?: number | null;
  location_confirmed_at?: string | null;
};

export type ProjectRecord = {
  id: string;
  name: string;
  status: string | null;
  status_label?: string | null;
  display_status?: string | null;
  display_status_label?: string | null;
  current_stage?: string | null;
  current_stage_label?: string | null;
  stage_code?: string | null;
  stage_label?: string | null;
  budget: number | null;
  signed_amount?: number | null;
  start_date: string | null;
  created_at: string | null;
  address: string | null;
  customer_id?: string | null;
  property_id?: string | null;
  style_tags?: string[];
  visibility_status?: string | null;
  customer?: CustomerRelation | CustomerRelation[] | null;
  property?: PropertyRelation | PropertyRelation[] | null;
  designer?: RelationPerson | RelationPerson[] | null;
  supervisor?: RelationPerson | RelationPerson[] | null;
  members?: Array<{
    id: string;
    employee_id: string;
    role_name: string;
    role_code: string;
    employee?: RelationPerson | null;
    is_primary?: boolean;
    is_virtual?: boolean;
  }>;
};

export type Option = {
  id: string;
  label: string;
  description?: string | null;
};

export type EmployeeOption = {
  id: string;
  name: string | null;
  phone: string | null;
  avatar?: string | null;
  department_name?: string | null;
  post_name?: string | null;
};

export type ProjectMode = "create" | "edit";
export type ProjectDetailTab = "overview" | "members" | "logs" | "acceptances";
export type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "danger";

export type ProjectStatusActionItem = {
  action: string;
  label: string;
  from_status: string;
  to_status: string;
  requires_reason?: boolean;
};

export type ProjectStatusActionsResponse = {
  current_status: string;
  paused_from_status?: string | null;
  actions: ProjectStatusActionItem[];
};

export type ConstructionStageSummaryItem = {
  stage_code: string;
  stage_label: string;
};

export type ProjectConstructionStagesResponse = {
  required_completed: boolean;
  missing_required_stages?: ConstructionStageSummaryItem[];
};

export type ProjectStatusTransitionRecord = {
  id: string;
  from_status: string | null;
  to_status: string;
  action: string;
  reason: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type ProjectFormState = {
  name: string;
  customer_id: string;
  designer_employee_id: string;
  supervisor_employee_id: string;
  budget: string;
  start_date: string;
  address: string;
  visibility_status: string;
  style_tags: string;
};
