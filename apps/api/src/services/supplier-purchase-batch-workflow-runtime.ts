import type { SupplierPurchaseBatchWorkflowSubmitResult } from
  "@/repositories/supplier-purchase-batch-workflow";
import {
  supplierPurchaseBatchesRepository,
  type BatchCommandContext,
} from
  "@/repositories/supplier-purchase-batches";
import {
  tenantSuppliersRepository,
  type TenantSupplierSettings,
} from "@/repositories/tenant-suppliers";
import { isPurchaseBatchWorkflowEnabled } from
  "@/services/supplier-rollout-settings";

type SettingsRepositoryPort = {
  getSettings(tenantId: string): Promise<TenantSupplierSettings | null>;
};

type WorkflowRepositoryPort = {
  submitWithWorkflow(
    input: BatchCommandContext,
  ): Promise<SupplierPurchaseBatchWorkflowSubmitResult>;
};

export type SupplierPurchaseBatchWorkflowRuntimeDependencies = {
  settingsRepository?: SettingsRepositoryPort;
  workflowRepository?: WorkflowRepositoryPort;
};

export class SupplierPurchaseBatchWorkflowRuntime {
  private readonly settingsRepository: SettingsRepositoryPort;
  private readonly workflowRepository: WorkflowRepositoryPort;

  constructor(
    dependencies: SupplierPurchaseBatchWorkflowRuntimeDependencies = {},
  ) {
    this.settingsRepository = dependencies.settingsRepository ??
      tenantSuppliersRepository;
    this.workflowRepository = dependencies.workflowRepository ??
      supplierPurchaseBatchesRepository;
  }

  async isEnabled(tenantId: string): Promise<boolean> {
    const settings = await this.settingsRepository.getSettings(tenantId);
    return settings ? isPurchaseBatchWorkflowEnabled(settings) : false;
  }

  submit(
    input: BatchCommandContext,
  ): Promise<SupplierPurchaseBatchWorkflowSubmitResult> {
    return this.workflowRepository.submitWithWorkflow(input);
  }
}

export const supplierPurchaseBatchWorkflowRuntime =
  new SupplierPurchaseBatchWorkflowRuntime();
