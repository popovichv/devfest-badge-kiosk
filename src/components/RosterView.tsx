import { useMemo, useState } from 'react';
import { Printer, QrCode, Search } from 'lucide-react';
import type { AttendeeRecord } from '../types';

interface RosterViewProps {
  attendees: AttendeeRecord[];
  onReprintAttendee: (attendee: AttendeeRecord) => void;
  onScanAttendeeInKiosk: (attendee: AttendeeRecord) => void;
}

type RosterFilter = 'all' | 'printed' | 'pending' | 'student';

export function RosterView({
  attendees,
  onReprintAttendee,
  onScanAttendeeInKiosk,
}: RosterViewProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RosterFilter>('all');

  const stats = useMemo(() => {
    const total = attendees.length;
    const checkedIn = attendees.filter((a) => a.status === 'printed').length;
    const studentsVerified = attendees.filter(
      (a) => a.ticketType === 'student' && a.studentVerification?.decision === 'approved'
    ).length;
    const totalPrints = attendees.reduce((sum, a) => sum + a.printCount, 0);
    return { total, checkedIn, studentsVerified, totalPrints };
  }, [attendees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return attendees.filter((a) => {
      if (filter === 'printed' && a.status !== 'printed') return false;
      if (filter === 'pending' && a.status === 'printed') return false;
      if (filter === 'student' && a.ticketType !== 'student') return false;
      if (!q) return true;
      return (
        `${a.firstName} ${a.lastName}`.toLowerCase().includes(q) ||
        a.ticketId.toLowerCase().includes(q) ||
        a.org.toLowerCase().includes(q)
      );
    });
  }, [attendees, filter, search]);

  return (
    <div className="space-y-6">
      {/* 4-Column Tabular KPI Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Registered Attendees</p>
          <p className="mt-1 font-display text-3xl font-bold text-slate-900 tabular-nums">
            {stats.total}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Checked In</p>
          <p className="mt-1 font-display text-3xl font-bold text-emerald-700 tabular-nums">
            {stats.checkedIn}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Students AI-Verified</p>
          <p className="mt-1 font-display text-3xl font-bold text-blue-700 tabular-nums">
            {stats.studentsVerified}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Labels Printed</p>
          <p className="mt-1 font-display text-3xl font-bold text-slate-900 tabular-nums">
            {stats.totalPrints}
          </p>
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5">
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, ticket ID, or organization..."
              aria-label="Search attendees"
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Filter attendees">
            {(
              [
                ['all', 'All'],
                ['printed', 'Checked In'],
                ['pending', 'Pending'],
                ['student', 'Students'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  filter === key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-display text-base font-semibold text-slate-900">
              No matching attendees
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Adjust your search filter or add a new ticket in Ticket QR Builder.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold text-slate-500">
                  <th className="px-5 py-3">Attendee</th>
                  <th className="px-5 py-3">Ticket ID</th>
                  <th className="px-5 py-3">Tier</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Prints</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((a) => (
                  <tr key={a.ticketId} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-900">
                        {a.firstName} {a.lastName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {a.role} · {a.org}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-700 tabular-nums">
                      {a.ticketId}
                    </td>
                    <td className="px-5 py-3.5 text-xs font-medium capitalize text-slate-700">
                      {a.ticketType}
                    </td>
                    <td className="px-5 py-3.5 text-xs font-semibold">
                      {a.status === 'printed' ? (
                        <span className="text-emerald-700">Checked In & Printed</span>
                      ) : a.status === 'student_rejected' ? (
                        <span className="text-red-700">Student ID Rejected</span>
                      ) : (
                        <span className="text-slate-500">Awaiting Scan</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {a.printCount}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {a.status === 'printed' ? (
                        <button
                          type="button"
                          onClick={() => onReprintAttendee(a)}
                          className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                          Reprint
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onScanAttendeeInKiosk(a)}
                          className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap"
                        >
                          <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                          Scan at Kiosk
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
