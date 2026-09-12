import { renderingLibraryStorage } from '@/gateways/rendering-library-storage';
import { tenantRenderingLibraryRepository } from '@/repositories/tenant-rendering-library';
import { tenantRenderingPublicationRepository } from '@/repositories/tenant-rendering-publication';
import { accessPolicyService } from '@/services/access-policy';
import { TenantRenderingPublicationService } from './service';

export { TenantRenderingPublicationService } from './service';
export const tenantRenderingPublicationService = new TenantRenderingPublicationService({
  repository: tenantRenderingLibraryRepository,
  publicationRepository: tenantRenderingPublicationRepository,
  storage: renderingLibraryStorage,
  accessPolicy: accessPolicyService,
});
