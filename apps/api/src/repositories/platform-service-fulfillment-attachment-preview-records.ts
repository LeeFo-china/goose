export type FulfillmentAttachmentPreviewFileRecord = {
  id: string;
  tenant_id: string | null;
  scene: string;
  provider: string;
  object_key: string;
  visibility: string;
  status: string;
  deleted_at: string | null;
};

export type FulfillmentAttachmentPreviewRecord = {
  id: string;
  tenant_id: string;
  service_order_id: string;
  work_order_id: string;
  fulfillment_record_id: string | null;
  file_id: string;
  file_name?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  file?: FulfillmentAttachmentPreviewFileRecord
    | FulfillmentAttachmentPreviewFileRecord[]
    | null;
};

export const TENANT_FULFILLMENT_ATTACHMENT_PREVIEW_SELECT = [
  "id",
  "tenant_id",
  "service_order_id",
  "work_order_id",
  "fulfillment_record_id",
  "file_id",
  "file_name",
  "mime_type",
  "size_bytes",
  "file:platform_file_objects!tenant_service_fulfillment_attachments_file_id_fkey(id,tenant_id,scene,provider,object_key,visibility,status,deleted_at)",
].join(",");
