import { tenantRenderingLibraryRepository } from '@/repositories/tenant-rendering-library';
import { accessPolicyService } from '@/services/access-policy';
import { TenantRenderingLibraryService } from './service';

export { TenantRenderingLibraryService } from './service';
export const tenantRenderingLibraryService = new TenantRenderingLibraryService({
  repository: tenantRenderingLibraryRepository,
  accessPolicy: accessPolicyService,
});
