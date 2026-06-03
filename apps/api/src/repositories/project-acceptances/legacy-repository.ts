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
  getAcceptanceById,
  updateAcceptance,
  deleteAcceptance,
} from "./legacy/acceptances";
import { listCustomerProjectAcceptanceSummaries } from "./legacy/customer-summary-rpc";
import {
  listItems,
  listItemsByAcceptanceIds,
  listActions,
  listActionsByAcceptanceIds,
  updateItem,
  createAction,
} from "./legacy/items-actions";
import { listEmployees, listCustomers, getTenantById } from "./legacy/people";

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

class ProjectAcceptanceRepository {
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
  listCustomerProjectAcceptanceSummaries = listCustomerProjectAcceptanceSummaries;
  getAcceptanceById = getAcceptanceById;
  listItems = listItems;
  listItemsByAcceptanceIds = listItemsByAcceptanceIds;
  listActions = listActions;
  listActionsByAcceptanceIds = listActionsByAcceptanceIds;
  updateAcceptance = updateAcceptance;
  deleteAcceptance = deleteAcceptance;
  updateItem = updateItem;
  createAction = createAction;
  listEmployees = listEmployees;
  listCustomers = listCustomers;
  getTenantById = getTenantById;
}

export const projectAcceptanceRepository = new ProjectAcceptanceRepository();
