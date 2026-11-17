import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { INITIAL_ATTENDEES } from './src/utils/attendeeSeed.ts';
import { doesExtractedNameMatch, generateThermalLabelCommands } from './src/utils/qrParser.ts';
import type { AttendeeRecord, PrintJob, StudentVerificationResult, TicketPayload } from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '12mb' }));

// In-memory conference session store seeded with DevFest 2026 attendees
const attendees: AttendeeRecord[] = structuredClone(INITIAL_ATTENDEES);
const printQueue: PrintJob[] = attendees
  .filter((a) => a.status === 'printed')
  .map((a, idx) => ({
    jobId: `JOB-${100 + idx}`,
    ticketId: a.ticketId,
    firstName: a.firstName,
    lastName: a.lastName,
    ticketType: a.ticketType,
    role: a.role,
    org: a.org,
    track: a.track,
    verifiedStudent: a.ticketType === 'student',
    printedAt: a.printedAt || new Date().toISOString(),
    rawPrinterCommands: generateThermalLabelCommands({
      firstName: a.firstName,
      lastName: a.lastName,
      ticketType: a.ticketType,
      ticketId: a.ticketId,
      role: a.role,
      org: a.org,
      verifiedStudent: a.ticketType === 'student',
    }),
  }));

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    attendeeCount: attendees.length,
    printedCount: printQueue.length,
  });
});

app.get('/api/attendees', (_req, res) => {
  res.json({
    attendees,
    printQueue,
  });
});

app.post('/api/attendees', (req, res) => {
  const payload = req.body as Partial<TicketPayload> & { email?: string };
  const firstName = (payload.firstName || '').trim();
  const lastName = (payload.lastName || '').trim();
  if (!firstName || !lastName) {
    res.status(400).json({ error: 'First name and last name are required.' });
    return;
  }

  const ticketId =
    (payload.ticketId || '').trim() ||
    `DF26-${(payload.ticketType || 'general').slice(0, 3).toUpperCase()}-${Math.floor(300 + Math.random() * 699)}`;

  const existing = attendees.find((a) => a.ticketId.toLowerCase() === ticketId.toLowerCase());
  if (existing) {
    res.json({ attendee: existing });
    return;
  }

  const record: AttendeeRecord = {
    ticketId,
    firstName,
    lastName,
    email:
      (payload.email || '').trim() ||
      `${firstName.toLowerCase()}.${lastName.toLowerCase()}@devfest.example`,
    ticketType: payload.ticketType || 'general',
    role: (payload.role || '').trim() || (payload.ticketType === 'student' ? 'Student Attendee' : 'Attendee'),
    org: (payload.org || '').trim() || 'DevFest Community',
    track: (payload.track || '').trim() || 'All Tracks',
    status: 'pending',
    printCount: 0,
  };

  attendees.unshift(record);
  res.status(201).json({ attendee: record });
});

app.post('/api/checkin', (req, res) => {
  const {
    ticket,
    studentVerification,
  } = req.body as {
    ticket?: TicketPayload;
    studentVerification?: StudentVerificationResult;
  };

  if (!ticket || !ticket.firstName?.trim() || !ticket.lastName?.trim()) {
    res.status(400).json({ error: 'Valid ticket payload with first and last name is required.' });
    return;
  }

  if (ticket.ticketType === 'student' && studentVerification?.decision !== 'approved') {
    res.status(403).json({
      error: 'Student ticket requires approved Student ID verification before badge printing.',
    });
    return;
  }

  const now = new Date().toISOString();
  let attendee = attendees.find(
    (a) =>
      a.ticketId.toLowerCase() === ticket.ticketId.toLowerCase() ||
      (a.firstName.toLowerCase() === ticket.firstName.toLowerCase() &&
        a.lastName.toLowerCase() === ticket.lastName.toLowerCase())
  );

  if (!attendee) {
    attendee = {
      ticketId: ticket.ticketId,
      firstName: ticket.firstName.trim(),
      lastName: ticket.lastName.trim(),
      email: `${ticket.firstName.toLowerCase()}.${ticket.lastName.toLowerCase()}@devfest.example`,
      ticketType: ticket.ticketType,
      role: ticket.role || 'Attendee',
      org: ticket.org || 'DevFest Community',
      track: ticket.track || 'All Tracks',
      status: 'printed',
      checkedInAt: now,
      printedAt: now,
      printCount: 1,
      studentVerification,
    };
    attendees.unshift(attendee);
  } else {
    attendee.status = 'printed';
    attendee.checkedInAt = attendee.checkedInAt || now;
    attendee.printedAt = now;
    attendee.printCount += 1;
    if (studentVerification) {
      attendee.studentVerification = studentVerification;
    }
  }

  const job: PrintJob = {
    jobId: `JOB-${101 + printQueue.length}`,
    ticketId: attendee.ticketId,
    firstName: attendee.firstName,
    lastName: attendee.lastName,
    ticketType: attendee.ticketType,
    role: attendee.role,
    org: attendee.org,
    track: attendee.track,
    verifiedStudent:
      attendee.ticketType === 'student' && attendee.studentVerification?.decision === 'approved',
    printedAt: now,
    rawPrinterCommands: generateThermalLabelCommands({
      firstName: attendee.firstName,
      lastName: attendee.lastName,
      ticketType: attendee.ticketType,
      ticketId: attendee.ticketId,
      role: attendee.role,
      org: attendee.org,
      verifiedStudent:
        attendee.ticketType === 'student' && attendee.studentVerification?.decision === 'approved',
    }),
  };

  printQueue.unshift(job);

  res.json({
    attendee,
    printJob: job,
  });
});

