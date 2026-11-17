import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  CheckCircle2,
  Download,
  Printer,
  RotateCcw,
  ShieldCheck,
  Terminal,
  Usb,
} from 'lucide-react';
import type { KioskStage, PrintJob, TicketPayload } from '../types';

interface ThermalPrinterUnitProps {
  stage: KioskStage;
  activeTicket: TicketPayload | null;
  activeJob: PrintJob | null;
  recentJobs: PrintJob[];
  onResetToIdle: () => void;
  onSelectRecentJob: (job: PrintJob) => void;
}

const TIER_LABEL_TEXT: Record<string, string> = {
  general: 'GENERAL ATTENDEE',
  student: 'STUDENT PASS',
  speaker: 'SPEAKER',
  organizer: 'ORGANIZER',
};

const TIER_HEADER_STYLE: Record<string, string> = {
  general: 'bg-slate-900 text-white',
  student: 'bg-amber-600 text-white',
  speaker: 'bg-blue-600 text-white',
  organizer: 'bg-emerald-700 text-white',
};

export function ThermalPrinterUnit({
  stage,
  activeTicket,
  activeJob,
  recentJobs,
  onResetToIdle,
  onSelectRecentJob,
}: ThermalPrinterUnitProps) {
  const [badgeQrUrl, setBadgeQrUrl] = useState<string>('');
  const [showCommands, setShowCommands] = useState(false);
  const [serialStatus, setSerialStatus] = useState<string>('Simulated USB Thermal Roll');
  const [serialPort, setSerialPort] = useState<unknown>(null);

  const displaySubject = activeJob ?? activeTicket;

  useEffect(() => {
    let cancelled = false;
    if (!displaySubject) {
      setBadgeQrUrl('');
      return;
    }

    const qrContent = `${displaySubject.ticketId}|${displaySubject.firstName} ${displaySubject.lastName}|${displaySubject.ticketType}`;
    QRCode.toDataURL(qrContent, {
      width: 200,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setBadgeQrUrl(url);
      })
      .catch(() => {
        if (!cancelled) setBadgeQrUrl('');
      });

    return () => {
      cancelled = true;
    };
  }, [displaySubject?.ticketId, displaySubject?.firstName, displaySubject?.lastName, displaySubject?.ticketType]);

  // Automatically send TSPL commands if a WebSerial thermal printer is paired
  useEffect(() => {
    async function writeToSerial() {
      if (!activeJob || !serialPort) return;
      try {
        const port = serialPort as { writable?: WritableStream<Uint8Array> };
        if (port.writable) {
          const writer = port.writable.getWriter();
          await writer.write(new TextEncoder().encode(activeJob.rawPrinterCommands + '\n'));
          writer.releaseLock();
          setSerialStatus('Sent to USB Thermal Printer');
        }
      } catch {
        setSerialStatus('USB Printer write error (using screen print)');
      }
    }
    writeToSerial();
  }, [activeJob, serialPort]);

  async function handleConnectSerialPrinter() {
    const nav = navigator as Navigator & {
      serial?: { requestPort: () => Promise<{ open: (opts: { baudRate: number }) => Promise<void> }> };
    };
    if (!nav.serial) {
      setSerialStatus('WebSerial unavailable · Use Print Label (62×100mm)');
      return;
    }
    try {
      const port = await nav.serial.requestPort();
      await port.open({ baudRate: 9600 });
      setSerialPort(port);
      setSerialStatus('USB Thermal Printer Connected (9600 baud)');
    } catch {
      setSerialStatus('USB pairing cancelled · Simulated Roll active');
    }
  }

  function handlePrintBrowserSticker() {
    window.print();
  }

  function handleDownloadBadgeSvg() {
    if (!displaySubject) return;
    const verified = activeJob?.verifiedStudent ?? false;
    const tierText =
      displaySubject.ticketType === 'student' && verified
        ? 'STUDENT · ID VERIFIED'
        : TIER_LABEL_TEXT[displaySubject.ticketType] || 'ATTENDEE';

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="372" height="600" viewBox="0 0 372 600">
  <rect width="372" height="600" fill="#ffffff" stroke="#0f172a" stroke-width="4" rx="12"/>
  <rect x="0" y="0" width="372" height="64" fill="#0f172a" rx="12"/>
  <rect x="0" y="48" width="372" height="16" fill="#0f172a"/>
  <text x="24" y="40" fill="#ffffff" font-family="sans-serif" font-size="18" font-weight="700">GOOGLE DEVFEST 2026</text>
  <text x="24" y="136" fill="#0f172a" font-family="sans-serif" font-size="40" font-weight="800">${escapeXml(displaySubject.firstName)}</text>
  <text x="24" y="186" fill="#0f172a" font-family="sans-serif" font-size="40" font-weight="800">${escapeXml(displaySubject.lastName)}</text>
  <text x="24" y="236" fill="#475569" font-family="sans-serif" font-size="18" font-weight="600">${escapeXml(displaySubject.role)}</text>
  <text x="24" y="264" fill="#64748b" font-family="sans-serif" font-size="16">${escapeXml(displaySubject.org)}</text>
  <rect x="24" y="300" width="324" height="44" rx="6" fill="#f1f5f9" stroke="#cbd5e1"/>
  <text x="40" y="328" fill="#0f172a" font-family="monospace" font-size="15" font-weight="700">${escapeXml(tierText)}</text>
  ${badgeQrUrl ? `<image href="${badgeQrUrl}" x="24" y="388" width="132" height="132"/>` : ''}
  <text x="174" y="438" fill="#64748b" font-family="monospace" font-size="13">TICKET ID</text>
  <text x="174" y="462" fill="#0f172a" font-family="monospace" font-size="16" font-weight="700">${escapeXml(displaySubject.ticketId)}</text>
  <text x="174" y="494" fill="#64748b" font-family="sans-serif" font-size="13">${escapeXml(displaySubject.track || 'All Tracks')}</text>
</svg>`;

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `devfest-badge-${displaySubject.firstName.toLowerCase()}-${displaySubject.lastName.toLowerCase()}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section
      aria-label="Thermal label printer unit"
      className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6"
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Badge Label Printer
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            <span>62 × 100 mm adhesive thermal stock</span>
            <span aria-hidden="true"> · </span>
            <span>{serialStatus}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={handleConnectSerialPrinter}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0"
        >
          <Usb className="h-3.5 w-3.5" aria-hidden="true" />
          Connect USB
        </button>
      </div>

      {/* Physical Printer Slot & Emerging Sticker */}
      <div className="mt-5 rounded-xl bg-slate-900 p-5 text-white">
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span className="font-mono">THERMAL UNIT QL-820</span>
          <span className="font-mono tabular-nums">
            {stage === 'printing'
              ? 'FEEDING LABEL...'
              : stage === 'printed'
                ? 'LABEL READY — PEEL & STICK'
                : stage === 'verifying_student_id'
                  ? 'HOLD — STUDENT ID CHECK'
                  : 'READY TO PRINT'}
          </span>
        </div>

        {/* Printer Ejection Slot */}
        <div
          aria-hidden="true"
          className="mt-4 h-3 w-full rounded-full bg-slate-950 ring-1 ring-slate-700"
        />

        {/* Sticker Output Tray */}
        <div className="relative mt-2 flex min-h-[380px] items-center justify-center overflow-hidden rounded-lg bg-slate-800/70 p-4">
          {displaySubject ? (
            <div
              key={activeJob?.jobId || displaySubject.ticketId}
              id="printable-badge-sticker"
              data-testid="printed-badge-sticker"
              className={`w-full max-w-[272px] rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl ${
                stage === 'printed' || stage === 'printing' ? 'animate-label-eject' : ''
              }`}
            >
              {/* Google DevFest 4-Color Accent Strip */}
              <div className="grid h-2 grid-cols-4 overflow-hidden rounded-t-xl">
                <div className="bg-blue-600" />
                <div className="bg-red-500" />
                <div className="bg-amber-400" />
                <div className="bg-emerald-600" />
              </div>

              <div className="p-5">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                  <span className="font-display text-[11px] font-bold tracking-wide text-slate-900 whitespace-nowrap shrink-0">
                    GOOGLE DEVFEST 2026
                  </span>
                  <span className="max-w-[96px] truncate font-mono text-[10px] font-medium text-slate-500 tabular-nums">
                    {displaySubject.track || 'All Tracks'}
                  </span>
                </div>

                {/* First & Last Name */}
                <div className="mt-4">
                  <p className="font-display text-3xl font-extrabold leading-none tracking-tight text-slate-900">
                    {displaySubject.firstName}
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold leading-tight tracking-tight text-slate-800">
                    {displaySubject.lastName}
                  </p>
                </div>

                <div className="mt-3 space-y-0.5 text-xs text-slate-600">
                  <p className="font-semibold text-slate-800">{displaySubject.role}</p>
                  <p>{displaySubject.org}</p>
                </div>

                {/* Tier Banner */}
                <div
                  className={`mt-4 flex items-center justify-between rounded-md px-3 py-2 text-xs font-bold tracking-wide ${
                    TIER_HEADER_STYLE[displaySubject.ticketType] || TIER_HEADER_STYLE.general
                  }`}
                >
                  <span>
                    {displaySubject.ticketType === 'student' && activeJob?.verifiedStudent
                      ? 'STUDENT · ID VERIFIED'
                      : TIER_LABEL_TEXT[displaySubject.ticketType] || 'ATTENDEE'}
                  </span>
                  {displaySubject.ticketType === 'student' && activeJob?.verifiedStudent && (
                    <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                </div>

                {/* Perforated Tear Line & QR Footer */}
                <div className="mt-4 flex items-center gap-3 border-t border-dashed border-slate-300 pt-3.5">
                  {badgeQrUrl ? (
                    <img
                      src={badgeQrUrl}
                      alt={`Badge QR code for ${displaySubject.firstName} ${displaySubject.lastName}`}
                      className="h-16 w-16 rounded border border-slate-200 bg-white p-0.5"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded border border-slate-200 bg-slate-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[10px] font-medium text-slate-400">
                      TICKET ID
                    </p>
                    <p className="truncate font-mono text-xs font-bold text-slate-900 tabular-nums">
                      {displaySubject.ticketId}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-slate-500 tabular-nums">
                      {activeJob
                        ? `PRINTED ${new Date(activeJob.printedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}`
                        : 'AWAITING VERIFICATION'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Printer className="h-10 w-10 text-slate-500" aria-hidden="true" />
              <p className="mt-3 font-display text-base font-semibold text-slate-200">
                Waiting for Ticket QR Scan
              </p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-400">
                Scan an attendee QR ticket on the left. Adhesive badge stickers output automatically in under 2 seconds.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Action Controls for Printed Sticker */}
      {activeJob && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-900">
            <span className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
              <span>
                Printed {activeJob.firstName} {activeJob.lastName} ({activeJob.jobId})
              </span>
            </span>
            <button
              type="button"
              onClick={onResetToIdle}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 hover:underline whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Next Attendee
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrintBrowserSticker}
              className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Print Sticker (62×100mm)
            </button>
            <button
              type="button"
              onClick={handleDownloadBadgeSvg}
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Save SVG
            </button>
            <button
              type="button"
              onClick={() => setShowCommands((v) => !v)}
              className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-medium text-slate-600 transition-colors hover:bg-slate-50 whitespace-nowrap"
              aria-expanded={showCommands}
            >
              <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
              TSPL
            </button>
          </div>

          {showCommands && (
            <pre className="max-h-40 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-slate-200">
              {activeJob.rawPrinterCommands}
            </pre>
          )}
        </div>
      )}

      {/* Recent Printed Feed Strip */}
      {recentJobs.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Recent Printed Badges</span>
            <span className="font-mono tabular-nums">{recentJobs.length} printed</span>
          </div>
          <ul className="mt-2.5 divide-y divide-slate-100">
            {recentJobs.slice(0, 4).map((job) => (
              <li key={job.jobId}>
                <button
                  type="button"
                  onClick={() => onSelectRecentJob(job)}
                  className="flex w-full items-center justify-between py-2 text-left text-sm transition-colors hover:bg-slate-50 rounded px-1.5"
                >
                  <span className="font-medium text-slate-900">
                    {job.firstName} {job.lastName}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{job.ticketType === 'student' ? 'Student Verified' : job.ticketType}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {new Date(job.printedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
