import { Errors } from "@/errors/error-factory";
import type { VisitorPictureAssetRecord } from "@/repositories/visitor-picture-library";
import { getDirectPostgresSql } from "@/utils/postgres-direct";
import { SupabaseDB } from "@/utils/supabase";

export type VisitorPictureNavigationContext = {
  category_id: string | null;
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
    direction: "prev" | "next" | "both";
    limit: number;
  }): Promise<VisitorPictureNavigationBundle> {
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

  private toBundle(rows: VisitorPictureNavigationRpcRow[]): VisitorPictureNavigationBundle {
    const current = rows.find((row) => row.nav_position === "current") ?? null;
    const prev = rows.find((row) => row.nav_position === "prev") ?? null;
    const next = rows.find((row) => row.nav_position === "next") ?? null;
    return {
      current: current?.asset ?? null,
      prev: prev?.asset ?? null,
      next: next?.asset ?? null,
      context: current?.context ?? prev?.context ?? next?.context ?? null,
    };
  }
}

export const visitorPictureNavigationRepository = new VisitorPictureNavigationRepository();
