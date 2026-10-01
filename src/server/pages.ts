/**
 * Server functions: the bridge between the React UI and Cloudflare.
 *
 * Data split:
 *   - D1 (`pages` table) holds page metadata + a pointer (repo_name, current_sha)
 *   - Artifacts holds the actual content as a real Git repo per page
 *
 * Every mutation pushes a commit to Artifacts, then updates `current_sha` in D1.
 */

import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { marked } from 'marked'

import {
  createPageRepo,
  forkPageRepo,
  mintToken,
  readHistory,
  readPage,
  tokenSecret,
  updatePage,
  type CommitEntry,
  type PageMeta,
  type RepoRef,
} from './artifactsGit'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PageRow {
  id: number
  slug: string
  title: string
  author: string
  summary: string | null
  namespace: string
  repo_name: string
  remote: string
  current_sha: string
  forked_from: string | null
  created_at: number
  updated_at: number
}

export interface PageView {
  page: PageRow
  html: string
  markdown: string
  sha: string
  isHistorical: boolean
}

export interface AdminPageRow extends PageRow {
  fork_count: number
}

export interface AdminRepoRow {
  id: string
  name: string
  description: string | null
  defaultBranch: string
  createdAt: string
  updatedAt: string
  lastPushAt: string | null
  source: string | null
  readOnly: boolean
  indexedSlug: string | null
}

export interface AdminState {
  pages: AdminPageRow[]
  repos: AdminRepoRow[]
  adminKeyConfigured: boolean
}

export interface DeleteFamilyResult {
  rootSlug: string
  deletedPages: PageRow[]
  deletedRepos: { name: string; deleted: boolean }[]
}

export interface DeleteRepoResult {
  repoName: string
  deleted: boolean
}

export interface DeleteOrphansResult {
  deletedRepos: { name: string; deleted: boolean }[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base || 'page'
  let attempt = 0
  // Try `slug`, `slug-2`, `slug-3`, … until unused.
  while (true) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt + 1}`
    const row = await env.DB.prepare('SELECT id FROM pages WHERE slug = ?')
      .bind(candidate)
      .first()
    if (!row) return candidate
    attempt++
    if (attempt > 50) return `${slug}-${crypto.randomUUID().slice(0, 6)}`
  }
}

function repoNameFor(slug: string): string {
  // Artifacts repo names are scoped per-namespace; keep them tight and stable.
  return `page-${slug}-${crypto.randomUUID().slice(0, 6)}`
}

function renderMarkdown(md: string): string {
  // marked in sync mode is safe for trusted-ish content (our own DB).
  return marked.parse(md, { async: false }) as string
}

async function getPageBySlug(slug: string): Promise<PageRow | null> {
  const row = await env.DB.prepare('SELECT * FROM pages WHERE slug = ?')
    .bind(slug)
    .first<PageRow>()
  return row ?? null
}

async function insertPage(
  row: Pick<PageRow, 'slug' | 'title' | 'author' | 'summary' | 'forked_from'>,
  repo: RepoRef,
): Promise<void> {
  const now = Date.now()
  await env.DB.prepare(
    `INSERT INTO pages (slug, title, author, summary, namespace, repo_name, remote, current_sha, forked_from, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'wiki', ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      row.slug,
      row.title,
      row.author,
      row.summary,
      repo.repoName,
      repo.remote,
      repo.sha,
      row.forked_from,
      now,
      now,
    )
    .run()
}

/**
 * A plain `git push` moves the repo forward without going through `editPage`.
 * The repo is the source of truth, so when we see a newer HEAD (and maybe new
 * meta.json values) we bring the D1 index row back in sync.
 */
