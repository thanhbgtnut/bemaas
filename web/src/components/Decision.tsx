import { useEffect, useMemo, useState } from 'react'
import type { Question } from '../standards'

// SystemOne decision API (docs.ollama.com/api/systemone): nhập state và các câu hỏi, hiện quyết định kèm xác suất.
// Tiêu chí nhập mỗi dòng một mục: choice "khoá: mô tả", noul "false: …" và "true: …", score mỗi dòng một mức từ thấp đến cao.

type Row = { name: string; type: Question['type']; instructions: string; criteria: string }

function toRows(q: Record<string, Question> = {}): Row[] {
  return Object.entries(q).map(([name, x]) => ({
    name, type: x.type, instructions: x.instructions,
    criteria: x.type === 'score' ? x.criteria.join('\n')
      : Object.entries(x.criteria ?? {}).map(([k, v]) => (v ? `${k}: ${v}` : k)).join('\n'),
  }))
}

function toQuestions(rows: Row[]): Record<string, Question> {
  const out: Record<string, Question> = {}
  for (const r of rows) {
    if (!r.name.trim()) continue
    const lines = r.criteria.split('\n').map((l) => l.trim()).filter(Boolean)
    const pairs = Object.fromEntries(lines.map((l) => {
      const i = l.indexOf(':')
      return i < 0 ? [l, null] : [l.slice(0, i).trim(), l.slice(i + 1).trim() || null]
    }))
    if (r.type === 'score') out[r.name.trim()] = { type: 'score', instructions: r.instructions, criteria: lines }
    else if (r.type === 'noul') {
      const c: { false?: string; true?: string } = {}
      if (pairs.false) c.false = pairs.false
      if (pairs.true) c.true = pairs.true
      out[r.name.trim()] = { type: 'noul', instructions: r.instructions, ...(Object.keys(c).length ? { criteria: c } : {}) }
    } else out[r.name.trim()] = { type: 'choice', instructions: r.instructions, criteria: pairs }
  }
  return out
}

const hints: Record<Question['type'], string> = {
  choice: 'Mỗi dòng một phương án "khoá: mô tả", 2–255 phương án',
  noul: 'Tuỳ chọn: dòng "false: mô tả" và "true: mô tả"',
  score: 'Mỗi dòng một mức, từ thấp nhất đến cao nhất, 2–10 mức',
}

// Giới hạn body của SystemOne: 32 MiB khi có ảnh (gồm cả base64 và JSON); base64 tăng kích thước khoảng 4/3.
export const IMAGE_BODY_LIMIT = 32 << 20
export const base64Size = (files: File[]) => files.reduce((n, f) => n + Math.ceil(f.size / 3) * 4, 0)

export function DecisionForm({ state, questions, version, onState, onQuestions, imageAccept, images, onImages }: {
  state: string; questions?: Record<string, Question>; version: number
  onState: (s: string) => void; onQuestions: (q: Record<string, Question>) => void
  imageAccept?: string; images: File[]; onImages: (f: File[]) => void
}) {
  const [rows, setRows] = useState<Row[]>(() => toRows(questions))
  // Bấm ví dụ khác (version đổi) thì nạp lại câu hỏi của ví dụ.
  useEffect(() => { setRows(toRows(questions)) }, [version]) // eslint-disable-line react-hooks/exhaustive-deps
  const update = (next: Row[]) => { setRows(next); onQuestions(toQuestions(next)) }
  const patch = (i: number, p: Partial<Row>) => update(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))

  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor="s1-state">State</label>
        <textarea id="s1-state" className="input font-mono text-sm" rows={4} value={state} onChange={(e) => onState(e.target.value)} />
        <p className="mt-1 text-xs text-subtle">Văn bản cần ra quyết định. Nhập object hoặc mảng JSON thì gửi đúng dạng JSON. Không kèm ảnh thì body tối đa 64 KiB.</p>
      </div>
      {imageAccept && <ImagePicker accept={imageAccept} images={images} onImages={onImages} />}
      <div className="space-y-2">
        <div className="text-sm font-medium text-ink">Câu hỏi ({rows.length}/64)</div>
        {rows.map((r, i) => (
          <fieldset key={i} className="space-y-2 rounded-md border border-slate-200 p-3">
            <legend className="sr-only">Câu hỏi {i + 1}</legend>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
              <input className="input font-mono" aria-label="Tên câu hỏi" placeholder="ten_cau_hoi" value={r.name} onChange={(e) => patch(i, { name: e.target.value })} />
              <select className="input" aria-label="Loại câu hỏi" value={r.type} onChange={(e) => patch(i, { type: e.target.value as Row['type'] })}>
                <option value="choice">choice</option><option value="noul">noul</option><option value="score">score</option>
              </select>
              <button type="button" className="btn-secondary" disabled={rows.length <= 1} onClick={() => update(rows.filter((_, j) => j !== i))}>Xoá</button>
            </div>
            <input className="input" aria-label="Câu hỏi" placeholder="Câu hỏi cho model" value={r.instructions} onChange={(e) => patch(i, { instructions: e.target.value })} />
            <textarea className="input font-mono text-sm" rows={Math.min(10, Math.max(3, r.criteria.split('\n').length))} aria-label="Tiêu chí" placeholder={hints[r.type]} value={r.criteria} onChange={(e) => patch(i, { criteria: e.target.value })} />
            <p className="text-xs text-subtle">{hints[r.type]}</p>
          </fieldset>
        ))}
        <button type="button" className="btn-secondary" disabled={rows.length >= 64}
          onClick={() => update([...rows, { name: `cau_hoi_${rows.length + 1}`, type: 'choice', instructions: '', criteria: '' }])}>+ Thêm câu hỏi</button>
      </div>
    </div>
  )
}

