import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { hubContext } from '@/lib/hubPage'
import { hubMoney } from '@/lib/hubTheme'
import Tag from '@/components/hub/Tag'
import { addNextMove, completeTask, logGift, saveNotes } from '../actions'

/**
 * One household, six sections: Snapshot, Giving, Relationship,
 * Research, Notes, Next move. She thinks "I'm meeting them Thursday,
 * what do I need to know," so everything is on one page and the
 * research profile lives inside it. Do-not-contact renders
 * unmistakably and closes the next-move form; the database trigger is
 * the wall behind the closed form.
 */

const label = {
  fontFamily: 'var(--hub-font-detail)',
  fontSize: 10,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: 'var(--hub-stone-ink)',
}
const h2 = {
  fontFamily: 'var(--hub-font-detail)',
  fontSize: 11,
  letterSpacing: '0.2em',
  textTransform: 'uppercase' as const,
  color: 'var(--hub-gold-ink)',
  borderBottom: '3px solid var(--hub-gold)',
  paddingBottom: 8,
  marginTop: 34,
}
const input = {
  padding: '10px 12px',
  background: 'var(--hub-paper-raised)',
  border: '1px solid var(--hub-line-on-paper)',
  fontSize: 14,
  color: 'var(--hub-acid-black)',
  width: '100%',
}
const goldButton = {
  padding: '10px 16px',
  background: 'var(--hub-gold)',
  color: 'var(--hub-acid-black)',
  border: 'none',
  fontFamily: 'var(--hub-font-detail)',
  fontSize: 11,
  letterSpacing: '0.16em',
  textTransform: 'uppercase' as const,
  cursor: 'pointer',
}

function fact(k: string, v: string | null) {
  if (!v) return null
  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid var(--hub-line-on-paper)' }}>
      <span style={label}>{k}</span>
      <div style={{ fontSize: 14, marginTop: 2 }}>{v}</div>
    </div>
  )
}

