-- Backfills legacy applyment attachments only when object_key resolves to one
-- active file uploaded by the applyment creator in the same tenant and scene.
--
-- Rollback: this is a forward-only data repair. Restore the attachments column
-- from the pre-migration database backup if these inferred file IDs must be
-- removed; do not remove later user-created file IDs with a blanket update.

BEGIN;

WITH attachment_rows AS (
  SELECT
    applyment.id AS applyment_id,
    applyment.tenant_id,
    applyment.created_by_employee_id,
    attachment.ordinality,
    attachment.value AS attachment
  FROM public.tenant_wechat_pay_applyments AS applyment
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(applyment.attachments, '[]'::jsonb)
  ) WITH ORDINALITY AS attachment(value, ordinality)
),
attachment_matches AS (
  SELECT
    attachment_rows.applyment_id,
    attachment_rows.ordinality,
    (array_agg(file_object.id ORDER BY file_object.id))[1] AS file_object_id,
    count(*) AS match_count
  FROM attachment_rows
  JOIN public.platform_file_objects AS file_object
    ON file_object.tenant_id = attachment_rows.tenant_id
   AND file_object.object_key = attachment_rows.attachment ->> 'object_key'
   AND file_object.scene = 'wechat_pay_applyment'
   AND file_object.status = 'active'
   AND file_object.deleted_at IS NULL
   AND file_object.created_by_employee_id =
     attachment_rows.created_by_employee_id
  WHERE NULLIF(
    attachment_rows.attachment ->> 'file_object_id',
    ''
  ) IS NULL
  GROUP BY attachment_rows.applyment_id, attachment_rows.ordinality
),
unique_matches AS (
  SELECT applyment_id, ordinality, file_object_id
  FROM attachment_matches
  WHERE match_count = 1
),
rewritten_applyments AS (
  SELECT
    attachment_rows.applyment_id,
    jsonb_agg(
      CASE
        WHEN unique_matches.file_object_id IS NULL
          THEN attachment_rows.attachment
        ELSE jsonb_set(
          attachment_rows.attachment,
          '{file_object_id}',
          to_jsonb(unique_matches.file_object_id::text),
          true
        )
      END
      ORDER BY attachment_rows.ordinality
    ) AS attachments
  FROM attachment_rows
  LEFT JOIN unique_matches
    ON unique_matches.applyment_id = attachment_rows.applyment_id
   AND unique_matches.ordinality = attachment_rows.ordinality
  GROUP BY attachment_rows.applyment_id
)
UPDATE public.tenant_wechat_pay_applyments AS applyment
SET attachments = rewritten_applyments.attachments
FROM rewritten_applyments
WHERE applyment.id = rewritten_applyments.applyment_id
  AND applyment.attachments IS DISTINCT FROM rewritten_applyments.attachments;

COMMIT;
