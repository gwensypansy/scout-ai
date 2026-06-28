
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects, public.competitors, public.sources, public.attributes, public.extracted_values, public.extracted_value_sources TO authenticated;
GRANT ALL ON public.projects, public.competitors, public.sources, public.attributes, public.extracted_values, public.extracted_value_sources TO service_role;
