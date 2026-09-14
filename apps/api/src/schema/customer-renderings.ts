import { z } from 'zod';

export const RenderingPhoneBindSchema = z.strictObject({
  idempotency_key: z.uuid(),
});

export type RenderingPhoneBind = z.infer<typeof RenderingPhoneBindSchema>;

export const RenderingUploadStatusResponseSchema = z.strictObject({
  file_id: z.uuid(),
  status: z.enum(['issued', 'processing', 'pending_review', 'approved', 'ready', 'rejected', 'failed', 'deleted']),
  review_state: z.enum(['pending', 'manual']).nullable(),
  mime_type: z.literal('image/webp').nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  size_bytes: z.number().int().positive().nullable(),
});

export type RenderingUploadStatusResponse = z.infer<typeof RenderingUploadStatusResponseSchema>;

export const RenderingJobStatusResponseSchema = z.strictObject({
  job_id: z.uuid(),
  status: z.enum(['queued', 'processing', 'succeeded', 'failed', 'review_required']),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  finished_at: z.iso.datetime({ offset: true }).nullable(),
  result: z.strictObject({
    mime_type: z.literal('image/webp'), size_bytes: z.number().int().positive(),
    download_url: z.url().refine((url) => url.startsWith('https://')),
    expires_at: z.iso.datetime({ offset: true }),
  }).nullable(),
});
export type RenderingJobStatusResponse = z.infer<typeof RenderingJobStatusResponseSchema>;
