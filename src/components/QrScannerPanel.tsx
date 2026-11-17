import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import {
  Camera,
  CameraOff,
  Keyboard,
  QrCode,
  Upload,
} from 'lucide-react';
import type { TicketPayload } from '../types';
import { encodeTicketQrPayload } from '../utils/qrParser';

interface QrScannerPanelProps {
  demoTickets: TicketPayload[];
  onQrDecoded: (rawPayload: string, source: 'camera' | 'upload' | 'manual' | 'demo') => void;
  scanError: string | null;
  disabled?: boolean;
}

export function QrScannerPanel({
  demoTickets,
  onQrDecoded,
  scanError,
  disabled = false,
}: QrScannerPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastDecodedRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraNotice, setCameraNotice] = useState<string>(
    'Start the kiosk camera to scan a phone QR ticket, upload a QR image, or use a quick demo ticket below.'
  );
  const [manualInput, setManualInput] = useState('');
  const [demoQrImages, setDemoQrImages] = useState<Record<string, string>>({});

  // Render real QR code PNG data URLs for the demo ticket cards
  useEffect(() => {
    let cancelled = false;
    async function buildDemoQrs() {
      const entries = await Promise.all(
        demoTickets.map(async (t) => {
          const payload = encodeTicketQrPayload(t);
          const url = await QRCode.toDataURL(payload, {
            width: 140,
            margin: 1,
            color: { dark: '#0f172a', light: '#ffffff' },
          });
          return [t.ticketId, url] as const;
        })
      );
      if (!cancelled) {
        setDemoQrImages(Object.fromEntries(entries));
      }
    }
    buildDemoQrs();
    return () => {
      cancelled = true;
    };
  }, [demoTickets]);

  // Real-time jsQR frame loop while cameraActive is true
  useEffect(() => {
    if (!cameraActive || disabled) return;

    let rafId = 0;
    let stopped = false;

    const scanFrame = () => {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w > 0 && h > 0) {
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, w, h);
            const imgData = ctx.getImageData(0, 0, w, h);
            const decoded = jsQR(imgData.data, w, h, {
              inversionAttempts: 'dontInvert',
            });
            if (decoded?.data) {
              const now = Date.now();
              if (
                decoded.data !== lastDecodedRef.current.text ||
                now - lastDecodedRef.current.at > 2500
              ) {
                lastDecodedRef.current = { text: decoded.data, at: now };
                onQrDecoded(decoded.data, 'camera');
              }
            }
          }
        }
      }
      rafId = requestAnimationFrame(scanFrame);
    };

    rafId = requestAnimationFrame(scanFrame);
    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
    };
  }, [cameraActive, disabled, onQrDecoded]);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  function stopCameraStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }

  async function handleToggleCamera() {
    if (cameraActive) {
      stopCameraStream();
      setCameraNotice('Camera paused. You can re-enable it anytime or scan using a QR image.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraNotice('Browser camera API unavailable here. Upload a QR ticket image or test with a demo ticket.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setCameraNotice('Camera active — hold attendee QR ticket inside the frame.');
    } catch {
      setCameraNotice('Camera access was not granted. Use Upload QR Image or a Demo Ticket below.');
      setCameraActive(false);
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(imageData.data, canvas.width, canvas.height);
        if (decoded?.data) {
          onQrDecoded(decoded.data, 'upload');
        } else {
          onQrDecoded('INVALID_QR_IMAGE', 'upload');
        }
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualInput.trim()) return;
    onQrDecoded(manualInput.trim(), 'manual');
    setManualInput('');
  }

  return (
    <section
      aria-label="QR ticket scanner"
      className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6"
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Step 1 · Ticket QR Scanner
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Extracts attendee name and ticket tier to trigger badge printing or Student ID check.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleToggleCamera}
            disabled={disabled}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              cameraActive
                ? 'border border-slate-300 bg-slate-100 text-slate-900 hover:bg-slate-200'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            } disabled:opacity-50`}
          >
            {cameraActive ? (
              <>
                <CameraOff className="h-3.5 w-3.5" aria-hidden="true" />
                Stop Camera
              </>
            ) : (
              <>
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                Start Camera
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Upload QR
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            aria-label="Upload QR ticket image"
          />
        </div>
      </div>

      {/* Optical Scanner Viewport */}
      <div className="relative mt-5 overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
        <div className="relative flex h-60 w-full items-center justify-center">
          <video
            ref={videoRef}
            muted
            playsInline
            className={`h-full w-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
          />
          <canvas ref={canvasRef} className="hidden" />

          {!cameraActive && (
            <div className="flex flex-col items-center justify-center px-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-slate-700 bg-slate-900">
                <QrCode className="h-8 w-8 text-blue-400" aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-100">
                Optical QR Reader Standby
              </p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
                {cameraNotice}
              </p>
            </div>
          )}

          {/* Corner Framing Reticle */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div className="relative h-48 w-48 rounded-lg border border-white/25">
              <span className="absolute -left-px -top-px h-4 w-4 rounded-tl-md border-l-2 border-t-2 border-blue-400" />
              <span className="absolute -right-px -top-px h-4 w-4 rounded-tr-md border-r-2 border-t-2 border-blue-400" />
              <span className="absolute -bottom-px -left-px h-4 w-4 rounded-bl-md border-b-2 border-l-2 border-blue-400" />
              <span className="absolute -bottom-px -right-px h-4 w-4 rounded-br-md border-b-2 border-r-2 border-blue-400" />
              {cameraActive && (
                <div className="animate-scan-beam h-0.5 w-full bg-blue-400" />
              )}
            </div>
          </div>
        </div>
      </div>

      {scanError && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-800"
        >
          {scanError}
        </div>
      )}

      {/* Hardware Barcode Wedge / Manual Payload Entry */}
      <form onSubmit={handleManualSubmit} className="mt-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Keyboard
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            disabled={disabled}
            placeholder="USB scanner input or paste payload (e.g. DEVFEST26|Ada|Lovelace|general)"
            aria-label="Hardware QR scanner input or ticket payload"
            className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={disabled || !manualInput.trim()}
          className="min-h-[42px] rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
        >
          Process QR
        </button>
      </form>

      {/* Instant Demo Ticket QR Cards */}
      <div className="mt-6 border-t border-slate-100 pt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Quick Demo Tickets (Click to Scan)
          </h3>
          <span className="text-xs text-slate-400">Real QR payloads</span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {demoTickets.map((ticket) => {
            const isStudent = ticket.ticketType === 'student';
            return (
              <button
                key={ticket.ticketId}
                type="button"
                disabled={disabled}
                onClick={() => onQrDecoded(encodeTicketQrPayload(ticket), 'demo')}
                className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left transition-colors hover:border-blue-500 hover:bg-blue-50/40 disabled:opacity-50"
              >
                {demoQrImages[ticket.ticketId] ? (
                  <img
                    src={demoQrImages[ticket.ticketId]}
                    alt={`QR code for ${ticket.firstName} ${ticket.lastName}`}
                    className="h-14 w-14 shrink-0 rounded-md border border-slate-200 bg-white p-0.5"
                  />
                ) : (
                  <div className="h-14 w-14 shrink-0 rounded-md border border-slate-200 bg-white" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold text-slate-900 group-hover:text-blue-700">
                    {ticket.firstName} {ticket.lastName}
                  </p>
                  <p className="truncate text-xs text-slate-600">
                    {isStudent ? 'Student Ticket · Requires ID' : `${ticket.ticketType} · Instant Print`}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400 tabular-nums">
                    {ticket.ticketId}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
