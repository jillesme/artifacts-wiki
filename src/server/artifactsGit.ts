/**
 * Git operations against Cloudflare Artifacts repos, from a Worker.
 *
 * - `env.ARTIFACTS` creates repos, forks them, and mints repo-scoped tokens.
 * - Each repo is a standard Git HTTPS remote, so we use isomorphic-git to
 *   clone, commit, and push from inside the request handler.
 * - Files live in Workers' built-in per-request `node:fs` (/tmp), enabled by
 *   `nodejs_compat`. https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/
 *
 * Docs: https://developers.cloudflare.com/artifacts/examples/isomorphic-git/
 */

import fs from 'node:fs'
import git from 'isomorphic-git'
import http from 'isomorphic-git/http/web'

const PAGE_FILE = 'page.md'
const META_FILE = 'meta.json'
const BRANCH = 'main'
const TOKEN_TTL_SECONDS = 15 * 60

/** Metadata we store in `meta.json` alongside the markdown body. */
export interface PageMeta {
  title: string
  author: string
  summary?: string
  createdAt: string
  forkedFrom?: string
}

export interface RepoRef {
  repoName: string
  remote: string
  sha: string
}

export interface RenderedPage {
  markdown: string
  meta: PageMeta
  sha: string
}

export interface CommitEntry {
  sha: string
  message: string
  author: string
  timestamp: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Tokens
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Artifacts tokens look like `art_v1_<secret>?expires=<unix>`.
 * Git auth only wants the secret part.
 */
export function tokenSecret(token: string): string {
  return token.split('?expires=')[0]
}

/** Mint a short-lived, repo-scoped token for Git access. */
export async function mintToken(
  env: Env,
  repoName: string,
  scope: 'read' | 'write',
) {
  const repo = await env.ARTIFACTS.get(repoName)
  return repo.createToken(scope, TOKEN_TTL_SECONDS)
}

// ─────────────────────────────────────────────────────────────────────────────
// Local Git helpers (isomorphic-git + node:fs)
// ─────────────────────────────────────────────────────────────────────────────

function onAuth(token: string) {
  return () => ({ username: 'x', password: tokenSecret(token) })
}

/** Fresh workdir per operation, so parallel reads in one request don't collide. */
async function newWorkdir(): Promise<string> {
  const dir = `/tmp/artifacts-${crypto.randomUUID()}`
  await fs.promises.mkdir(dir, { recursive: true })
  return dir
}

async function cloneMain(remote: string, token: string, depth = 1) {
  const dir = await newWorkdir()
  await git.clone({
    fs,
    http,
    dir,
    url: remote,
    ref: BRANCH,
    singleBranch: true,
    depth,
    onAuth: onAuth(token),
  })
  return dir
}

/** Write files into the workdir and stage them. */
async function writeAndStage(dir: string, files: Record<string, string>) {
  for (const [filepath, contents] of Object.entries(files)) {
    await fs.promises.writeFile(`${dir}/${filepath}`, contents)
    await git.add({ fs, dir, filepath })
  }
}

function pageFiles(body: string, meta: PageMeta): Record<string, string> {
  return {
    [PAGE_FILE]: body,
    [META_FILE]: JSON.stringify(meta, null, 2) + '\n',
  }
}

function commitAuthor(name: string) {
  const email =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'contributor'
  return { name: name.slice(0, 80), email: `${email}@artifacts.example` }
}

async function commitAndPush(
  dir: string,
  remote: string,
  token: string,
  message: string,
  author: string,
): Promise<string> {
  const sha = await git.commit({
    fs,
    dir,
    message,
    author: commitAuthor(author),
  })
  await git.push({
    fs,
    http,
    dir,
    url: remote,
    ref: BRANCH,
    onAuth: onAuth(token),
  })
  return sha
}

// ─────────────────────────────────────────────────────────────────────────────
// Page operations
// ─────────────────────────────────────────────────────────────────────────────

/** Create a new Artifacts repo with `page.md` + `meta.json` and push `main`. */
export async function createPageRepo(
  env: Env,
  repoName: string,
  body: string,
  meta: PageMeta,
): Promise<RepoRef> {
  const repo = await env.ARTIFACTS.create(repoName, {
    description: meta.title,
  })

  const dir = await newWorkdir()
  await git.init({ fs, dir, defaultBranch: BRANCH })
  await writeAndStage(dir, {
    ...pageFiles(body, meta),
    'README.md': `# ${meta.title}\n\nThis wiki page lives in a Cloudflare Artifacts repo.\n\nClone it, edit \`${PAGE_FILE}\`, and push to update the page.\n`,
  })

  const sha = await commitAndPush(
    dir,
    repo.remote,
    repo.token,
    `Create page: ${meta.title}`,
    meta.author,
  )
  return { repoName: repo.name, remote: repo.remote, sha }
}

/** Read `page.md` + `meta.json` at a given commit, or at the tip of `main`. */
export async function readPage(
  env: Env,
  repoName: string,
  remote: string,
  atSha?: string,
): Promise<RenderedPage> {
  const { plaintext } = await mintToken(env, repoName, 'read')
  const dir = await cloneMain(remote, plaintext, atSha ? 100 : 1)
  const oid = atSha ?? (await git.resolveRef({ fs, dir, ref: BRANCH }))

  const readText = async (filepath: string) => {
    const { blob } = await git.readBlob({ fs, dir, oid, filepath })
    return new TextDecoder().decode(blob)
  }

  // meta.json may be missing if someone removed it via `git push`.
  const meta = await readText(META_FILE)
    .then((text) => JSON.parse(text) as PageMeta)
    .catch(() => ({}) as PageMeta)

  return { markdown: await readText(PAGE_FILE), meta, sha: oid }
}

/** Commit a new version of the page, push, and return the new HEAD SHA. */
export async function updatePage(
  env: Env,
  repoName: string,
  remote: string,
  body: string,
  meta: PageMeta,
  message: string,
  editor: string,
): Promise<string> {
  const { plaintext } = await mintToken(env, repoName, 'write')
  const dir = await cloneMain(remote, plaintext)
  await writeAndStage(dir, pageFiles(body, meta))
  return commitAndPush(dir, remote, plaintext, message, editor)
}

/** Read the last `depth` commits on `main`, newest first. */
export async function readHistory(
  env: Env,
  repoName: string,
  remote: string,
  depth = 50,
): Promise<CommitEntry[]> {
  const { plaintext } = await mintToken(env, repoName, 'read')
  const dir = await cloneMain(remote, plaintext, depth)
  const log = await git.log({ fs, dir, depth })
  return log.map((c) => ({
    sha: c.oid,
    message: c.commit.message.trim(),
    author: c.commit.author.name,
    timestamp: c.commit.author.timestamp * 1000,
  }))
}

/**
 * Fork an existing repo into a brand-new one. The fork has its own remote and
 * tokens, and diverges independently from the source.
 */
export async function forkPageRepo(
  env: Env,
  sourceRepoName: string,
  targetRepoName: string,
  description: string,
): Promise<RepoRef> {
  const source = await env.ARTIFACTS.get(sourceRepoName)
  const fork = await source.fork(targetRepoName, {
    description,
    defaultBranchOnly: true,
  })

  // The fork starts at the source's HEAD; a shallow clone tells us that SHA.
  const dir = await cloneMain(fork.remote, fork.token)
  const sha = await git.resolveRef({ fs, dir, ref: BRANCH })
  return { repoName: fork.name, remote: fork.remote, sha }
}
