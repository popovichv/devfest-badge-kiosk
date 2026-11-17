import { useCallback, useEffect, useMemo, useState } from 'react';
import { TopBar, type AppView } from './components/TopBar';
import { QrScannerPanel } from './components/QrScannerPanel';
import { StudentIdVerifier } from './components/StudentIdVerifier';
import { ThermalPrinterUnit } from './components/ThermalPrinterUnit';
import { RosterView } from './components/RosterView';
import { TicketBuilderView } from './components/TicketBuilderView';
import type {
  AttendeeRecord,
  KioskStage,
  PrintJob,
  StudentVerificationResult,
  TicketPayload,
} from './types';
import { INITIAL_ATTENDEES } from './utils/attendeeSeed';
import {
  encodeTicketQrPayload,
  parseTicketQrPayload,
  requiresStudentIdVerification,
} from './utils/qrParser';

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('kiosk');
  const [attendees, setAttendees] = useState<AttendeeRecord[]>(INITIAL_ATTENDEES);
  const [printQueue, setPrintQueue] = useState<PrintJob[]>([]);

  const [stage, setStage] = useState<KioskStage>('idle');
  const [activeTicket, setActiveTicket] = useState<TicketPayload | null>(null);
  const [activeJob, setActiveJob] = useState<PrintJob | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadRoster() {
      try {
        const res = await fetch('/api/attendees');
        if (!res.ok) return;
        const data = (await res.json()) as {
          attendees?: AttendeeRecord[];
          printQueue?: PrintJob[];
        };
        if (!cancelled && data.attendees) {
          setAttendees(data.attendees);
        }
        if (!cancelled && data.printQueue) {
          setPrintQueue(data.printQueue);
        }
      } catch {
        // Keep initial seed state if server request fails
      }
    }
    loadRoster();
    return () => {
      cancelled = true;
    };
  }, []);

  const demoTickets = useMemo<TicketPayload[]>(() => {
    const preferredIds = ['DF26-GEN-101', 'DF26-SPK-012', 'DF26-STU-204', 'DF26-STU-209'];
    const picked = preferredIds
      .map((id) => attendees.find((a) => a.ticketId === id))
      .filter((a): a is AttendeeRecord => Boolean(a));
    return picked.length > 0 ? picked : attendees.slice(0, 4);
  }, [attendees]);

  const executeCheckInAndPrint = useCallback(
    async (ticket: TicketPayload, studentVerification?: StudentVerificationResult) => {
      setStage('printing');
      setActiveTicket(ticket);
      setScanError(null);

      try {
        const res = await fetch('/api/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket, studentVerification }),
        });

        const data = (await res.json()) as {
          attendee?: AttendeeRecord;
          printJob?: PrintJob;
          error?: string;
        };

        if (!res.ok || !data.printJob || !data.attendee) {
          throw new Error(data.error || 'Failed to queue label print job.');
        }

        setAttendees((prev) => {
          const exists = prev.some((a) => a.ticketId === data.attendee!.ticketId);
          if (exists) {
            return prev.map((a) =>
              a.ticketId === data.attendee!.ticketId ? data.attendee! : a
            );
          }
          return [data.attendee!, ...prev];
        });

        setPrintQueue((prev) => [data.printJob!, ...prev]);
        setActiveJob(data.printJob);
        setStage('printed');
      } catch (err) {
        setStage('error');
        setScanError(
          err instanceof Error ? err.message : 'Unable to print badge sticker.'
        );
      }
    },
    []
  );

  const handleQrDecoded = useCallback(
    (rawPayload: string) => {
      setScanError(null);
      const parsed = parseTicketQrPayload(rawPayload);
      if (!parsed) {
        setScanError(
          'Unrecognized QR code. Scan a valid Google DevFest ticket QR or use one of the demo tickets.'
        );
        return;
      }

      // Enrich with roster metadata if ticketId matches
      const matched = attendees.find(
        (a) => a.ticketId.toLowerCase() === parsed.ticketId.toLowerCase()
      );
      const enriched: TicketPayload = matched
        ? {
            ...parsed,
            role: parsed.role === 'Attendee' ? matched.role : parsed.role,
            org: parsed.org === 'DevFest Community' ? matched.org : parsed.org,
            track: matched.track || parsed.track,
          }
        : parsed;

      setActiveTicket(enriched);
      setActiveJob(null);

      if (requiresStudentIdVerification(enriched.ticketType)) {
        setStage('verifying_student_id');
        return;
      }

      executeCheckInAndPrint(enriched);
    },
    [attendees, executeCheckInAndPrint]
  );

  const handleResetKiosk = useCallback(() => {
    if (stage !== 'idle' || activeTicket || activeJob) {
      setStage('idle');
      setActiveTicket(null);
      setActiveJob(null);
      setScanError(null);
      setActiveView('kiosk');
      return;
    }

    // When already idle, "Test Print" prints the first general demo attendee
    const sample = demoTickets[0];
    if (sample) {
      setActiveView('kiosk');
      handleQrDecoded(encodeTicketQrPayload(sample));
    }
  }, [activeJob, activeTicket, demoTickets, handleQrDecoded, stage]);

  const handleReprintAttendee = useCallback(
    (attendee: AttendeeRecord) => {
      setActiveView('kiosk');
      executeCheckInAndPrint(attendee, attendee.studentVerification);
    },
    [executeCheckInAndPrint]
  );

  const handleScanAttendeeInKiosk = useCallback(
    (attendee: AttendeeRecord) => {
      setActiveView('kiosk');
      handleQrDecoded(encodeTicketQrPayload(attendee));
    },
    [handleQrDecoded]
  );

  const handleRegisterAndScan = useCallback(
    async (ticket: TicketPayload) => {
      const res = await fetch('/api/attendees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticket),
      });
      const data = (await res.json()) as { attendee?: AttendeeRecord };
      if (data.attendee) {
        setAttendees((prev) => {
          const exists = prev.some((a) => a.ticketId === data.attendee!.ticketId);
          return exists ? prev : [data.attendee!, ...prev];
        });
      }
      setActiveView('kiosk');
      handleQrDecoded(encodeTicketQrPayload(ticket));
    },
    [handleQrDecoded]
  );

  const checkedInCount = attendees.filter((a) => a.status === 'printed').length;
  const studentVerifiedCount = attendees.filter(
    (a) => a.ticketType === 'student' && a.studentVerification?.decision === 'approved'
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <TopBar
        activeView={activeView}
        onSelectView={setActiveView}
        onResetKiosk={handleResetKiosk}
        kioskBusy={stage !== 'idle' || Boolean(activeTicket)}
      />

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Clean Contextual Summary Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {activeView === 'kiosk'
                ? 'Self-Service Badge Printing Kiosk'
                : activeView === 'roster'
                  ? 'Registration Desk & Print Log'
                  : 'Digital Ticket QR Builder'}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              <span>Google DevFest 2026</span>
              <span aria-hidden="true"> · </span>
              <span className="tabular-nums">{checkedInCount} of {attendees.length} checked in</span>
              <span aria-hidden="true"> · </span>
              <span className="tabular-nums">{studentVerifiedCount} student IDs verified</span>
            </p>
          </div>
        </div>

        {activeView === 'kiosk' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-7">
              {stage === 'verifying_student_id' && activeTicket ? (
                <StudentIdVerifier
                  ticket={activeTicket}
                  onVerificationApproved={(verification) =>
                    executeCheckInAndPrint(activeTicket, verification)
                  }
                  onVerificationRejected={(verification) => {
                    setAttendees((prev) =>
                      prev.map((a) =>
                        a.ticketId === activeTicket.ticketId
                          ? {
                              ...a,
                              status: 'student_rejected',
                              studentVerification: verification,
                            }
                          : a
                      )
                    );
                  }}
                  onBackToScanner={() => {
                    setStage('idle');
                    setActiveTicket(null);
                    setActiveJob(null);
                  }}
                />
              ) : (
                <QrScannerPanel
                  demoTickets={demoTickets}
                  onQrDecoded={handleQrDecoded}
                  scanError={scanError}
                  disabled={stage === 'printing'}
                />
              )}
            </div>

            <div className="lg:col-span-5">
              <ThermalPrinterUnit
                stage={stage}
                activeTicket={activeTicket}
                activeJob={activeJob}
                recentJobs={printQueue}
                onResetToIdle={() => {
                  setStage('idle');
                  setActiveTicket(null);
                  setActiveJob(null);
                  setScanError(null);
                }}
                onSelectRecentJob={(job) => {
                  setActiveJob(job);
                  setActiveTicket(job);
                  setStage('printed');
                }}
              />
            </div>
          </div>
        )}

        {activeView === 'roster' && (
          <RosterView
            attendees={attendees}
            onReprintAttendee={handleReprintAttendee}
            onScanAttendeeInKiosk={handleScanAttendeeInKiosk}
          />
        )}

        {activeView === 'tickets' && (
          <TicketBuilderView onRegisterAndScan={handleRegisterAndScan} />
        )}
      </main>
    </div>
  );
}
