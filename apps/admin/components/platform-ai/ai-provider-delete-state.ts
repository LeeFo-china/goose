import { z } from 'zod';
import { requestBackendJson } from '@/lib/backend-client';
import type { AiProviderRecord } from './ai-config-types';

export async function deleteAiProvider(
  provider: Pick<AiProviderRecord, 'id' | 'version'>,
  request: (path: string, init?: RequestInit) => Promise<unknown> = requestBackendJson,
): Promise<void> {
  const target = z.object({ id: z.uuid(), version: z.number().int().positive() }).safeParse(provider);
  if (!target.success) throw new Error('供应商版本无效，请刷新后重试');
  const result = await request(`/platform/ai-config/providers/${target.data.id}`, {
    method: 'DELETE', body: JSON.stringify({ expected_version: target.data.version }),
  });
  const ack = z.strictObject({ id: z.literal(target.data.id), deleted: z.literal(true) }).safeParse(result);
  if (!ack.success) throw new Error('删除结果未确认，请刷新列表后检查');
}

export function providerDeleteError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  const status = error && typeof error === 'object' && 'status' in error ? error.status : null;
  if (code === 'AI_PROVIDER_IN_USE') return '供应商有关联模型或目录同步记录，不能删除。请取消后编辑供应商，改用停用。';
  if (code === 'AI_CONFIG_VERSION_STALE') return '供应商已变更或已被删除，请取消并刷新列表后再操作。';
  if (status === 403) return '当前账号没有删除供应商的权限。';
  return '删除结果未确认，请取消并刷新列表后检查。系统不会自动重试。';
}

export function providerPageAfterDelete(page: number, visibleCount: number): number {
  return visibleCount === 1 ? Math.max(1, page - 1) : page;
}
