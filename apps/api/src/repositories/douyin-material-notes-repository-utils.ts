import { z } from 'zod';

import { AppError } from '@/errors/app-error';
import { Errors } from '@/errors/error-factory';

import type { DouyinMaterialNotesDatabaseResult } from './douyin-material-notes';

type PageInput = { readonly page: number; readonly pageSize: number };

export async function execute<Result>(
  message: string,
  operation: () => Promise<Result>,
) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw Errors.dbError(message);
  }
}

export function pageRange(input: PageInput): [number, number] {
  const from = (input.page - 1) * input.pageSize;
  return [from, from + input.pageSize - 1];
}

export function searchFilter(keyword: string): string {
  const escaped = escapeIlikeOperand(keyword);
  const operand = `"%${escaped}%"`;
  return ['title', 'summary', 'category']
    .map((column) => `${column}.ilike.${operand}`).join(',');
}

export function categorySearchFilter(keyword: string): string {
  const escaped = escapeIlikeOperand(keyword);
  const operand = `"%${escaped}%"`;
  return ['name', 'description']
    .map((column) => `${column}.ilike.${operand}`).join(',');
}

export function removeUndefined(input: Readonly<Record<string, unknown>>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

export function pageResult<Schema extends z.ZodType>(
  schema: Schema,
  result: DouyinMaterialNotesDatabaseResult,
) {
  assertSuccess(result, '查询抖音资料分页失败');
  if (!Number.isSafeInteger(result.count) || result.count! < 0) {
    throw invalidResponse();
  }
  if (!Array.isArray(result.data)) throw invalidResponse();
  return { rows: parse(z.array(schema).max(100), result.data), total: result.count! };
}

export function optionalResult<Schema extends z.ZodType>(
  schema: Schema,
  result: DouyinMaterialNotesDatabaseResult,
): z.output<Schema> | null {
  assertSuccess(result, '查询抖音资料详情失败');
  return result.data === null ? null : parse(schema, result.data);
}

export function parse<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.output<Schema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw invalidResponse();
  return parsed.data;
}

export function assertSuccess(
  result: DouyinMaterialNotesDatabaseResult,
  message: string,
): void {
  if (!result.error) return;
  throw databaseFailure(result.error, message);
}

function escapeIlikeOperand(keyword: string): string {
  return keyword.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/[%_]/g, '\\$&');
}

export function invalidResponse(): AppError {
  return Errors.business(
    500,
    '抖音资料数据库响应格式无效',
    'MATERIAL_NOTE_REPOSITORY_RESPONSE_INVALID',
  );
}

function databaseFailure(error: unknown, fallbackMessage: string): AppError {
  const text = errorText(error);
  const mappings: ReadonlyArray<readonly [string, number, string]> = [
    ['MATERIAL_NOTE_CATEGORY_NOT_FOUND', 404, '资料分类不存在'],
    ['MATERIAL_NOTE_CLAIM_NOT_FOUND', 404, '领取记录不存在'],
    ['MATERIAL_NOTE_NOT_FOUND', 404, '资料不存在'],
    ['MATERIAL_NOTE_NOT_AVAILABLE', 409, '资料当前不可领取'],
    ['MATERIAL_NOTE_VERSION_CONFLICT', 409, '资料版本冲突'],
    ['MATERIAL_NOTE_STATE_CONFLICT', 409, '资料状态已变化'],
    ['MATERIAL_NOTE_IDEMPOTENCY_CONFLICT', 409, '幂等键已用于不同请求'],
    ['MATERIAL_NOTE_WITHDRAWN', 410, '资料已停止提供'],
    ['MATERIAL_NOTE_INVALID_INPUT', 400, '资料命令参数无效'],
    ['MATERIAL_NOTE_TENANT_NOT_ACTIVE', 409, '租户当前不可执行资料命令'],
    ['MATERIAL_NOTE_ACTOR_NOT_ACTIVE', 409, '员工当前不可执行资料命令'],
    ['MATERIAL_NOTE_INSTALLATION_NOT_ACTIVE', 409, '小程序安装当前不可用'],
    ['MATERIAL_NOTE_TENANT_NOT_FOUND', 404, '租户不存在'],
    ['MATERIAL_NOTE_INSTALLATION_NOT_FOUND', 404, '小程序安装不存在'],
  ];
  for (const [code, statusCode, message] of mappings) {
    if (text.includes(code)) return Errors.business(statusCode, message, code);
  }
  return Errors.dbError(fallbackMessage);
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (typeof error !== 'object' || error === null) return '';
  const values = ['message', 'details', 'hint', 'code'].map((key) => {
    const value = (error as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : '';
  });
  return values.join(' ');
}
