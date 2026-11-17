import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, PlusCircle, QrCode } from 'lucide-react';
import type { TicketPayload, TicketTier } from '../types';
import { encodeTicketQrPayload } from '../utils/qrParser';

interface TicketBuilderViewProps {
  onRegisterAndScan: (ticket: TicketPayload) => Promise<void>;
}

export function TicketBuilderView({ onRegisterAndScan }: TicketBuilderViewProps) {
  const [firstName, setFirstName] = useState('Jordan');
  const [lastName, setLastName] = useState('Patel');
  const [ticketType, setTicketType] = useState<TicketTier>('general');
  const [role, setRole] = useState('Cloud Engineer');
  const [org, setOrg] = useState('Acme Dev');
  const [track, setTrack] = useState('AI & Gemini');
  const [ticketId, setTicketId] = useState('DF26-GEN-450');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const previewTicket: TicketPayload = {
    ticketId: ticketId.trim() || 'DF26-NEW-001',
    firstName: firstName.trim() || 'Attendee',
    lastName: lastName.trim() || 'Guest',
    ticketType,
    role: role.trim() || 'Attendee',
    org: org.trim() || 'DevFest Community',
    track: track.trim() || 'All Tracks',
  };

  const encodedPayload = encodeTicketQrPayload(previewTicket);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(encodedPayload, {
      width: 280,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [encodedPayload]);

  function handleTierChange(nextTier: TicketTier) {
    setTicketType(nextTier);
    const prefix = nextTier.slice(0, 3).toUpperCase();
    setTicketId(`DF26-${prefix}-${Math.floor(300 + Math.random() * 600)}`);
    if (nextTier === 'student' && role === 'Cloud Engineer') {
      setRole('Computer Science Student');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    setSubmitting(true);
    try {
      await onRegisterAndScan(previewTicket);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-7"
      >
        <h2 className="font-display text-lg font-bold text-slate-900">
          Generate Attendee Ticket QR
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Create a scannable DevFest QR ticket for any guest to test with your phone camera or send directly to the kiosk.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="tb-first-name" className="block text-xs font-semibold text-slate-700">
              First Name
            </label>
            <input
              id="tb-first-name"
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="mt-1.5 min-h-[42px] w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="tb-last-name" className="block text-xs font-semibold text-slate-700">
              Last Name
            </label>
            <input
              id="tb-last-name"
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="mt-1.5 min-h-[42px] w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="tb-ticket-type" className="block text-xs font-semibold text-slate-700">
              Ticket Type
            </label>
            <select
              id="tb-ticket-type"
              value={ticketType}
              onChange={(e) => handleTierChange(e.target.value as TicketTier)}
              className="mt-1.5 min-h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              <option value="general">General Attendee (Instant Print)</option>
              <option value="student">Student (Requires AI Student ID Check)</option>
              <option value="speaker">Speaker (Instant Print)</option>
              <option value="organizer">Organizer (Instant Print)</option>
            </select>
          </div>

          <div>
            <label htmlFor="tb-ticket-id" className="block text-xs font-semibold text-slate-700">
              Ticket ID
            </label>
            <input
              id="tb-ticket-id"
              type="text"
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              className="mt-1.5 min-h-[42px] w-full rounded-lg border border-slate-200 px-3 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="tb-role" className="block text-xs font-semibold text-slate-700">
              Role / Title
            </label>
            <input
              id="tb-role"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1.5 min-h-[42px] w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="tb-org" className="block text-xs font-semibold text-slate-700">
              Company or University
            </label>
            <input
              id="tb-org"
              type="text"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              className="mt-1.5 min-h-[42px] w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="tb-track" className="block text-xs font-semibold text-slate-700">
              Preferred Track
            </label>
            <input
              id="tb-track"
              type="text"
              value={track}
              onChange={(e) => setTrack(e.target.value)}
              className="mt-1.5 min-h-[42px] w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            Register & Scan in Kiosk
          </button>

          {qrDataUrl && (
            <a
              href={qrDataUrl}
              download={`ticket-${previewTicket.ticketId}.png`}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Download QR PNG
            </a>
          )}
        </div>
      </form>

      {/* Live Scannable QR Ticket Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <span className="font-display text-sm font-bold text-slate-900">
            Scannable Digital Ticket
          </span>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            {previewTicket.ticketId}
          </span>
        </div>

        <div className="mt-5 flex flex-col items-center text-center">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`Ticket QR code for ${previewTicket.firstName} ${previewTicket.lastName}`}
              className="h-52 w-52 rounded-xl border border-slate-200 bg-white p-2"
            />
          ) : (
            <div className="flex h-52 w-52 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
              <QrCode className="h-10 w-10 text-slate-300" aria-hidden="true" />
            </div>
          )}

          <p className="mt-4 font-display text-xl font-bold text-slate-900">
            {previewTicket.firstName} {previewTicket.lastName}
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            {previewTicket.role} · {previewTicket.org}
          </p>
          <p className="mt-2 font-mono text-xs font-semibold uppercase text-blue-700">
            {previewTicket.ticketType === 'student'
              ? 'Student Ticket · ID Required at Kiosk'
              : `${previewTicket.ticketType} Ticket · Auto-Print`}
          </p>
        </div>

        <div className="mt-5 rounded-lg bg-slate-50 p-3">
          <p className="font-mono text-[10px] font-semibold uppercase text-slate-400">
            Encoded QR Payload
          </p>
          <p className="mt-1 break-all font-mono text-[11px] text-slate-600">
            {encodedPayload}
          </p>
        </div>
      </div>
    </div>
  );
}
