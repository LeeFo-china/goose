const MAX_AMOUNT_FEN = 100_000_000;
const MAX_DAILY_TASKS = 10_000;
const MAX_VERSION = 2_147_483_646;

export interface SettingsFormValues {
  enabled: boolean;
  dailyTaskLimit: string;
  dailyBudgetYuan: string;
  perJobReserveYuan: string;
  reason: string;
}

export interface SettingsCommand {
  enabled: boolean;
  daily_task_limit: number;
  daily_budget_fen: number;
  per_job_reserve_fen: number;
  expected_version: number;
  reason: string;
}

export type SettingsFormErrors = Partial<Record<keyof SettingsFormValues | 'form', string>>;

export type SettingsCommandResult =
  | { ok: true; command: SettingsCommand }
  | { ok: false; errors: SettingsFormErrors };

export function yuanToFen(value: string): number | null {
  const trimmed = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const [yuan, decimal = ''] = trimmed.split('.');
  const fen = Number(yuan) * 100 + Number(decimal.padEnd(2, '0'));
  return Number.isSafeInteger(fen) && fen >= 1 && fen <= MAX_AMOUNT_FEN ? fen : null;
}

export function fenToYuan(fen: number | null): string {
  if (fen === null) return '';
  return `${Math.trunc(fen / 100)}.${String(fen % 100).padStart(2, '0')}`;
}

export function buildSettingsCommand(values: SettingsFormValues,
  expectedVersion: number): SettingsCommandResult {
  const errors: SettingsFormErrors = {};
  const dailyTaskLimit = /^\d+$/.test(values.dailyTaskLimit.trim())
    ? Number(values.dailyTaskLimit.trim()) : NaN;
  const dailyBudgetFen = yuanToFen(values.dailyBudgetYuan);
  const perJobReserveFen = yuanToFen(values.perJobReserveYuan);
  const reason = values.reason.trim();

  if (!Number.isInteger(dailyTaskLimit) || dailyTaskLimit < 1
    || dailyTaskLimit > MAX_DAILY_TASKS) errors.dailyTaskLimit = '每日任务上限须为 1–10000';
  if (dailyBudgetFen === null) errors.dailyBudgetYuan = '日预算须为 0.01–1000000 元，最多两位小数';
  if (perJobReserveFen === null) errors.perJobReserveYuan = '单任务预占须为 0.01–1000000 元，最多两位小数';
  if (dailyBudgetFen !== null && perJobReserveFen !== null
    && perJobReserveFen > dailyBudgetFen) errors.perJobReserveYuan = '单任务预占不能超过日预算';
  if (reason.length < 3 || reason.length > 240 || /[\x00-\x1f\x7f]/.test(reason)) {
    errors.reason = '操作原因须为 3–240 字，不能包含换行或控制字符';
  }
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0 || expectedVersion > MAX_VERSION) {
    errors.form = '设置版本无效，请刷新页面';
  }
  if (Object.keys(errors).length || dailyBudgetFen === null || perJobReserveFen === null) {
    return { ok: false, errors };
  }
  return { ok: true, command: { enabled: values.enabled,
    daily_task_limit: dailyTaskLimit, daily_budget_fen: dailyBudgetFen,
    per_job_reserve_fen: perJobReserveFen, expected_version: expectedVersion, reason } };
}
