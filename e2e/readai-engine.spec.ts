import { test, expect } from '@playwright/test'
import {
  ReadAiWebhook,
  normalizeMeeting,
  proposalFromMeeting,
  safeReportUrl,
  secretMatches,
  transcriptText,
} from '../src/lib/readai/payload'
import {
  clientsFromParticipants,
  matchMeeting,
  type MatchClient,
  type MatchSession,
} from '../src/lib/readai/match'

/**
 * Unit tests for the pure Read AI payload and matching halves
 * (specs/keystone-readai.md). No network, no DB.
 */

const PRACTICE = ['remi@practice.test']
const SAFESPACE: MatchClient = {
  id: 'client-safespace',
  emails: ['aris@safespace.test', 'jasmine@gmail.com'],
}
const OTHER: MatchClient = { id: 'client-other', emails: ['lee@other.test'] }

const at = (iso: string) => new Date(iso)
const SESSION: MatchSession = {
  id: 'session-1',
  clientId: 'client-safespace',
  engagementId: 'eng-1',
  startsAt: at('2026-11-04T21:00:00Z'),
  endsAt: at('2026-11-04T22:00:00Z'),
}
const OTHER_SESSION: MatchSession = {
  id: 'session-2',
  clientId: 'client-other',
  engagementId: 'eng-2',
  startsAt: at('2026-11-05T21:00:00Z'),
  endsAt: at('2026-11-05T22:00:00Z'),
}

const PAYLOAD = {
  session_id: '01KA3883FYZSFZXE391Q0FMV39',
  trigger: 'meeting_end',
  title: 'SafeSpace working session',
  start_time: '2026-11-04T21:02:00Z',
  end_time: 1793830000000,
  participants: [
    { name: 'Remi', email: 'Remi@practice.test' },
    { name: 'Aris', email: 'aris@safespace.test' },
    { name: 'Guest', email: null },
    { name: 'Bad', email: 'not-an-email' },
  ],
  owner: { name: 'Remi', email: 'remi@practice.test' },
  summary: 'We set the donor calendar for the quarter.',
  action_items: [{ text: 'Aris drafts the donor letter' }, { text: '  ' }],
  key_questions: [],
  topics: [{ text: 'Donors' }],
  report_url: 'https://app.read.ai/analytics/meetings/01KA3883FYZSFZXE391Q0FMV39?utm=x',
  chapter_summaries: [],
  transcript: {
    speakers: [{ name: 'Remi' }, { name: 'Aris' }],
    speaker_blocks: [
      { start_time: '1793829000000', end_time: '1793829010000', speaker: { name: 'Remi' }, words: 'Welcome back.' },
      { start_time: 1793829010000, end_time: 1793829020000, speaker: { name: 'Aris' }, words: 'Thanks.' },
      { start_time: 1793829020000, end_time: 1793829030000, speaker: { name: null }, words: 'Hello?' },
      { start_time: 1793829030000, end_time: 1793829040000, speaker: { name: 'Aris' }, words: '   ' },
    ],
  },
}

test.describe('the webhook payload', () => {
  test('parses the documented shape, extra fields allowed', () => {
    const parsed = ReadAiWebhook.safeParse({ ...PAYLOAD, something_new: 1 })
    expect(parsed.success).toBe(true)
  })

  test('rejects a body with no meeting id', () => {
    const { session_id: _omit, ...rest } = PAYLOAD
    void _omit
    expect(ReadAiWebhook.safeParse(rest).success).toBe(false)
  })

  test('normalizes emails, times, and items', () => {
    const m = normalizeMeeting(ReadAiWebhook.parse(PAYLOAD))
    expect(m.readaiId).toBe('01KA3883FYZSFZXE391Q0FMV39')
    expect(m.participantEmails).toEqual(['aris@safespace.test', 'remi@practice.test'])
    expect(m.startedAt?.toISOString()).toBe('2026-11-04T21:02:00.000Z')
    expect(m.endedAt?.getTime()).toBe(1793830000000)
    expect(m.actionItems).toEqual(['Aris drafts the donor letter'])
    expect(m.reportUrl).toBe('https://app.read.ai/analytics/meetings/01KA3883FYZSFZXE391Q0FMV39')
  })

  test('the transcript becomes plain speaker lines, empty blocks dropped', () => {
    expect(transcriptText(ReadAiWebhook.parse(PAYLOAD))).toBe(
      'Remi: Welcome back.\nAris: Thanks.\nSpeaker: Hello?'
    )
  })

  test('only an https Read AI report link survives', () => {
    expect(safeReportUrl('https://app.read.ai/x')).toBe('https://app.read.ai/x')
    expect(safeReportUrl('http://app.read.ai/x')).toBeNull()
    expect(safeReportUrl('https://evil.test/app.read.ai')).toBeNull()
    expect(safeReportUrl('https://app.read.ai.evil.test/x')).toBeNull()
    expect(safeReportUrl('javascript:alert(1)')).toBeNull()
  })

  test('the notes become an extraction-shaped proposal with no decisions', () => {
    const p = proposalFromMeeting(normalizeMeeting(ReadAiWebhook.parse(PAYLOAD)))
    expect(p).not.toBeNull()
    expect(p!.summary_md).toBe('We set the donor calendar for the quarter.')
    expect(p!.decisions_md).toBe('')
    expect(p!.action_items).toEqual([{ title: 'Aris drafts the donor letter', timing: 'standing' }])
  })

  test('no summary means no proposal (the transcript still attaches)', () => {
    const m = normalizeMeeting(ReadAiWebhook.parse({ ...PAYLOAD, summary: '' }))
    expect(proposalFromMeeting(m)).toBeNull()
  })
})

