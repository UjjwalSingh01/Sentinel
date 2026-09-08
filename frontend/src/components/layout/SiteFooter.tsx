import { Link } from 'react-router-dom';
import { LEGAL_LINKS, copyright } from '@/lib/legal';

/* ---------------------------------------------------------------------------
   The public footer.

   One component so the landing page and the policy pages can never drift apart
   on what the copyright line says or where the legal links point.
--------------------------------------------------------------------------- */

export function SiteFooter() {
  return (
    <footer className="border-t border-line px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="font-mono text-[11px] leading-relaxed text-ink-subtle">
          <div className="text-ink-muted">Sentinel · observability &amp; incident response</div>
          <div className="mt-1">{copyright()}</div>
        </div>

        <div className="flex flex-col gap-2 font-mono text-[11px] sm:items-end">
          <nav className="flex items-center gap-4">
            {LEGAL_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                data-probe={l.label}
                className="text-ink-muted transition-colors duration-150 hover:text-ink"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <span className="text-ink-subtle">FastAPI · TimescaleDB · Redpanda · React</span>
        </div>
      </div>
    </footer>
  );
}
