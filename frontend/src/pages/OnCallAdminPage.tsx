import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { Calendar, Clock, Phone, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CREATE_ON_CALL_ENTRY,
  DELETE_ON_CALL_ENTRY,
  GET_ON_CALL_SCHEDULE,
  GET_NOTIFICATION_LOG,
} from '@/graphql/onCall';
import { GET_USERS } from '@/graphql/queries';
import { getUser } from '@/lib/auth';

interface OnCallRow {
  id: string;
  userId: string;
  startsAt: string;
  endsAt: string;
  user?: { id: string; name: string; email: string } | null;
}

interface NotificationRow {
  id: string;
  incidentId: string;
  channel: string;
  recipient: string;
  template: string;
  sentAt: string;
}

function localToIso(value: string): string {
  // <input type="datetime-local"> gives "2026-05-28T16:00" without TZ.
  // Treat the input as the user's wall clock and convert to ISO/UTC.
  return new Date(value).toISOString();
}

function isoToLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function OnCallAdminPage() {
  const currentUser = getUser();
  if (currentUser?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const { data, loading, refetch } = useQuery(GET_ON_CALL_SCHEDULE, {
    pollInterval: 30000,
  });
  const { data: usersData } = useQuery(GET_USERS);
  const { data: logData, refetch: refetchLog } = useQuery(GET_NOTIFICATION_LOG, {
    variables: { limit: 25 },
    pollInterval: 15000,
  });
  const [createOnCallEntry] = useMutation(CREATE_ON_CALL_ENTRY);
  const [deleteOnCallEntry] = useMutation(DELETE_ON_CALL_ENTRY);

  const initialStart = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getMinutes() % 15);
    return isoToLocal(d.toISOString());
  }, []);
  const initialEnd = useMemo(() => {
    const d = new Date();
    d.setHours(d.getHours() + 4);
    return isoToLocal(d.toISOString());
  }, []);

  const [draftUserId, setDraftUserId] = useState<string>('');
  const [draftStart, setDraftStart] = useState<string>(initialStart);
  const [draftEnd, setDraftEnd] = useState<string>(initialEnd);

  const schedule: OnCallRow[] = (data as any)?.onCallSchedule || [];
  const currentOnCall: OnCallRow | null = (data as any)?.currentOnCall || null;
  const users = (usersData as any)?.users || [];
  const log: NotificationRow[] = (logData as any)?.notificationLog || [];

  const handleCreate = async () => {
    if (!draftUserId) {
      toast.error('Pick a user');
      return;
    }
    try {
      await createOnCallEntry({
        variables: {
          userId: draftUserId,
          startsAt: localToIso(draftStart),
          endsAt: localToIso(draftEnd),
        },
      });
      toast.success('On-call slot added');
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add slot');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this on-call slot?')) return;
    await deleteOnCallEntry({ variables: { id } });
    toast.success('Slot deleted');
    await refetch();
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Phone size={22} className="text-emerald-400" />
          On-Call Schedule
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          When an incident fires, the engineer currently on-call gets paged. If
          they don&apos;t acknowledge within the escalation window, admins are
          emailed.
        </p>
      </div>

      <div className="glass rounded-xl border border-zinc-800 p-4">
        <div className="flex items-center gap-2 mb-2 text-sm">
          <Clock size={14} className="text-emerald-400" />
          <span className="font-semibold">Currently on call:</span>
          {currentOnCall ? (
            <span>
              {currentOnCall.user?.name ?? '(unknown)'}{' '}
              <span className="text-muted-foreground text-xs">
                ({currentOnCall.user?.email})
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground italic">
              Nobody — incidents will go to the default mailbox.
            </span>
          )}
        </div>
      </div>

      <div className="glass rounded-xl border border-zinc-800 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Plus size={14} className="text-emerald-400" />
          <span className="text-sm font-semibold">Add slot</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase">user</span>
            <select
              value={draftUserId}
              onChange={(e) => setDraftUserId(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500/40"
            >
              <option value="">— pick user —</option>
              {users.map((u: { id: string; name: string; email: string }) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase">starts at</span>
            <input
              type="datetime-local"
              value={draftStart}
              onChange={(e) => setDraftStart(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase">ends at</span>
            <input
              type="datetime-local"
              value={draftEnd}
              onChange={(e) => setDraftEnd(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500/40"
            />
          </label>
          <button
            onClick={handleCreate}
            disabled={!draftUserId}
            className="px-3 py-1.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-xs font-medium disabled:opacity-50 transition-colors mt-5"
          >
            Add slot
          </button>
        </div>
      </div>

      <div className="glass rounded-xl border border-zinc-800 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
          <Calendar size={14} className="text-emerald-400" />
          <span className="text-sm font-semibold">Schedule</span>
        </div>
        {loading && schedule.length === 0 ? (
          <div className="p-6 text-xs text-muted-foreground">Loading…</div>
        ) : schedule.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground italic">
            No slots configured.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[11px] text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-2">User</th>
                <th className="px-4 py-2">Starts</th>
                <th className="px-4 py-2">Ends</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {schedule.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-2">
                    {entry.user?.name ?? '(unknown)'}
                    <span className="block text-[11px] text-muted-foreground">
                      {entry.user?.email}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(entry.startsAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(entry.endsAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleDelete(entry.id)}
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

      <div className="glass rounded-xl border border-zinc-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Phone size={14} className="text-emerald-400" />
            Recent notifications
          </div>
          <button
            onClick={() => refetchLog()}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Refresh
          </button>
        </div>
        {log.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground italic">
            No notifications yet.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] text-muted-foreground uppercase border-b border-zinc-800">
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Template</th>
                <th className="px-3 py-2">Recipient</th>
                <th className="px-3 py-2">Incident</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/30 font-mono">
              {log.map((n) => (
                <tr key={n.id}>
                  <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                    {new Date(n.sentAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        n.template === 'admin_escalation'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-emerald-500/20 text-emerald-400'
                      }`}
                    >
                      {n.template}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-foreground/80">{n.recipient}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {n.incidentId.slice(0, 8)}
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
