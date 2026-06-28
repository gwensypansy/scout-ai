GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitors TO authenticated;
GRANT ALL ON public.competitors TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sources TO authenticated;
GRANT ALL ON public.sources TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attributes TO authenticated;
GRANT ALL ON public.attributes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.extracted_values TO authenticated;
GRANT ALL ON public.extracted_values TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.extracted_value_sources TO authenticated;
GRANT ALL ON public.extracted_value_sources TO service_role;