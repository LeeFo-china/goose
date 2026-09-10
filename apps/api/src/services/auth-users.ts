import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

type AuthUserPlatform = "douyin_mini";

export class AuthUsersService {
  constructor(private readonly adminClient = SupabaseDB.getAdminClient()) {}

  async createLocalPlatformUser(input: {
    platform: AuthUserPlatform;
    subject: string;
    source: string;
  }) {
    const emailLocalPart =
      `${input.platform}.${input.subject}.${crypto.randomUUID()}`;
    const { data, error } = await this.adminClient.auth.admin.createUser({
      email: `${emailLocalPart}@auth.local`,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: {
        platform: input.platform,
        subject: input.subject,
        source: input.source,
      },
    });

    if (error || !data.user) {
      throw Errors.dbError(
        "创建登录用户失败",
        error ?? { message: "createUser returned no user" },
      );
    }

    return data.user.id;
  }
}

export const authUsersService = new AuthUsersService();
