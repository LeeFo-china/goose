import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { RENDERING_UPLOAD_MAX_BYTES, RenderingLibraryBatchPreviewSchema } from '@gooes/domain';
import { TenantBaseController } from '@/controllers/TenantBaseController';
import { Errors } from '@/errors/error-factory';
import { RenderingLibraryEmptyQuerySchema, RenderingLibraryParamsSchema } from '@/schema/tenant-rendering-library';
import { renderingLibraryFilesService, type RenderingLibraryFilesService } from '@/services/rendering-library-files';
import { Get, Post } from '@/utils/decorators/route';
import { ResponseHandler } from '@/utils/response';

type ServicePort = Pick<RenderingLibraryFilesService, 'assertUploadAccess' | 'upload' | 'preview' | 'previews'>;

export class TenantRenderingLibraryFilesController extends TenantBaseController {
  constructor(private readonly service: ServicePort = renderingLibraryFilesService) {
    super('platform_file_objects');
  }

  private parse<Output>(schema: z.ZodType<Output>, input: unknown): Output {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    return parsed.data;
  }

  private async readFile(request: FastifyRequest): Promise<{ bytes: Buffer; mimeType: string }> {
    const message = '请使用 multipart/form-data 上传且仅上传一个名为 file 的图片文件';
    if (!request.isMultipart()) throw Errors.badRequest(message);
    let file: { bytes: Buffer; mimeType: string } | undefined;
    try {
      for await (const part of request.parts({ limits: { files: 1, fields: 0, parts: 1, fileSize: RENDERING_UPLOAD_MAX_BYTES } })) {
        if (part.type !== 'file' || part.fieldname !== 'file' || file) throw Errors.badRequest(message);
        const bytes = await part.toBuffer();
        if (part.file.truncated) throw Errors.badRequest(message);
        file = { bytes, mimeType: part.mimetype };
      }
      // Await the complete iterator so trailing fields, files and malformed framing cannot trigger storage.
      if (!file) throw Errors.badRequest(message);
      return file;
    } catch { throw Errors.badRequest(message); }
  }

  @Post('/tenant/rendering-library/files')
  async uploadFile(request: FastifyRequest, reply: FastifyReply) {
    const auth = await this.getRequiredTenantContext(request);
    this.service.assertUploadAccess(auth);
    reply.header('Cache-Control', 'private, no-store');
    this.parse(RenderingLibraryEmptyQuerySchema, request.query ?? {});
    const file = await this.readFile(request);
    return ResponseHandler.success(await this.service.upload(auth, file));
  }

  @Get('/tenant/rendering-library/files/:id/preview')
  async previewFile(request: FastifyRequest, reply: FastifyReply) {
    const auth = await this.getRequiredTenantContext(request);
    reply.header('Cache-Control', 'private, no-store');
    const { id } = this.parse(RenderingLibraryParamsSchema, request.params);
    this.parse(RenderingLibraryEmptyQuerySchema, request.query ?? {});
    return ResponseHandler.success(await this.service.preview(auth, id));
  }

  @Post('/tenant/rendering-library/files/previews', { tenantServiceAccess: 'read' })
  async previewFiles(request: FastifyRequest, reply: FastifyReply) {
    const auth = await this.getRequiredTenantContext(request);
    reply.header('Cache-Control', 'private, no-store');
    this.parse(RenderingLibraryEmptyQuerySchema, request.query ?? {});
    const body = this.parse(RenderingLibraryBatchPreviewSchema, request.body);
    return ResponseHandler.success(await this.service.previews(auth, body));
  }
}

export default new TenantRenderingLibraryFilesController();
