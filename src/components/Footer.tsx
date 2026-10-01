export default function Footer() {
  return (
    <footer className="mt-20 pb-12">
      <div className="measure-wide px-4">
        <div className="triple-rule mb-6" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
          <p className="nameplate m-0 text-2xl">The Cloudflare Artifacts Wiki</p>
          <p className="folio m-0">
            Printed on Cloudflare Workers · Artifacts · D1 · TanStack Start
          </p>
        </div>
        <p className="byline mt-3 text-sm">
          “All the knowledge that’s fit to push.”
        </p>
      </div>
    </footer>
  )
}
