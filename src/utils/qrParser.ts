import type { TicketPayload, TicketTier } from '../types';

const VALID_TIERS: ReadonlySet<string> = new Set([
  'general',
  'student',
  'speaker',
  'organizer',
]);

export function normalizeTicketTier(value: unknown): TicketTier {
  if (typeof value !== 'string') return 'general';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'vip' || normalized === 'gde') return 'speaker';
  if (normalized === 'volunteer' || normalized === 'staff') return 'organizer';
  if (normalized === 'edu' || normalized === 'university' || normalized === 'academic') {
    return 'student';
  }
  return VALID_TIERS.has(normalized) ? (normalized as TicketTier) : 'general';
}

export function requiresStudentIdVerification(ticketType: TicketTier): boolean {
  return ticketType === 'student';
}

export function encodeTicketQrPayload(ticket: TicketPayload): string {
  return JSON.stringify({
    v: 1,
    id: ticket.ticketId,
    fn: ticket.firstName.trim(),
    ln: ticket.lastName.trim(),
    t: ticket.ticketType,
    r: ticket.role.trim(),
    o: ticket.org.trim(),
    tr: ticket.track?.trim() || 'Main Track',
  });
}

function sanitizeName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
}

export function parseTicketQrPayload(rawInput: string): TicketPayload | null {
  const raw = rawInput.trim();
  if (!raw) return null;

  // 1. JSON format (both compact v1 keys and verbose keys)
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const firstName = sanitizeName(parsed.fn ?? parsed.firstName ?? parsed.first_name);
      const lastName = sanitizeName(parsed.ln ?? parsed.lastName ?? parsed.last_name);
      if (!firstName || !lastName) return null;

      const ticketId =
        sanitizeName(parsed.id ?? parsed.ticketId ?? parsed.ticket_id) ||
        `DF26-${firstName.slice(0, 2).toUpperCase()}${lastName.slice(0, 2).toUpperCase()}`;

      return {
        ticketId,
        firstName,
        lastName,
        ticketType: normalizeTicketTier(parsed.t ?? parsed.ticketType ?? parsed.ticket_type ?? parsed.tier),
        role: sanitizeName(parsed.r ?? parsed.role) || 'Attendee',
        org: sanitizeName(parsed.o ?? parsed.org ?? parsed.company ?? parsed.university) || 'DevFest Community',
        track: sanitizeName(parsed.tr ?? parsed.track) || 'All Tracks',
      };
    } catch {
      return null;
    }
  }

  // 2. Pipe-delimited format: DEVFEST26|FirstName|LastName|ticketType|ticketId|org|role
  if (raw.includes('|')) {
    const parts = raw.split('|').map((p) => p.trim());
    const startIdx = parts[0].toUpperCase().startsWith('DEVFEST') ? 1 : 0;
    const firstName = sanitizeName(parts[startIdx]);
    const lastName = sanitizeName(parts[startIdx + 1]);
    if (!firstName || !lastName) return null;

    return {
      ticketId: sanitizeName(parts[startIdx + 3]) || `DF26-${firstName.slice(0, 2).toUpperCase()}${lastName.slice(0, 2).toUpperCase()}`,
      firstName,
      lastName,
      ticketType: normalizeTicketTier(parts[startIdx + 2] ?? 'general'),
      org: sanitizeName(parts[startIdx + 4]) || 'DevFest Community',
      role: sanitizeName(parts[startIdx + 5]) || 'Attendee',
      track: 'All Tracks',
    };
  }

  // 3. URL / Query string format: devfest://checkin?firstName=Maya&lastName=Lin&type=student
  if (raw.includes('firstName=') || raw.includes('fn=')) {
    const queryPart = raw.includes('?') ? raw.split('?')[1] : raw;
    const params = new URLSearchParams(queryPart);
    const firstName = sanitizeName(params.get('firstName') ?? params.get('fn'));
    const lastName = sanitizeName(params.get('lastName') ?? params.get('ln'));
    if (!firstName || !lastName) return null;

    return {
      ticketId: sanitizeName(params.get('ticketId') ?? params.get('id')) || `DF26-${firstName.slice(0, 2).toUpperCase()}${lastName.slice(0, 2).toUpperCase()}`,
      firstName,
      lastName,
      ticketType: normalizeTicketTier(params.get('ticketType') ?? params.get('type') ?? params.get('t')),
      role: sanitizeName(params.get('role')) || 'Attendee',
      org: sanitizeName(params.get('org')) || 'DevFest Community',
      track: sanitizeName(params.get('track')) || 'All Tracks',
    };
  }

  return null;
}

export function generateThermalLabelCommands(job: {
  firstName: string;
  lastName: string;
  ticketType: TicketTier;
  ticketId: string;
  role: string;
  org: string;
  verifiedStudent: boolean;
}): string {
  const tierLabel =
    job.ticketType === 'student'
      ? job.verifiedStudent
        ? 'STUDENT · ID VERIFIED'
        : 'STUDENT'
      : job.ticketType.toUpperCase();

  const lines = [
    'SIZE 62 mm, 100 mm',
    'GAP 3 mm, 0 mm',
    'DIRECTION 1',
    'CLS',
    'TEXT 36,34,"3",0,1,1,"GOOGLE DEVFEST 2026"',
    'BAR 36,72,424,3',
    `TEXT 36,105,"4",0,2,2,"${job.firstName.toUpperCase()}"`,
    `TEXT 36,165,"4",0,2,2,"${job.lastName.toUpperCase()}"`,
    `TEXT 36,245,"2",0,1,1,"${job.role}"`,
    `TEXT 36,278,"2",0,1,1,"${job.org}"`,
    `BOX 36,330,460,382,3`,
    `TEXT 52,344,"3",0,1,1,"${tierLabel}"`,
    `QRCODE 36,415,M,6,A,0,"${job.ticketId}|${job.firstName} ${job.lastName}"`,
    `TEXT 220,460,"2",0,1,1,"ID: ${job.ticketId}"`,
    'PRINT 1,1',
  ];

  return lines.join('\n');
}

export function doesExtractedNameMatch(
  extractedName: string,
  expectedFirstName: string,
  expectedLastName: string
): boolean {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  const tokens = clean(extractedName);
  const firstTokens = clean(expectedFirstName);
  const lastTokens = clean(expectedLastName);

  if (tokens.length === 0 || firstTokens.length === 0 || lastTokens.length === 0) {
    return false;
  }

  const hasFirst = firstTokens.every((t) => tokens.includes(t));
  const hasLast = lastTokens.every((t) => tokens.includes(t));
  return hasFirst && hasLast;
}
