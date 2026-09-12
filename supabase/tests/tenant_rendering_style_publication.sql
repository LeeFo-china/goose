-- 仅在 Task 10 明确配置的隔离测试库执行；不读取或改动客户素材，不请求对象存储。
-- 同版本竞争按串行可观察结果验证；真实双连接锁等待/并发执行另在隔离 smoke 中验证。
-- 所有随机测试租户、员工和文件都位于本事务，最终 ROLLBACK。
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  v_table oid;
  v_role text;
  v_privilege text;
  v_function regprocedure;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['public.tenant_rendering_style_publish_commands'::regclass,
    'public.tenant_rendering_style_publish_command_keys'::regclass] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = v_table AND relrowsecurity)
      OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = v_table) THEN
      RAISE EXCEPTION '发布命令及键映射表必须启用 RLS 且无客户端策略';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_class AS relation,
        LATERAL aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) AS privilege
      WHERE relation.oid = v_table AND privilege.grantee = 0
    ) THEN RAISE EXCEPTION 'PUBLIC 不得拥有发布命令或键映射表权限'; END IF;
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
        IF has_table_privilege(v_role, v_table, v_privilege)
          IS DISTINCT FROM (v_role = 'service_role' AND v_privilege = 'SELECT') THEN
          RAISE EXCEPTION '命令或键映射表权限不符: % %', v_role, v_privilege;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    FOREACH v_function IN ARRAY ARRAY[
      'public.begin_tenant_rendering_style_publish(uuid,uuid,integer,uuid,text,uuid)'::regprocedure,
      'public.complete_tenant_rendering_style_publish(uuid,uuid,uuid,text,uuid)'::regprocedure,
      'public.fail_tenant_rendering_style_publish(uuid,uuid,uuid,text)'::regprocedure
    ] LOOP
      IF has_function_privilege(v_role, v_function, 'EXECUTE') IS DISTINCT FROM (v_role = 'service_role') THEN
        RAISE EXCEPTION '发布函数权限不符: % %', v_role, v_function;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_function AND prosecdef
        AND 'search_path=pg_catalog, public' = ANY(proconfig)
        AND proowner NOT IN ((SELECT oid FROM pg_roles WHERE rolname = 'anon'),
          (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'))) THEN
        RAISE EXCEPTION '发布函数 owner、security definer 或 search_path 不符';
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM id FROM public.tenant_rendering_style_publish_commands LIMIT 1;
    RAISE EXCEPTION 'anon 意外获得命令读取权限';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.tenant_rendering_style_publish_commands WHERE false;
    RAISE EXCEPTION 'anon 意外获得命令写入权限';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM id FROM public.tenant_rendering_style_publish_commands LIMIT 1;
    RAISE EXCEPTION 'authenticated 意外获得命令读取权限';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.tenant_rendering_style_publish_commands SET status = 'failed' WHERE false;
    RAISE EXCEPTION 'authenticated 意外获得命令写入权限';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
  v_employee uuid := gen_random_uuid();
  v_other_employee uuid := gen_random_uuid();
  v_style uuid := gen_random_uuid();
  v_conflicting_style uuid := gen_random_uuid();
  v_source uuid := gen_random_uuid();
  v_other_source uuid := gen_random_uuid();
  v_key uuid := gen_random_uuid();
  v_recovered_key uuid := gen_random_uuid();
  v_expired_key uuid := gen_random_uuid();
  v_success_key uuid := gen_random_uuid();
  v_retry_key uuid;
  v_lease uuid := gen_random_uuid();
  v_new_lease uuid := gen_random_uuid();
  v_expiry_lease uuid := gen_random_uuid();
  v_command uuid;
  v_public uuid;
  v_claim jsonb;
  v_result jsonb;
  v_row public.tenant_rendering_styles%ROWTYPE;
  v_url text;
BEGIN
  INSERT INTO public.tenants (id, slug, name, status) VALUES
    (v_tenant, 'rendering-publish-' || v_tenant::text, '素材发布测试租户', 'active'),
    (v_other_tenant, 'rendering-publish-' || v_other_tenant::text, '素材发布隔离测试租户', 'active');
  INSERT INTO public.employees (id, tenant_id, name, status) VALUES
    (v_employee, v_tenant, '素材发布测试员工', 'active'),
    (v_other_employee, v_other_tenant, '其他租户测试员工', 'active');
  INSERT INTO public.platform_file_objects (
    id, tenant_id, owner_type, owner_id, scene, provider, bucket, region, object_key,
    mime_type, size_bytes, width, height, checksum, visibility, status
  ) VALUES
    (v_source, v_tenant, 'tenant', v_tenant, 'rendering_style_source', 'tencent_cos', 'rendering-test-123456', 'ap-guangzhou',
      'private/renovation-styles/' || v_tenant::text || '/' || v_source::text || '.webp',
      'image/webp', 128, 32, 24, repeat('a', 64), 'private', 'active'),
    (v_other_source, v_other_tenant, 'tenant', v_other_tenant, 'rendering_style_source', 'tencent_cos', 'rendering-test-123456', 'ap-guangzhou',
      'private/renovation-styles/' || v_other_tenant::text || '/' || v_other_source::text || '.webp',
      'image/webp', 128, 32, 24, repeat('b', 64), 'private', 'active');
  INSERT INTO public.tenant_rendering_styles (
    id, tenant_id, title, space, style, color_notes, material_notes, source_type, rights_confirmed, file_id
  ) VALUES (v_style, v_tenant, '首次发布标题', 'living_room', 'cream', '米白', '木饰面', 'ai_concept', true, v_source);
  -- 已删除行不占用活动原图唯一键，用于验证幂等键不能转给另一素材。
  INSERT INTO public.tenant_rendering_styles (
    id, tenant_id, title, space, style, source_type, rights_confirmed, file_id, deleted_at
  ) VALUES (v_conflicting_style, v_tenant, '其他素材', 'living_room', 'cream', 'ai_concept', true, v_source, clock_timestamp());

  BEGIN
    UPDATE public.tenant_rendering_styles SET published_title = '不完整快照' WHERE id = v_style;
    RAISE EXCEPTION '不完整快照必须被 CHECK 拒绝';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.tenant_rendering_styles SET file_id = v_other_source WHERE id = v_style;
    RAISE EXCEPTION '跨租户原图必须被复合 FK 拒绝';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  v_result := public.begin_tenant_rendering_style_publish(v_other_tenant, v_style, 1, v_key, repeat('c', 64), v_lease);
  IF v_result IS DISTINCT FROM '{"decision":"not_found"}'::jsonb THEN RAISE EXCEPTION '跨租户素材不应可领取'; END IF;
  v_claim := public.begin_tenant_rendering_style_publish(v_tenant, v_style, 1, v_key, repeat('c', 64), v_lease);
  IF v_claim->>'decision' IS DISTINCT FROM 'claimed' OR (v_claim->>'target_version')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION '首次领取失败';
  END IF;
  v_command := (v_claim->>'command_id')::uuid;
  v_public := (v_claim->>'public_file_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.platform_file_objects
    WHERE id = v_public AND tenant_id = v_tenant AND status = 'migrating' AND visibility = 'public'
      AND scene = 'rendering_style_public' AND public_url IS NULL AND id IS DISTINCT FROM v_source
      AND object_key = 'public/renovation-styles/' || v_tenant::text || '/' || v_style::text || '/2.webp') THEN
    RAISE EXCEPTION '公开文件预留位置或物理隔离不符';
  END IF;
  v_result := public.begin_tenant_rendering_style_publish(v_tenant, v_style, 1, v_key, repeat('c', 64), v_new_lease);
  IF v_result IS DISTINCT FROM '{"decision":"in_progress"}'::jsonb THEN RAISE EXCEPTION '未过期租约不能再次领取'; END IF;
  v_result := public.begin_tenant_rendering_style_publish(v_tenant, v_style, 1, gen_random_uuid(), repeat('c', 64), v_new_lease);
  IF v_result IS DISTINCT FROM '{"decision":"in_progress"}'::jsonb THEN RAISE EXCEPTION '同版本不同键应等待同一命令'; END IF;
  v_result := public.begin_tenant_rendering_style_publish(v_tenant, v_style, 1, v_key, repeat('d', 64), v_new_lease);
  IF v_result IS DISTINCT FROM '{"decision":"idempotency_conflict"}'::jsonb THEN RAISE EXCEPTION '同键不同摘要必须冲突'; END IF;
  IF (SELECT count(*) FROM public.tenant_rendering_style_publish_commands WHERE tenant_id = v_tenant AND style_id = v_style) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '同版本只允许一条命令';
  END IF;
  BEGIN
    UPDATE public.tenant_rendering_style_publish_commands SET public_file_id = v_other_source WHERE id = v_command;
    RAISE EXCEPTION '命令不能关联跨租户文件';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.tenant_rendering_style_publish_command_keys (tenant_id, idempotency_key, command_id)
      VALUES (v_other_tenant, gen_random_uuid(), v_command);
    RAISE EXCEPTION '跨租户键映射必须被复合 FK 拒绝';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  v_result := public.fail_tenant_rendering_style_publish(v_tenant, v_command, v_new_lease, 'copy_failed');
  IF v_result IS DISTINCT FROM '{"decision":"lease_conflict"}'::jsonb THEN RAISE EXCEPTION '错误租约不能标记失败'; END IF;
  v_result := public.fail_tenant_rendering_style_publish(v_tenant, v_command, v_lease, 'raw sdk exception');
  IF v_result IS DISTINCT FROM '{"decision":"invalid_request"}'::jsonb THEN RAISE EXCEPTION '不能保存非枚举异常文本'; END IF;
  v_result := public.fail_tenant_rendering_style_publish(v_tenant, v_command, v_lease, 'copy_failed');
  IF v_result IS DISTINCT FROM '{"decision":"failed"}'::jsonb THEN RAISE EXCEPTION '当前租约应能标记失败'; END IF;
  v_result := public.begin_tenant_rendering_style_publish(v_tenant, v_style, 1, v_recovered_key, repeat('d', 64), v_new_lease);
  IF v_result IS DISTINCT FROM '{"decision":"idempotency_conflict"}'::jsonb THEN RAISE EXCEPTION '新键不能恢复不同摘要的命令'; END IF;
  v_result := public.begin_tenant_rendering_style_publish(v_tenant, v_style, 1, v_recovered_key, repeat('c', 64), v_new_lease);
  IF v_result->>'decision' IS DISTINCT FROM 'claimed' OR v_result->>'command_id' IS DISTINCT FROM v_command::text
    OR v_result->>'public_file_id' IS DISTINCT FROM v_public::text THEN RAISE EXCEPTION '丢失原键后失败重领必须复用原命令和公开文件'; END IF;
  v_result := public.begin_tenant_rendering_style_publish(v_tenant, v_style, 1, v_key, repeat('c', 64), v_lease);
  IF v_result IS DISTINCT FROM '{"decision":"in_progress"}'::jsonb THEN RAISE EXCEPTION '旧键必须识别已被新键重领的租约'; END IF;
  UPDATE public.tenant_rendering_style_publish_commands SET lease_expires_at = clock_timestamp() - interval '1 second' WHERE id = v_command;
  v_result := public.begin_tenant_rendering_style_publish(v_tenant, v_style, 1, v_key, repeat('c', 64), v_new_lease);
  IF v_result IS DISTINCT FROM '{"decision":"lease_conflict"}'::jsonb THEN RAISE EXCEPTION '过期重领必须使用新 token'; END IF;
  v_result := public.begin_tenant_rendering_style_publish(v_tenant, v_style, 1, v_expired_key, repeat('c', 64), v_expiry_lease);
  IF v_result->>'decision' IS DISTINCT FROM 'claimed' OR v_result->>'command_id' IS DISTINCT FROM v_command::text
    OR v_result->>'public_file_id' IS DISTINCT FROM v_public::text THEN
    RAISE EXCEPTION '丢失原键后过期重领必须复用原命令和公开文件';
  END IF;
  -- 使用 CDN 域名证明 SQL 不把 host 限制到 COS 默认域名；gateway 另测配置匹配。
  v_url := 'https://rendering-test.example.invalid/' || (v_claim->'public_location'->>'object_key');
  v_result := public.complete_tenant_rendering_style_publish(v_tenant, v_command, v_new_lease, v_url, v_employee);
  IF v_result IS DISTINCT FROM '{"decision":"lease_conflict"}'::jsonb THEN RAISE EXCEPTION '旧 token 不得完成新租约'; END IF;
  v_result := public.complete_tenant_rendering_style_publish(v_other_tenant, v_command, v_expiry_lease, v_url, v_other_employee);
  IF v_result IS DISTINCT FROM '{"decision":"not_found"}'::jsonb THEN RAISE EXCEPTION '跨租户命令不可完成'; END IF;
  v_result := public.complete_tenant_rendering_style_publish(v_tenant, v_command, v_expiry_lease, v_url, v_other_employee);
  IF v_result IS DISTINCT FROM '{"decision":"not_publishable"}'::jsonb THEN RAISE EXCEPTION '发布人必须属于同租户'; END IF;
  v_result := public.complete_tenant_rendering_style_publish(v_tenant, v_command, v_expiry_lease, replace(v_url, 'https:', 'http:'), v_employee);
  IF v_result IS DISTINCT FROM '{"decision":"not_publishable"}'::jsonb THEN RAISE EXCEPTION 'HTTP 地址不可发布'; END IF;
  v_result := public.complete_tenant_rendering_style_publish(v_tenant, v_command, v_expiry_lease, v_url || '?signature=secret', v_employee);
  IF v_result IS DISTINCT FROM '{"decision":"not_publishable"}'::jsonb THEN RAISE EXCEPTION '签名 URL 不可持久化'; END IF;
  UPDATE public.platform_file_objects SET owner_id = v_other_tenant WHERE id = v_source;
  v_result := public.complete_tenant_rendering_style_publish(v_tenant, v_command, v_expiry_lease, v_url, v_employee);
  IF v_result IS DISTINCT FROM '{"decision":"not_publishable"}'::jsonb THEN RAISE EXCEPTION '完成时必须重查原图归属'; END IF;
  UPDATE public.platform_file_objects SET owner_id = v_tenant WHERE id = v_source;
  UPDATE public.platform_file_objects SET owner_id = v_other_tenant WHERE id = v_public;
  v_result := public.complete_tenant_rendering_style_publish(v_tenant, v_command, v_expiry_lease, v_url, v_employee);
  IF v_result IS DISTINCT FROM '{"decision":"not_publishable"}'::jsonb THEN RAISE EXCEPTION '完成时必须重查公开图归属'; END IF;
  UPDATE public.platform_file_objects SET owner_id = v_tenant WHERE id = v_public;

  v_result := public.complete_tenant_rendering_style_publish(v_tenant, v_command, v_expiry_lease, v_url, v_employee);
  IF v_result IS DISTINCT FROM jsonb_build_object('decision', 'succeeded', 'command_id', v_command, 'result_version', 2) THEN
    RAISE EXCEPTION '完整发布应返回稳定最小结果';
  END IF;
  SELECT * INTO v_row FROM public.tenant_rendering_styles WHERE id = v_style;
  IF v_row.status IS DISTINCT FROM 'published' OR v_row.version IS DISTINCT FROM 2 OR v_row.published_version IS DISTINCT FROM v_row.version
    OR v_row.published_title IS DISTINCT FROM v_row.title OR v_row.published_space IS DISTINCT FROM v_row.space
    OR v_row.published_style IS DISTINCT FROM v_row.style OR v_row.published_color_notes IS DISTINCT FROM v_row.color_notes
    OR v_row.published_material_notes IS DISTINCT FROM v_row.material_notes OR v_row.published_source_type IS DISTINCT FROM v_row.source_type
    OR v_row.published_file_id IS DISTINCT FROM v_public OR v_row.published_by_employee_id IS DISTINCT FROM v_employee
    OR v_row.published_at IS NULL THEN RAISE EXCEPTION '发布快照不完整'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_file_objects WHERE id = v_public AND status = 'active'
    AND visibility = 'public' AND public_url = v_url AND created_by_employee_id = v_employee) THEN
    RAISE EXCEPTION '公开文件激活或创建人审计缺失';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_file_objects WHERE id = v_source AND status = 'active'
    AND visibility = 'private' AND public_url IS NULL) THEN RAISE EXCEPTION '发布不能改动原图可见性'; END IF;
  v_result := public.begin_tenant_rendering_style_publish(v_tenant, v_style, 1, v_success_key, repeat('c', 64), gen_random_uuid());
  IF v_result IS DISTINCT FROM jsonb_build_object('decision', 'succeeded', 'command_id', v_command, 'result_version', 2) THEN
    RAISE EXCEPTION '成功版本使用新键必须返回首次结果';
  END IF;
  FOREACH v_retry_key IN ARRAY ARRAY[v_key, v_recovered_key, v_expired_key, v_success_key] LOOP
    v_result := public.begin_tenant_rendering_style_publish(v_tenant, v_style, 1, v_retry_key, repeat('c', 64), gen_random_uuid());
    IF v_result IS DISTINCT FROM jsonb_build_object('decision', 'succeeded', 'command_id', v_command, 'result_version', 2) THEN
      RAISE EXCEPTION '旧键重试仍返回同一命令';
    END IF;
    v_result := public.begin_tenant_rendering_style_publish(v_tenant, v_style, 2, v_retry_key, repeat('c', 64), gen_random_uuid());
    IF v_result IS DISTINCT FROM '{"decision":"idempotency_conflict"}'::jsonb THEN RAISE EXCEPTION '已接纳键不能用于其他版本'; END IF;
    v_result := public.begin_tenant_rendering_style_publish(v_tenant, v_conflicting_style, 1, v_retry_key, repeat('c', 64), gen_random_uuid());
    IF v_result IS DISTINCT FROM '{"decision":"idempotency_conflict"}'::jsonb THEN RAISE EXCEPTION '已接纳键不能用于其他素材'; END IF;
    v_result := public.begin_tenant_rendering_style_publish(v_tenant, v_style, 1, v_retry_key, repeat('d', 64), gen_random_uuid());
    IF v_result IS DISTINCT FROM '{"decision":"idempotency_conflict"}'::jsonb THEN RAISE EXCEPTION '已接纳键不能用于其他摘要'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.tenant_rendering_style_publish_commands WHERE tenant_id = v_tenant AND style_id = v_style) IS DISTINCT FROM 1
    OR (SELECT count(*) FROM public.platform_file_objects WHERE tenant_id = v_tenant AND scene = 'rendering_style_public') IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '新旧键重放不能产生额外命令或公开文件';
  END IF;
  v_result := public.begin_tenant_rendering_style_publish(v_tenant, v_style, 1, v_key, repeat('d', 64), gen_random_uuid());
  IF v_result IS DISTINCT FROM '{"decision":"idempotency_conflict"}'::jsonb THEN RAISE EXCEPTION '成功命令也必须验证请求摘要'; END IF;
  UPDATE public.tenant_rendering_styles SET title = '仅修改草稿资料', version = version + 1 WHERE id = v_style;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_rendering_styles WHERE id = v_style AND version = 3
    AND published_title = '首次发布标题' AND published_version = 2) THEN RAISE EXCEPTION '编辑不得修改发布快照'; END IF;
  UPDATE public.tenant_rendering_styles SET status = 'hidden', version = version + 1 WHERE id = v_style;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_rendering_styles WHERE id = v_style AND version = 4 AND status = 'hidden'
    AND published_title = '首次发布标题' AND published_file_id = v_public AND published_version = 2) THEN
    RAISE EXCEPTION '隐藏必须保留发布快照';
  END IF;
  v_result := public.complete_tenant_rendering_style_publish(v_tenant, v_command, v_expiry_lease, v_url, v_employee);
  IF v_result->>'result_version' IS DISTINCT FROM '2'
    OR (SELECT version FROM public.tenant_rendering_styles WHERE id = v_style) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION '重复 complete 不得增加版本或恢复隐藏';
  END IF;
  BEGIN
    UPDATE public.tenant_rendering_styles SET published_file_id = v_other_source WHERE id = v_style;
    RAISE EXCEPTION '发布快照不能引用跨租户文件';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  v_claim := public.begin_tenant_rendering_style_publish(v_tenant, v_style, 4, gen_random_uuid(), repeat('e', 64), v_lease);
  IF v_claim->>'decision' IS DISTINCT FROM 'claimed' OR v_claim->>'public_file_id' IS NULL
    OR v_claim->>'public_file_id' IS NOT DISTINCT FROM v_public::text THEN
    RAISE EXCEPTION '重新发布必须分配新公开文件';
  END IF;
  -- 模拟租约期间发生编辑/隐藏：旧命令必须稳定冲突且不能影响旧公开快照。
  UPDATE public.tenant_rendering_styles SET version = version + 1 WHERE id = v_style;
  v_result := public.complete_tenant_rendering_style_publish(v_tenant, (v_claim->>'command_id')::uuid, v_lease, v_url, v_employee);
  IF v_result IS DISTINCT FROM '{"decision":"version_conflict"}'::jsonb THEN RAISE EXCEPTION '版本发生变化后不能完成发布'; END IF;
  v_result := public.fail_tenant_rendering_style_publish(v_tenant, (v_claim->>'command_id')::uuid, v_lease, 'version_conflict');
  IF v_result IS DISTINCT FROM '{"decision":"failed"}'::jsonb OR NOT EXISTS (
    SELECT 1 FROM public.tenant_rendering_styles WHERE id = v_style AND status = 'hidden' AND version = 5
      AND published_version = 2 AND published_title = '首次发布标题' AND published_file_id = v_public
  ) THEN RAISE EXCEPTION '失败命令不能改变已有发布快照'; END IF;
END;
$$;

ROLLBACK;
