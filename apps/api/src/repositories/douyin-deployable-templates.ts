import { z } from "zod";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

const SAFE_SELECT = [
  "id",
  "template_app_id",
  "source_draft_id",
  "template_id",
  "template_version",
  "description",
  "channel",
  "is_current",
  "is_tenant_selectable",
  "confirmed_by_employee_id",
  "confirmed_at",
  "selectability_updated_at",
  "selectability_updated_by_employee_id",
  "created_at",
].join(",");

const DeployableTemplateSchema = z.strictObject({
  id: z.uuid(),
  template_app_id: z.literal("tt0d647bd99301341b01"),
  source_draft_id: z.string().regex(/^[1-9][0-9]{0,18}$/),
  template_id: z.string().regex(/^[1-9][0-9]{0,18}$/),
  template_version: z.string().trim().min(1).max(64),
  description: z.string().trim().min(1).max(200),
  channel: z.enum(["default", "1"]),
  is_current: z.boolean(),
  is_tenant_selectable: z.boolean(),
  confirmed_by_employee_id: z.uuid().nullable(),
  confirmed_at: z.iso.datetime({ offset: true }),
  selectability_updated_at: z.iso.datetime({ offset: true }),
  selectability_updated_by_employee_id: z.uuid().nullable(),
  created_at: z.iso.datetime({ offset: true }),
});

export type DouyinDeployableTemplate = z.infer<typeof DeployableTemplateSchema>;
export type DouyinDeployableTemplateChannel = "default" | "1";
export type ConfirmDouyinDeployableTemplateInput = {
  readonly templateAppId: string;
  readonly sourceDraftId: string;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly description: string;
  readonly channel: DouyinDeployableTemplateChannel;
  readonly actorEmployeeId: string;
};
export type ListDouyinDeployableTemplatesInput = {
  readonly channel: DouyinDeployableTemplateChannel;
  readonly page: number;
  readonly pageSize: number;
};
export type SetDouyinTemplateSelectabilityInput = {
  readonly templateRecordId: string;
  readonly isTenantSelectable: boolean;
  readonly expectedIsTenantSelectable: boolean;
  readonly actorEmployeeId: string;
};

type DatabaseResult = {
  readonly data: unknown;
  readonly error: unknown;
  readonly count?: number | null;
};

interface Query {
  select(columns: string, options?: { count: "exact" }): Query;
  eq(column: string, value: unknown): Query;
  order(column: string, options: { ascending: boolean }): Query;
  range(from: number, to: number): PromiseLike<DatabaseResult>;
  maybeSingle(): Promise<DatabaseResult>;
}

export interface DouyinDeployableTemplatesDatabaseClient {
  from(table: string): Query;
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<DatabaseResult>;
}

export class DouyinDeployableTemplatesRepository {
  constructor(
    private readonly client: DouyinDeployableTemplatesDatabaseClient =
      SupabaseDB.getAdminClient() as unknown as
        DouyinDeployableTemplatesDatabaseClient,
  ) {}

  async findCurrent(
    channel: DouyinDeployableTemplateChannel,
  ): Promise<DouyinDeployableTemplate | null> {
    return execute(async () => {
      const result = await this.client
        .from("douyin_miniapp_deployable_templates")
        .select(SAFE_SELECT)
        .eq("channel", channel)
        .eq("is_current", true)
        .maybeSingle();
      assertSuccess(result);
      return result.data === null ? null : parseTemplate(result.data);
    });
  }

  async findSelectableById(
    templateRecordId: string,
    channel: DouyinDeployableTemplateChannel,
  ): Promise<DouyinDeployableTemplate | null> {
    return execute(async () => {
      const result = await this.client
        .from("douyin_miniapp_deployable_templates")
        .select(SAFE_SELECT)
        .eq("id", templateRecordId)
        .eq("channel", channel)
        .eq("is_tenant_selectable", true)
        .maybeSingle();
      assertSuccess(result);
      return result.data === null ? null : parseTemplate(result.data);
    });
  }

  async list(input: ListDouyinDeployableTemplatesInput) {
    return this.listWhere(input, false);
  }

  async listSelectable(input: ListDouyinDeployableTemplatesInput) {
    return this.listWhere(input, true);
  }

