import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { createPage } from '../server/pages'

export const Route = createFileRoute('/new')({
  component: NewPage,
})

const STARTER_BODY = `# Hello, Artifacts Wiki

This page is a Git repository. Every edit is a commit.

Try:

1. Edit this file and hit **Save** — you'll see a new SHA.
2. Open **Revision history** to view past versions.
3. Hit **Fork page** to spin up an independent copy.
`

function NewPage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [summary, setSummary] = useState('')
  const [body, setBody] = useState(STARTER_BODY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await createPage({
        data: {
          title,
          author: author || undefined,
          summary: summary || undefined,
          body,
        },
      })
      navigate({
        to: '/wiki/$slug',
        params: { slug: result.slug },
        search: { v: undefined },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <main className="measure px-4 pb-16 pt-10 sm:pt-14">
      <header className="mb-10">
        <p className="folio mb-4">The wiki desk · new page</p>
        <h1 className="display text-[clamp(2.5rem,6vw,4rem)] text-[var(--ink)]">
          Create a new wiki page.
        </h1>
        <p className="byline mt-5 text-lg leading-relaxed text-[var(--ink-soft)]">
          Filling this form creates a fresh Artifacts repository, writes{' '}
          <code>page.md</code> & <code>meta.json</code>, and pushes the first
          commit to <code>main</code>.
        </p>
        <div className="mt-6 h-px bg-[var(--rule)]" />
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <label className="field">
          <span className="field-label">Title</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="field-input"
            placeholder="How to use Artifacts"
          />
        </label>

        <div className="grid gap-6 sm:grid-cols-2">
          <label className="field">
            <span className="field-label">Creator</span>
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="field-input"
              placeholder="Anonymous"
            />
          </label>
          <label className="field">
            <span className="field-label">Summary · optional</span>
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="field-input"
              placeholder="One sentence pitch"
            />
          </label>
        </div>

        <label className="field">
          <span className="field-label">Body · Markdown</span>
          <textarea
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={18}
            className="field-textarea"
          />
        </label>

        {error ? <p className="note-error">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-5 border-t border-[var(--rule)] pt-6">
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Pushing first commit…' : 'Create page'}
          </button>
          <p className="m-0 text-sm leading-relaxed text-[var(--ink-soft)]">
            A new repo, <code>page-&lt;slug&gt;-&lt;nonce&gt;</code>, will be
            provisioned on Cloudflare Artifacts.
          </p>
        </div>
      </form>
    </main>
  )
}
