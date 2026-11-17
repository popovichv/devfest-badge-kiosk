import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import type { StudentVerificationResult, TicketPayload } from '../types';
import validSampleIdImg from '../assets/images/sample-student-id-valid.webp';
import expiredSampleIdImg from '../assets/images/sample-student-id-expired.webp';

interface StudentIdVerifierProps {
  ticket: TicketPayload;
  onVerificationApproved: (result: StudentVerificationResult) => void;
  onVerificationRejected?: (result: StudentVerificationResult) => void;
  onBackToScanner: () => void;
}

export function StudentIdVerifier({
  ticket,
  onVerificationApproved,
  onVerificationRejected,
  onBackToScanner,
}: StudentIdVerifierProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [result, setResult] = useState<StudentVerificationResult | null>(null);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
  }

  async function startCamera() {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera unavailable in this browser. Upload a photo or select a sample Student ID.');
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
      setCameraOn(true);
    } catch {
      setCameraError('Camera permission declined. Use Upload ID Photo or Sample Student ID below.');
    }
  }

  async function submitImageForVerification(dataUrl: string, mimeType: string) {
    setCapturedPreviewUrl(dataUrl);
    setVerifying(true);
    setApiError(null);
    setResult(null);

    try {
      const response = await fetch('/api/verify-student-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUrl,
          mimeType,
          expectedFirstName: ticket.firstName,
          expectedLastName: ticket.lastName,
          ticketId: ticket.ticketId,
        }),
      });

      const payload = (await response.json()) as {
        verification?: StudentVerificationResult;
        error?: string;
      };

      if (!response.ok || !payload.verification) {
        throw new Error(payload.error || 'Unable to verify Student ID.');
      }

      setResult(payload.verification);
      if (payload.verification.decision === 'approved') {
        stopCamera();
        // Brief pause so attendee sees the green confirmation before label prints
        setTimeout(() => {
          onVerificationApproved(payload.verification!);
        }, 700);
      } else {
        onVerificationRejected?.(payload.verification);
      }
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Verification request failed.');
    } finally {
      setVerifying(false);
    }
  }

  function handleCaptureSnapshot() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    stopCamera();
    submitImageForVerification(dataUrl, 'image/jpeg');
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        submitImageForVerification(reader.result, file.type || 'image/jpeg');
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  async function handleTestSampleId(imageUrl: string) {
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          submitImageForVerification(reader.result, blob.type || 'image/jpeg');
        }
      };
      reader.readAsDataURL(blob);
    } catch {
      setApiError('Failed to load sample student ID image.');
    }
  }

  function handleVolunteerOverride() {
    const overrideResult: StudentVerificationResult = {
      decision: 'approved',
      isStudentIdCard: true,
      isCurrentAndValid: true,
      nameMatchesTicket: true,
      extractedName: `${ticket.firstName} ${ticket.lastName}`,
      institution: ticket.org,
      expirationText: 'Manual Volunteer Check',
      confidence: 1,
      reason: 'Approved manually by registration desk volunteer.',
      verifiedAt: new Date().toISOString(),
      overrideByVolunteer: true,
    };
    onVerificationApproved(overrideResult);
  }

  return (
    <section
      aria-label="Student ID verification gate"
      className="flex flex-col rounded-2xl border border-amber-300 bg-white p-6"
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
            Student Ticket Verification Required
          </p>
          <h2 className="mt-1 font-display text-lg font-bold text-slate-900">
            Step 2 · Student ID Photo Check
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            <span>Ticket holder: </span>
            <strong className="font-semibold text-slate-900">
              {ticket.firstName} {ticket.lastName}
            </strong>
            <span aria-hidden="true"> · </span>
            <span className="font-mono text-xs">{ticket.ticketId}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            stopCamera();
            onBackToScanner();
          }}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Cancel
        </button>
      </div>

      {/* Camera / Captured ID Card Frame */}
      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
        <div className="relative flex h-60 w-full items-center justify-center">
          <video
            ref={videoRef}
            muted
            playsInline
            className={`h-full w-full object-cover ${cameraOn ? 'block' : 'hidden'}`}
          />

          {!cameraOn && capturedPreviewUrl && (
            <img
              src={capturedPreviewUrl}
              alt="Captured student ID for verification"
              className="h-full w-full object-contain bg-slate-900"
            />
          )}

          {!cameraOn && !capturedPreviewUrl && (
            <div className="flex flex-col items-center justify-center px-6 text-center">
              <Camera className="h-9 w-9 text-amber-400" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-white">
                Hold Student ID Card in Front of Camera
              </p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
                {cameraError ||
                  'AI checks institution name, validity date, and matches the printed name to the DevFest ticket.'}
              </p>
            </div>
          )}

          {verifying && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/75 backdrop-blur-xs">
              <Loader2 className="h-8 w-8 animate-spin text-blue-400" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-white">
                Analyzing Student ID with Gemini Vision...
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Camera & Upload Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!cameraOn ? (
          <button
            type="button"
            onClick={startCamera}
            disabled={verifying}
            className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap disabled:opacity-50"
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            Open ID Camera
          </button>
        ) : (
          <button
            type="button"
            onClick={handleCaptureSnapshot}
            disabled={verifying}
            className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 whitespace-nowrap disabled:opacity-50"
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            Take Photo & Verify
          </button>
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={verifying}
          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap disabled:opacity-50"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          Upload Photo
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
          aria-label="Upload student ID photo"
        />
      </div>

      {/* Verification Error */}
      {apiError && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-900"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold">Verification Error</p>
            <p className="mt-0.5 text-xs text-red-700">{apiError}</p>
          </div>
        </div>
      )}

      {/* AI Verification Result */}
      {result && (
        <div
          data-testid="student-verification-result"
          className={`mt-4 rounded-xl border p-4 ${
            result.decision === 'approved'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
              : 'border-red-200 bg-red-50 text-red-950'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              {result.decision === 'approved' ? (
                <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" aria-hidden="true" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-red-600 shrink-0" aria-hidden="true" />
              )}
              <span className="font-display text-sm font-bold">
                {result.decision === 'approved'
                  ? 'Student ID Verified — Printing Badge'
                  : 'Student ID Rejected'}
              </span>
            </div>
            <span className="font-mono text-xs font-semibold tabular-nums">
              {Math.round((result.confidence || 0) * 100)}% conf
            </span>
          </div>

          <p className="mt-2 text-sm">{result.reason}</p>

          <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-black/10 pt-3 text-xs">
            <div>
              <dt className="text-slate-500">Extracted Name</dt>
              <dd className="font-semibold">{result.extractedName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Institution</dt>
              <dd className="font-semibold">{result.institution}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Validity</dt>
              <dd className="font-mono font-semibold">{result.expirationText}</dd>
            </div>
          </dl>

          {result.decision !== 'approved' && (
            <div className="mt-3 flex items-center justify-end gap-2 border-t border-red-200 pt-3">
              <button
                type="button"
                onClick={handleVolunteerOverride}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                Volunteer Override & Print
              </button>
            </div>
          )}
        </div>
      )}

      {/* Demo Student ID Photos (Real Images Sent to Gemini Vision API) */}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Demo Student ID Cards (Live AI Vision Test)
        </p>
        <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={verifying}
            onClick={() => handleTestSampleId(validSampleIdImg)}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50/40 disabled:opacity-50"
          >
            <img
              src={validSampleIdImg}
              alt="Sample valid Pacific Tech University student ID for Maya Lin"
              referrerPolicy="no-referrer"
              className="h-12 w-16 rounded object-cover border border-slate-200 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900">Maya Lin · Valid 2027 ID</p>
              <p className="text-[11px] text-slate-500">Pacific Tech University</p>
            </div>
          </button>

          <button
            type="button"
            disabled={verifying}
            onClick={() => handleTestSampleId(expiredSampleIdImg)}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-left transition-colors hover:border-red-500 hover:bg-red-50/40 disabled:opacity-50"
          >
            <img
              src={expiredSampleIdImg}
              alt="Sample expired Metro State College student ID for Alex Mercer"
              referrerPolicy="no-referrer"
              className="h-12 w-16 rounded object-cover border border-slate-200 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900">Alex Mercer · Expired 2021</p>
              <p className="text-[11px] text-slate-500">Metro State College</p>
            </div>
          </button>
        </div>
      </div>
    </section>
  );
}
