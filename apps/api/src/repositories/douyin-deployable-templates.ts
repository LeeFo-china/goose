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
  "confirmed_by_employee_id",
  "confirmed_at",
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
  confirmed_by_employee_id: z.uuid().nullable(),
  confirmed_at: z.iso.datetime({ offset: true }),
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

type DatabaseResult = {
  readonly data: unknown;
  readonly error: unknown;
};

interface Query {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
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
