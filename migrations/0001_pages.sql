-- Pages metadata. The actual content lives in Cloudflare Artifacts (Git).
-- Each wiki page == one Artifacts repo. `current_sha` is the commit currently
-- shown on the wiki; older SHAs can still be rendered via /history.
CREATE TABLE IF NOT EXISTS pages (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  author         TEXT NOT NULL DEFAULT 'anonymous',
  summary        TEXT,
  namespace      TEXT NOT NULL DEFAULT 'wiki',
  repo_name      TEXT NOT NULL,
  remote         TEXT NOT NULL,
  current_sha    TEXT NOT NULL,
  forked_from    TEXT,                -- slug of the original page, if this is a fork
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pages_updated_at ON pages(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pages_forked_from ON pages(forked_from);