app.post('/api/verify-student-id', async (req, res) => {
  const {
    imageBase64,
    mimeType,
    expectedFirstName,
    expectedLastName,
    ticketId,
  } = req.body as {
    imageBase64?: string;
    mimeType?: string;
    expectedFirstName?: string;
    expectedLastName?: string;
    ticketId?: string;
  };

  if (!imageBase64 || !expectedFirstName || !expectedLastName) {
    res.status(400).json({
      error: 'Student ID image and ticket holder first/last name are required.',
    });
    return;
  }

  try {
    const ai = getAiClient();
    const cleanedBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
    const currentDate = new Date().toISOString().slice(0, 10);

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: cleanedBase64,
            },
          },
          {
            text: [
              `You are the Google DevFest registration kiosk Student ID verifier. Today's date is ${currentDate}.`,
              `Expected ticket holder: "${expectedFirstName} ${expectedLastName}" (Ticket ID: ${ticketId || 'N/A'}).`,
              'Inspect the uploaded image carefully and evaluate:',
              '1. Is it an actual student ID card, enrollment card, or university/school ID (not a blank photo, random object, or unrelated card)?',
              '2. Extract the student full name and institution name printed on the card.',
              `3. Check if any expiration / valid-thru / academic-year date on the card is expired relative to today (${currentDate}). If it explicitly says EXPIRED or shows a past year like 2021/2023/2024, mark isCurrentAndValid false.`,
              '4. Check if the extracted name matches the expected ticket holder name.',
              'Approve ONLY if isStudentIdCard is true, isCurrentAndValid is true, and nameMatchesTicket is true. Otherwise reject and give a clear 1-sentence reason.',
            ].join('\n'),
          },
        ],
      },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isStudentIdCard: {
              type: Type.BOOLEAN,
              description: 'True if the image clearly depicts a student identification card.',
            },
            isCurrentAndValid: {
              type: Type.BOOLEAN,
              description: `True if the card is legible and not expired as of ${currentDate}.`,
            },
            nameMatchesTicket: {
              type: Type.BOOLEAN,
              description: 'True if the name printed on the student ID matches the expected ticket holder.',
            },
            extractedName: {
              type: Type.STRING,
              description: 'Full name read from the card, or "Unreadable" if not visible.',
            },
            institution: {
              type: Type.STRING,
              description: 'School, college, or university name read from the card.',
            },
            expirationText: {
              type: Type.STRING,
              description: 'Validity date, graduation year, or academic term printed on the card, or "Not listed".',
            },
            confidence: {
              type: Type.NUMBER,
              description: 'Confidence score between 0 and 1.',
            },
            reason: {
              type: Type.STRING,
              description: 'Concise 1-sentence explanation of the verification outcome.',
            },
          },
          required: [
            'isStudentIdCard',
            'isCurrentAndValid',
            'nameMatchesTicket',
            'extractedName',
            'institution',
            'expirationText',
            'confidence',
            'reason',
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}') as Omit<
      StudentVerificationResult,
      'decision' | 'verifiedAt'
    >;

    const deterministicMatch = doesExtractedNameMatch(
      parsed.extractedName || '',
      expectedFirstName,
      expectedLastName
    );
    const nameMatchesTicket = Boolean(parsed.nameMatchesTicket || deterministicMatch);
    const approved =
      Boolean(parsed.isStudentIdCard) &&
      Boolean(parsed.isCurrentAndValid) &&
      nameMatchesTicket;

    const result: StudentVerificationResult = {
      ...parsed,
      nameMatchesTicket,
      decision: approved ? 'approved' : 'rejected',
      verifiedAt: new Date().toISOString(),
    };

    const existing = attendees.find(
      (a) =>
        (ticketId && a.ticketId.toLowerCase() === ticketId.toLowerCase()) ||
        (a.firstName.toLowerCase() === expectedFirstName.toLowerCase() &&
          a.lastName.toLowerCase() === expectedLastName.toLowerCase())
    );
    if (existing) {
      existing.studentVerification = result;
      if (!approved) {
        existing.status = 'student_rejected';
      }
    }

    res.json({ verification: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Student ID verification failed.';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  const port = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    // Imported lazily so a production install (no devDependencies) never needs vite
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`DevFest Badge Kiosk server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