async function syncPageHead(
  page: PageRow,
  sha: string,
  meta?: Partial<PageMeta>,
): Promise<PageRow> {
  const next: PageRow = {
    ...page,
    title: meta?.title?.trim() || page.title,
    author: meta?.author?.trim() || page.author,
    summary: meta ? meta.summary?.trim() || null : page.summary,
    current_sha: sha,
  }
  const changed =
    next.current_sha !== page.current_sha ||
    next.title !== page.title ||
    next.author !== page.author ||
    next.summary !== page.summary
  if (!changed) return page

  if (next.current_sha !== page.current_sha) next.updated_at = Date.now()
  await env.DB.prepare(
    `UPDATE pages
     SET title = ?, author = ?, summary = ?, current_sha = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(next.title, next.author, next.summary, next.current_sha, next.updated_at, page.id)
    .run()
  return next
}

/** Page through every repo in the Artifacts namespace. */
async function listAllRepos() {
  const repos: ArtifactsRepoListResult['repos'] = []
  let cursor: string | undefined
  do {
    const page = await env.ARTIFACTS.list({ limit: 200, cursor })
    repos.push(...page.repos)
    cursor = page.cursor
  } while (cursor)
  return repos
}

function configuredAdminKey(): string | null {
  const configured = (env as typeof env & { ADMIN_DELETE_KEY?: string })
    .ADMIN_DELETE_KEY
  const trimmed = configured?.trim()
  return trimmed ? trimmed : null
}

function assertAdmin(inputKey?: string): void {
  const configured = configuredAdminKey()
  if (!configured) return
  if (inputKey !== configured) {
    throw new Error('Admin key required')
  }
}

async function getPageFamily(rootSlug: string): Promise<PageRow[]> {
  const result = await env.DB.prepare(
    `WITH RECURSIVE family AS (
       SELECT * FROM pages WHERE slug = ?
       UNION
       SELECT p.* FROM pages p
       JOIN family f ON p.forked_from = f.slug
     )
     SELECT * FROM family ORDER BY created_at ASC`,
  )
    .bind(rootSlug)
    .all<PageRow>()

  return result.results
}

async function deletePageFamilyRows(rootSlug: string): Promise<number> {
  const result = await env.DB.prepare(
    `WITH RECURSIVE family(slug) AS (
       SELECT slug FROM pages WHERE slug = ?
       UNION
       SELECT p.slug FROM pages p
       JOIN family f ON p.forked_from = f.slug
     )
     DELETE FROM pages WHERE slug IN (SELECT slug FROM family)`,
  )
    .bind(rootSlug)
    .run()

  return result.meta.changes ?? 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Server functions
// ─────────────────────────────────────────────────────────────────────────────

export const listPages = createServerFn({ method: 'GET' }).handler(async () => {
  const result = await env.DB.prepare(
    'SELECT * FROM pages ORDER BY updated_at DESC LIMIT 100',
  ).all<PageRow>()
  return result.results
})

export const getPage = createServerFn({ method: 'GET' })
  .validator((data: { slug: string; sha?: string }) => data)
  .handler(async ({ data }): Promise<PageView | null> => {
    const found = await getPageBySlug(data.slug)
    if (!found) return null

    const rendered = await readPage(env, found.repo_name, found.remote, data.sha)
    // Viewing the latest version? Make sure D1 reflects any direct `git push`.
    const page = data.sha
      ? found
      : await syncPageHead(found, rendered.sha, rendered.meta)

    return {
      page,
      markdown: rendered.markdown,
      html: renderMarkdown(rendered.markdown),
      sha: rendered.sha,
      isHistorical: Boolean(data.sha) && data.sha !== page.current_sha,
    }
  })

export const createPage = createServerFn({ method: 'POST' })
  .validator(
    (data: { title: string; author?: string; summary?: string; body: string }) =>
      data,
  )
  .handler(async ({ data }) => {
    const title = data.title.trim()
    if (!title) throw new Error('Title is required')
    const body = data.body.trim()
    if (!body) throw new Error('Body is required')

    const author = (data.author?.trim() || 'anonymous').slice(0, 60)
    const summary = data.summary?.trim() || null
    const slug = await uniqueSlug(slugify(title))

    const repo = await createPageRepo(env, repoNameFor(slug), body, {
      title,
      author,
      summary: summary ?? undefined,
      createdAt: new Date().toISOString(),
    })
    await insertPage({ slug, title, author, summary, forked_from: null }, repo)

    return { slug }
  })

export const editPage = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      slug: string
      title: string
      summary?: string
      body: string
      message?: string
      editor?: string
    }) => data,
  )
  .handler(async ({ data }) => {
    const page = await getPageBySlug(data.slug)
    if (!page) throw new Error(`Page not found: ${data.slug}`)
    const title = data.title.trim() || page.title
    const summary = data.summary?.trim() || page.summary || undefined
    const body = data.body.trim()
    if (!body) throw new Error('Body is required')

    const meta: PageMeta = {
      title,
      author: page.author,
      summary,
      createdAt: new Date(page.created_at).toISOString(),
      forkedFrom: page.forked_from ?? undefined,
    }
    const message = (data.message?.trim() || `Edit: ${title}`).slice(0, 140)
    const editor = (data.editor?.trim() || page.author).slice(0, 80)

    const sha = await updatePage(
      env,
      page.repo_name,
      page.remote,
      body,
      meta,
      message,
      editor,
    )
    await syncPageHead(page, sha, meta)

    return { slug: page.slug, sha }
  })

export const getHistory = createServerFn({ method: 'GET' })
  .validator((data: { slug: string }) => data)
  .handler(
    async ({ data }): Promise<{ page: PageRow; commits: CommitEntry[] } | null> => {
      const found = await getPageBySlug(data.slug)
      if (!found) return null
      const commits = await readHistory(env, found.repo_name, found.remote)
      // Keep the "Current" marker right after direct `git push`es.
      const page = commits[0] ? await syncPageHead(found, commits[0].sha) : found
      return { page, commits }
    },
  )

export const forkPage = createServerFn({ method: 'POST' })
  .validator((data: { slug: string; author?: string }) => data)
  .handler(async ({ data }) => {
    const source = await getPageBySlug(data.slug)
    if (!source) throw new Error(`Page not found: ${data.slug}`)

    const slug = await uniqueSlug(`${source.slug}-fork`)
    const repo = await forkPageRepo(
      env,
      source.repo_name,
      repoNameFor(slug),
      `Fork of ${source.title}`,
    )
    await insertPage(
      {
        slug,
        title: `Fork: ${source.title}`,
        author: (data.author?.trim() || 'anonymous').slice(0, 60),
        summary: source.summary,
        forked_from: source.slug,
      },
      repo,
    )

    return { slug }
  })

/**
 * Mint a short-lived write token and return a ready-to-paste `git clone`.
 *
 * `--config` (unlike `-c`) persists the auth header into the clone's
 * .git/config, so a later `git push` just works.
 *
 * NOTE: this is a public, unauthenticated demo. Anyone can mint a token and
 * push to `main`. Gate this behind real auth in anything production-like.
 */
export const mintCloneCommand = createServerFn({ method: 'POST' })
  .validator((data: { slug: string }) => data)
  .handler(async ({ data }) => {
    const page = await getPageBySlug(data.slug)
    if (!page) throw new Error(`Page not found: ${data.slug}`)
    const token = await mintToken(env, page.repo_name, 'write')
    const header = `Authorization: Bearer ${tokenSecret(token.plaintext)}`
    return {
      command: `git clone --config http.extraHeader="${header}" ${page.remote}`,
      expiresAt: token.expiresAt,
    }
  })

export const listAdminState = createServerFn({ method: 'GET' })
  .validator((data?: { adminKey?: string }) => data ?? {})
  .handler(async ({ data }): Promise<AdminState> => {
    assertAdmin(data.adminKey)

    const pageResult = await env.DB.prepare(
      `SELECT p.*,
              (SELECT COUNT(*) FROM pages child WHERE child.forked_from = p.slug) AS fork_count
       FROM pages p
        ORDER BY p.updated_at DESC
       LIMIT 500`,
    ).all<AdminPageRow>()
    const pages = pageResult.results

    const slugByRepo = new Map(pages.map((page) => [page.repo_name, page.slug]))
    const repos: AdminRepoRow[] = (await listAllRepos()).map((repo) => ({
      ...repo,
      indexedSlug: slugByRepo.get(repo.name) ?? null,
    }))

    return {
      pages,
      repos,
      adminKeyConfigured: Boolean(configuredAdminKey()),
    }
  })

export const previewDeleteFamily = createServerFn({ method: 'GET' })
  .validator((data: { slug: string; adminKey?: string }) => data)
  .handler(async ({ data }): Promise<PageRow[]> => {
    assertAdmin(data.adminKey)
    const family = await getPageFamily(data.slug)
    if (family.length === 0) throw new Error(`Page not found: ${data.slug}`)
    return family
  })

export const deletePageFamily = createServerFn({ method: 'POST' })
  .validator(
    (data: { slug: string; confirm: string; adminKey?: string }) => data,
  )
  .handler(async ({ data }): Promise<DeleteFamilyResult> => {
    assertAdmin(data.adminKey)

    const slug = data.slug.trim()
    if (!slug) throw new Error('Slug is required')
    if (data.confirm !== `DELETE ${slug}`) {
      throw new Error(`Type DELETE ${slug} to confirm`)
    }

    const family = await getPageFamily(slug)
    if (family.length === 0) throw new Error(`Page not found: ${slug}`)

    const deletedRepos: DeleteFamilyResult['deletedRepos'] = []
    for (const page of family) {
      try {
        const deleted = await env.ARTIFACTS.delete(page.repo_name)
        deletedRepos.push({ name: page.repo_name, deleted })
      } catch (err) {
        throw new Error(
          `Stopped before deleting D1 rows: failed to delete ${page.repo_name}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }

    const deletedRows = await deletePageFamilyRows(slug)
    if (deletedRows !== family.length) {
      throw new Error(
        `Deleted ${deletedRepos.length} Artifacts repos, but D1 removed ${deletedRows}/${family.length} rows. Refresh before retrying.`,
      )
    }

    return { rootSlug: slug, deletedPages: family, deletedRepos }
  })