const pctText = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')}%`

function Bar({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <li className="space-y-1">
      <div className="flex justify-between gap-3 text-sm">
        <span className={`min-w-0 break-words ${strong ? 'font-semibold' : ''}`}>{label}</span>
        <span className="shrink-0 font-mono text-muted">{pctText(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${strong ? 'bg-primary' : 'bg-tint-200'}`} style={{ width: `${value * 100}%` }} /></div>
    </li>
  )
}

export type DecisionAnswer = {
  type: string; choice?: string; noul?: number; score?: number
  probabilities?: Record<string, number>; legend?: Record<string, string>; confidence?: number
}

export function DecisionResult({ d, questions }: { d: { answers?: Record<string, DecisionAnswer> }; questions?: Record<string, Question> }) {
  // Hiện theo thứ tự câu hỏi đã gửi; câu trả lời lạ (nếu có) xếp sau.
  const order = Object.keys(questions ?? {})
  const answers = Object.entries(d?.answers ?? {}).sort(([x], [y]) => (order.indexOf(x) + 1 || 1e9) - (order.indexOf(y) + 1 || 1e9))
  if (!answers.length) return null
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {answers.map(([name, a]) => {
        const q = questions?.[name]
        return (
          <section key={name} className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
            <div>
              <div className="flex flex-wrap items-baseline gap-2"><span className="font-mono text-sm font-medium">{name}</span><span className="text-xs text-subtle">{a.type}</span></div>
              {q?.instructions && <p className="text-sm text-muted">{q.instructions}</p>}
            </div>
            {a.type === 'choice' && (
              <>
                <div className="text-sm">Quyết định: <strong className="font-mono">{a.choice}</strong>
                  {q?.type === 'choice' && q.criteria[a.choice ?? ''] && <span className="text-muted"> · {q.criteria[a.choice ?? '']}</span>}</div>
                <ul className="space-y-2">
                  {Object.entries(a.probabilities ?? {}).sort((x, y) => y[1] - x[1]).map(([k, v]) => <Bar key={k} label={k} value={v} strong={k === a.choice} />)}
                </ul>
              </>
            )}
            {a.type === 'noul' && a.noul !== undefined && (
              <>
                <div className="text-sm">Quyết định: <strong>{a.noul >= 0.5 ? (q?.type === 'noul' && q.criteria?.true) || 'Đúng' : (q?.type === 'noul' && q.criteria?.false) || 'Sai'}</strong></div>
                <ul><Bar label="Xác suất đúng (true)" value={a.noul} strong /></ul>
              </>
            )}
            {a.type === 'score' && a.score !== undefined && (
              <>
                <div className="text-sm">Điểm: <strong className="font-mono">{a.score.toFixed(2).replace('.', ',')}</strong> <span className="text-muted">trên thang 0–{Object.keys(a.legend ?? {}).length - 1}</span></div>
                <ul className="space-y-2">
                  {/* Đậm mức có xác suất cao nhất; điểm là trung bình có trọng số nên có thể nằm giữa hai mức. */}
                  {Object.entries(a.probabilities ?? {}).map(([k, v]) => <Bar key={k} label={`${k}. ${a.legend?.[k] ?? ''}`} value={v} strong={v === Math.max(...Object.values(a.probabilities ?? {}))} />)}
                </ul>
              </>
            )}
            {a.confidence !== undefined && <p className="font-mono text-xs text-subtle">Độ tin cậy {pctText(a.confidence)} (độ tập trung của phân phối, không phải xác suất đúng)</p>}
          </section>
        )
      })}
    </div>
  )
}

// Ảnh gửi kèm (trường `images`): dùng chung cho mọi câu hỏi, cần model có thị giác (họ clef).
function ImagePicker({ accept, images, onImages }: { accept: string; images: File[]; onImages: (f: File[]) => void }) {
  const urls = useMemo(() => images.map((f) => URL.createObjectURL(f)), [images])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  const size = base64Size(images)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-ink">Ảnh (tuỳ chọn)</span>
        <label className="btn-secondary cursor-pointer focus-within:ring-2 focus-within:ring-primary">
          Thêm ảnh
          <input type="file" multiple className="sr-only" accept={accept}
            onChange={(e) => { onImages([...images, ...Array.from(e.target.files ?? [])]); e.target.value = '' }} />
        </label>
        {images.length > 0 && <button type="button" className="text-sm text-primary hover:underline" onClick={() => onImages([])}>Bỏ hết ảnh</button>}
      </div>
      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {images.map((f, i) => (
            <li key={i} className="w-36 space-y-1 rounded-md border border-slate-200 p-1.5">
              <img src={urls[i]} alt={f.name} className="h-24 w-full rounded object-contain" />
              <div className="flex items-center justify-between gap-1">
                <span className="min-w-0 truncate font-mono text-[11px] text-muted" title={f.name}>{f.name}</span>
                <button type="button" className="shrink-0 text-xs text-bad hover:underline" aria-label={`Bỏ ảnh ${f.name}`} onClick={() => onImages(images.filter((_, j) => j !== i))}>Bỏ</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className={`text-xs ${size > IMAGE_BODY_LIMIT ? 'text-bad' : 'text-subtle'}`}>
        PNG, JPEG hoặc WebP, gửi dạng base64, dùng chung cho mọi câu hỏi. Cần model có thị giác (họ clef); model chỉ đọc văn bản sẽ báo lỗi.
        {images.length > 0 && ` Dung lượng sau mã hoá khoảng ${(size / 1048576).toFixed(1).replace('.', ',')} / 32 MiB.`}
      </p>
      {images.length > 0 && <p className="text-xs text-warn">Chỉ dùng ảnh mẫu đã che thông tin khách hàng.</p>}
    </div>
  )
}
