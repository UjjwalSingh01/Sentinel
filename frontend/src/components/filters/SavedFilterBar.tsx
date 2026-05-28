import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { Bookmark, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CREATE_SAVED_FILTER,
  DELETE_SAVED_FILTER,
  GET_SAVED_FILTERS,
} from '@/graphql/savedFilters';

interface SavedFilterBarProps {
  scope: 'incidents' | 'logs';
  /** Current filter state to persist when "Save" is clicked. */
  currentFilter: Record<string, unknown>;
  /** Called when a saved filter is selected. */
  onApply: (filter: Record<string, unknown>) => void;
}

interface SavedFilterRow {
  id: string;
  name: string;
  filter: string;
}

export function SavedFilterBar({ scope, currentFilter, onApply }: SavedFilterBarProps) {
  const { data, refetch } = useQuery(GET_SAVED_FILTERS, {
    variables: { scope },
  });
  const [createSavedFilter] = useMutation(CREATE_SAVED_FILTER);
  const [deleteSavedFilter] = useMutation(DELETE_SAVED_FILTER);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');

  const filters: SavedFilterRow[] = (data as any)?.savedFilters || [];

  const handleSave = async () => {
    const name = newName.trim();
    if (!name) return;
    await createSavedFilter({
      variables: {
        name,
        scope,
        filter: JSON.stringify(currentFilter),
      },
    });
    toast.success('Filter saved');
    setNewName('');
    setNaming(false);
    await refetch();
  };

  const handleApply = (sf: SavedFilterRow) => {
    try {
      const parsed = JSON.parse(sf.filter);
      onApply(parsed);
      toast.success(`Applied "${sf.name}"`);
    } catch {
      toast.error('Saved filter is malformed');
    }
  };

  const handleDelete = async (sf: SavedFilterRow) => {
    if (!confirm(`Delete saved filter "${sf.name}"?`)) return;
    await deleteSavedFilter({ variables: { id: sf.id } });
    toast.success('Filter deleted');
    await refetch();
  };

  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      <Bookmark size={12} className="text-muted-foreground" />
      {filters.length === 0 && !naming && (
        <span className="text-muted-foreground italic">No saved filters.</span>
      )}
      {filters.map((sf) => (
        <div key={sf.id} className="inline-flex items-center bg-zinc-800 rounded">
          <button
            onClick={() => handleApply(sf)}
            className="px-2 py-1 text-foreground/80 hover:text-emerald-400 transition-colors"
          >
            {sf.name}
          </button>
          <button
            onClick={() => handleDelete(sf)}
            className="px-1.5 py-1 text-muted-foreground hover:text-red-400 transition-colors"
            title="Delete saved filter"
          >
            <Trash2 size={11} />
          </button>
        </div>
      ))}
      {naming ? (
        <div className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setNaming(false);
            }}
            placeholder="Filter name…"
            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-foreground focus:outline-none focus:border-emerald-500/40"
          />
          <button
            onClick={handleSave}
            disabled={!newName.trim()}
            className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50 transition-colors"
          >
            Save
          </button>
          <button
            onClick={() => {
              setNewName('');
              setNaming(false);
            }}
            className="px-2 py-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setNaming(true)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus size={11} /> Save current
        </button>
      )}
    </div>
  );
}
