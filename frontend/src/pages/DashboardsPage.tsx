import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { ExternalLink, LayoutGrid, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CREATE_DASHBOARD,
  DELETE_DASHBOARD,
  GET_DASHBOARDS,
} from '@/graphql/dashboards';

interface DashboardRow {
  id: string;
  name: string;
  ownerId: string;
  updatedAt: string;
}

export function DashboardsPage() {
  const navigate = useNavigate();
  const { data, loading, refetch } = useQuery(GET_DASHBOARDS);
  const [createDashboard] = useMutation(CREATE_DASHBOARD);
  const [deleteDashboard] = useMutation(DELETE_DASHBOARD);
  const [newName, setNewName] = useState('');

  const dashboards: DashboardRow[] = (data as any)?.dashboards || [];

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    const res = await createDashboard({
      variables: { name, layout: JSON.stringify([]) },
    });
    setNewName('');
    const id = (res.data as any)?.createDashboard?.id;
    if (id) {
      toast.success('Dashboard created');
      navigate(`/dashboards/${id}`);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete dashboard "${name}"?`)) return;
    await deleteDashboard({ variables: { id } });
    toast.success('Dashboard deleted');
    await refetch();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <LayoutGrid size={22} className="text-emerald-400" />
            Dashboards
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Drag-and-drop custom views. Widgets refresh on their own polling intervals.
          </p>
        </div>
      </div>

      <div className="glass rounded-xl border border-zinc-800 p-4 mb-4">
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New dashboard name…"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/40"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-sm font-medium disabled:opacity-50 transition-colors"
          >
            <Plus size={14} />
            Create
          </button>
        </div>
      </div>

      <div className="glass rounded-xl border border-zinc-800 overflow-hidden">
        {loading && dashboards.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : dashboards.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            No dashboards yet. Create your first one above.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[11px] text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {dashboards.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-3 font-medium">
                    <Link
                      to={`/dashboards/${d.id}`}
                      className="hover:text-emerald-400 inline-flex items-center gap-1"
                    >
                      {d.name}
                      <ExternalLink size={11} />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(d.updatedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(d.id, d.name)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-zinc-800 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
