SELECT 'uploads='||count(*) FROM public.project_log_comment_uploads WHERE auth_user_id='00000000-0000-4000-8000-000000700001';
SELECT 'files='||count(*) FROM public.platform_file_objects WHERE created_by_auth_user_id='00000000-0000-4000-8000-000000700001';
SELECT 'orphans='||count(*) FROM public.platform_file_objects f LEFT JOIN public.project_log_comment_uploads u ON u.file_id=f.id WHERE f.created_by_auth_user_id='00000000-0000-4000-8000-000000700001' AND u.file_id IS NULL;
SELECT 'rejected_file='||count(*) FROM public.platform_file_objects WHERE id='00000000-0000-4000-8000-000000710061';
SELECT 'rejected_upload='||count(*) FROM public.project_log_comment_uploads WHERE file_id='00000000-0000-4000-8000-000000710061';
SELECT 'paired='||count(*) FROM public.platform_file_objects f JOIN public.project_log_comment_uploads u ON u.file_id=f.id WHERE f.created_by_auth_user_id='00000000-0000-4000-8000-000000700001' AND u.status='uploading' AND f.visibility='private' AND f.public_url IS NULL AND u.upload_expires_at=u.created_at+interval '10 minutes';
