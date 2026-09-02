import { unzipSync, strFromU8 } from 'fflate'

/**
 * A minimal xlsx sheet reader on fflate (already the repo's zip
 * library), built for the two hub parsers (specs/
 * epayl-fundraising-hub.md): the Young Life donor export and the
 * budget workbook. Deliberately narrow: values only (cached formula
 * results included), no styles, no merged-cell logic, no writing.
 * Date columns are the caller's knowledge: Excel stores dates as
 * serials, and only the parser knows which columns hold them, so this
 * module exposes the serial conversion and nothing guesses.
 */

export type CellValue = string | number | null

const escapes: [RegExp, string][] = [
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&apos;/g, "'"],
  [/&#(\d+);/g, ''],
  [/&amp;/g, '&'],
]

function unescapeXml(s: string): string {
  let out = s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  for (const [re, to] of escapes) {
    if (to === '') continue
    out = out.replace(re, to)
  }
  return out
}

/** Concatenated text of every <t> inside one shared-string item. */
function siText(si: string): string {
  const parts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1])
  if (parts.length === 0) return ''
  return unescapeXml(parts.join(''))
}

function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))
  return m ? m[1] : null
}

/** Column letters to a zero-based index: A=0, Z=25, AA=26. */
export function colToIndex(letters: string): number {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Excel date serial (1900 system) to an ISO date string. */
export function excelSerialToISO(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0) return null
  // Day 0 is 1899-12-30 (the 1900 leap-year bug is inside the epoch).
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

export interface SheetTable {
  name: string
  rows: CellValue[][]
}

/**
 * Read one workbook's sheets into dense row arrays (sparse cells become
 * null). Throws on anything that is not a readable xlsx; the callers
 * turn that into an honest parse error on the document row.
 */
export function readWorkbook(buf: Uint8Array): SheetTable[] {
  const files = unzipSync(buf)
  const wbXml = files['xl/workbook.xml']
  if (!wbXml) throw new Error('not an xlsx workbook (xl/workbook.xml missing)')
  const workbook = strFromU8(wbXml)
  const relsXml = files['xl/_rels/workbook.xml.rels']
  const rels = relsXml ? strFromU8(relsXml) : ''
  const relTargets = new Map<string, string>()
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], 'Id')
    const target = attr(m[1], 'Target')
    if (id && target) relTargets.set(id, target.replace(/^\//, ''))
  }

  const shared: string[] = []
  const ssXml = files['xl/sharedStrings.xml']
  if (ssXml) {
    for (const m of strFromU8(ssXml).matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push(siText(m[1]))
    }
  }

  const sheets: SheetTable[] = []
  for (const m of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = attr(m[1], 'name')
    const rid = attr(m[1], 'r:id')
    if (!name || !rid) continue
    let target = relTargets.get(rid)
    if (!target) continue
    if (!target.startsWith('xl/')) target = `xl/${target}`
    const sheetFile = files[target]
    if (!sheetFile) continue
    sheets.push({ name, rows: readSheetXml(strFromU8(sheetFile), shared) })
  }
  return sheets
}

function readSheetXml(xml: string, shared: string[]): CellValue[][] {
  const rows: CellValue[][] = []
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: CellValue[] = []
    for (const c of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1], 'r')
      if (!ref) continue
      const colMatch = ref.match(/^([A-Z]+)\d+$/)
      if (!colMatch) continue
      const idx = colToIndex(colMatch[1])
      const t = attr(c[1], 't') ?? 'n'
      const body = c[2] ?? ''
      let value: CellValue = null
      if (t === 'inlineStr') {
        const is = body.match(/<is>([\s\S]*?)<\/is>/)
        value = is ? siText(is[1]) : null
      } else {
        const v = body.match(/<v>([\s\S]*?)<\/v>/)
        if (v) {
          const raw = unescapeXml(v[1])
          if (t === 's') {
            const i = Number(raw)
            value = Number.isInteger(i) && i >= 0 && i < shared.length ? shared[i] : null
          } else if (t === 'str') {
            value = raw
          } else if (t === 'b') {
            value = raw === '1' ? 'TRUE' : 'FALSE'
          } else if (t === 'e') {
            value = null
          } else {
            const n = Number(raw)
            value = Number.isFinite(n) ? n : raw
          }
        }
      }
      while (cells.length < idx) cells.push(null)
      cells[idx] = value
    }
    rows.push(cells)
  }
  return rows
}
