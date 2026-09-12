import { renderingLibraryStorage } from '@/gateways/rendering-library-storage';
import { tenantRenderingLibraryRepository } from '@/repositories/tenant-rendering-library';
import { accessPolicyService } from '@/services/access-policy';
import { RenderingLibraryFilesService } from './service';

export { RenderingLibraryFilesService } from './service';
export const renderingLibraryFilesService = new RenderingLibraryFilesService({
  repository: tenantRenderingLibraryRepository, storage: renderingLibraryStorage, accessPolicy: accessPolicyService,
});
