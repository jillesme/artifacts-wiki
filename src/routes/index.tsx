import { createFileRoute, Link } from '@tanstack/react-router'
import { listPages } from '../server/pages'

export const Route = createFileRoute('/')({
  component: Home,
  loader: () => listPages(),
})

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const COLUMNS = [
  {
    title: 'Commits, not saves',
    body: 'Every edit pushes a new commit to main. Nothing is lost, and every past revision still renders at its own URL.',
  },
  {
    title: 'Forks, not copies',
    body: 'A fork creates an entirely new Artifacts repo with its own history. Readers become contributors.',
  },
  {
    title: 'Clone it, push it',
    body: 'The Worker mints a short-lived token and hands you a git clone command. Edit on your laptop, push, and the page updates.',
  },
]

function Home() {
  const pages = Route.useLoaderData()

  return (
    <main className="measure-wide px-4 pb-16 pt-8">
      {/* ── Lead story ───────────────────────────────────────────────── */}
      <section
        aria-labelledby="lead"
        className="grid gap-8 border-b border-[var(--ink)] pb-8 lg:grid-cols-[1fr_300px]"
      >
        <div>
        <p className="kicker mb-3">
          <span className="text-[var(--cf-orange-deep)]">■</span> Technology
        </p>
        <h1
          id="lead"
          className="display m-0 text-[clamp(2.4rem,5.2vw,4.1rem)]"
        >
          Every Page in This Wiki Is a Git Repository
        </h1>
        <p className="byline mt-4 max-w-3xl text-xl leading-snug sm:text-2xl">
          Edits become commits, forks become new repos, and anyone can{' '}
          <code className="not-italic">git clone</code> a page to their laptop.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link to="/new" className="btn-primary">
            Write a new page
          </Link>
          <Link to="/about" className="btn-ghost">
            How it works
          </Link>
        </div>
        </div>

        <aside className="self-start border border-[var(--ink)] p-5">
          <p className="kicker m-0 border-b border-[var(--ink)] pb-2">
            Try it yourself
          </p>
          <ol className="m-0 mt-3 list-decimal space-y-2 pl-5 text-[15px] leading-snug">
            <li>Write a page. That creates a new repo.</li>
            <li>Edit it. Every save is a commit.</li>
            <li>Fork it into a brand-new repo.</li>
            <li>
              Mint a clone command, <code className="whitespace-nowrap">git push</code> from your laptop, and
              refresh.
            </li>
          </ol>
        </aside>
      </section>

      {/* ── Three ruled columns ──────────────────────────────────────── */}
      <section className="col-rules grid gap-6 py-6 sm:grid-cols-3 sm:gap-0 sm:[&>*]:px-6 sm:[&>*:first-child]:pl-0 sm:[&>*:last-child]:pr-0">
        {COLUMNS.map((col) => (
          <article key={col.title}>
            <h2 className="display m-0 text-2xl">{col.title}</h2>
            <p className="newsprint mt-2 mb-0 text-[15px] leading-relaxed text-[var(--ink-soft)]">
              {col.body}
            </p>
          </article>
        ))}
      </section>

      <div className="triple-rule" />

      {/* ── Index of pages ───────────────────────────────────────────── */}
      <section aria-labelledby="contents-heading" className="pt-6">
        <header className="mb-2 flex items-baseline justify-between gap-4">
          <h2 id="contents-heading" className="kicker m-0 text-sm">
            Recently changed pages
          </h2>
          <p className="folio m-0">
            {pages.length} {pages.length === 1 ? 'page' : 'pages'}
          </p>
        </header>

        {pages.length === 0 ? (
          <div className="border-t border-[var(--ink)] py-12 text-center">
            <p className="byline mb-5 text-lg">No pages yet. Be the first.</p>
            <Link to="/new" className="btn-primary">
              Write the first page
            </Link>
          </div>
        ) : (
          <ol className="m-0 grid list-none gap-x-8 border-t border-[var(--ink)] p-0 sm:grid-cols-2">
            {pages.map((page) => (
              <li key={page.id} className="border-b border-[var(--rule)] py-5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="folio">{formatDate(page.updated_at)}</span>
                  <span className="folio">·</span>
                  <span className="byline text-sm">by {page.author}</span>
                  {page.forked_from ? (
                    <span className="tag tag-moss">fork of {page.forked_from}</span>
                  ) : null}
                  <span className="tag tag-accent ml-auto">
                    @{page.current_sha.slice(0, 7)}
                  </span>
                </div>

                <h3 className="display mt-1.5 mb-0 text-2xl leading-tight">
                  <Link
                    to="/wiki/$slug"
                    params={{ slug: page.slug }}
                    search={{ v: undefined }}
                    className="no-underline hover:underline"
                  >
                    {page.title}
                  </Link>
                </h3>

                {page.summary ? (
                  <p className="mt-1.5 mb-0 text-[15px] leading-relaxed text-[var(--ink-soft)]">
                    {page.summary}
                  </p>
                ) : null}

                <div className="mt-2 flex gap-4">
                  <Link
                    to="/wiki/$slug/history"
                    params={{ slug: page.slug }}
                    className="folio no-underline hover:text-[var(--ink)]"
                  >
                    History
                  </Link>
                  <Link
                    to="/wiki/$slug/edit"
                    params={{ slug: page.slug }}
                    className="folio no-underline hover:text-[var(--ink)]"
                  >
                    Edit
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  )
}
