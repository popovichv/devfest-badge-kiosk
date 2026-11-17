export type TicketTier = 'general' | 'student' | 'speaker' | 'organizer';

export type CheckInStatus =
  | 'pending'
  | 'printed'
  | 'awaiting_student_id'
  | 'student_rejected';

export type KioskStage =
  | 'idle'
  | 'verifying_student_id'
  | 'printing'
  | 'printed'
  | 'error';

export interface TicketPayload {
  ticketId: string;
  firstName: string;
  lastName: string;
  ticketType: TicketTier;
  role: string;
  org: string;
  track?: string;
}

export interface StudentVerificationResult {
  decision: 'approved' | 'rejected' | 'manual_review';
  isStudentIdCard: boolean;
  isCurrentAndValid: boolean;
  nameMatchesTicket: boolean;
  extractedName: string;
  institution: string;
  expirationText: string;
  confidence: number;
  reason: string;
  verifiedAt: string;
  overrideByVolunteer?: boolean;
}

export interface AttendeeRecord extends TicketPayload {
  email: string;
  status: CheckInStatus;
  checkedInAt?: string;
  printedAt?: string;
  printCount: number;
  studentVerification?: StudentVerificationResult;
}

export interface PrintJob {
  jobId: string;
  ticketId: string;
  firstName: string;
  lastName: string;
  ticketType: TicketTier;
  role: string;
  org: string;
  track?: string;
  verifiedStudent: boolean;
  printedAt: string;
  rawPrinterCommands: string;
}
