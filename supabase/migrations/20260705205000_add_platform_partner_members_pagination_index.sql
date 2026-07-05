CREATE INDEX IF NOT EXISTS platform_partner_members_partner_created_idx
  ON public.platform_partner_members(partner_id, created_at DESC);
