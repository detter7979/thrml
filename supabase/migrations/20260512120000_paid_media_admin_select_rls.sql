-- Allow dashboard (authenticated is_admin) to read paid media tables for
-- server components using the SSR Supabase client + Realtime subscriptions.
CREATE POLICY campaigns_select_admin ON public.campaigns
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND COALESCE(p.is_admin, false)
    )
  );

CREATE POLICY ad_sets_select_admin ON public.ad_sets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND COALESCE(p.is_admin, false)
    )
  );

CREATE POLICY ads_select_admin ON public.ads
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND COALESCE(p.is_admin, false)
    )
  );

CREATE POLICY recommendations_select_admin ON public.recommendations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND COALESCE(p.is_admin, false)
    )
  );