export const deleteOrphanArtifactRepo = createServerFn({ method: 'POST' })
  .validator(
    (data: { repoName: string; confirm: string; adminKey?: string }) => data,
  )
  .handler(async ({ data }): Promise<DeleteRepoResult> => {
    assertAdmin(data.adminKey)

    const repoName = data.repoName.trim()
    if (!repoName) throw new Error('Repo name is required')
    if (data.confirm !== `DELETE ${repoName}`) {
      throw new Error(`Type DELETE ${repoName} to confirm`)
    }

    const linked = await env.DB.prepare('SELECT slug FROM pages WHERE repo_name = ?')
      .bind(repoName)
      .first<{ slug: string }>()
    if (linked) {
      throw new Error(
        `Repo ${repoName} is indexed as /wiki/${linked.slug}; delete the page lineage instead so D1 stays consistent.`,
      )
    }

    const deleted = await env.ARTIFACTS.delete(repoName)
    return { repoName, deleted }
  })

export const deleteOrphanArtifactRepos = createServerFn({ method: 'POST' })
  .validator((data: { confirm: string; adminKey?: string }) => data)
  .handler(async ({ data }): Promise<DeleteOrphansResult> => {
    assertAdmin(data.adminKey)
    if (data.confirm !== 'DELETE ORPHANS') {
      throw new Error('Type DELETE ORPHANS to confirm')
    }

    const indexedResult = await env.DB.prepare(
      'SELECT repo_name FROM pages LIMIT 10000',
    ).all<{ repo_name: string }>()
    const indexed = new Set(
      indexedResult.results.map((row) => row.repo_name),
    )

    const orphanNames = (await listAllRepos())
      .map((repo) => repo.name)
      .filter((name) => !indexed.has(name))

    const deletedRepos: DeleteOrphansResult['deletedRepos'] = []
    for (const name of orphanNames) {
      const deleted = await env.ARTIFACTS.delete(name)
      deletedRepos.push({ name, deleted })
    }

    return { deletedRepos }
  })
