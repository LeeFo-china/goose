-- Harden service-role-only tables created after the public direct-access baseline.
--
-- All application access to these tables goes through Fastify repositories using
-- SupabaseDB.getAdminClient(). service_role has BYPASSRLS; anon/authenticated do
-- not need direct table access or policies.
--
-- Do not add FORCE ROW LEVEL SECURITY: existing SECURITY DEFINER review/refund
-- functions execute as the table owner and must retain their current behavior.
--
-- Rollback must be a new migration. If an API regression is proven to originate
-- here, disable RLS only on the affected table and restore only the service_role
-- privileges required by its repository. Never grant anon/authenticated access.

BEGIN;

ALTER TABLE public.platform_partner_member_rebind_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_credit_refund_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_partner_member_rebind_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tenant_credit_refund_requests FROM PUBLIC, anon, authenticated;

REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.platform_partner_member_rebind_requests FROM service_role;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.tenant_credit_refund_requests FROM service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_partner_member_rebind_requests TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tenant_credit_refund_requests TO service_role;

COMMIT;
