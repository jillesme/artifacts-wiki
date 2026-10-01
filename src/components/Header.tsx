import { Link } from '@tanstack/react-router'
import ThemeToggle from './ThemeToggle'

function todayLine(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function Header() {
  return (
    <header className="masthead">
      <div className="spot-rule" />

      <div className="measure-wide px-4">
        {/* Nameplate with boxed ears, like a proper front page */}
        <div className="grid items-center gap-4 pt-6 pb-4 sm:grid-cols-[150px_1fr_150px]">
          <div className="ear hidden sm:block">
            <strong>Edge edition</strong>
            Served from every Cloudflare data center
          </div>
          <Link
            to="/"
            aria-label="The Cloudflare Artifacts Wiki, home"
            className="nameplate text-center text-[clamp(1.9rem,4.4vw,3.9rem)] no-underline hover:text-[var(--ink)] sm:whitespace-nowrap"
          >
            The Cloudflare Artifacts Wiki
          </Link>
          <div className="ear hidden text-right sm:block">
            <strong>Price</strong>
            One <code className="bg-transparent p-0 normal-case">git push</code>
          </div>
        </div>

        {/* Dateline strip */}
        <div className="flex items-center justify-between border-y border-[var(--ink)] py-1.5">
          <p className="folio m-0 text-[var(--ink)]">{todayLine()}</p>
          <p className="folio m-0 hidden text-[var(--ink)] sm:block">
            Every page is a Git repository
          </p>
          <p className="folio m-0 text-[var(--ink)]">
            Powered by Cloudflare Artifacts
          </p>
        </div>

        {/* Section nav */}
        <div className="flex items-center justify-between gap-4 border-b-[3px] border-[var(--ink)] py-2.5">
          <nav aria-label="Primary" className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link
              to="/"
              className="nav-link"
              activeProps={{ className: 'nav-link is-active' }}
              activeOptions={{ exact: true }}
            >
              Front page
            </Link>
            <Link
              to="/new"
              className="nav-link"
              activeProps={{ className: 'nav-link is-active' }}
            >
              New page
            </Link>
            <Link
              to="/about"
              className="nav-link"
              activeProps={{ className: 'nav-link is-active' }}
            >
              About
            </Link>
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