test.describe('the URL secret', () => {
  test('matches only the exact value, and fails closed when unset', () => {
    const s = 'a'.repeat(40)
    expect(secretMatches(s, s)).toBe(true)
    expect(secretMatches(s + 'b', s)).toBe(false)
    expect(secretMatches(null, s)).toBe(false)
    expect(secretMatches('', s)).toBe(false)
    expect(secretMatches(s, undefined)).toBe(false)
    expect(secretMatches(s, '')).toBe(false)
  })
})

test.describe('matching a meeting to a client and a session', () => {
  const base = { startedAt: at('2026-11-04T21:02:00Z'), endedAt: at('2026-11-04T21:58:00Z') }

  test('a client email plus a booked session at that time attaches', () => {
    const r = matchMeeting(
      { ...base, participantEmails: ['remi@practice.test', 'aris@safespace.test'] },
      [SAFESPACE, OTHER],
      [SESSION, OTHER_SESSION],
      PRACTICE
    )
    expect(r.status).toBe('attached')
    if (r.status === 'attached') expect(r.session.id).toBe('session-1')
  })

  test('a colleague at the client domain counts; a public mail domain never does', () => {
    expect(clientsFromParticipants(['new.person@safespace.test'], [SAFESPACE], PRACTICE)).toEqual([
      'client-safespace',
    ])
    expect(clientsFromParticipants(['stranger@gmail.com'], [SAFESPACE], PRACTICE)).toEqual([])
    // The exact personal address still counts.
    expect(clientsFromParticipants(['jasmine@gmail.com'], [SAFESPACE], PRACTICE)).toEqual([
      'client-safespace',
    ])
  })

  test('the practice itself is never a client signal', () => {
    const shared: MatchClient = { id: 'c', emails: ['someone@practice.test'] }
    expect(clientsFromParticipants(['remi@practice.test'], [shared], PRACTICE)).toEqual([])
    expect(clientsFromParticipants(['other@practice.test'], [shared], PRACTICE)).toEqual([])
  })

  test('a client call with no session at that time waits for review', () => {
    const r = matchMeeting(
      { startedAt: at('2026-11-10T18:00:00Z'), endedAt: at('2026-11-10T19:00:00Z'), participantEmails: ['aris@safespace.test'] },
      [SAFESPACE],
      [SESSION],
      PRACTICE
    )
    expect(r).toEqual({ status: 'needs_review', reason: 'no_session', clientId: 'client-safespace', engagementId: null })
  })

  test('a call during a session with no client on the invite waits for review', () => {
    const r = matchMeeting({ ...base, participantEmails: ['remi@practice.test'] }, [SAFESPACE], [SESSION], PRACTICE)
    expect(r).toEqual({ status: 'needs_review', reason: 'time_only', clientId: 'client-safespace', engagementId: 'eng-1' })
  })

  test('two clients on one call, neither at a matching session, waits for review', () => {
    const r = matchMeeting(
      { startedAt: at('2026-11-10T18:00:00Z'), endedAt: null, participantEmails: ['aris@safespace.test', 'lee@other.test'] },
      [SAFESPACE, OTHER],
      [SESSION, OTHER_SESSION],
      PRACTICE
    )
    expect(r.status).toBe('needs_review')
    if (r.status === 'needs_review') expect(r.reason).toBe('several_clients')
  })

  test('a call with no client and no session is skipped (nothing kept)', () => {
    const r = matchMeeting(
      { startedAt: at('2026-11-10T18:00:00Z'), endedAt: null, participantEmails: ['shannon@nonprofit.test'] },
      [SAFESPACE],
      [SESSION],
      PRACTICE
    )
    expect(r).toEqual({ status: 'skipped', reason: 'no_client' })
  })

  test('a call with no start time cannot match on time', () => {
    const r = matchMeeting({ startedAt: null, endedAt: null, participantEmails: [] }, [SAFESPACE], [SESSION], PRACTICE)
    expect(r.status).toBe('skipped')
  })

  test('a little slack either side of the session still matches', () => {
    const r = matchMeeting(
      { startedAt: at('2026-11-04T22:10:00Z'), endedAt: at('2026-11-04T22:30:00Z'), participantEmails: ['aris@safespace.test'] },
      [SAFESPACE],
      [SESSION],
      PRACTICE
    )
    expect(r.status).toBe('attached')
  })
})
