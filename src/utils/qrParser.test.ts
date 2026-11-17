import test from 'node:test';
import assert from 'node:assert/strict';
import {
  doesExtractedNameMatch,
  encodeTicketQrPayload,
  generateThermalLabelCommands,
  normalizeTicketTier,
  parseTicketQrPayload,
  requiresStudentIdVerification,
} from './qrParser';

test('parseTicketQrPayload decodes compact JSON QR payloads accurately', () => {
  const encoded = encodeTicketQrPayload({
    ticketId: 'DF26-STU-204',
    firstName: 'Maya',
    lastName: 'Lin',
    ticketType: 'student',
    role: 'CS Undergraduate',
    org: 'Pacific Tech University',
    track: 'Web & Cloud',
  });

  const parsed = parseTicketQrPayload(encoded);
  assert.ok(parsed);
  assert.equal(parsed.firstName, 'Maya');
  assert.equal(parsed.lastName, 'Lin');
  assert.equal(parsed.ticketType, 'student');
  assert.equal(parsed.ticketId, 'DF26-STU-204');
  assert.equal(parsed.org, 'Pacific Tech University');
});

test('parseTicketQrPayload supports pipe-delimited and query-string QR formats', () => {
  const piped = parseTicketQrPayload('DEVFEST26|Elena|Rostova|general|DF26-GEN-101|CloudScale AI|Staff ML Engineer');
  assert.ok(piped);
  assert.equal(piped.firstName, 'Elena');
  assert.equal(piped.lastName, 'Rostova');
  assert.equal(piped.ticketType, 'general');
  assert.equal(piped.ticketId, 'DF26-GEN-101');

  const query = parseTicketQrPayload('devfest://checkin?firstName=David&lastName=Okafor&type=speaker&id=DF26-SPK-012');
  assert.ok(query);
  assert.equal(query.firstName, 'David');
  assert.equal(query.lastName, 'Okafor');
  assert.equal(query.ticketType, 'speaker');
});

test('parseTicketQrPayload returns null for malformed or incomplete payloads', () => {
  assert.equal(parseTicketQrPayload(''), null);
  assert.equal(parseTicketQrPayload('not-a-ticket'), null);
  assert.equal(parseTicketQrPayload('{"fn":"OnlyFirst"}'), null);
});

test('requiresStudentIdVerification gates student tickets only', () => {
  assert.equal(requiresStudentIdVerification('student'), true);
  assert.equal(requiresStudentIdVerification('general'), false);
  assert.equal(requiresStudentIdVerification('speaker'), false);
  assert.equal(requiresStudentIdVerification('organizer'), false);
  assert.equal(normalizeTicketTier('university'), 'student');
});

test('doesExtractedNameMatch handles case, punctuation, and middle initials', () => {
  assert.equal(doesExtractedNameMatch('MAYA LIN', 'Maya', 'Lin'), true);
  assert.equal(doesExtractedNameMatch('Lin, Maya K.', 'Maya', 'Lin'), true);
  assert.equal(doesExtractedNameMatch('Alex Mercer', 'Maya', 'Lin'), false);
});

test('generateThermalLabelCommands emits valid TSPL label output', () => {
  const cmd = generateThermalLabelCommands({
    firstName: 'Maya',
    lastName: 'Lin',
    ticketType: 'student',
    ticketId: 'DF26-STU-204',
    role: 'CS Undergraduate',
    org: 'Pacific Tech University',
    verifiedStudent: true,
  });

  assert.match(cmd, /SIZE 62 mm, 100 mm/);
  assert.match(cmd, /"MAYA"/);
  assert.match(cmd, /"LIN"/);
  assert.match(cmd, /STUDENT · ID VERIFIED/);
  assert.match(cmd, /PRINT 1,1/);
});
