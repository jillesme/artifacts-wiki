# The Cloudflare Artifacts Wiki

A tiny wiki where **every page is its own Git repository**, built on [Cloudflare Artifacts](https://developers.cloudflare.com/artifacts/).

- Every save is a commit. Revision history is just `git log`.
- **Fork** a page and you get a brand-new repo that diverges independently.
- **Mint clone command** gives you a short-lived token and a `git clone` command. Edit the page locally, `git push`, refresh, and the wiki updates.

Live demo: _deploy your own with the steps below._

## How it works

| Piece | Role |
| --- | --- |
| Artifacts (`env.ARTIFACTS`) | One Git repo per page (`page.md` + `meta.json`). Creates repos, forks them, and mints repo-scoped tokens. |
| `isomorphic-git` + `node:fs` | Clones, commits, and pushes from inside the Worker (per-request in-memory `/tmp`). |
| D1 (`DB`) | A small index: slug, title, repo name, and the current commit SHA. The repo is the source of truth. |
| TanStack Start | UI and server functions. |

The important files:

- `wrangler.jsonc`: the `artifacts` binding
- `src/server/artifactsGit.ts`: all Git and Artifacts calls
- `src/server/pages.ts`: server functions the UI calls (create, edit, history, fork, clone)

## Run it

```bash
pnpm install
pnpm exec wrangler d1 migrations apply artifacts-wiki-db --remote
pnpm dev      # http://localhost:3000
pnpm run deploy
```

`/jilles` is an unlinked admin page for deleting pages and orphaned repos. Set an `ADMIN_DELETE_KEY` secret to protect it.

> ⚠️ This is a demo with no auth. Anyone can mint a write token for any page. Gate token minting behind real identity for anything production-like.
