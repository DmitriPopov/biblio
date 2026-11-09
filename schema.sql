-- ============================================================
-- Библиотека — Схема базы данных (Supabase / PostgreSQL)
-- Выполнить этот SQL в Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Таблица книг (издания)
CREATE TABLE IF NOT EXISTS books (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  author VARCHAR(255) NOT NULL,
  class_grade VARCHAR(20),
  isbn VARCHAR(20)
);

-- 2. Таблица экземпляров книг
CREATE TABLE IF NOT EXISTS book_copies (
  id SERIAL PRIMARY KEY,
  book_id INT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  qr_code_text VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'issued', 'lost', 'damaged')),
  acquired_date DATE
);

-- 3. Таблица учеников
CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  class VARCHAR(10) NOT NULL,
  qr_code_text VARCHAR(100) UNIQUE NOT NULL
);

-- 4. Таблица выдач
CREATE TABLE IF NOT EXISTS checkouts (
  id SERIAL PRIMARY KEY,
  copy_id INT NOT NULL REFERENCES book_copies(id) ON DELETE CASCADE,
  student_id INT NOT NULL REFERENCES students(id),
  issued_at TIMESTAMP NOT NULL DEFAULT NOW(),
  returned_at TIMESTAMP
);

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_book_copies_book_id ON book_copies(book_id);
CREATE INDEX IF NOT EXISTS idx_book_copies_status ON book_copies(status);
CREATE INDEX IF NOT EXISTS idx_checkouts_copy_id ON checkouts(copy_id);
CREATE INDEX IF NOT EXISTS idx_checkouts_student_id ON checkouts(student_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class);

-- Включить RLS (Row Level Security)
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkouts ENABLE ROW LEVEL SECURITY;

-- Полные права для service role (используется серверным приложением)
DROP POLICY IF EXISTS "service_role_full_books" ON books;
CREATE POLICY "service_role_full_books" ON books
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_full_book_copies" ON book_copies;
CREATE POLICY "service_role_full_book_copies" ON book_copies
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_full_students" ON students;
CREATE POLICY "service_role_full_students" ON students
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_full_checkouts" ON checkouts;
CREATE POLICY "service_role_full_checkouts" ON checkouts
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Права анонимного доступа (для веб-приложения)
DROP POLICY IF EXISTS "anon_read_books" ON books;
CREATE POLICY "anon_read_books" ON books
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_read_book_copies" ON book_copies;
CREATE POLICY "anon_read_book_copies" ON book_copies
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_read_students" ON students;
CREATE POLICY "anon_read_students" ON students
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_read_checkouts" ON checkouts;
CREATE POLICY "anon_read_checkouts" ON checkouts
  FOR SELECT USING (true);

-- Права на запись для service role (серверное приложение управляет данными)
DROP POLICY IF EXISTS "service_role_write_books" ON books;
CREATE POLICY "service_role_write_books" ON books
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_write_books_upd" ON books
  FOR UPDATE USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_write_books_del" ON books
  FOR DELETE USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_write_book_copies" ON book_copies;
CREATE POLICY "service_role_write_book_copies" ON book_copies
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_write_book_copies_upd" ON book_copies
  FOR UPDATE USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_write_book_copies_del" ON book_copies
  FOR DELETE USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_write_students" ON students;
CREATE POLICY "service_role_write_students" ON students
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_write_students_upd" ON students
  FOR UPDATE USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_write_students_del" ON students
  FOR DELETE USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_write_checkouts" ON checkouts;
CREATE POLICY "service_role_write_checkouts" ON checkouts
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_write_checkouts_upd" ON checkouts
  FOR UPDATE USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_write_checkouts_del" ON checkouts
  FOR DELETE USING (auth.role() = 'service_role');
