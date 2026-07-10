import {
  listTemplates,
  getTemplateById,
  updateTemplate,
  getActiveTemplateByStage,
  getActiveTemplate,
  listTemplateSections,
  upsertTemplateSections,
  deactivateTemplateSections,
  listTemplateItems,
  upsertTemplateItems,
  deactivateTemplateItems,
} from "./legacy/templates";
import {
  getProject,
  listProjectsByIds,
  findPrimaryConstructionManager,
  hasOpenAcceptance,
  listLatestAcceptancesByStages,
} from "./legacy/projects";
import {
  createAcceptance,
  createItems,
  listAcceptances,
  listProjectAcceptanceDetailGraphs,
  getAcceptanceById,
  getAcceptanceDetailGraph,
  updateAcceptance,
  deleteAcceptance,
} from "./legacy/acceptances";
import { getAcceptanceDetailGraphDirect } from "./legacy/acceptance-detail-direct";
import { listCustomerProjectAcceptanceSummaries } from "./legacy/customer-summary-rpc";
import {
  listItems,
  listItemsByAcceptanceIds,
  listActions,
  listActionsByAcceptanceIds,
  updateItem,
  createAction,
} from "./legacy/items-actions";
import {
  listEmployees,
  listEmployeesByTenant,
  listCustomers,
  getTenantById,
} from "./legacy/people";
import { getDirectPostgresSql } from "@/utils/postgres-direct";
import { SupabaseDB } from "@/utils/supabase";

export type {
  ProjectAcceptanceActionRow,
  ProjectAcceptanceCustomerRow,
  ProjectAcceptanceEmployeeRow,
  ProjectAcceptanceItemRow,
  ProjectAcceptanceProjectRow,
  ProjectAcceptanceRow,
  ProjectAcceptanceTemplateItemRow,
  ProjectAcceptanceTemplateItemWriteRow,
  ProjectAcceptanceTemplateRow,
  ProjectAcceptanceTemplateSectionRow,
  ProjectAcceptanceTemplateSectionWriteRow,
} from "./legacy/shared";
export type { ProjectAcceptanceDetailGraphRow } from "./legacy/acceptances";

type ProjectAcceptanceRepositoryDependencies = {
  getDirectSql?: typeof getDirectPostgresSql;
  getAdminClient?: typeof SupabaseDB.getAdminClient;
};

export class ProjectAcceptanceRepository {
  private acceptanceDetailListDirectSqlUnavailable = false;
  private acceptanceDetailDirectSqlUnavailable = false;
  private customerAcceptanceSummaryDirectSqlUnavailable = false;
  private readonly getDirectSql: typeof getDirectPostgresSql;
  private readonly getAdminClient: typeof SupabaseDB.getAdminClient;

  constructor(dependencies: ProjectAcceptanceRepositoryDependencies = {}) {
    this.getDirectSql = dependencies.getDirectSql ?? getDirectPostgresSql;
    this.getAdminClient = dependencies.getAdminClient ?? (() => SupabaseDB.getAdminClient());
  }

  listTemplates = listTemplates;
  getTemplateById = getTemplateById;
  updateTemplate = updateTemplate;
  getActiveTemplateByStage = getActiveTemplateByStage;
  getActiveTemplate = getActiveTemplate;
  listTemplateSections = listTemplateSections;
  upsertTemplateSections = upsertTemplateSections;
  deactivateTemplateSections = deactivateTemplateSections;
  listTemplateItems = listTemplateItems;
  upsertTemplateItems = upsertTemplateItems;
  deactivateTemplateItems = deactivateTemplateItems;
  getProject = getProject;
  listProjectsByIds = listProjectsByIds;
  findPrimaryConstructionManager = findPrimaryConstructionManager;
  hasOpenAcceptance = hasOpenAcceptance;
  listLatestAcceptancesByStages = listLatestAcceptancesByStages;
  createAcceptance = createAcceptance;
  createItems = createItems;
  listAcceptances = listAcceptances;
  listProjectAcceptanceDetailGraphs = listProjectAcceptanceDetailGraphs;
  listCustomerProjectAcceptanceSummaries = listCustomerProjectAcceptanceSummaries;
  getAcceptanceById = getAcceptanceById;
  getAcceptanceDetailGraph = getAcceptanceDetailGraph;
  getAcceptanceDetailGraphDirect = getAcceptanceDetailGraphDirect;
  listItems = listItems;
  listItemsByAcceptanceIds = listItemsByAcceptanceIds;
  listActions = listActions;
  listActionsByAcceptanceIds = listActionsByAcceptanceIds;
  updateAcceptance = updateAcceptance;
  deleteAcceptance = deleteAcceptance;
  updateItem = updateItem;
  createAction = createAction;
  listEmployees = listEmployees;
  listEmployeesByTenant = listEmployeesByTenant;
  listCustomers = listCustomers;
  getTenantById = getTenantById;
}

export const projectAcceptanceRepository = new ProjectAcceptanceRepository();
