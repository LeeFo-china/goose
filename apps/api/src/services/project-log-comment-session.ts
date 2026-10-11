import { Errors } from "@/errors/error-factory";
import { projectLogProjectCommentsRepository } from "@/repositories/project-log-project-comments";
import { userIdentityRepository } from "@/repositories/user-identities";
import type { JwtPayload } from "@/utils/jwt";
import { projectLogCommunicationAccess } from "./project-log-communication-access";
import { projectLogCommunicationRollout } from "./project-log-communication-rollout";

type Dependencies = {
  repository?: Pick<typeof projectLogProjectCommentsRepository, "findLog">;
  access?: Pick<typeof projectLogCommunicationAccess, "resolve">;
  identity?: { findActiveOauthIdentity(platform: "wechat_mini", openid: string): Promise<{ user_id: string } | null> };
  rollout?: Pick<typeof projectLogCommunicationRollout, "assertProjectAvailable" | "assertContract">;
};
export class ProjectLogCommentSession {
  private readonly repository;
  private readonly access;
  private readonly identity;
  private readonly rollout;
  constructor(deps: Dependencies = {}) {
    this.repository = deps.repository ?? projectLogProjectCommentsRepository;
    this.access = deps.access ?? projectLogCommunicationAccess;
    this.identity = deps.identity ?? userIdentityRepository;
    this.rollout = deps.rollout ?? projectLogCommunicationRollout;
  }
  async authorize(input: { actor: JwtPayload | undefined; logId: string; write: boolean }) {
    const actor = input.actor;
    if (!actor?.sub) throw Errors.unauthorized();
    await this.rollout.assertProjectAvailable();
    await this.rollout.assertContract(2);
    // Binding freshness is authentication, independent of content detection.
    // Current mini-program and older signed sessions must retain their active binding.
    if (actor.login_channel === "wechat" || actor.login_channel === undefined) {
      const identity = actor.openid
        ? await this.identity.findActiveOauthIdentity("wechat_mini", actor.openid) : null;
      if (!identity || identity.user_id !== actor.sub) {
        throw Errors.unauthorized("当前微信绑定关系已变化，请重新登录", "WECHAT_BINDING_NOT_MATCHED");
      }
    } else if (actor.login_channel !== "admin_web") {
      throw Errors.forbidden();
    }
    const log = await this.repository.findLog(input.logId);
    if (!log) throw Errors.forbidden();
    const context = await this.access.resolve({ actor, log, write: input.write });
    return { context, log };
  }
}
export const projectLogCommentSession = new ProjectLogCommentSession();
