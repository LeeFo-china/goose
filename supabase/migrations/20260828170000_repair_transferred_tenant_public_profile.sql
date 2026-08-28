-- Restore tenant-owned public profile data omitted by the production transfer.
--
-- The source transfer excluded these records as environment state even though
-- they are durable tenant business data required by Douyin release readiness.
-- The source reviewer is a development-only platform employee, so the review
-- attribution is intentionally cleared while its decision metadata is kept.
--
-- Rollback: delete the service area and profile only when their IDs and tenant
-- still match the values inserted below. Do not roll back after tenant edits.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $repair$
DECLARE
  v_tenant_id constant uuid := '3eebca47-961f-4899-b976-a3d3208d326b';
  v_profile_id constant uuid := 'f806292a-c2af-4a27-bbe9-3b8517bb053f';
  v_area_id constant uuid := 'e2638b8a-f2f4-4bbe-a877-2cbdab6ec828';
  v_tenant public.tenants%ROWTYPE;
BEGIN
  SELECT tenant.*
  INTO v_tenant
  FROM public.tenants AS tenant
  WHERE tenant.id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_tenant.name IS DISTINCT FROM '固始晴天装饰工程有限公司'
    OR v_tenant.status IS DISTINCT FROM 'active'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'TRANSFERRED_TENANT_PUBLIC_PROFILE_PRECONDITION_FAILED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_service_provider_profiles AS profile
    WHERE profile.tenant_id = v_tenant_id
  ) THEN
    INSERT INTO public.tenant_service_provider_profiles (
      id,
      tenant_id,
      public_name,
      introduction,
      public_phone,
      address_province,
      address_city,
      address_district,
      address_region_code,
      address,
      address_latitude,
      address_longitude,
      status,
      version,
      submitted_at,
      reviewed_by_employee_id,
      reviewed_at,
      review_remark,
      published_at,
      suspended_at,
      created_at,
      updated_at
    ) VALUES (
      v_profile_id,
      v_tenant_id,
      '固始晴天装饰工程有限公司',
      '固始晴天装饰工程有限公司面向本地家庭装修用户提供设计与施工服务，服务内容覆盖前期咨询、现场量房、方案沟通、预算初算、材料与工艺确认、施工过程管理和完工交付。我们在小程序中展示真实项目实景、施工进度和预算初算入口，帮助用户在提交量房申请前了解服务范围和装修流程。预算结果仅作为前期沟通参考，最终费用以现场测量、材料品牌和施工项目确认为准。',
      '15518591857',
      '河南省',
      '信阳市',
      '固始县',
      '411525',
      '河南省信阳市固始县番城街道北二环路北(凤凰幼儿园西北400米)',
      32.209249,
      115.669837,
      'published',
      5,
      '2026-07-17T13:32:15.365316+00:00'::timestamptz,
      NULL,
      '2026-07-17T13:35:11.768488+00:00'::timestamptz,
      '同意',
      '2026-07-17T13:35:11.768488+00:00'::timestamptz,
      NULL,
      '2026-07-17T05:05:25.487633+00:00'::timestamptz,
      '2026-08-25T07:07:39.170117+00:00'::timestamptz
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_service_areas AS area
    WHERE area.tenant_id = v_tenant_id
      AND area.adcode = '411525'
  ) THEN
    INSERT INTO public.tenant_service_areas (
      id,
      tenant_id,
      province,
      city,
      district,
      adcode,
      center_latitude,
      center_longitude,
      service_radius_km,
      priority,
      status,
      created_at,
      updated_at
    ) VALUES (
      v_area_id,
      v_tenant_id,
      '河南省',
      '信阳市',
      '固始县',
      '411525',
      NULL,
      NULL,
      NULL,
      100,
      'active',
      '2026-06-04T09:12:39.095+00:00'::timestamptz,
      '2026-07-17T13:35:11.768488+00:00'::timestamptz
    );
  END IF;

  PERFORM 1
  FROM public.tenant_service_provider_profiles AS profile
  WHERE profile.tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'TRANSFERRED_TENANT_PUBLIC_PROFILE_REPAIR_FAILED';
  END IF;

  PERFORM 1
  FROM public.tenant_service_areas AS area
  WHERE area.tenant_id = v_tenant_id
    AND area.adcode = '411525';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'TRANSFERRED_TENANT_PUBLIC_PROFILE_REPAIR_FAILED';
  END IF;
END
$repair$;

COMMIT;
