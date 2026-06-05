import { administrativeAreaRepository, type AdministrativeAreaRecord } from "@/repositories/administrative-areas";
import type { AdministrativeAreaListQuery } from "@/schema/administrative-areas";
import type { AuthContext } from "@/services/authorization";
import { Errors } from "@/errors/error-factory";

export type AdministrativeAreaNode = AdministrativeAreaRecord & {
  children?: AdministrativeAreaNode[];
};

type PublicAdministrativeAreaNode = {
  adcode: string;
  name: string;
  level: AdministrativeAreaRecord["level"];
  parent_adcode: string | null;
  full_name: string;
  children?: PublicAdministrativeAreaNode[];
};

const PUBLIC_CACHE_SECONDS = 24 * 60 * 60;

class AdministrativeAreaService {
  async list(query: AdministrativeAreaListQuery, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const list = await administrativeAreaRepository.list(query);
    return {
      list: query.tree ? this.toTree(list) : list,
    };
  }

  async listPublic(query: AdministrativeAreaListQuery) {
    const list = await administrativeAreaRepository.list(query);
    const publicList = list.map((item) => this.toPublicNode(item));
    return {
      list: query.tree ? this.toPublicTree(publicList) : publicList,
      version: this.resolveVersion(list),
      expires_in: PUBLIC_CACHE_SECONDS,
    };
  }

  private toTree(rows: AdministrativeAreaRecord[]) {
    const nodes = new Map<string, AdministrativeAreaNode>();
    for (const row of rows) {
      nodes.set(row.adcode, { ...row, children: [] });
    }

    const roots: AdministrativeAreaNode[] = [];
    for (const node of nodes.values()) {
      if (node.parent_adcode && nodes.has(node.parent_adcode)) {
        nodes.get(node.parent_adcode)?.children?.push(node);
      } else {
        roots.push(node);
      }
    }

    const prune = (items: AdministrativeAreaNode[]) => {
      for (const item of items) {
        if (item.children?.length) {
          prune(item.children);
        } else {
          delete item.children;
        }
      }
    };
    prune(roots);
    return roots;
  }

  private toPublicNode(row: AdministrativeAreaRecord): PublicAdministrativeAreaNode {
    return {
      adcode: row.adcode,
      name: row.name,
      level: row.level,
      parent_adcode: row.parent_adcode,
      full_name: row.full_name,
    };
  }

  private toPublicTree(rows: PublicAdministrativeAreaNode[]) {
    const nodes = new Map<string, PublicAdministrativeAreaNode>();
    for (const row of rows) {
      nodes.set(row.adcode, { ...row, children: [] });
    }

    const roots: PublicAdministrativeAreaNode[] = [];
    for (const node of nodes.values()) {
      if (node.parent_adcode && nodes.has(node.parent_adcode)) {
        nodes.get(node.parent_adcode)?.children?.push(node);
      } else {
        roots.push(node);
      }
    }

    this.pruneEmptyChildren(roots);
    return roots;
  }

  private pruneEmptyChildren(items: PublicAdministrativeAreaNode[]) {
    for (const item of items) {
      if (item.children?.length) {
        this.pruneEmptyChildren(item.children);
      } else {
        delete item.children;
      }
    }
  }

  private resolveVersion(rows: AdministrativeAreaRecord[]) {
    const sourceVersion = rows.find((item) => item.source_version)?.source_version;
    if (sourceVersion) return sourceVersion;

    const latestSyncedAt = rows
      .map((item) => item.synced_at)
      .filter(Boolean)
      .sort()
      .at(-1);
    return latestSyncedAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  }

  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
  }
}

export const administrativeAreaService = new AdministrativeAreaService();
