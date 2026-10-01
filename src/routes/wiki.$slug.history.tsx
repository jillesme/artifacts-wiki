import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { getHistory } from '../server/pages'

export const Route = createFileRoute('/wiki/$slug/history')({
  component: History,
  loader: async ({ params }) => {
    const data = await getHistory({ data: { slug: params.slug } })
    if (!data) throw notFound()
    return data
  },
})

function formatTimestamp(ms: number): string {
  return new Date(ms)
    .toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    .toUpperCase()
}

function History() {
  const { page, commits } = Route.useLoaderData()

  return (
    <main className="measure-wide px-4 pb-16 pt-10 sm:pt-14">
      <div className="mb-6">
        <Link
          to="/wiki/$slug"
          params={{ slug: page.slug }}
          search={{ v: undefined }}
          className="folio no-underline hover:text-[var(--ink)]"
        >
          ← Back to the page
        </Link>
      </div>

      <header className="mb-10 border-b border-[var(--rule)] pb-6">
        <p className="folio mb-3">Revision history</p>
        <h1 className="display text-[clamp(2.25rem,5.5vw,3.75rem)] text-[var(--ink)]">
          {page.title}
        </h1>
        <p className="byline mt-4 text-lg leading-relaxed text-[var(--ink-soft)]">
          Every commit ever pushed to <code>{page.repo_name}</code> on{' '}
          <code>main</code>. Click a SHA to render that exact version of the
          page.
        </p>
      </header>

      {/* Vertical timeline, editorial — ruled column on the left. */}
      <ol className="relative m-0 list-none p-0 pl-10 sm:pl-16">
        <span
          className="pointer-events-none absolute bottom-2 left-2 top-2 w-px bg-[var(--rule)]"
          aria-hidden
        />

        {commits.map((c, idx) => {
          const isCurrent = c.sha === page.current_sha
          const isInitial = idx === commits.length - 1
          return (
            <li
              key={c.sha}
              className="relative mb-10 pl-2"
            >
              {/* Dot on the rule */}
              <span
                className={`absolute -left-[30px] top-2 sm:-left-[54px] ${
                  isCurrent
                    ? 'h-[11px] w-[11px] rounded-full bg-[var(--oxblood)]'
                    : 'h-[7px] w-[7px] rounded-full bg-[var(--ink-faint)]'
                }`}
                style={{
                  boxShadow: isCurrent
                    ? '0 0 0 4px var(--parchment)'
                    : '0 0 0 3px var(--parchment)',
                }}
                aria-hidden
              />

              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="folio">{formatTimestamp(c.timestamp)}</span>
                <span className="byline text-sm">{c.author}</span>
                {isCurrent ? (
                  <span className="tag tag-accent">Current</span>
                ) : null}
                {isInitial && !isCurrent ? (
                  <span className="tag tag-moss">First impression</span>
                ) : null}
                <span className="ml-auto tag">@{c.sha.slice(0, 7)}</span>
              </div>

              <p className="display mb-0 mt-2 text-xl leading-snug text-[var(--ink)]">
                {isInitial && !c.message ? 'Initial commit' : c.message}
              </p>

              <div className="mt-3">
                <Link
                  to="/wiki/$slug"
                  params={{ slug: page.slug }}
                  search={{ v: c.sha }}
                  className="text-sm font-medium text-[var(--oxblood)]"
                >
                  Render this revision →
                </Link>
              </div>
            </li>
          )
        })}
      </ol>
    </main>
  )
}
