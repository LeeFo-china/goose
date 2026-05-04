CREATE INDEX IF NOT EXISTS idx_marketing_leads_page_phone_created_at
ON public.marketing_leads(page_id, phone, created_at DESC)
WHERE phone IS NOT NULL;
