import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { mintCloneCommand } from '../server/pages'

/**
 * The "git clone your page" block. On click we ask the Worker to mint a
 * short-lived read/write Artifacts token for this repo, then render the
 * ready-to-paste command in a terminal-style block.
 */
export default function CloneSnippet({ slug }: { slug: string }) {
  const [info, setInfo] = useState<{ command: string; expiresAt: string } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function mint() {
    setBusy(true)
    setError(null)
    try {
      setInfo(await mintCloneCommand({ data: { slug } }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!info) return
    await navigator.clipboard.writeText(info.command)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  if (!info) {
    return (
      <section className="border-y border-[var(--rule)] py-6" aria-label="Clone this page">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-md">
            <p className="smallcaps mb-1">Take it with you</p>
            <p className="m-0 text-[15px] leading-relaxed text-[var(--ink-soft)]">
              Mint a 15-minute read/write token and get a ready-to-paste{' '}
              <code>git clone</code> command. This page is a real remote;
              clone it, edit offline, and <code>git push</code> to update it.
            </p>
          </div>
          <button onClick={mint} disabled={busy} className="btn-ghost">
            {busy ? 'Minting…' : 'Mint clone command'}
          </button>
        </div>
        {error ? <p className="note-error mt-3">{error}</p> : null}
      </section>
    )
  }

  const expiresIn = Math.max(
    0,
    Math.round((new Date(info.expiresAt).getTime() - Date.now()) / 1000 / 60),
  )

  return (
    <section className="border-y border-[var(--rule)] py-6" aria-label="Clone this page">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="smallcaps m-0">Clone this page</p>
        <span className="tag tag-accent">
          Token expires in ~{expiresIn} min
        </span>
      </div>

      <pre className="terminal">
        <code>{info.command}</code>
      </pre>

      <p className="mt-2 text-[12px] leading-relaxed text-[var(--ink-faint)]">
        Then edit, <code>git commit -am "…"</code>, and{' '}
        <code>git push</code>. The token is stored in the cloned repo's{' '}
        <code>.git/config</code>, so pushes work without re-typing it.
      </p>

      <aside
        role="note"
        className="mt-3 border-l-2 border-[var(--oxblood)] bg-[color-mix(in_oklab,var(--oxblood)_8%,var(--parchment-hi))] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--ink)]"
      >
        <strong
          className="font-display font-semibold uppercase tracking-[0.14em] text-[var(--oxblood)]"
          style={{ fontSize: '0.72rem' }}
        >
          Demo notice ·{' '}
        </strong>
        This token is <strong>read/write</strong> and scoped to this repo.
        Anyone holding it can <code>git push</code> to <code>main</code> for
        the next ~{expiresIn} minutes. The wiki has no auth — that's
        intentional for the demo. If this were production, you'd gate token
        minting behind a real identity.
      </aside>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[13px] leading-relaxed text-[var(--ink-soft)]">
          When it expires, mint another — or fork the page to get your own
          independent repo.
        </p>
        <button
          onClick={copy}
          className="folio inline-flex items-center gap-2 border border-[var(--rule)] bg-transparent px-3 py-1.5 text-[var(--ink)] transition hover:border-[var(--ink)]"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy
            </>
          )}
        </button>
      </div>
    </section>
  )
}
