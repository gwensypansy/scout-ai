
-- 1. Tighten projects ownership
ALTER TABLE public.projects ALTER COLUMN user_id SET DEFAULT auth.uid();

-- Helper: does the current user own a given project?
CREATE OR REPLACE FUNCTION public.owns_project(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = _project_id AND user_id = auth.uid()
  );
$$;

-- 2. Drop the permissive dev policies
DROP POLICY IF EXISTS "dev open projects" ON public.projects;
DROP POLICY IF EXISTS "dev open competitors" ON public.competitors;
DROP POLICY IF EXISTS "dev open attributes" ON public.attributes;
DROP POLICY IF EXISTS "dev open extracted_values" ON public.extracted_values;
DROP POLICY IF EXISTS "dev open evs" ON public.extracted_value_sources;
DROP POLICY IF EXISTS "dev open sources" ON public.sources;

-- 3. Re-grant to authenticated (anonymous users are also "authenticated" role in Supabase)
REVOKE ALL ON public.projects FROM anon;
REVOKE ALL ON public.competitors FROM anon;
REVOKE ALL ON public.attributes FROM anon;
REVOKE ALL ON public.extracted_values FROM anon;
REVOKE ALL ON public.extracted_value_sources FROM anon;
REVOKE ALL ON public.sources FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attributes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.extracted_values TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.extracted_value_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sources TO authenticated;

-- 4. Scoped policies
-- projects: visible only to owner; also allow claiming rows where user_id IS NULL (one-time bootstrap)
CREATE POLICY "owner select projects" ON public.projects
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "owner insert projects" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "owner update projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "owner delete projects" ON public.projects
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- competitors
CREATE POLICY "owner all competitors" ON public.competitors
  FOR ALL TO authenticated
  USING (public.owns_project(project_id))
  WITH CHECK (public.owns_project(project_id));

-- attributes
CREATE POLICY "owner all attributes" ON public.attributes
  FOR ALL TO authenticated
  USING (public.owns_project(project_id))
  WITH CHECK (public.owns_project(project_id));

-- sources (via competitor -> project)
CREATE POLICY "owner all sources" ON public.sources
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.competitors c WHERE c.id = competitor_id AND public.owns_project(c.project_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.competitors c WHERE c.id = competitor_id AND public.owns_project(c.project_id)));

-- extracted_values (via competitor -> project)
CREATE POLICY "owner all extracted_values" ON public.extracted_values
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.competitors c WHERE c.id = competitor_id AND public.owns_project(c.project_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.competitors c WHERE c.id = competitor_id AND public.owns_project(c.project_id)));

-- extracted_value_sources
CREATE POLICY "owner all evs" ON public.extracted_value_sources
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.extracted_values ev
    JOIN public.competitors c ON c.id = ev.competitor_id
    WHERE ev.id = extracted_value_id AND public.owns_project(c.project_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.extracted_values ev
    JOIN public.competitors c ON c.id = ev.competitor_id
    WHERE ev.id = extracted_value_id AND public.owns_project(c.project_id)
  ));

-- 5. One-shot claim function: assigns any orphan (user_id IS NULL) projects to the caller.
-- After you sign in the first time, the app will call this once. Subsequent testers won't
-- find any unclaimed rows.
CREATE OR REPLACE FUNCTION public.claim_orphan_projects()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.projects SET user_id = uid WHERE user_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_orphan_projects() TO authenticated;