  async confirm(
    input: ConfirmDouyinDeployableTemplateInput,
  ): Promise<DouyinDeployableTemplate> {
    return execute(async () => {
      const result = await this.client.rpc(
        "confirm_douyin_deployable_template",
        {
          p_template_app_id: input.templateAppId,
          p_source_draft_id: input.sourceDraftId,
          p_template_id: input.templateId,
          p_template_version: input.templateVersion,
          p_description: input.description,
          p_channel: input.channel,
          p_actor_employee_id: input.actorEmployeeId,
        },
      );
      assertSuccess(result);
      return parseTemplate(result.data);
    });
  }

  async setSelectability(
    input: SetDouyinTemplateSelectabilityInput,
  ): Promise<DouyinDeployableTemplate> {
    return execute(async () => {
      const result = await this.client.rpc(
        "set_douyin_deployable_template_selectability",
        {
          p_template_record_id: input.templateRecordId,
          p_is_tenant_selectable: input.isTenantSelectable,
          p_expected_is_tenant_selectable: input.expectedIsTenantSelectable,
          p_actor_employee_id: input.actorEmployeeId,
        },
      );
      assertSuccess(result);
      return parseTemplate(result.data);
    });
  }

  private async listWhere(
    input: ListDouyinDeployableTemplatesInput,
    selectableOnly: boolean,
  ) {
    return execute(async () => {
      let query = this.client
        .from("douyin_miniapp_deployable_templates")
        .select(SAFE_SELECT, { count: "exact" })
        .eq("channel", input.channel);
      if (selectableOnly) query = query.eq("is_tenant_selectable", true);
      const from = (input.page - 1) * input.pageSize;
      const result = await query
        .order("is_current", { ascending: false })
        .order("confirmed_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + input.pageSize - 1);
      assertSuccess(result);
      if (!Array.isArray(result.data)
        || !Number.isInteger(result.count)
        || (result.count ?? -1) < 0) {
        throw invalidResponse();
      }
      return {
        list: result.data.map(parseTemplate),
        total: result.count as number,
      };
    });
  }
}

async function execute<Result>(operation: () => Promise<Result>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw repositoryError();
  }
}

function assertSuccess(result: DatabaseResult): void {
  if (!result.error) return;
  const message = databaseErrorMessage(result.error);
  if (message === "DOUYIN_DEPLOYABLE_TEMPLATE_ID_CONFLICT") {
    throw Errors.business(
      409,
      "抖音模板编号与已有确认记录冲突",
      message,
    );
  }
  if (message === "DOUYIN_TEMPLATE_CONFIRMATION_FORBIDDEN") {
    throw Errors.business(
      403,
      "无权确认抖音可发布模板",
      message,
    );
  }
  if (message === "DOUYIN_TEMPLATE_SELECTABILITY_FORBIDDEN") {
    throw Errors.business(
      403,
      "无权修改抖音模板可选状态",
      message,
    );
  }
  if (message === "DOUYIN_DEPLOYABLE_TEMPLATE_NOT_FOUND") {
    throw Errors.business(404, "抖音模板不存在", message);
  }
  if (message === "DOUYIN_TEMPLATE_SELECTABILITY_CHANGED") {
    throw Errors.business(409, "模板可选状态已更新，请刷新后重试", message);
  }
  if (message === "DOUYIN_CURRENT_TEMPLATE_MUST_REMAIN_SELECTABLE") {
    throw Errors.business(409, "推荐模板必须保持租户可选", message);
  }
  throw repositoryError();
}

function parseTemplate(data: unknown): DouyinDeployableTemplate {
  const parsed = DeployableTemplateSchema.safeParse(data);
  if (!parsed.success) throw invalidResponse();
  return parsed.data;
}

function databaseErrorMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return null;
  }
  return typeof error.message === "string" ? error.message : null;
}

function repositoryError() {
  return Errors.business(
    500,
    "查询抖音可发布模板失败",
    "DOUYIN_DEPLOYABLE_TEMPLATE_REPOSITORY_ERROR",
  );
}

function invalidResponse() {
  return Errors.business(
    500,
    "抖音可发布模板数据格式无效",
    "DOUYIN_DEPLOYABLE_TEMPLATE_REPOSITORY_RESPONSE_INVALID",
  );
}

export const douyinDeployableTemplatesRepository =
  new DouyinDeployableTemplatesRepository();
