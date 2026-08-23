-- ============================================================================
-- Миграция 010 — коригиран модел на учебното съдържание
--
-- ЗАЩО Е НУЖНА
-- ------------
-- Съдържанието досега живееше в 12.5 MB JavaScript файл във фронтенда.
-- Последиците бяха три:
--   1) платеното съдържание се сваляше от всеки посетител преди вход —
--      paywall-ът беше само визуален;
--   2) администраторът не можеше да редактира нищо без промяна в кода;
--   3) таблиците в schema.sql не отговаряха на реалната форма на данните:
--        • quiz_questions има фиксирани option_a..option_d и correct_answer
--          CHAR(1) — не поема въпроси с обяснение за всяка опция, ниво и
--          методическа бележка;
--        • cases е моделирана като съдебно решение (legal_question, decision,
--          court, year), а учебните казуси имат съвсем друга структура
--          (тема, ниво, ключови понятия, учебни цели, въпроси, насоки,
--          примерен отговор, извод, чести грешки);
--        • conspects е един TEXT на предмет, а конспектите са структурирани
--          документи на тема;
--        • subjects няма code/slug, по който фронтендът да ги адресира.
--
-- ПОДХОД
-- ------
-- Миграцията е адитивна. Старите таблици не се пипат — новите носят суфикс,
-- когато името е заето. Пренасянето е с scripts/import-content.ts.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------- предмети

ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS code         VARCHAR(30),
  ADD COLUMN IF NOT EXISTS slug         VARCHAR(120),
  ADD COLUMN IF NOT EXISTS tagline      TEXT,
  ADD COLUMN IF NOT EXISTS study_year   SMALLINT,
  ADD COLUMN IF NOT EXISTS is_featured  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE,
  -- брой безплатни теми в началото на предмета (витрина преди покупка)
  ADD COLUMN IF NOT EXISTS free_topic_limit SMALLINT NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_subjects_code ON subjects (code) WHERE code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_subjects_slug ON subjects (slug) WHERE slug IS NOT NULL;

-- Предметът се продава като пакет със същия код.
-- FK не се налага твърдо, за да не блокира импорт преди зареждане на пакетите.
COMMENT ON COLUMN subjects.code IS 'Съвпада с packages.id — определя правото на достъп';

-- -------------------------------------------------------------------- теми

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS slug         VARCHAR(120),
  ADD COLUMN IF NOT EXISTS position     INT,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_topics_subject_slug     ON topics (subject_id, slug) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_topics_subject_position ON topics (subject_id, position) WHERE position IS NOT NULL;
CREATE INDEX        IF NOT EXISTS ix_topics_subject          ON topics (subject_id, position);

-- --------------------------------------------------------------- конспекти
-- Един структуриран документ на тема. Секциите и блоковете стоят в JSONB,
-- защото са документно дърво — нормализирането им в отделни таблици само
-- усложнява редакцията от админ панела без да носи полза при заявките.

CREATE TABLE IF NOT EXISTS topic_conspects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id    UUID NOT NULL UNIQUE REFERENCES topics(id) ON DELETE CASCADE,
  heading     TEXT,
  sections    JSONB NOT NULL DEFAULT '[]'::jsonb,
  refs        JSONB NOT NULL DEFAULT '[]'::jsonb,
  word_count  INT GENERATED ALWAYS AS (
                length(regexp_replace(sections::text, '[^[:alnum:]]+', ' ', 'g'))
              ) STORED,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT topic_conspects_sections_is_array CHECK (jsonb_typeof(sections) = 'array')
);

-- ------------------------------------------------------------- флашкарти
-- Таблицата съществува; допълва се с подредба и състояние на публикуване.

ALTER TABLE flashcards
  ADD COLUMN IF NOT EXISTS position     INT,
  ADD COLUMN IF NOT EXISTS topic_label  TEXT,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS ix_flashcards_topic ON flashcards (topic_id, position);

-- ------------------------------------------------------------ тестови въпроси
-- Платформата има ДВА типа упражнения и схемата трябва да поеме и двата:
--
--   'mcq'  — въпрос с избор. Броят опции е променлив (не фиксирани четири
--            колони като в старата quiz_questions), верният отговор е индекс,
--            а обяснението за всяка отделна опция стои в JSONB — точно както
--            са подготвени рецензираните партиди.
--
--   'fill' — свободен отговор (982-те упражнения по латински). Проверява се
--            срещу списък от приети формулировки, не срещу индекс.
--
-- Ограниченията са условни по тип, за да не може да се запише полу-попълнен
-- ред от нито един от двата вида.

