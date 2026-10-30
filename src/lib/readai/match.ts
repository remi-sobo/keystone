/**
 * lib/readai/match.ts
 *
 * Which client, and which session, a Read AI meeting belongs to. PURE
 * (e2e/readai-engine.spec.ts). Two signals:
 *
 *   - Who was there. A participant email that is a client member's
 *     email, or shares a client member's work domain (never a public
 *     mail domain, never the practice's own domain).
 *   - When it was. A practice can never hold two live sessions at once
 *     (the sessions_no_overlap constraint), so a meeting that overlaps a
 *     booked session is a strong pointer to that session.
 *
 * Only both signals together attach a meeting on their own. One signal
 * parks it for the consultant to confirm. Neither signal means it is not
 * a client call (the practice's other meetings, family, ministry) and
 * nothing about it is kept.
 */

export interface MatchClient {
  id: string
  emails: string[]
}

export interface MatchSession {
  id: string
  clientId: string
  engagementId: string
  startsAt: Date
  endsAt: Date
}

export interface MatchMeeting {
  startedAt: Date | null
  endedAt: Date | null
  participantEmails: string[]
}

export type MatchResult =
  | { status: 'attached'; reason: 'participants_and_time'; clientId: string; session: MatchSession }
  | {
      status: 'needs_review'
      reason: 'no_session' | 'several_sessions' | 'several_clients' | 'time_only'
      clientId: string | null
      engagementId: string | null
    }
  | { status: 'skipped'; reason: 'no_client' }

/** Mail domains shared by strangers; a match on these means nothing. */
export const PUBLIC_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'comcast.net',
  'att.net',
  'sbcglobal.net',
  'verizon.net',
])

/** Minutes of slack around a session (people join early and run long). */
export const SESSION_SLACK_MIN = 20

const domainOf = (email: string) => email.slice(email.lastIndexOf('@') + 1).toLowerCase()

/**
 * The client ids a meeting's participants point to. practiceEmails are
 * excluded first (the consultant is on every call), and the practice's
 * own domains never count as a client domain.
 */
export function clientsFromParticipants(
  participantEmails: string[],
  clients: MatchClient[],
  practiceEmails: string[]
): string[] {
  const practice = new Set(practiceEmails.map((e) => e.toLowerCase()))
  const practiceDomains = new Set([...practice].map(domainOf))
  const people = participantEmails.map((e) => e.toLowerCase()).filter((e) => !practice.has(e))

  const hits = new Set<string>()
  for (const c of clients) {
    const emails = new Set(c.emails.map((e) => e.toLowerCase()))
    const domains = new Set(
      [...emails]
        .map(domainOf)
        .filter((d) => !PUBLIC_MAIL_DOMAINS.has(d) && !practiceDomains.has(d))
    )
    if (people.some((p) => emails.has(p) || domains.has(domainOf(p)))) hits.add(c.id)
  }
  return [...hits].sort()
}

/** Sessions whose window (with slack) overlaps the meeting. */
export function sessionsAtTime(meeting: MatchMeeting, sessions: MatchSession[]): MatchSession[] {
  if (!meeting.startedAt) return []
  const start = meeting.startedAt.getTime()
  const end = (meeting.endedAt ?? meeting.startedAt).getTime()
  const slack = SESSION_SLACK_MIN * 60 * 1000
  return sessions.filter(
    (s) => start < s.endsAt.getTime() + slack && end > s.startsAt.getTime() - slack
  )
}

export function matchMeeting(
  meeting: MatchMeeting,
  clients: MatchClient[],
  sessions: MatchSession[],
  practiceEmails: string[]
): MatchResult {
  const clientIds = clientsFromParticipants(meeting.participantEmails, clients, practiceEmails)
  const atTime = sessionsAtTime(meeting, sessions)

  if (clientIds.length === 0) {
    if (atTime.length === 1) {
      return {
        status: 'needs_review',
        reason: 'time_only',
        clientId: atTime[0].clientId,
        engagementId: atTime[0].engagementId,
      }
    }
    return { status: 'skipped', reason: 'no_client' }
  }

  const candidates = atTime.filter((s) => clientIds.includes(s.clientId))
  if (candidates.length === 1) {
    return {
      status: 'attached',
      reason: 'participants_and_time',
      clientId: candidates[0].clientId,
      session: candidates[0],
    }
  }

  if (clientIds.length > 1) {
    return { status: 'needs_review', reason: 'several_clients', clientId: null, engagementId: null }
  }
  return {
    status: 'needs_review',
    reason: candidates.length === 0 ? 'no_session' : 'several_sessions',
    clientId: clientIds[0],
    engagementId: null,
  }
}
