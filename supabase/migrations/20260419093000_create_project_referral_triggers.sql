CREATE OR REPLACE FUNCTION public.recalculate_project_referral(
  p_project_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_referral public.project_referrals%ROWTYPE;
  v_commission numeric(12,2);
BEGIN
  SELECT *
  INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '项目不存在';
  END IF;

  IF v_project.status IS DISTINCT FROM 'signed' THEN
    RETURN;
  END IF;

  IF v_project.signed_amount IS NULL OR v_project.signed_amount <= 0 THEN
    RAISE EXCEPTION '项目签约时必须提供有效的 signed_amount';
  END IF;

  SELECT *
  INTO v_referral
  FROM public.project_referrals
  WHERE project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_referral.status = 'paid' OR v_referral.paid_at IS NOT NULL THEN
    RETURN;
  END IF;

  v_commission := ROUND(
    (v_project.signed_amount * v_referral.rate_bps::numeric) / 10000,
    2
  );

  UPDATE public.project_referrals
  SET
    base_amount = v_project.signed_amount,
    commission_amount = v_commission,
    status = 'calculated',
    calculated_at = COALESCE(calculated_at, now()),
    recalculated_at = CASE
      WHEN status = 'calculated' THEN now()
      ELSE recalculated_at
    END,
    updated_at = now()
  WHERE id = v_referral.id;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_project_referral(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_project_referral(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.validate_project_signed_amount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'signed' AND (NEW.signed_amount IS NULL OR NEW.signed_amount <= 0) THEN
    RAISE EXCEPTION '项目签约时必须提供有效的 signed_amount';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'signed'
     AND NEW.signed_amount IS DISTINCT FROM OLD.signed_amount
     AND EXISTS (
       SELECT 1
       FROM public.project_referrals
       WHERE project_id = OLD.id
         AND (status = 'paid' OR paid_at IS NOT NULL)
     ) THEN
    RAISE EXCEPTION '已支付介绍费的项目不允许修改 signed_amount';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_projects_validate_signed_amount ON public.projects;

CREATE TRIGGER tr_projects_validate_signed_amount
  BEFORE INSERT OR UPDATE OF status, signed_amount
  ON public.projects
  FOR EACH ROW
  EXECUTE PROCEDURE public.validate_project_signed_amount();

CREATE OR REPLACE FUNCTION public.sync_project_referral_on_project_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'signed' AND (
    TG_OP = 'INSERT'
    OR OLD.status IS DISTINCT FROM NEW.status
    OR OLD.signed_amount IS DISTINCT FROM NEW.signed_amount
  ) THEN
    PERFORM public.recalculate_project_referral(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_projects_sync_project_referral ON public.projects;

CREATE TRIGGER tr_projects_sync_project_referral
  AFTER INSERT OR UPDATE OF status, signed_amount
  ON public.projects
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_project_referral_on_project_change();

CREATE OR REPLACE FUNCTION public.guard_project_referral_paid_updates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (OLD.status = 'paid' OR OLD.paid_at IS NOT NULL)
     AND (
       NEW.referrer_id IS DISTINCT FROM OLD.referrer_id
       OR NEW.rate_bps IS DISTINCT FROM OLD.rate_bps
     ) THEN
    RAISE EXCEPTION '已支付介绍费的项目不允许修改介绍人或提成比例';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_project_referrals_guard_paid_updates ON public.project_referrals;

CREATE TRIGGER tr_project_referrals_guard_paid_updates
  BEFORE UPDATE OF referrer_id, rate_bps
  ON public.project_referrals
  FOR EACH ROW
  EXECUTE PROCEDURE public.guard_project_referral_paid_updates();

CREATE OR REPLACE FUNCTION public.sync_project_referral_on_referral_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('pending', 'calculated')
     AND NEW.paid_at IS NULL THEN
    PERFORM public.recalculate_project_referral(NEW.project_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_project_referrals_sync_project_referral ON public.project_referrals;

CREATE TRIGGER tr_project_referrals_sync_project_referral
  AFTER INSERT OR UPDATE OF referrer_id, rate_bps
  ON public.project_referrals
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_project_referral_on_referral_change();
