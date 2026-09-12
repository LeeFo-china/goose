import { z } from 'zod';

export { RenderingLibraryListSchema, RenderingLibraryCreateSchema, RenderingLibraryUpdateSchema,
  RenderingLibraryVersionSchema } from '@gooes/domain';
export const RenderingLibraryParamsSchema = z.strictObject({ id: z.uuid('无效的素材 ID') });
export const RenderingLibraryEmptyQuerySchema = z.strictObject({});
