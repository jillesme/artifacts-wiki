import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import {
  deleteOrphanArtifactRepo,
  deleteOrphanArtifactRepos,
  deletePageFamily,
  listAdminState,
  previewDeleteFamily,
  type AdminState,
  type PageRow,
} from '../server/pages'

export const Route = createFileRoute('/jilles')({
  component: JillesAdmin,
})

function formatDate(ts: number | string): string {
  const date = typeof ts === 'number' ? new Date(ts) : new Date(ts)
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function humanJoin(items: string[]): string {
  if (items.length <= 3) return items.join(', ')
  return `${items.slice(0, 3).join(', ')} +${items.length - 3} more`
}

function JillesAdmin() {
  const [adminKey, setAdminKey] = useState('')
  const [state, setState] = useState<AdminState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [query, setQuery] = useState('on-artifacts')
  const [selectedSlug, setSelectedSlug] = useState('')
  const [family, setFamily] = useState<PageRow[]>([])
  const [pageConfirm, setPageConfirm] = useState('')
  const [repoConfirm, setRepoConfirm] = useState('')
  const [orphanConfirm, setOrphanConfirm] = useState('')
  const [repoName, setRepoName] = useState('')

  async function refresh(key = adminKey) {
    setLoading(true)
    setError(null)
    try {
      const next = await listAdminState({ data: { adminKey: key || undefined } })
      setState(next)
      setSelectedSlug((slug) =>
        slug && next.pages.some((page) => page.slug === slug) ? slug : '',
      )
      window.localStorage.setItem('jilles-admin-key', key)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const stored = window.localStorage.getItem('jilles-admin-key') ?? ''
    setAdminKey(stored)
    refresh(stored)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedSlug) {
      setFamily([])
      return
    }

    let cancelled = false
    setBusy(`preview:${selectedSlug}`)
    previewDeleteFamily({ data: { slug: selectedSlug, adminKey: adminKey || undefined } })
      .then((next) => {
        if (!cancelled) setFamily(next)
      })
      .catch((err) => {
        if (!cancelled) setFamily([])
        const message = err instanceof Error ? err.message : String(err)
        if (!cancelled && selectedSlug && !message.includes('Page not found:')) {
          setError(message)
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(null)
      })

    return () => {
      cancelled = true
    }
  }, [adminKey, selectedSlug])

  const filteredPages = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const pages = state?.pages ?? []
    if (!needle) return pages
    return pages.filter((page) =>
      [page.slug, page.title, page.author, page.repo_name, page.forked_from ?? '']
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [query, state?.pages])

  const orphanRepos = useMemo(
    () => (state?.repos ?? []).filter((repo) => !repo.indexedSlug),
    [state?.repos],
  )

  async function onDeleteFamily(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedSlug) return
    setBusy(`delete:${selectedSlug}`)
    setError(null)
    setNotice(null)
    try {
      const result = await deletePageFamily({
        data: {
          slug: selectedSlug,
          confirm: pageConfirm,
          adminKey: adminKey || undefined,
        },
      })
      setNotice(
        `Deleted ${result.deletedPages.length} page rows and ${result.deletedRepos.length} Artifacts repos: ${humanJoin(
          result.deletedPages.map((page) => page.slug),
        )}`,
      )
      setPageConfirm('')
      setFamily([])
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function onDeleteOrphanRepo(e: React.FormEvent) {
    e.preventDefault()
    if (!repoName) return
    setBusy(`repo:${repoName}`)
    setError(null)
    setNotice(null)
    try {
      const result = await deleteOrphanArtifactRepo({
        data: {
          repoName,
          confirm: repoConfirm,
          adminKey: adminKey || undefined,
        },
      })
      setNotice(
        result.deleted
          ? `Deleted orphan Artifacts repo ${result.repoName}.`
          : `Repo ${result.repoName} was already absent from Artifacts.`,
      )
      setRepoName('')
      setRepoConfirm('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function onDeleteAllOrphans(e: React.FormEvent) {
    e.preventDefault()
    setBusy('orphans')
    setError(null)
    setNotice(null)
    try {
      const result = await deleteOrphanArtifactRepos({
        data: {
          confirm: orphanConfirm,
          adminKey: adminKey || undefined,
        },
      })
      setNotice(
        result.deletedRepos.length
          ? `Deleted ${result.deletedRepos.length} orphan Artifacts repos: ${humanJoin(
              result.deletedRepos.map((repo) => repo.name),
            )}`
          : 'No orphan Artifacts repos to delete.',
      )
      setOrphanConfirm('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const confirmPhrase = selectedSlug ? `DELETE ${selectedSlug}` : ''
  const repoConfirmPhrase = repoName ? `DELETE ${repoName}` : ''

  return (
    <main className="measure-wide px-4 pb-20 pt-10 sm:pt-14">
      <header className="mb-10 border-b border-[var(--umber)] pb-8">
        <p className="folio mb-4">/jilles · hidden composition-room ledger</p>
        <div className="grid gap-6 sm:grid-cols-[1.2fr_0.8fr] sm:items-end">
          <div>
            <h1 className="display display-wonk text-[clamp(2.6rem,7vw,5.5rem)] text-[var(--ink)]">
              Burn after reading.
            </h1>
            <p className="byline mt-5 max-w-2xl text-xl leading-relaxed text-[var(--ink-soft)]">
              A deliberately unlinked admin desk for deleting the D1 index row
              and the backing Cloudflare Artifacts Git repo in one pass. Forks
              below a page are swept up before the ledger line is crossed out.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              refresh()
            }}
            className="border border-[var(--rule)] bg-[var(--parchment-hi)] p-4"
          >
            <label className="field">
              <span className="field-label">Admin key</span>
              <input
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                className="field-input"
                type="password"
                placeholder="required if ADMIN_DELETE_KEY is set"
              />
            </label>
            <button className="btn-ghost mt-3" disabled={loading} type="submit">
              {loading ? 'Opening ledger…' : 'Refresh ledger'}
            </button>
          </form>
        </div>
      </header>

      {error ? <p className="note-error mb-6">{error}</p> : null}
      {notice ? (
        <p className="mb-6 border border-[var(--moss)] bg-[var(--parchment-hi)] p-4 text-[var(--moss)]">
          {notice}
        </p>
      ) : null}

      <section className="mb-10 grid gap-4 sm:grid-cols-4">
        <div className="border-y border-[var(--rule)] py-4">
          <p className="folio">D1 pages</p>
          <p className="display mt-1 text-4xl">{state?.pages.length ?? '—'}</p>
        </div>
        <div className="border-y border-[var(--rule)] py-4">
          <p className="folio">Artifacts repos</p>
          <p className="display mt-1 text-4xl">{state?.repos.length ?? '—'}</p>
        </div>
        <div className="border-y border-[var(--rule)] py-4">
          <p className="folio">Orphans</p>
          <p className="display mt-1 text-4xl">{orphanRepos.length}</p>
        </div>
        <div className="border-y border-[var(--rule)] py-4">
          <p className="folio">Key configured</p>
          <p className="display mt-1 text-4xl">
            {state?.adminKeyConfigured ? 'yes' : 'no'}
          </p>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="min-w-0" aria-labelledby="pages-heading">
          <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-4">
            <div>
              <p className="folio">Cascade deletion</p>
              <h2 id="pages-heading" className="display text-3xl">
                Indexed pages & forks
              </h2>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="field-input max-w-xs"
              placeholder="filter slugs, titles, repos"
            />
          </header>

          <div className="max-h-[720px] overflow-auto border-y border-[var(--rule)]">
            {filteredPages.map((page) => (
              <article
                key={page.id}
                className={`grid gap-3 border-b border-[var(--rule-soft)] p-4 sm:grid-cols-[1fr_auto] ${
                  selectedSlug === page.slug ? 'bg-[var(--parchment-hi)]' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="tag tag-accent">{page.slug}</span>
                    {page.forked_from ? (
                      <span className="tag tag-moss">fork of {page.forked_from}</span>
                    ) : null}
                    {page.fork_count ? (
                      <span className="tag">{page.fork_count} forks</span>
                    ) : null}
                  </div>
                  <h3 className="display truncate text-2xl">
                    <Link
                      to="/wiki/$slug"
                      params={{ slug: page.slug }}
                      search={{ v: undefined }}
                      className="text-[var(--ink)] no-underline"
                    >
                      {page.title}
                    </Link>
                  </h3>
                  <p className="m-0 mt-2 break-all font-mono text-xs text-[var(--ink-soft)]">
                    {page.repo_name} · @{page.current_sha.slice(0, 7)} ·{' '}
                    {formatDate(page.created_at)}
                  </p>
                </div>
                <button
                  className="btn-ghost self-center"
                  onClick={() => {
                    setSelectedSlug(page.slug)
                    setPageConfirm('')
                  }}
                  type="button"
                >
                  Stage deletion
                </button>
              </article>
            ))}
          </div>
        </section>

        <aside className="lg:sticky lg:top-8 lg:self-start" aria-labelledby="danger-heading">
          <form
            onSubmit={onDeleteFamily}
            className="border-2 border-[var(--oxblood)] bg-[var(--parchment-hi)] p-5"
          >
            <p className="folio mb-2 text-[var(--oxblood)]">Destructive action</p>
            <h2 id="danger-heading" className="display text-3xl">
              Delete a lineage
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">
              This deletes every Artifacts repo listed here first, then removes
              the matching D1 rows. Missing repos are treated as already gone;
              failed repo deletes stop before D1 is touched.
            </p>

            <label className="field mt-5">
              <span className="field-label">Root slug</span>
              <input
                value={selectedSlug}
                onChange={(e) => {
                  setSelectedSlug(e.target.value.trim())
                  setPageConfirm('')
                }}
                className="field-input"
              />
            </label>

            <div className="my-5 border-y border-[var(--rule)] py-4">
              <p className="smallcaps mb-3">
                {busy?.startsWith('preview:') ? 'checking forks…' : 'will delete'}
              </p>
              {family.length ? (
                <ol className="m-0 grid gap-2 p-0">
                  {family.map((page) => (
                    <li key={page.id} className="list-none text-sm">
                      <span className="font-semibold">{page.slug}</span>
                      <br />
                      <code>{page.repo_name}</code>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="m-0 text-sm text-[var(--ink-soft)]">No rows loaded.</p>
              )}
            </div>

            <label className="field">
              <span className="field-label">Type {confirmPhrase}</span>
              <input
                value={pageConfirm}
                onChange={(e) => setPageConfirm(e.target.value)}
                className="field-input"
                placeholder={confirmPhrase}
              />
            </label>
            <button
              className="btn-primary mt-4 border-[var(--oxblood)] bg-[var(--oxblood)]"
              disabled={!family.length || pageConfirm !== confirmPhrase || busy !== null}
              type="submit"
            >
              {busy?.startsWith('delete:') ? 'Deleting repos…' : 'Delete D1 rows + repos'}
            </button>
          </form>

          <form
            onSubmit={onDeleteOrphanRepo}
            className="mt-6 border border-[var(--rule)] bg-[var(--parchment-hi)] p-5"
          >
            <p className="folio mb-2">Orphan repo cleanup</p>
            <h2 className="display text-2xl">Artifacts only</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">
              For repos not referenced by D1. Indexed repos are rejected here;
              use the lineage deleter instead.
            </p>

            <label className="field mt-5">
              <span className="field-label">Repo name</span>
              <input
                value={repoName}
                onChange={(e) => {
                  setRepoName(e.target.value.trim())
                  setRepoConfirm('')
                }}
                className="field-input"
                list="orphan-repos"
                placeholder="page-something-a1b2c3"
              />
              <datalist id="orphan-repos">
                {orphanRepos.map((repo) => (
                  <option key={repo.id} value={repo.name} />
                ))}
              </datalist>
            </label>
            <label className="field mt-4">
              <span className="field-label">Type {repoConfirmPhrase || 'DELETE repo-name'}</span>
              <input
                value={repoConfirm}
                onChange={(e) => setRepoConfirm(e.target.value)}
                className="field-input"
                placeholder={repoConfirmPhrase}
              />
            </label>
            <button
              className="btn-ghost mt-4"
              disabled={!repoName || repoConfirm !== repoConfirmPhrase || busy !== null}
              type="submit"
            >
              {busy?.startsWith('repo:') ? 'Deleting repo…' : 'Delete orphan repo'}
            </button>
          </form>

          <form
            onSubmit={onDeleteAllOrphans}
            className="mt-6 border border-[var(--oxblood)] bg-[var(--parchment-hi)] p-5"
          >
            <p className="folio mb-2 text-[var(--oxblood)]">Bulk cleanup</p>
            <h2 className="display text-2xl">Delete all orphans</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">
              Deletes every Artifacts repo that is not referenced by the D1
              <code>pages</code> table. Currently staged:{' '}
              <strong>{orphanRepos.length}</strong>.
            </p>
            {orphanRepos.length ? (
              <ol className="my-4 grid max-h-40 gap-2 overflow-auto border-y border-[var(--rule)] py-3 pl-0">
                {orphanRepos.map((repo) => (
                  <li key={repo.id} className="list-none break-all text-xs">
                    <code>{repo.name}</code>
                  </li>
                ))}
              </ol>
            ) : null}
            <label className="field mt-4">
              <span className="field-label">Type DELETE ORPHANS</span>
              <input
                value={orphanConfirm}
                onChange={(e) => setOrphanConfirm(e.target.value)}
                className="field-input"
                placeholder="DELETE ORPHANS"
              />
            </label>
            <button
              className="btn-primary mt-4 border-[var(--oxblood)] bg-[var(--oxblood)]"
              disabled={
                orphanRepos.length === 0 || orphanConfirm !== 'DELETE ORPHANS' || busy !== null
              }
              type="submit"
            >
              {busy === 'orphans' ? 'Deleting orphan repos…' : 'Delete all orphan repos'}
            </button>
          </form>
        </aside>
      </div>
    </main>
  )
}
