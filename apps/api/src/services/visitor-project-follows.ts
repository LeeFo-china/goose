import { projectRepository } from "@/repositories/projects";
import {
  visitorProjectFollowRepository,
  type VisitorProjectFollowActor,
} from "@/repositories/visitor-project-follows";
import type { VisitorProjectListQuery } from "@/schema/visitor-projects";
import { projectSer } from "@/services/projects";

class VisitorProjectFollowService {
  async follow(input: {
    projectId: string;
    actor: VisitorProjectFollowActor;
  }) {
    await projectSer.getRequiredPublicProjectVisibility(input.projectId);
    await visitorProjectFollowRepository.follow(input);
    return this.getProjectFollowState(input.projectId, input.actor.visitorId);
  }

  async unfollow(input: {
    projectId: string;
    actor: VisitorProjectFollowActor;
  }) {
    await projectSer.getRequiredPublicProjectVisibility(input.projectId);
    await visitorProjectFollowRepository.unfollow(input);
    return this.getProjectFollowState(input.projectId, input.actor.visitorId);
  }

  async getProjectFollowState(
    projectId: string,
    visitorId?: string | null,
  ) {
    const [followedByMe, followCount] = await Promise.all([
      visitorProjectFollowRepository.isFollowing({ projectId, visitorId }),
      visitorProjectFollowRepository.countByProjectId(projectId),
    ]);

    return {
      followed_by_me: followedByMe,
      follow_count: followCount,
    };
  }

  async listFollowedProjects(input: {
    actor: VisitorProjectFollowActor;
    query: VisitorProjectListQuery;
  }) {
    const { projectIds, total } =
      await visitorProjectFollowRepository.listFollowedProjectIds({
        visitorId: input.actor.visitorId,
        page: input.query.page,
        pageSize: input.query.pageSize,
      });

    const rows = await projectRepository.listPublicProjectsByIds(projectIds);
    const followCounts = await Promise.all(
      rows.map(async (item) => {
        const projectId = typeof item.id === "string" ? item.id : null;
        if (!projectId) return 0;
        const state = await this.getProjectFollowState(projectId, input.actor.visitorId);
        return state.follow_count;
      }),
    );
    const visibleIds = new Set(rows.map((item) => item.id).filter(Boolean));
    const visibleTotal = projectIds.filter((id) => visibleIds.has(id)).length === projectIds.length
      ? total
      : rows.length;

    return {
      rows: rows.map((item, index) => ({
        ...item,
        followed_by_me: true,
        follow_count: followCounts[index] ?? 0,
      })),
      pagination: {
        page: input.query.page,
        pageSize: input.query.pageSize,
        total: visibleTotal,
        totalPages: visibleTotal ? Math.ceil(visibleTotal / input.query.pageSize) : 0,
      },
    };
  }
}

export const visitorProjectFollowService = new VisitorProjectFollowService();
