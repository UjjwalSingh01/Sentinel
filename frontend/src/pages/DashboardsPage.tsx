import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { motion } from 'motion/react';
import { ArrowUpRight, LayoutGrid, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { CREATE_DASHBOARD, DELETE_DASHBOARD, GET_DASHBOARDS } from '@/graphql/dashboards';
import { Button, EmptyState, IconButton, PageHeader, Skeleton } from '@/components/ui';
import { fadeUp, stagger } from '@/lib/motion';
import { formatDateTime } from '@/lib/format';

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
  const [name, setName] = useState('');

  const dashboards: DashboardRow[] = (data as any)?.dashboards ?? [];

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const res = await createDashboard({
      variables: { name: trimmed, layout: JSON.stringify([]) },
    });
    setName('');
    const id = (res.data as any)?.createDashboard?.id;
    if (id) {
      toast.success('Dashboard created');
      navigate(`/dashboards/${id}`);
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Dashboards"
        subtitle="Build your own views. Drag widgets around; each one polls on its own."
      />

      <div className="mb-4 flex gap-2 rounded-lg border border-line bg-card p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder="Name a new dashboard…"
          className="field flex-1"
        />
        <Button variant="primary" icon={Plus} onClick={create} disabled={!name.trim()}>
          Create
        </Button>
      </div>

      {loading && dashboards.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : dashboards.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={LayoutGrid}
            title="No dashboards yet"
            hint="A dashboard is a saved grid of metric charts, log panels and incident lists."
          />
        </div>
      ) : (
        <motion.div
          variants={stagger(0.04)}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          {dashboards.map((d) => (
            <motion.div
              key={d.id}
              variants={fadeUp}
              whileHover={{ y: -2 }}
              className="group relative rounded-lg border border-line bg-card p-4 transition-colors hover:border-line-strong"
            >
              <Link to={`/dashboards/${d.id}`} className="block">
                <div className="flex items-start justify-between gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-md bg-elevated text-ink-muted">
                    <LayoutGrid size={14} />
                  </div>
                  <ArrowUpRight
                    size={14}
                    className="text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100"
                  />
                </div>
                <div className="mt-3 truncate text-[14px] font-medium text-ink">{d.name}</div>
                <div className="mt-1 font-mono text-[11px] text-ink-subtle">
                  Updated {formatDateTime(d.updatedAt)}
                </div>
              </Link>

              <div className="absolute right-3 bottom-3 opacity-0 transition-opacity group-hover:opacity-100">
                <IconButton
                  icon={Trash2}
                  label={`Delete ${d.name}`}
                  className="hover:text-crit-text"
                  onClick={async () => {
                    if (!confirm(`Delete dashboard “${d.name}”?`)) return;
                    await deleteDashboard({ variables: { id: d.id } });
                    toast.success('Dashboard deleted');
                    await refetch();
                  }}
                />
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
