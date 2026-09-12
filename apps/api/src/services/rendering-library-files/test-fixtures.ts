import sharp from 'sharp';
import COS from 'cos-nodejs-sdk-v5';
import { Errors } from '@/errors/error-factory';
import { RenderingLibraryStorage } from '@/gateways/rendering-library-storage/client';
import type { TenantRenderingLibraryDatabaseClient } from '@/repositories/tenant-rendering-library';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

export async function makeFilesFixture() {
  const { TenantRenderingLibraryRepository } = await import('@/repositories/tenant-rendering-library');
  const { accessPolicyService } = await import('@/services/access-policy');
  const { RenderingLibraryFilesService } = await import('./service');
  const { TenantRenderingLibraryService } = await import('@/services/tenant-rendering-library/service');
  const events: string[] = [];
  const files = new Map<string, Record<string, unknown>>();
  const styles = new Map<string, Record<string, unknown>>();
  const state = { fail: '' };
  const uploaded: Buffer[] = [];
  const io = { database: 0, cos: 0 };
  const from = (table: string) => {
    const rows = table === 'platform_file_objects' ? files : styles;
    const filters: [string, unknown][] = [];
    let fields = '';
    let operation = 'find';
    let write: Record<string, unknown> = {};
    let includedIds: readonly unknown[] | undefined;
    let rowLimit = 0;
    const project = (row: Record<string, unknown>) => Object.fromEntries(fields.split(',').map((key) => [key, row[key]]));
    const execute = async () => {
      const event = operation === 'insert' ? (table === 'platform_file_objects' ? 'stage' : 'create')
        : operation === 'update' ? 'activate' : includedIds ? 'find-batch' : 'find';
      io.database++;
      events.push(event);
      if (state.fail === event) return { data: null, error: { message: 'raw secret DB error' } };
      if (includedIds) {
        const requestedIds = includedIds;
        const matching = [...rows.values()].filter((candidate) => requestedIds.includes(candidate.id)
          && filters.every(([key, value]) => candidate[key] === value)).slice(0, rowLimit);
        return { data: matching.map(project), error: null };
      }
      let row: Record<string, unknown> | undefined;
      if (operation === 'insert') {
        row = { deleted_at: null, created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z',
          version: 1, id: crypto.randomUUID(), ...write };
        rows.set(String(row.id), row);
      } else {
        row = [...rows.values()].find((candidate) => filters.every(([key, value]) => candidate[key] === value));
        if (row && operation === 'update') Object.assign(row, write);
      }
      if (event === 'activate' && row?.status === 'active' && state.fail === 'activation_committed_response_lost') {
        return { data: null, error: { message: 'raw secret DB response lost after commit' } };
      }
      return { data: row ? project(row) : null, error: null };
    };
    const query = {
      select(value: string) { fields = value; return query; },
      eq(key: string, value: unknown) { filters.push([key, value]); return query; },
      is(key: string, value: unknown) { filters.push([key, value]); return query; },
      in(_key: string, values: readonly unknown[]) { includedIds = values; return query; },
      limit(value: number) { rowLimit = value; return query; },
      insert(value: Record<string, unknown>) { operation = 'insert'; write = value; return query; },
      update(value: Record<string, unknown>) { operation = 'update'; write = value; return query; },
      single: execute, maybeSingle: execute,
      then: (resolve: (value: Awaited<ReturnType<typeof execute>>) => unknown) => execute().then(resolve),
    };
    return query;
  };
  // Supabase's fluent builder is the only database replacement; all domain layers remain real.
  const repository = new TenantRenderingLibraryRepository({ from } as unknown as TenantRenderingLibraryDatabaseClient);
  const storage = new RenderingLibraryStorage({
    loadConfig: async () => {
      events.push('config');
      if (state.fail === 'config') throw Errors.badRequest('raw secret configuration');
      return { bucket: 'rendering-123456', region: 'ap-guangzhou', secretId: 'dummy-id', secretKey: 'dummy-key' };
    },
    createCos: (options) => {
      io.cos++;
      const cos = new COS(options);
      return {
      async getObject(): Promise<never> {
        throw Errors.business(500, '私有文件流程不得读取对象', 'UNEXPECTED_COS_READ');
      },
      async headObject(): Promise<never> {
        throw Errors.business(500, '私有文件流程不得检查公开对象', 'UNEXPECTED_COS_HEAD');
      },
      async putObject(params) {
        events.push('put');
        if (state.fail === 'put') throw Errors.badRequest('raw secret COS error');
        if (Buffer.isBuffer(params.Body)) uploaded.push(params.Body);
      },
      getObjectUrl(params) {
        events.push('preview');
        if (state.fail === 'preview') throw Errors.badRequest('raw secret signed URL');
        return cos.getObjectUrl(params);
      },
      };
    },
  });
  const service = new RenderingLibraryFilesService({ repository, storage, accessPolicy: accessPolicyService });
  const draftService = new TenantRenderingLibraryService({ repository, accessPolicy: accessPolicyService });
  const bytes = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#bada55' } }).png().toBuffer();
  return { service, draftService, repository, storage, events, files, styles, state, uploaded, bytes, io };
}
