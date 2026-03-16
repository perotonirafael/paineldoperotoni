
-- 1. Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'analista', 'consulta');

-- 2. Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  full_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. User roles table (security best practice - roles in separate table)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- 4. Data batches table
CREATE TABLE public.data_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_name TEXT,
  status TEXT NOT NULL DEFAULT 'processing',
  created_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  file_count INTEGER DEFAULT 0,
  snapshot_path TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Validation trigger for batch status (instead of CHECK constraint)
CREATE OR REPLACE FUNCTION public.validate_batch_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('processing', 'published', 'failed', 'archived') THEN
    RAISE EXCEPTION 'Invalid batch status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_batch_status
  BEFORE INSERT OR UPDATE ON public.data_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_batch_status();

-- 5. Uploaded files table
CREATE TABLE public.uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES public.data_batches(id) ON DELETE CASCADE,
  file_type TEXT,
  original_name TEXT,
  storage_path TEXT,
  mime_type TEXT,
  file_size BIGINT,
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Security definer functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT role::text FROM public.user_roles
  WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_active_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    (SELECT is_active FROM public.profiles WHERE id = _user_id),
    false
  )
$$;

-- 7. Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;

-- 8. Profiles RLS
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "profiles_insert_admin" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 9. User roles RLS
CREATE POLICY "user_roles_select_own_or_admin" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_insert_admin" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_update_admin" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_delete_admin" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 10. Data batches RLS
CREATE POLICY "batches_manage_admin_analyst" ON public.data_batches
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analista')
  );

CREATE POLICY "batches_select_published" ON public.data_batches
  FOR SELECT TO authenticated
  USING (status = 'published');

-- 11. Uploaded files RLS
CREATE POLICY "files_manage_admin_analyst" ON public.uploaded_files
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analista')
  );

-- 12. Storage bucket for data files
INSERT INTO storage.buckets (id, name, public) VALUES ('data-files', 'data-files', false);

-- 13. Storage RLS
CREATE POLICY "data_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'data-files' AND
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analista'))
  );

CREATE POLICY "data_files_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'data-files');

CREATE POLICY "data_files_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'data-files' AND
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analista'))
  );

CREATE POLICY "data_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'data-files' AND
    public.has_role(auth.uid(), 'admin')
  );
