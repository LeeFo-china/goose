-- Bind platform credit recharge orders to platform payment configs.
-- The create-order service stores platform_payment_configs.id in payment_config_id.

DO $$
BEGIN
  IF to_regclass('public.tenant_credit_orders') IS NOT NULL THEN
    ALTER TABLE public.tenant_credit_orders
      DROP CONSTRAINT IF EXISTS tenant_credit_orders_payment_config_id_fkey;

    ALTER TABLE public.tenant_credit_orders
      ADD CONSTRAINT tenant_credit_orders_payment_config_id_fkey
      FOREIGN KEY (payment_config_id)
      REFERENCES public.platform_payment_configs(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

COMMENT ON CONSTRAINT tenant_credit_orders_payment_config_id_fkey
ON public.tenant_credit_orders
IS 'Platform credit recharge orders use platform payment configs.';
