import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { motion } from 'motion/react';
import { CalendarClock, Mail, Plus, Trash2, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  CREATE_ON_CALL_ENTRY,
  DELETE_ON_CALL_ENTRY,
  GET_NOTIFICATION_LOG,
  GET_ON_CALL_SCHEDULE,
} from '@/graphql/onCall';
import { GET_USERS } from '@/graphql/queries';
import { getUser } from '@/lib/auth';
import {
  Button,
  EmptyState,
  IconButton,
  LiveDot,
  PageHeader,
  StatusBadge,
} from '@/components/ui';
import { formatDateTime, timeAgo } from '@/lib/format';
import { fadeUp, stagger } from '@/lib/motion';

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

/** <input type="datetime-local"> has no timezone — treat it as wall clock. */
const toIso = (local: string) => new Date(local).toISOString();

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function OnCallAdminPage() {
  const currentUser = getUser();

  const { data, loading, refetch } = useQuery(GET_ON_CALL_SCHEDULE, { pollInterval: 30000 });
  const { data: usersData } = useQuery(GET_USERS);
  const { data: logData } = useQuery(GET_NOTIFICATION_LOG, {
    variables: { limit: 25 },
    pollInterval: 15000,
  });
  const [createEntry] = useMutation(CREATE_ON_CALL_ENTRY);
  const [deleteEntry] = useMutation(DELETE_ON_CALL_ENTRY);

  const defaults = useMemo(() => {
    const start = new Date();
    start.setMinutes(start.getMinutes() - (start.getMinutes() % 15), 0, 0);
    const end = new Date(start);
    end.setHours(end.getHours() + 4);
    return { start: toLocalInput(start.toISOString()), end: toLocalInput(end.toISOString()) };
  }, []);

  const [userId, setUserId] = useState('');
  const [startsAt, setStartsAt] = useState(defaults.start);
  const [endsAt, setEndsAt] = useState(defaults.end);

  // Hooks first — an early return above them would break the rules of hooks.
  if (currentUser?.role !== 'admin') return <Navigate to="/" replace />;

  const schedule: OnCallRow[] = (data as any)?.onCallSchedule ?? [];
  const current: OnCallRow | null = (data as any)?.currentOnCall ?? null;
  const users: { id: string; name: string; email: string }[] = (usersData as any)?.users ?? [];
  const log: NotificationRow[] = (logData as any)?.notificationLog ?? [];

  const addSlot = async () => {
    if (!userId) return toast.error('Pick who is covering the slot.');
    try {
      await createEntry({
        variables: { userId, startsAt: toIso(startsAt), endsAt: toIso(endsAt) },
      });
      toast.success('On-call slot added');
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add the slot');
    }
  };

  return (
    <motion.div
      variants={stagger(0.05)}
      initial="hidden"
      animate="show"
      className="space-y-5 p-6"
    >
      <PageHeader
        title="On-call"
        subtitle="Whoever is on-call gets paged first. If they don't acknowledge in time, admins do."
      />

      {/* Who is holding the pager right now — the one thing this page exists to
          answer, so it gets the top slot and the only status colour. */}
      <motion.section
        variants={fadeUp}
        className="flex items-center gap-3 rounded-lg border border-line bg-card px-4 py-3.5"
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-elevated text-ink-muted">
          <UserCheck size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium tracking-wider text-ink-subtle uppercase">
            Currently on call
          </div>
          {current ? (
            <div className="mt-1 flex items-center gap-2">
              <LiveDot level="good" />
              <span className="text-[14px] font-medium text-ink">
                {current.user?.name ?? 'Unknown user'}
              </span>
              <span className="truncate font-mono text-[11px] text-ink-subtle">
                {current.user?.email}
              </span>
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge level="warn">Nobody scheduled</StatusBadge>
              <span className="text-[12px] text-ink-muted">
                Pages will fall back to the default mailbox.
              </span>
            </div>
          )}
        </div>
      </motion.section>

      <motion.section variants={fadeUp} className="rounded-lg border border-line bg-card p-4">
        <h2 className="mb-3 text-[13px] font-semibold text-ink">Add a slot</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium tracking-wider text-ink-subtle uppercase">
              engineer
            </span>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="field">
              <option value="">Pick an engineer…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.email}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium tracking-wider text-ink-subtle uppercase">
              starts
            </span>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="field font-mono"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium tracking-wider text-ink-subtle uppercase">
              ends
            </span>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="field font-mono"
            />
          </label>

          <Button variant="primary" icon={Plus} onClick={addSlot} disabled={!userId}>
            Add
          </Button>
        </div>
      </motion.section>

      <motion.section
        variants={fadeUp}
        className="overflow-hidden rounded-lg border border-line bg-card"
      >
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <CalendarClock size={14} className="text-ink-muted" />
          <h2 className="text-[13px] font-semibold text-ink">Schedule</h2>
        </header>

        {loading && schedule.length === 0 ? (
          <p className="px-4 py-6 text-[12px] text-ink-subtle">Loading…</p>
        ) : schedule.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No slots configured"
            hint="Until someone is scheduled, every page goes to the fallback mailbox."
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                {['Engineer', 'Starts', 'Ends', ''].map((h, i) => (
                  <th
                    key={i}
                    className="px-4 py-2.5 text-left text-[10px] font-medium tracking-wider text-ink-subtle uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedule.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-line/60 transition-colors last:border-0 hover:bg-elevated"
                >
                  <td className="px-4 py-2.5">
                    <div className="text-[13px] text-ink">{entry.user?.name ?? 'Unknown'}</div>
                    <div className="font-mono text-[11px] text-ink-subtle">{entry.user?.email}</div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] whitespace-nowrap text-ink-muted">
                    {formatDateTime(entry.startsAt)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] whitespace-nowrap text-ink-muted">
                    {formatDateTime(entry.endsAt)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <IconButton
                      icon={Trash2}
                      label="Delete slot"
                      className="hover:text-crit-text"
                      onClick={async () => {
                        if (!confirm('Delete this on-call slot?')) return;
                        await deleteEntry({ variables: { id: entry.id } });
                        toast.success('Slot deleted');
                        await refetch();
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </motion.section>

      <motion.section
        variants={fadeUp}
        className="overflow-hidden rounded-lg border border-line bg-card"
      >
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Mail size={14} className="text-ink-muted" />
          <h2 className="text-[13px] font-semibold text-ink">Recent pages</h2>
        </header>

        {log.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="Nothing sent yet"
            hint="Every email Sentinel sends is recorded here."
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                {['Sent', 'Kind', 'Recipient', 'Incident'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-[10px] font-medium tracking-wider text-ink-subtle uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.map((n) => (
                <tr key={n.id} className="border-b border-line/60 last:border-0">
                  <td
                    className="px-4 py-2 font-mono text-[11px] whitespace-nowrap text-ink-subtle"
                    title={formatDateTime(n.sentAt)}
                  >
                    {timeAgo(n.sentAt)}
                  </td>
                  <td className="px-4 py-2">
                    {/* An escalation means the first page went unanswered — that
                        is a genuine warning, so it earns a status colour. */}
                    <StatusBadge
                      level={n.template === 'admin_escalation' ? 'critical' : 'good'}
                      showIcon={false}
                    >
                      {n.template === 'admin_escalation' ? 'escalation' : 'on-call'}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-2 font-mono text-[11px] text-ink">{n.recipient}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-ink-subtle">
                    {n.incidentId.slice(0, 8)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </motion.section>
    </motion.div>
  );
}
