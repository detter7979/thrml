-- Atomic increment of referral_credit_cents on profiles (can be negative when spending wallet credit)
CREATE OR REPLACE FUNCTION increment_referral_credit(
  p_user_id uuid,
  p_amount_cents integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE profiles
  SET referral_credit_cents = COALESCE(referral_credit_cents, 0) + p_amount_cents
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_referral_credit(uuid, integer) TO service_role;
