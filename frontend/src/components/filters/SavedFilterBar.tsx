import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { AnimatePresence, motion } from 'motion/react';
import { Bookmark, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  CREATE_SAVED_FILTER,
  DELETE_SAVED_FILTER,
  GET_SAVED_FILTERS,
} from '@/graphql/savedFilters';
import { snappy } from '@/lib/motion';

interface SavedFilterBarProps {
  scope: 'incidents' | 'logs';
  currentFilter: Record<string, unknown>;
  onApply: (filter: Record<string, unknown>) => void;
}

interface SavedFilterRow {
  id: string;
  name: string;
  filter: string;
}

export function SavedFilterBar({ scope, currentFilter, onApply }: SavedFilterBarProps) {
  const { data, refetch } = useQuery(GET_SAVED_FILTERS, { variables: { scope } });
  const [createSavedFilter] = useMutation(CREATE_SAVED_FILTER);
  const [deleteSavedFilter] = useMutation(DELETE_SAVED_FILTER);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const filters: SavedFilterRow[] = (data as any)?.savedFilters ?? [];

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await createSavedFilter({
      variables: { name: trimmed, scope, filter: JSON.stringify(currentFilter) },
    });
    toast.success(`Saved “${trimmed}”`);
    setName('');
    setNaming(false);
    await refetch();
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Bookmark size={12} className="shrink-0 text-ink-subtle" />

      <AnimatePresence initial={false}>
        {filters.map((f) => (
          <motion.span
            key={f.id}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={snappy}
            className="group inline-flex items-center overflow-hidden rounded-md border border-line bg-inset"
          >
            <button
              onClick={() => {
                try {
                  onApply(JSON.parse(f.filter));
                  toast.success(`Applied “${f.name}”`);
                } catch {
                  toast.error('That saved filter is malformed.');
                }
              }}
              className="py-1 pr-1.5 pl-2 text-[11px] text-ink-muted transition-colors hover:text-ink"
            >
              {f.name}
            </button>
            <button
              onClick={async () => {
                if (!confirm(`Delete saved filter “${f.name}”?`)) return;
                await deleteSavedFilter({ variables: { id: f.id } });
                await refetch();
              }}
              aria-label={`Delete ${f.name}`}
              className="py-1 pr-1.5 pl-0.5 text-ink-subtle transition-colors hover:text-crit-text"
            >
              <X size={10} />
            </button>
          </motion.span>
        ))}
      </AnimatePresence>

      {naming ? (
        <motion.span
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: 'auto' }}
          className="inline-flex items-center gap-1"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => !name.trim() && setNaming(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') {
                setName('');
                setNaming(false);
              }
            }}
            placeholder="Name this view…"
            className="w-36 rounded-md border border-line bg-inset px-2 py-1 text-[11px] outline-none placeholder:text-ink-subtle focus:border-line-strong"
          />
        </motion.span>
      ) : (
        <button
          onClick={() => setNaming(true)}
          className="inline-flex items-center gap-1 rounded-md border border-line bg-inset px-2 py-1 text-[11px] text-ink-subtle transition-colors hover:text-ink"
        >
          <Plus size={10} />
          Save view
        </button>
      )}
    </div>
  );
}
