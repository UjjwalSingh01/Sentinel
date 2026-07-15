import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { gentle } from '@/lib/motion';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Rendered at the top-left, before the title — usually a severity glyph. */
  leading?: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
  children: ReactNode;
}

/**
 * The app's only dialog.
 *
 * The old one unmounted instantly on close, which made every dismissal feel
 * like a crash. This one runs an exit animation, traps focus, restores focus to
 * whatever opened it, closes on Escape, and locks body scroll so the page
 * behind doesn't drift while you're reading.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  leading,
  footer,
  size = 'md',
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      // Focus trap: cycle within the dialog rather than escaping to the page
      // behind it, which is invisible while the backdrop is up.
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = overflow;
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
          <motion.div
            className="fixed inset-0 bg-black/70 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            className={cn(
              'relative my-auto flex w-full flex-col overflow-hidden rounded-xl',
              'border border-line-strong bg-panel shadow-2xl shadow-black/60',
              size === 'lg' ? 'max-w-3xl' : 'max-w-xl',
            )}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6, transition: { duration: 0.14 } }}
            transition={gentle}
          >
            {(title || leading) && (
              <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  {leading}
                  <div className="min-w-0">
                    <h2 className="truncate text-[15px] font-semibold text-ink">{title}</h2>
                    {subtitle && (
                      <p className="mt-0.5 truncate text-[11px] text-ink-muted">{subtitle}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
                >
                  <X size={16} />
                </button>
              </header>
            )}

            <div className="max-h-[70vh] flex-1 overflow-y-auto">{children}</div>

            {footer && (
              <footer className="border-t border-line bg-card px-5 py-3">{footer}</footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
