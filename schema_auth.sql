-- ============================================================
-- Добавление таблицы librarians и seed учётной записи
-- ============================================================

-- Таблица библиотекарей
CREATE TABLE IF NOT EXISTS librarians (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'librarian',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_librarians_username ON librarians(username);
CREATE INDEX IF NOT EXISTS idx_librarians_role ON librarians(role);

-- RLS
ALTER TABLE librarians ENABLE ROW LEVEL SECURITY;

-- Библиотекарь может читать только себя и записывать только себя
DROP POLICY IF EXISTS "librarians_read_own" ON librarians;
CREATE POLICY "librarians_read_own" ON librarians
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "librarians_write_own" ON librarians;
CREATE POLICY "librarians_write_own" ON librarians
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Service role — полный доступ
DROP POLICY IF EXISTS "service_role_full_librarians" ON librarians;
CREATE POLICY "service_role_full_librarians" ON librarians
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Триггер для updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS librarians_updated_at ON librarians;
CREATE TRIGGER librarians_updated_at
  BEFORE UPDATE ON librarians
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
