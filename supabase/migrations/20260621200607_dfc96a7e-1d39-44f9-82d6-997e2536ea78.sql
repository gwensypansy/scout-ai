
ALTER TABLE public.competitors ADD COLUMN IF NOT EXISTS key_insight text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS last_stage1_raw text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS last_stage2_raw text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS last_error text;
