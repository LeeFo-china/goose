import { administrativeAreaRepository, type AdministrativeAreaRecord } from "@/repositories/administrative-areas";
import type { AdministrativeAreaListQuery } from "@/schema/administrative-areas";
import type { AuthContext } from "@/services/authorization";
import { Errors } from "@/errors/error-factory";

export type AdministrativeAreaNode = AdministrativeAreaRecord & {
  children?: AdministrativeAreaNode[];
};

class AdministrativeAreaService {
  async list(query: AdministrativeAreaListQuery, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const list = await administrativeAreaRepository.list(query);
    return {
      list: query.tree ? this.toTree(list) : list,
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

  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
  }
}

export const administrativeAreaService = new AdministrativeAreaService();
