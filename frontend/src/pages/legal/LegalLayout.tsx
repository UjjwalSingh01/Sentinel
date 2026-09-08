import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion, useScroll, useSpring } from 'motion/react';
import { ArrowLeft, Shield } from 'lucide-react';
import { isAuthenticated } from '@/lib/auth';
import { OPERATOR } from '@/lib/legal';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------------------
   Shared chrome for the policy pages.

   Deliberately calmer than the landing page: no reticle, no cursor field, no
   entrance animations on the body. Two reasons. Reading a legal document with
   a custom cursor is unpleasant — you want a real I-beam to select a clause.
   And body text must never start at opacity 0: if anything about the motion
   layer fails, the terms someone is legally bound by should still be on the
   screen. The only motion here is the scroll progress hairline, which is
   genuinely useful in a long document.
--------------------------------------------------------------------------- */

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

interface LegalLayoutProps {
  kicker: string;
  title: string;
  updated: string;
  version: string;
  summary: ReactNode;
  sections: LegalSection[];
}

export function LegalLayout({
  kicker,
  title,
  updated,
  version,
  summary,
  sections,
}: LegalLayoutProps) {
  const reduced = useReducedMotion();
  const authed = isAuthenticated();
  // Memoised: a fresh array every render would resubscribe the scroll listener
  // on every render.
  const ids = useMemo(() => sections.map((s) => s.id), [sections]);
  const active = useActiveSection(ids);
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 240, damping: 36, mass: 0.6 });

  // A policy page is a linkable document: land on #retention and go there.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  }, []);

  return (
    <div className="min-h-screen bg-canvas">
      <motion.div
        aria-hidden
        className="fixed top-0 right-0 left-0 z-50 h-px origin-left"
        style={{ scaleX, background: 'var(--color-series)' }}
      />

      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
          <Link to="/welcome" className="flex items-center gap-2.5" data-probe="home">
            <div className="grid h-7 w-7 place-items-center rounded-md border border-line bg-card">
              <Shield size={14} className="text-ink" />
            </div>
            <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Sentinel</span>
          </Link>

          <Link
            to="/welcome"
            className="ml-auto hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] text-ink-muted transition-colors duration-150 hover:text-ink sm:inline-flex"
          >
            <ArrowLeft size={13} />
            Back to site
          </Link>

          <Link
            to={authed ? '/' : '/login'}
            className="rounded-md border border-line bg-elevated px-3 py-1.5 text-[13px] text-ink transition-colors duration-150 hover:border-line-strong max-sm:ml-auto"
          >
            {authed ? 'Open console' : 'Sign in'}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pt-16 pb-24">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="font-mono text-[10px] tracking-[0.18em] text-ink-subtle uppercase">
            {kicker}
          </div>
          <h1 className="mt-4 text-[clamp(2rem,4.6vw,3.1rem)] leading-[1.02] font-semibold tracking-[-0.035em] text-ink">
            {title}
          </h1>

          <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 border-t border-line pt-4 font-mono text-[11px]">
            <div className="flex gap-2">
              <dt className="text-ink-subtle">Last updated</dt>
              <dd className="text-ink-muted">{updated}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-subtle">Version</dt>
              <dd className="text-ink-muted">{version}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-subtle">Applies to</dt>
              <dd className="text-ink-muted">this Sentinel deployment</dd>
            </div>
          </dl>

          <div className="mt-8 max-w-[68ch] text-[15.5px] leading-relaxed text-ink-muted">
            {summary}
          </div>
        </motion.div>

        <div className="mt-16 grid gap-12 lg:grid-cols-[184px_minmax(0,1fr)] lg:gap-16">
          {/* Contents. Sticky on wide screens, a plain list on narrow ones —
              a collapsed accordion here would just hide the map of the page. */}
          <nav aria-label="Contents" className="lg:sticky lg:top-24 lg:self-start">
            <div className="mb-4 font-mono text-[10px] tracking-[0.18em] text-ink-subtle uppercase">
              Contents
            </div>
            <ol className="space-y-1">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className={cn(
                      'flex gap-2.5 rounded-md py-1 text-[12.5px] transition-colors duration-150',
                      active === s.id ? 'text-ink' : 'text-ink-subtle hover:text-ink-muted',
                    )}
                  >
                    <span className="font-mono text-[10px] tabular-nums opacity-70">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0">{s.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="min-w-0">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-24 border-t border-line py-10 first:border-t-0 first:pt-0">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[11px] tabular-nums text-ink-subtle">
                    §{String(i + 1).padStart(2, '0')}
                  </span>
                  <h2 className="text-[19px] leading-snug font-semibold tracking-[-0.015em] text-ink">
                    {s.title}
                  </h2>
                </div>
                <div className="mt-5 max-w-[68ch]">{s.body}</div>
              </section>
            ))}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

/**
 * Highlights the section you are actually reading: the last one whose heading
 * has passed under the header.
 *
 * The obvious implementation — an IntersectionObserver and "first visible
 * section wins" — gets this wrong on a page like this one. Sections here are
 * long, so a section whose heading scrolled off the top hours ago is still
 * intersecting the viewport, and the contents list keeps pointing at it while
 * you read the next one. Tracking the heading position instead is both simpler
 * and right.
 */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    let frame = 0;

    const pick = () => {
      frame = 0;
      let current = ids[0] ?? null;
      for (const id of ids) {
        const el = document.getElementById(id);
        // 120px ≈ the sticky header plus a little breathing room.
        if (el && el.getBoundingClientRect().top <= 120) current = id;
      }
      setActive(current);
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(pick);
    };

    pick();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ids]);

  return active;
}

/* ===========================================================================
   Prose primitives. Policy text uses these instead of raw tags so every
   paragraph, list and table on both documents shares one rhythm.
   =========================================================================== */

export function P({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-[14.5px] leading-[1.75] text-ink-muted first:mt-0">{children}</p>;
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-4 space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[14.5px] leading-[1.7] text-ink-muted">
          <span aria-hidden className="mt-[10px] h-px w-3 shrink-0 bg-line-strong" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** The operator's contact address — clickable, because a policy that tells you
 *  to get in touch should not make you retype the address. */
export function Mail() {
  return (
    <a
      href={`mailto:${OPERATOR.contact}`}
      className="text-series-text underline underline-offset-2 hover:text-ink"
    >
      {OPERATOR.contact}
    </a>
  );
}

/** Inline code — env vars, table names, storage keys. */
export function C({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-inset px-1 py-0.5 font-mono text-[12.5px] text-ink">
      {children}
    </code>
  );
}

export function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6 rounded-lg border border-line bg-panel p-4">
      <div className="font-mono text-[10px] tracking-[0.14em] text-ink-subtle uppercase">
        {title}
      </div>
      <div className="mt-2 text-[13.5px] leading-[1.7] text-ink-muted">{children}</div>
    </div>
  );
}

/** A hairline table. Used to say exactly what is stored where. */
export function DataTable({
  head,
  rows,
}: {
  head: [string, string, string];
  rows: [ReactNode, ReactNode, ReactNode][];
}) {
  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line bg-panel">
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="px-4 py-2.5 font-mono text-[10px] font-medium tracking-[0.12em] text-ink-subtle uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-line last:border-b-0">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={cn(
                    'px-4 py-3 align-top text-[13px] leading-[1.6]',
                    j === 0 ? 'text-ink' : 'text-ink-muted',
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