CREATE TABLE IF NOT EXISTS quiz_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id    UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic_id      UUID REFERENCES topics(id) ON DELETE CASCADE,
  position      INT NOT NULL DEFAULT 0,
  kind          VARCHAR(10) NOT NULL DEFAULT 'mcq',
  question      TEXT NOT NULL,
  -- mcq
  options       JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_index SMALLINT,
  -- fill
  answer        TEXT,
  accept        JSONB NOT NULL DEFAULT '[]'::jsonb,  -- приети формулировки
  direction     VARCHAR(20),                          -- lat2bg | bg2lat
  -- общи
  explanation   TEXT,
  level         VARCHAR(20),              -- базово | средно | високо
  theme         TEXT,
  option_explanations JSONB,              -- { "А": "защо е грешен", ... }
  method_note   TEXT,
  is_published  BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT quiz_items_kind_valid CHECK (kind IN ('mcq', 'fill')),
  CONSTRAINT quiz_items_options_is_array CHECK (jsonb_typeof(options) = 'array'),
  CONSTRAINT quiz_items_accept_is_array  CHECK (jsonb_typeof(accept) = 'array'),

  -- въпрос с избор: поне две опции и валиден индекс на верния отговор
  CONSTRAINT quiz_items_mcq_shape CHECK (
    kind <> 'mcq' OR (
      jsonb_array_length(options) >= 2
      AND correct_index IS NOT NULL
      AND correct_index >= 0
      AND correct_index < jsonb_array_length(options)
    )
  ),

  -- свободен отговор: задължителен отговор и поне една приета формулировка
  CONSTRAINT quiz_items_fill_shape CHECK (
    kind <> 'fill' OR (
      answer IS NOT NULL
      AND length(btrim(answer)) > 0
      AND jsonb_array_length(accept) >= 1
    )
  ),

  CONSTRAINT quiz_items_level_valid CHECK (
    level IS NULL OR level IN ('базово', 'средно', 'високо')
  )
);

CREATE INDEX IF NOT EXISTS ix_quiz_items_subject ON quiz_items (subject_id, position);
CREATE INDEX IF NOT EXISTS ix_quiz_items_topic   ON quiz_items (topic_id, position);

-- ------------------------------------------------------------------ казуси
-- Учебен казус, не съдебно решение.

CREATE TABLE IF NOT EXISTS study_cases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id   UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic_id     UUID REFERENCES topics(id) ON DELETE CASCADE,
  position     INT NOT NULL DEFAULT 0,
  number       VARCHAR(20),
  title        TEXT NOT NULL,
  theme        TEXT,
  level        VARCHAR(20),
  concepts     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ключови понятия
  goals        JSONB NOT NULL DEFAULT '[]'::jsonb,  -- учебни цели
  facts        TEXT NOT NULL,
  questions    JSONB NOT NULL DEFAULT '[]'::jsonb,
  hints        JSONB NOT NULL DEFAULT '[]'::jsonb,  -- насоки за решаване
  solution     TEXT,                                 -- примерен отговор
  conclusion   TEXT,                                 -- кратък извод
  mistakes     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- чести грешки
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT study_cases_level_valid CHECK (
    level IS NULL OR level IN ('базово', 'средно', 'високо')
  )
);

CREATE INDEX IF NOT EXISTS ix_study_cases_subject ON study_cases (subject_id, position);
CREATE INDEX IF NOT EXISTS ix_study_cases_topic   ON study_cases (topic_id, position);

-- ------------------------------------------------------- история на редакциите
-- Всяка промяна от админ панела се записва — кой, какво и кога.

CREATE TABLE IF NOT EXISTS content_revisions (
  id           BIGSERIAL PRIMARY KEY,
  entity_type  VARCHAR(30) NOT NULL,   -- conspect | quiz_item | study_case | flashcard | topic | subject
  entity_id    UUID NOT NULL,
  action       VARCHAR(10) NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  before_data  JSONB,
  after_data   JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_content_revisions_entity ON content_revisions (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_content_revisions_actor  ON content_revisions (actor_id, created_at DESC);

-- --------------------------------------------------------- право на достъп
-- Единствено място, което решава дали потребител вижда даден предмет.
-- Ползва се и от API-то, и от админ справките — за да няма две различни
-- дефиниции на „платен достъп".

CREATE OR REPLACE FUNCTION user_has_subject(p_user_id UUID, p_subject_code VARCHAR)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM purchases p
      JOIN packages  k ON k.id = p.package_id
     WHERE p.user_id = p_user_id
       AND p.status  = 'completed'
       AND (p.package_id = p_subject_code OR k.is_bundle = TRUE)
  );
$$;

COMMENT ON FUNCTION user_has_subject IS
  'Единствената дефиниция за платен достъп: собствен пакет или комплексен пакет.';

-- ------------------------------------------------------------ updated_at

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['topic_conspects', 'quiz_items', 'study_cases'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_touch ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_touch BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t, t);
  END LOOP;
END $$;

-- ------------------------------------------------------------ пълнотекстово
-- Търсене на български без външни разширения.

CREATE INDEX IF NOT EXISTS ix_quiz_items_search
  ON quiz_items USING gin (to_tsvector('simple', question));

CREATE INDEX IF NOT EXISTS ix_study_cases_search
  ON study_cases USING gin (to_tsvector('simple', title || ' ' || facts));

CREATE INDEX IF NOT EXISTS ix_flashcards_search
  ON flashcards USING gin (to_tsvector('simple', question || ' ' || answer));

COMMIT;
