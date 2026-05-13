INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  (
    'social_video_transcription.create',
    '发起短视频转文本',
    'social_video',
    'transcription',
    'create',
    '允许员工在租户上下文中发起短视频链接转文本任务',
    'active'
  ),
  (
    'social_video_transcription.manage',
    '管理短视频转写与脚本',
    'social_video',
    'transcription',
    'manage',
    '管理短视频转写任务和脚本生成结果',
    'active'
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles
JOIN public.permissions
  ON permissions.code IN (
    'social_video_transcription.create',
    'social_video_transcription.manage'
  )
WHERE roles.code = 'system_admin'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;
