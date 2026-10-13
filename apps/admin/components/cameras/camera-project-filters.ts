import { isProjectStatus, type ProjectStatus } from '@gooes/domain';
export type CameraProjectFilters = {
  page: number;
  keyword: string;
  binding: 'bound' | 'unbound' | 'all';
  status: ProjectStatus | '';
};
export type CameraProjectSearchParams = {
  camera_page?: string;
  camera_keyword?: string;
  binding?: string;
  project_status?: string;
  tab?: string;
};
export function normalizeCameraProjectFilters(params: CameraProjectSearchParams): CameraProjectFilters {
  const rawPage = Number(params.camera_page || 1);
  return {
    page: Number.isFinite(rawPage) ? Math.min(Math.max(Math.floor(rawPage), 1), 1000000) : 1,
    keyword: params.camera_keyword?.trim() || '',
    binding: params.binding === 'all' || params.binding === 'unbound' ? params.binding : 'bound',
    status: isProjectStatus(params.project_status) ? params.project_status : '',
  };
}
export function buildCameraProjectHref(input: CameraProjectFilters) {
  const params = new URLSearchParams();
  if (input.page > 1) params.set('camera_page', String(input.page));
  if (input.keyword) params.set('camera_keyword', input.keyword);
  if (input.binding !== 'bound') params.set('binding', input.binding);
  if (input.status) params.set('project_status', input.status);
  return `/cameras${params.size ? `?${params.toString()}` : ''}`;
}
