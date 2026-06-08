import { Errors } from "@/errors/error-factory";
import type { VisitorPictureAssetRecord } from "@/repositories/visitor-picture-library";
import { findVisitorPicturePersonalNavigationAssets } from "@/repositories/visitor-picture-library-personal";
import type { VisitorPictureLibraryScope } from "@/schema/visitor-picture-library";
import { getDirectPostgresSql } from "@/utils/postgres-direct";
import { SupabaseDB } from "@/utils/supabase";

export type VisitorPictureNavigationContext = {
  category_id: string | null;
  scope?: VisitorPictureLibraryScope;
  direction: "prev" | "next" | "both";
  limit: number;
  sort: string;
  has_prev: boolean;
  has_next: boolean;
  prev_cursor: string | null;
  next_cursor: string | null;
};

export type VisitorPictureNavigationBundle = {
  current: VisitorPictureAssetRecord | null;
  prev: VisitorPictureAssetRecord | null;
  next: VisitorPictureAssetRecord | null;
  prevList: VisitorPictureAssetRecord[];
  nextList: VisitorPictureAssetRecord[];
  context: VisitorPictureNavigationContext | null;
};

type VisitorPictureNavigationPosition = "current" | "prev" | "next";

type VisitorPictureNavigationRpcRow = {
  nav_position: VisitorPictureNavigationPosition;
  asset: VisitorPictureAssetRecord;
  context: VisitorPictureNavigationContext;
};

class VisitorPictureNavigationRepository {
  async findBundle(input: {
    assetId: string;
    categoryId: string | null;
    scope: VisitorPictureLibraryScope;
    visitorId: string | null;
    direction: "prev" | "next" | "both";
    limit: number;
  }): Promise<VisitorPictureNavigationBundle> {
    if (input.scope === "favorites" || input.scope === "likes") {
      return this.findPersonalBundle({
        assetId: input.assetId,
        scope: input.scope,
        visitorId: input.visitorId,
        direction: input.direction,
        limit: input.limit,
      });
    }

    const directSql = getDirectPostgresSql();
    if (directSql) {
      try {
        const rows = await directSql<VisitorPictureNavigationRpcRow[]>`
          select *
          from public.get_visitor_picture_asset_navigation(
            ${input.assetId}::uuid,
            ${input.categoryId}::uuid,
            ${input.direction},
            ${input.limit}
          )
        `;
        return this.toBundle(rows);
      } catch {
        return this.findBundleRpc(input);
      }
    }

    return this.findBundleRpc(input);
  }

  private async findBundleRpc(input: {
    assetId: string;
    categoryId: string | null;
    direction: "prev" | "next" | "both";
    limit: number;
  }) {
    const { data, error } = await (SupabaseDB.getAdminClient() as unknown as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{
        data: VisitorPictureNavigationRpcRow[] | null;
        error: { message?: string } | null;
      }>;
    }).rpc("get_visitor_picture_asset_navigation", {
      p_asset_id: input.assetId,
      p_category_id: input.categoryId,
      p_direction: input.direction,
      p_limit: input.limit,
    });
    if (error) throw Errors.dbError("查询图片导航失败", error);

    return this.toBundle(data || []);
  }

  private async findPersonalBundle(input: {
    assetId: string;
    scope: Exclude<VisitorPictureLibraryScope, "all">;
    visitorId: string | null;
    direction: "prev" | "next" | "both";
    limit: number;
  }): Promise<VisitorPictureNavigationBundle> {
    if (!input.visitorId) throw Errors.unauthorized("请先完成手机号验证");

    const assets = await findVisitorPicturePersonalNavigationAssets(
      input.scope,
      input.visitorId,
    );
    const currentIndex = assets.findIndex((asset) => asset.id === input.assetId);
    if (currentIndex < 0) {
      return this.emptyBundle();
    }

    const limit = Math.min(Math.max(input.limit, 1), 5);
    const current = assets[currentIndex] ?? null;
    const prevList = input.direction === "next"
      ? []
      : assets.slice(Math.max(0, currentIndex - limit), currentIndex).reverse();
    const nextList = input.direction === "prev"
      ? []
      : assets.slice(currentIndex + 1, currentIndex + 1 + limit);
    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex < assets.length - 1;

    return {
      current,
      prev: prevList[0] ?? null,
      next: nextList[0] ?? null,
      prevList,
      nextList,
      context: {
        category_id: null,
        scope: input.scope,
        direction: input.direction,
        limit,
        sort: `${input.scope}_created_at desc, asset_id desc`,
        has_prev: hasPrev,
        has_next: hasNext,
        prev_cursor: prevList[prevList.length - 1]?.id ?? null,
        next_cursor: nextList[nextList.length - 1]?.id ?? null,
      },
    };
  }

  private toBundle(rows: VisitorPictureNavigationRpcRow[]): VisitorPictureNavigationBundle {
    const current = rows.find((row) => row.nav_position === "current") ?? null;
    const prevRows = rows.filter((row) => row.nav_position === "prev");
    const nextRows = rows.filter((row) => row.nav_position === "next");
    return {
      current: current?.asset ?? null,
      prev: prevRows[0]?.asset ?? null,
      next: nextRows[0]?.asset ?? null,
      prevList: prevRows.map((row) => row.asset),
      nextList: nextRows.map((row) => row.asset),
      context: current?.context ?? prevRows[0]?.context ?? nextRows[0]?.context ?? null,
    };
  }

  private emptyBundle(): VisitorPictureNavigationBundle {
    return {
      current: null,
      prev: null,
      next: null,
      prevList: [],
      nextList: [],
      context: null,
    };
  }
}

export const visitorPictureNavigationRepository = new VisitorPictureNavigationRepository();
