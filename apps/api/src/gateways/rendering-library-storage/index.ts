import { systemSettingsService } from '@/services/system-settings';
import { RenderingLibraryStorage, loadRenderingStorageConfig } from './client';

export { RenderingLibraryStorage } from './client';
export const renderingLibraryStorage = new RenderingLibraryStorage({
  loadConfig: () => loadRenderingStorageConfig(systemSettingsService),
});