export default async function HubDonorPage({
  params,
}: {
  params: Promise<{ orgSlug: string; donorId: string }>
}) {
  const { orgSlug, donorId } = await params
  const hub = await hubContext(orgSlug)
  if (!hub) return null
  const supabase = await createServerSupabase()

  const { data: d } = await supabase
    .from('hub_donors')
    .select('*')
    .eq('org_id', hub.orgId)
    .eq('id', donorId)
    .maybeSingle()
  if (!d) notFound()

  const [giftsRes, touchesRes, tasksRes, profileRes, editorsRes] = await Promise.all([
    supabase
      .from('hub_gifts')
      .select('id, fiscal_year, amount_cents, gift_date, designation, kind, source')
      .eq('org_id', hub.orgId)
      .eq('donor_id', donorId)
      .order('fiscal_year', { ascending: false }),
    supabase
      .from('hub_touches')
      .select('id, kind, occurred_on, note')
      .eq('org_id', hub.orgId)
      .eq('donor_id', donorId)
      .order('occurred_on', { ascending: false }),
    supabase
      .from('hub_tasks')
      .select('id, title, why, due_date, done_at')
      .eq('org_id', hub.orgId)
      .eq('donor_id', donorId)
      .order('created_at', { ascending: false }),
    supabase
      .from('hub_profiles')
      .select('id, headline, status, updated_at')
      .eq('org_id', hub.orgId)
      .eq('donor_id', donorId)
      .maybeSingle(),
    supabase.from('hub_members').select('user_id, email').eq('org_id', hub.orgId),
  ])

  const gifts = giftsRes.data ?? []
  const touches = touchesRes.data ?? []
  const openTasks = (tasksRes.data ?? []).filter((t) => !t.done_at)
  const profile = profileRes.data
  const editorEmail = new Map(
    (editorsRes.data ?? []).filter((m) => m.user_id).map((m) => [m.user_id as string, m.email])
  )
  const editedBy = d.updated_by ? (editorEmail.get(d.updated_by) ?? null) : null

  const notesAction = saveNotes.bind(null, orgSlug)
  const moveAction = addNextMove.bind(null, orgSlug)
  const doneAction = completeTask.bind(null, orgSlug)
  const giftAction = logGift.bind(null, orgSlug)

  return (
    <div style={{ maxWidth: 880 }}>
      <Link
        href={`/${orgSlug}/people`}
        style={{ ...label, color: 'var(--hub-gold-ink)', textDecoration: 'none' }}
      >
        · Back to people
      </Link>
      <h1
        style={{
          fontFamily: 'var(--hub-font-display)',
          fontSize: 34,
          lineHeight: 1.05,
          textTransform: 'uppercase',
          margin: '12px 0 0',
          fontWeight: 400,
        }}
      >
        {d.household}
      </h1>
      {d.greeting ? (
        <div style={{ fontSize: 15, color: 'var(--hub-stone-ink)', marginTop: 6 }}>
          {d.greeting}
        </div>
      ) : null}

      {d.do_not_contact ? (
        <div
          style={{
            marginTop: 16,
            padding: '14px 16px',
            border: '1px solid var(--hub-terracotta)',
            color: 'var(--hub-terracotta)',
            fontFamily: 'var(--hub-font-detail)',
            fontSize: 12,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          Do not contact this household. No task can be created for them and every outreach list
          leaves them out.
        </div>
      ) : !d.receives_appeals ? (
        <div style={{ marginTop: 12 }}>
          <Tag tone="muted">no appeals: included in everything except an ask</Tag>
        </div>
      ) : null}

      <h2 style={h2}>Snapshot</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
        {fact('Status', d.status)}
        {fact('City', [d.city, d.state].filter(Boolean).join(', ') || null)}
        {fact('Email', d.email)}
        {fact('Phone', d.phone)}
        {fact(
          'Lifetime giving',
          d.lifetime_cents !== null ? hubMoney(Number(d.lifetime_cents)) : null
        )}
        {fact('Gifts on record with Young Life', d.gift_count !== null ? String(d.gift_count) : null)}
        {fact(
          'Capacity over five years, a wealth estimate, not interest',
          d.capacity_5yr_cents ? hubMoney(Number(d.capacity_5yr_cents)) : null
        )}
        {fact(
          'A reasonable ask, from the screening file',
          d.suggested_ask_cents ? hubMoney(Number(d.suggested_ask_cents)) : null
        )}
        {fact('Business', [d.business, d.business_title].filter(Boolean).join(' · ') || null)}
        {fact('Giving segment', d.planned_giving_segment)}
        {fact('How Young Life reads them', d.insights_category)}
        {fact(
          'Largest gift',
          d.largest_gift_cents
            ? `${hubMoney(Number(d.largest_gift_cents))}${d.largest_gift_date ? ` · ${d.largest_gift_date}` : ''}`
            : null
        )}
      </div>

      <h2 style={h2}>Giving</h2>
      {gifts.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--hub-stone-ink)' }}>No gifts on record here.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {gifts.map((g) => (
              <tr key={g.id} style={{ borderBottom: '1px solid var(--hub-line-on-paper)' }}>
                <td style={{ padding: '8px 8px 8px 0', fontFamily: 'var(--hub-font-detail)', fontSize: 12 }}>
                  FY{g.fiscal_year}
                </td>
                <td style={{ padding: '8px', fontFamily: 'var(--hub-font-detail)', fontSize: 13 }}>
                  {hubMoney(Number(g.amount_cents))}
                </td>
                <td style={{ padding: '8px', fontSize: 13 }}>
                  {g.kind === 'pledged' ? 'promised' : 'cash in hand'}
                  {g.designation ? ` · ${g.designation}` : ''}
                </td>
                <td style={{ padding: '8px 0', textAlign: 'right' }}>
                  <Tag tone={g.source === 'manual' ? 'gold' : 'muted'}>
                    {g.source === 'manual' ? 'logged here' : 'from the YL report'}
                  </Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <details style={{ marginTop: 12, maxWidth: 460 }}>
        <summary style={{ ...label, color: 'var(--hub-gold-ink)', cursor: 'pointer' }}>
          Log a gift
        </summary>
        <form action={giftAction} style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          <input type="hidden" name="donor_id" value={d.id} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label htmlFor="gift-amount" style={label}>
                How much, in dollars
              </label>
              <input id="gift-amount" name="amount" type="number" min="1" step="0.01" required style={input} />
            </div>
            <div>
              <label htmlFor="gift-date" style={label}>
                When
              </label>
              <input id="gift-date" name="gift_date" type="date" required style={input} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label htmlFor="gift-kind" style={label}>
                Cash in hand, or promised
              </label>
              <select id="gift-kind" name="kind" style={input} defaultValue="cash">
                <option value="cash">Cash in hand</option>
                <option value="pledged">Promised</option>
              </select>
            </div>
            <div>
              <label htmlFor="gift-designation" style={label}>
                What it is for
              </label>
              <input id="gift-designation" name="designation" maxLength={200} style={input} />
            </div>
          </div>
          <button type="submit" style={{ ...goldButton, justifySelf: 'start' }}>
            Log it
          </button>
        </form>
      </details>

      <h2 style={h2}>Relationship</h2>
      {touches.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--hub-stone-ink)' }}>
          Nothing recorded yet. What this household has heard from the ministry lands here, and it
          is what makes reminders honest.
        </p>
      ) : (
        touches.map((t) => (
          <div key={t.id} style={{ borderBottom: '1px solid var(--hub-line-on-paper)', padding: '8px 0' }}>
            <span style={{ ...label, color: 'var(--hub-gold-ink)' }}>
              {t.kind.replace('_', ' ')} · {t.occurred_on}
            </span>
            {t.note ? <div style={{ fontSize: 14, marginTop: 4 }}>{t.note}</div> : null}
          </div>
        ))
      )}

      <h2 style={h2}>Research</h2>
      {profile ? (
        <p style={{ fontSize: 14 }}>
          {profile.headline ?? 'A research profile exists for this household.'}{' '}
          <span style={{ color: 'var(--hub-stone-ink)' }}>({profile.status})</span>
        </p>
      ) : (
        <p style={{ fontSize: 14, color: 'var(--hub-stone-ink)' }}>
          No research profile yet. Profiles are written one household at a time and land here.
        </p>
      )}

      <h2 style={h2}>Notes</h2>
      <form action={notesAction} style={{ maxWidth: 640 }}>
        <input type="hidden" name="donor_id" value={d.id} />
        <textarea
          name="notes"
          rows={4}
          defaultValue={d.notes ?? ''}
          placeholder="What you know that the file does not."
          style={input}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
          <button type="submit" style={goldButton}>
            Save notes
          </button>
          {d.updated_at ? (
            <span style={label}>
              last change {String(d.updated_at).slice(0, 10)}
              {editedBy ? ` · ${editedBy}` : ''}
            </span>
          ) : null}
        </div>
      </form>

      <h2 style={h2}>Next move</h2>
      {openTasks.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--hub-stone-ink)' }}>No open move for this household.</p>
      ) : (
        openTasks.map((t) => (
          <div
            key={t.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 12,
              borderBottom: '1px solid var(--hub-line-on-paper)',
              padding: '8px 0',
            }}
          >
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{t.title}</div>
              {t.why ? <div style={{ fontSize: 13, marginTop: 2 }}>{t.why}</div> : null}
              {t.due_date ? (
                <div style={{ ...label, marginTop: 4 }}>{t.due_date}</div>
              ) : null}
            </div>
            <form action={doneAction}>
              <input type="hidden" name="task_id" value={t.id} />
              <input type="hidden" name="donor_id" value={d.id} />
              <button
                type="submit"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--hub-line-on-paper)',
                  color: 'var(--hub-forest-ink)',
                  fontFamily: 'var(--hub-font-detail)',
                  fontSize: 10,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  padding: '6px 10px',
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </form>
          </div>
        ))
      )}
      {d.do_not_contact ? (
        <p style={{ fontSize: 13, color: 'var(--hub-terracotta)', marginTop: 8 }}>
          This household is do-not-contact, so no move can be created for them.
        </p>
      ) : (
        <form action={moveAction} style={{ display: 'grid', gap: 10, marginTop: 12, maxWidth: 520 }}>
          <input type="hidden" name="donor_id" value={d.id} />
          <div>
            <label htmlFor="move-title" style={label}>
              The move
            </label>
            <input id="move-title" name="title" required maxLength={300} style={input} />
          </div>
          <div>
            <label htmlFor="move-why" style={label}>
              Why it matters
            </label>
            <input id="move-why" name="why" maxLength={1000} style={input} />
          </div>
          <button type="submit" style={{ ...goldButton, justifySelf: 'start' }}>
            Set the next move
          </button>
        </form>
      )}
    </div>
  )
}
