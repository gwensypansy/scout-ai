
-- updated_at trigger helper
CREATE OR REPLACE FUNCTION public.speclens_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- projects
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  name text NOT NULL DEFAULT 'Untitled project',
  feature_description text NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','ready')),
  crawl_depth text NOT NULL DEFAULT 'shallow' CHECK (crawl_depth IN ('seed','shallow','full')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO anon, authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev open projects" ON public.projects FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.speclens_set_updated_at();

-- competitors
CREATE TABLE public.competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX competitors_project_id_idx ON public.competitors(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitors TO anon, authenticated;
GRANT ALL ON public.competitors TO service_role;
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev open competitors" ON public.competitors FOR ALL USING (true) WITH CHECK (true);

-- sources
CREATE TABLE public.sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid NOT NULL REFERENCES public.competitors(id) ON DELETE CASCADE,
  url text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('seed','crawled','web_search','added_manually')),
  fetched_content text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sources_competitor_id_idx ON public.sources(competitor_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sources TO anon, authenticated;
GRANT ALL ON public.sources TO service_role;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev open sources" ON public.sources FOR ALL USING (true) WITH CHECK (true);

-- attributes
CREATE TABLE public.attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  label text NOT NULL,
  description text NULL,
  is_custom boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attributes_project_id_idx ON public.attributes(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attributes TO anon, authenticated;
GRANT ALL ON public.attributes TO service_role;
ALTER TABLE public.attributes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev open attributes" ON public.attributes FOR ALL USING (true) WITH CHECK (true);

-- extracted_values
CREATE TABLE public.extracted_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id uuid NOT NULL REFERENCES public.attributes(id) ON DELETE CASCADE,
  competitor_id uuid NOT NULL REFERENCES public.competitors(id) ON DELETE CASCADE,
  value text NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('high','med','low','manual')),
  extracted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attribute_id, competitor_id)
);
CREATE INDEX extracted_values_attribute_id_idx ON public.extracted_values(attribute_id);
CREATE INDEX extracted_values_competitor_id_idx ON public.extracted_values(competitor_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.extracted_values TO anon, authenticated;
GRANT ALL ON public.extracted_values TO service_role;
ALTER TABLE public.extracted_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev open extracted_values" ON public.extracted_values FOR ALL USING (true) WITH CHECK (true);

-- extracted_value_sources (join)
CREATE TABLE public.extracted_value_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extracted_value_id uuid NOT NULL REFERENCES public.extracted_values(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  UNIQUE (extracted_value_id, source_id)
);
CREATE INDEX evs_extracted_value_idx ON public.extracted_value_sources(extracted_value_id);
CREATE INDEX evs_source_idx ON public.extracted_value_sources(source_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.extracted_value_sources TO anon, authenticated;
GRANT ALL ON public.extracted_value_sources TO service_role;
ALTER TABLE public.extracted_value_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev open evs" ON public.extracted_value_sources FOR ALL USING (true) WITH CHECK (true);
