import { z } from 'zod';

export const RenderingPhoneBindSchema = z.strictObject({
  idempotency_key: z.uuid(),
});

export type RenderingPhoneBind = z.infer<typeof RenderingPhoneBindSchema>;
