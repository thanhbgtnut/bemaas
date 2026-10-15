import DOMPurify from 'dompurify'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, useApi, type Model } from '../api'
import { publicConfig } from '../auth'
import { DecisionForm, DecisionResult, IMAGE_BODY_LIMIT, base64Size, type DecisionAnswer } from '../components/Decision'
import Markdown from '../components/Markdown'
import { CodeBlock, ErrorBox, Loading, Modal, PageHeader, Tabs, num, usd, useMe } from '../components/ui'
import {
  codeSamples, estimateCost, exampleReq, isChat, isFile, jsonBody, opUrl, readUsage, useStandards,
  type Example, type Kind, type Op, type Req, type Standard, type Usage,
} from '../standards'
import { priceText } from './Models'

// Playground (mục 6). Mỗi chuẩn API là một tab, mỗi thao tác của chuẩn là một tab con (P2); mỗi tab có
// 1–2 ví dụ mẫu bấm là điền sẵn (P10). Lời gọi đi thẳng từ trình duyệt tới agentgateway bằng key của
// người dùng (P9); backend MaaS không đứng trên đường gọi. Key chỉ lưu trong phiên trình duyệt.

// [khoá, nhãn, min, max, bước, mặc định] theo bảng tham số ở P3.
type Param = [string, string, number, number, number, number]
const PARAMS: Partial<Record<Kind, Param[]>> = {
  'openai-chat': [
    ['past', 'Past messages included', 1, 20, 1, 10],
    ['max_tokens', 'Maximum token output', 1, 10000, 1, 800],
    ['temperature', 'Temperature', 0, 2, 0.1, 1],
    ['top_p', 'Top P', 0, 1, 0.05, 0.7],
    ['presence_penalty', 'Presence Penalty', -2, 2, 0.1, 0],
  ],
  'anthropic-messages': [
    ['past', 'Past messages included', 1, 20, 1, 10],
    ['max_tokens', 'Maximum token output', 1, 10000, 1, 800],
    ['temperature', 'Temperature', 0, 1, 0.1, 1],
  ],
  'openai-completion': [
    ['max_tokens', 'Maximum token output', 1, 10000, 1, 2048],
    ['temperature', 'Temperature', 0, 2, 0.1, 1],
    ['top_p', 'Top P', 0, 1, 0.05, 0.7],
    ['presence_penalty', 'Presence Penalty', -2, 2, 0.1, 0],
  ],
  'openai-rerank': [['top_n', 'Số đoạn trả về', 1, 20, 1, 3]],
}
const paramsOf = (k: Kind) => PARAMS[k] ?? []
const defaults = (k: Kind) => Object.fromEntries(paramsOf(k).map((p) => [p[0], p[5]])) as Record<string, number>

type Meta = Usage & { ms: number }
type Msg = { role: 'user' | 'assistant'; content: string; meta?: Meta; error?: string }

const KEY_STORE = 'bemaas.playground.key'
function loadKey() {
  try { return sessionStorage.getItem(KEY_STORE) ?? '' } catch { return '' }
}
function saveKey(k: string) {
  try { sessionStorage.setItem(KEY_STORE, k) } catch { /* trình duyệt chặn lưu trữ: chỉ giữ trong bộ nhớ */ }
}

function MetaLine({ m, x }: { m?: Model; x: Meta }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs text-subtle">
      <span>{(x.ms / 1000).toFixed(2).replace('.', ',')} s</span>
      {x.pages > 0 ? <span>{num(x.pages)} trang</span> : <span>{num(x.tin)} token vào</span>}
      {x.tout > 0 && <span>{num(x.tout)} token ra</span>}
      <span>≈ {usd(estimateCost(m, x), 6)}</span>
    </div>
  )
}

class GatewayError extends Error {}

async function gw(url: string, key: string, body: BodyInit, headers: Record<string, string> = {}, signal?: AbortSignal) {
  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, ...headers }, body, signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new GatewayError(`Không kết nối được agentgateway (${new URL(url).origin}). Kiểm tra mạng hoặc CORS của gateway.`)
  }
  if (!res.ok) {
    const msg = await res.json().then((d) => (typeof d?.error === 'string' ? d.error : d?.error?.message ?? d?.message ?? '')).catch(() => '')
    if (res.status === 401) throw new GatewayError('Key không hợp lệ, đã thu hồi hoặc đang bị khoá.')
    if (res.status === 403) throw new GatewayError('Key không được dùng model này, hoặc model đang tắt.')
    if (res.status === 429) throw new GatewayError('Vượt giới hạn token của key hoặc phòng. Thử lại sau.')
    throw new GatewayError(`Gateway trả lỗi ${res.status}${msg ? ': ' + msg : ''}`)
  }
  return res
}

const jsonHeaders = (k: Kind): Record<string, string> =>
  k === 'anthropic-messages' ? { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' } : { 'Content-Type': 'application/json' }

// readSSE đọc luồng server-sent events, gọi onData với từng payload JSON.
async function readSSE(res: Response, onData: (d: any) => void) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const parts = buf.split('\n\n')
    buf = parts.pop() ?? ''
    for (const part of parts) {
      const payload = part.split('\n').find((l) => l.startsWith('data:'))?.slice(5).trim()
      if (payload && payload !== '[DONE]') onData(JSON.parse(payload))
    }
  }
}

type Out = { text?: string; vec?: number[]; dim?: number; rank?: { index: number; score: number; text: string }[]; json?: unknown; meta: Meta }

export default function PlaygroundPage() {
  const me = useMe()
  const [params, setParams] = useSearchParams()
  const { standards, error: stdError } = useStandards()
  const { data, error, reload } = useApi<{ items: Model[] }>('/models')
  const models = useMemo(() => data?.items ?? [], [data])
  const byId = (id: string) => models.find((m) => m.id === id)

  // Chuẩn và thao tác lấy từ địa chỉ (?std=&op=); link cũ ?model=&mode= vẫn mở đúng tab của model.
  const wanted = byId(params.get('model') ?? '')
  const std: Standard | undefined = standards?.find((s) => s.id === params.get('std')) ?? standards?.find((s) => s.id === wanted?.standard) ?? standards?.[0]
  const op: Op | undefined = std?.ops.find((o) => o.id === (params.get('op') ?? params.get('mode')))
    ?? std?.ops.find((o) => wanted?.standard === std.id && wanted.modes.includes(o.id)) ?? std?.ops[0]
  const kind = op?.kind ?? 'openai-chat'
  const list = useMemo(() => models.filter((m) => m.standard === std?.id && op && m.modes.includes(op.id)), [models, std, op])

  const [modelA, setModelA] = useState('')
  const [modelB, setModelB] = useState('')
  const [compare, setCompare] = useState(false)
  const [p, setP] = useState<Record<string, number>>({})
  const [req, setReq] = useState<Req>({ input: '' })
  const [file, setFile] = useState<File | null>(null)
  const [images, setImages] = useState<File[]>([])
  const [exVersion, setExVersion] = useState(0)
  const [convA, setConvA] = useState<Msg[]>([])
  const [convB, setConvB] = useState<Msg[]>([])
  const [busy, setBusy] = useState(0)
  const [out, setOut] = useState<Out | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [key, setKey] = useState(loadKey)
  const [showApi, setShowApi] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const tabKey = `${std?.id}/${op?.id}`

  // Đổi tab: xoá kết quả, đặt tham số mặc định và điền sẵn ví dụ đầu tiên của tab.
  useEffect(() => {
    if (!op) return
    abort.current?.abort()
    setP(defaults(op.kind)); setConvA([]); setConvB([]); setOut(null); setRunError(null); setCompare(false); setBusy(0)
    applyExample(op, op.examples[0])
  }, [tabKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Chọn model mặc định của tab; ?model= trên địa chỉ được ưu tiên (nút "Mở Playground" ở model card).
  useEffect(() => {
    if (!list.length) return
    const first = list.find((m) => m.id === wanted?.id) ?? list.find((m) => m.enabled) ?? list[0]
    if (!list.some((m) => m.id === modelA)) setModelA(first.id)
    if (!list.some((m) => m.id === modelB)) setModelB((list.find((m) => m.id !== first.id) ?? first).id)
  }, [list]) // eslint-disable-line react-hooks/exhaustive-deps

  const mA = byId(modelA)
  const base = publicConfig.gateway_base_url

  function go(stdId: string, opId?: string) {
    const next = new URLSearchParams()
    next.set('std', stdId)
    if (opId) next.set('op', opId)
    setParams(next, { replace: true })
  }

  async function applyExample(o: Op, ex?: Example) {
    const r = exampleReq(o, ex ? o.examples.indexOf(ex) : 0)
    setReq(r)
    setExVersion((v) => v + 1)
    setOut(null); setRunError(null)
    if (ex?.model && list.some((m) => m.id === ex.model)) setModelA(ex.model)
    if (o.image_accept) {
      setImages([])
      try {
        setImages(await Promise.all((ex?.images ?? []).map(async (path) => {
          const blob = await (await fetch(path)).blob()
          return new File([blob], path.split('/').pop() ?? 'anh', { type: blob.type || 'image/png' })
        })))
      } catch { setRunError('Không tải được ảnh mẫu.') }
    }
    if (!isFile(o.kind)) return
    setFile(null)
    if (!ex?.file) return
    try {
      const blob = await (await fetch(ex.file)).blob()
      setFile(new File([blob], r.fileName ?? 'mau', { type: blob.type || r.fileType }))
    } catch { setRunError('Không tải được tệp mẫu.') }
  }

  async function enableModel(id: string) {
    await api('/models/enabled', { method: 'PUT', json: { changes: { [id]: true } } })
    reload()
  }

  function updateKey(k: string) {
    setKey(k)
    saveKey(k.trim())
  }

  // Chat có streaming (OpenAI và Anthropic); mỗi khung gửi lịch sử của chính nó, giới hạn theo "Past messages included".
  async function sendChat() {
    const text = req.input.trim()
    if (!text || busy || !key.trim() || !op) return
    const panes: [string, Msg[], (f: (m: Msg[]) => Msg[]) => void][] = [[modelA, convA, setConvA]]
    if (compare) panes.push([modelB, convB, setConvB])
    const live = panes.filter(([id]) => byId(id)?.enabled)
    if (!live.length) return
    setReq({ ...req, input: '' })
    setBusy(live.length)
    abort.current = new AbortController()
    await Promise.all(live.map(async ([id, conv, set]) => {
      const m = byId(id)!
      const history = [...conv.filter((x) => !x.error), { role: 'user' as const, content: text }].slice(-(p.past ?? 10)).map(({ role, content }) => ({ role, content }))
      set((c) => [...c, { role: 'user', content: text }, { role: 'assistant', content: '' }])
      const patchLast = (f: (x: Msg) => Msg) => set((c) => [...c.slice(0, -1), f(c[c.length - 1])])
      const t0 = performance.now()
      const messages = kind === 'anthropic-messages' ? history : [...(req.system ? [{ role: 'system', content: req.system }] : []), ...history]
      const body: Record<string, unknown> = { ...jsonBody(op, m, { ...req, input: text, params: p }), messages, stream: true }
      if (kind === 'openai-chat') body.stream_options = { include_usage: true }
      try {
        const res = await gw(opUrl(base, m, op), key.trim(), JSON.stringify(body), jsonHeaders(kind), abort.current!.signal)
        let textOut = ''
        let usage: Usage = { tin: 0, tout: 0, cache: 0, pages: 0 }
        await readSSE(res, (d) => {
          const delta = kind === 'anthropic-messages'
            ? (d.type === 'content_block_delta' ? d.delta?.text ?? '' : '')
            : d.choices?.[0]?.delta?.content ?? ''
          if (delta) { textOut += delta; patchLast((x) => ({ ...x, content: textOut })) }
          if (kind === 'anthropic-messages') {
            if (d.type === 'message_start') usage = { ...readUsage(kind, d.message), tout: 0 }
            if (d.type === 'message_delta') usage = { ...usage, tout: d.usage?.output_tokens ?? usage.tout }
          } else if (d.usage) usage = readUsage(kind, d)
        })
        patchLast((x) => ({ ...x, meta: { ...usage, ms: performance.now() - t0 } }))
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        patchLast((x) => ({ ...x, error: (e as Error).message }))
      } finally {
        setBusy((b) => b - 1)
      }
    }))
  }

  async function runOnce() {
    if (busy || !key.trim() || !mA?.enabled || !op) return
    let body: BodyInit
    let headers: Record<string, string> = {}
    if (kind === 'binary' || kind === 'multipart') {
      if (!file) { setRunError('Chọn một tệp hoặc bấm một ví dụ mẫu.'); return }
      if (kind === 'binary') { body = file; headers = { 'Content-Type': file.type || 'application/octet-stream' } }
      else { const f = new FormData(); f.append(op.file_field ?? 'file', file, file.name); body = f }
    } else {
      if (kind === 'json') {
        try { JSON.parse(req.body ?? '') } catch { setRunError('Body chưa phải JSON hợp lệ.'); return }
      } else if (kind === 'systemone-decision') {
        if (!req.state?.trim()) { setRunError('Nhập state cần ra quyết định.'); return }
        if (!Object.keys(req.questions ?? {}).length) { setRunError('Cần ít nhất một câu hỏi có tên.'); return }
        if (base64Size(images) > IMAGE_BODY_LIMIT) { setRunError('Ảnh quá lớn: body có ảnh tối đa 32 MiB. Bỏ bớt ảnh hoặc giảm kích thước.'); return }
      } else if (!req.input.trim()) return
      const payload = jsonBody(op, mA, { ...req, params: p }) ?? {}
      if (kind === 'systemone-decision' && images.length) payload.images = await Promise.all(images.map(toBase64))
      body = JSON.stringify(payload)
      headers = jsonHeaders(kind)
    }
    setBusy(1); setOut(null); setRunError(null)
    const t0 = performance.now()
    try {
      const d = await (await gw(opUrl(base, mA, op, req.query), key.trim(), body, headers)).json()
      const meta = { ...readUsage(kind, d), ms: performance.now() - t0 }
      if (kind === 'openai-completion') setOut({ text: d.choices?.[0]?.text ?? '', meta })
      else if (kind === 'openai-embedding') {
        const vec: number[] = d.data?.[0]?.embedding ?? []
        setOut({ vec: vec.slice(0, 8), dim: vec.length, meta })
      } else if (kind === 'openai-rerank') {
        const docs = req.docs ?? []
        setOut({ rank: (d.results ?? []).map((r: { index: number; relevance_score: number }) => ({ index: r.index, score: r.relevance_score, text: docs[r.index] })), meta })
      } else setOut({ json: d, text: typeof d?.output === 'string' ? d.output : undefined, meta })
    } catch (e) {
      setRunError((e as Error).message)
    } finally {
      setBusy(0)
    }
  }

  if (error || stdError) return <ErrorBox error={error ?? stdError} />
  if (!data || !standards || !std || !op) return <Loading />

  const offNote = (m?: Model) => m && !m.enabled && (
    <div className="m-auto flex flex-col items-center gap-2 p-4 text-center text-sm text-muted">
      <span>{m.name} đang tắt.</span>
      {me.is_platform_admin && <button className="btn-secondary" onClick={() => enableModel(m.id)}>Bật model</button>}
    </div>
  )

  const modelSelect = (id: string, setId: (v: string) => void, label: string, htmlId?: string) => (
    <select id={htmlId} className={`input ${htmlId ? '' : 'w-auto max-w-full font-medium'}`} value={id} onChange={(e) => { setId(e.target.value); setOut(null) }} aria-label={label}>
      {list.map((x) => <option key={x.id} value={x.id}>{x.name}{x.enabled ? '' : ' (đang tắt)'}</option>)}
    </select>
  )

  const pane = (label: string, id: string, setId: (v: string) => void, conv: Msg[]) => {
    const m = byId(id)
    return (
      <section aria-label={`Khung ${label}`} className="card flex min-w-0 flex-1 basis-80 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-tint-50 px-3 py-2">
          {modelSelect(id, setId, `Model ${label}`)}
          {m && <span className="ml-auto font-mono text-xs text-subtle">{priceText(m)}</span>}
        </div>
        <div className="flex max-h-[60vh] min-h-72 flex-col gap-3 overflow-y-auto p-3" aria-live="polite">
          {!m?.enabled ? offNote(m) : conv.length === 0 ? (
            <p className="m-auto text-center text-sm text-muted">Gửi một câu để xem {m.name} trả lời.</p>
          ) : conv.map((x, i) => (
            <div key={i} className={`flex max-w-[88%] flex-col gap-1 ${x.role === 'user' ? 'self-end' : 'self-start'}`}>
              <div className={`whitespace-pre-wrap rounded-xl border px-3 py-2 text-sm leading-relaxed ${x.role === 'user' ? 'border-tint-200 bg-tint-50' : 'border-slate-200 bg-slate-50'}`}>
                {x.error ? <span className="text-bad">{x.error}</span> : x.content || <span className="text-subtle">…</span>}
              </div>
              {x.meta && <MetaLine m={m} x={x.meta} />}
            </div>
          ))}
        </div>
      </section>
    )
  }

  const noKey = !key.trim()
  const chat = isChat(kind)
  const examples = (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-subtle">Ví dụ:</span>
      {op.examples.map((ex) => (
        <button key={ex.title} className="chip border-tint-200 bg-white text-ink hover:bg-tint-50" onClick={() => applyExample(op, ex)}>{ex.title}</button>
      ))}
    </div>
  )

  return (
    <>
      <PageHeader
        title="Playground"
        desc="Thử model trước khi tích hợp, không cần viết mã. Mỗi chuẩn API là một tab; bấm ví dụ mẫu để điền sẵn, chỉnh tham số, rồi xuất đúng cấu hình đó thành mã gọi API."
      />
      <div className="mb-3">
        <Tabs tabs={standards.map((s) => [s.id, s.name] as [string, string])} value={std.id} onChange={(id) => go(id)} />
      </div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        {std.ops.length > 1 ? <Tabs tabs={std.ops.map((o) => [o.id, o.label] as [string, string])} value={op.id} onChange={(id) => go(std.id, id)} /> : <span />}
        <div className="flex flex-wrap gap-2">
          {chat && <button className="btn-secondary" aria-pressed={compare} onClick={() => setCompare(!compare)}>{compare ? '✓ Compare' : 'Compare'}</button>}
          {chat && <button className="btn-secondary" onClick={() => { abort.current?.abort(); setConvA([]); setConvB([]); setBusy(0) }}>Xoá hội thoại</button>}
          <button className="btn-primary" disabled={!mA} onClick={() => setShowApi(true)}>&lt;&gt; API</button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          {std.unverified && (
            <div className="rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-sm text-warn">
              Chuẩn {std.name} chưa có tài liệu định dạng chính thức. Playground gửi nguyên body JSON bạn nhập và hiện nguyên kết quả.
            </div>
          )}
          {noKey && (
            <div className="space-y-2 rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-sm text-warn">
              <label htmlFor="pg-key-inline" className="block">Dán API key của bạn để gửi yêu cầu. Lời gọi tính vào hạn mức của key đó.</label>
              <input id="pg-key-inline" className="input font-mono" type="password" autoComplete="off" placeholder="mk-live-…" value={key} onChange={(e) => updateKey(e.target.value)} />
            </div>
          )}
          {list.length === 0 ? (
            <div className="card p-6 text-center text-sm text-muted">Chưa có model nào theo chuẩn {std.name} hỗ trợ thao tác {op.label}.</div>
          ) : chat ? (
            <>
              <div className="flex flex-wrap gap-3">
                {pane(compare ? 'A' : 'chính', modelA, setModelA, convA)}
                {compare && pane('B', modelB, setModelB, convB)}
              </div>
              {examples}
              <div className="flex gap-2">
                <textarea
                  className="input flex-1 resize-none" rows={2} aria-label="Câu lệnh" value={req.input}
                  placeholder={compare ? 'Gửi cùng một câu tới cả hai model… (Enter để gửi)' : 'Nhập câu lệnh… (Enter để gửi, Shift+Enter xuống dòng)'}
                  onChange={(e) => setReq({ ...req, input: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                />
                <button className="btn-primary self-end" disabled={!!busy || noKey} onClick={sendChat}>{busy ? 'Đang trả lời…' : 'Gửi'}</button>
              </div>
            </>
          ) : (
            <div className="card space-y-3 p-4">
              {examples}
              {isFile(kind) ? (
                <FileInput op={op} file={file} onFile={(f) => { setFile(f); setOut(null); setReq({ ...req, fileName: f?.name, fileType: f?.type }) }} />
              ) : kind === 'systemone-decision' ? (
                <DecisionForm state={req.state ?? ''} questions={req.questions} version={exVersion}
                  onState={(state) => setReq((r) => ({ ...r, state }))} onQuestions={(questions) => setReq((r) => ({ ...r, questions }))}
                  imageAccept={op.image_accept} images={images}
                  onImages={(f) => { setImages(f); setReq((r) => ({ ...r, imageNames: f.map((x) => x.name) })) }} />
              ) : kind === 'json' ? (
                <>
                  <label className="label" htmlFor="pg-body">Body JSON</label>
                  <textarea id="pg-body" className="input font-mono text-sm" rows={8} spellCheck={false} value={req.body ?? ''} onChange={(e) => setReq({ ...req, body: e.target.value })} />
                </>
              ) : (
                <>
                  <label className="label" htmlFor="pg-in">{kind === 'openai-completion' ? 'Prompt' : kind === 'openai-embedding' ? 'Văn bản cần tạo vector' : 'Câu truy vấn'}</label>
                  <textarea id="pg-in" className="input" rows={kind === 'openai-rerank' ? 2 : 5} value={req.input} onChange={(e) => setReq({ ...req, input: e.target.value })}
                    placeholder={kind === 'openai-completion' ? 'Viết phần mở đầu, model sẽ viết tiếp…' : kind === 'openai-embedding' ? 'Dán một đoạn văn bản…' : 'Ví dụ: thay đổi khẩn cấp cần ai phê duyệt'} />
                  {kind === 'openai-rerank' && (
                    <>
                      <label className="label" htmlFor="pg-docs">Các đoạn văn bản (mỗi dòng một đoạn)</label>
                      <textarea id="pg-docs" className="input" rows={4} value={(req.docs ?? []).join('\n')} onChange={(e) => setReq({ ...req, docs: e.target.value.split('\n') })} />
                    </>
                  )}
                </>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button className="btn-primary" disabled={!!busy || noKey || !mA?.enabled} onClick={runOnce}>{busy ? 'Đang chạy…' : 'Chạy'}</button>
                {mA && !mA.enabled && (
                  <span className="flex items-center gap-2 text-sm text-warn">
                    {mA.name} đang tắt.
                    {me.is_platform_admin && <button className="btn-secondary" onClick={() => enableModel(mA.id)}>Bật model</button>}
                  </span>
                )}
              </div>
              {runError && <div role="alert" className="rounded-md border border-bad/30 bg-bad-bg px-3 py-2 text-sm text-bad">{runError}</div>}
              {out && (
                <div className="space-y-2 rounded-md border border-slate-200 bg-tint-50 p-3">
                  {out.text !== undefined && <div className="whitespace-pre-wrap text-sm leading-relaxed">{out.text}</div>}
                  {out.vec && (
                    <>
                      <div className="text-sm">Vector <strong>{num(out.dim ?? 0)} chiều</strong></div>
                      <div className="break-all font-mono text-xs text-muted">[{out.vec.join(', ')}, …]</div>
                    </>
                  )}
                  {out.rank && (
                    <ol className="space-y-2">
                      {out.rank.map((r, i) => (
                        <li key={r.index} className="space-y-1">
                          <div className="flex justify-between gap-3 text-sm"><span><strong className="mr-2 font-mono">{i + 1}.</strong>{r.text}</span><span className="font-mono text-muted">{r.score.toFixed(2).replace('.', ',')}</span></div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-primary" style={{ width: `${r.score * 100}%` }} /></div>
                        </li>
                      ))}
                    </ol>
                  )}
                  {out.json !== undefined && isFile(kind) && <DocResult d={out.json} />}
                  {out.json !== undefined && kind === 'systemone-decision' && <DecisionResult d={out.json as { answers?: Record<string, DecisionAnswer> }} questions={req.questions} />}
                  {out.json !== undefined && (
                    <details open={kind === 'json'}>
                      <summary className="cursor-pointer text-sm font-medium">JSON trả về</summary>
                      <div className="mt-2"><CodeBlock code={JSON.stringify(out.json, null, 2)} label="JSON" /></div>
                    </details>
                  )}
                  <MetaLine m={mA} x={out.meta} />
                </div>
              )}
            </div>
          )}
        </div>

        <aside aria-label="Cấu hình" className="card h-fit space-y-4 p-4">
          <div className="space-y-1">
            <label className="label" htmlFor="pg-key">API key</label>
            <input id="pg-key" className="input font-mono" type="password" autoComplete="off" placeholder="mk-live-…" value={key} onChange={(e) => updateKey(e.target.value)} />
            <p className="text-xs text-subtle">Chỉ lưu trong tab trình duyệt này. Chưa có key? Xem <Link className="text-primary underline" to="/budget?tab=mine">Key của tôi</Link>.</p>
          </div>
          <div className="space-y-1 text-sm">
            <div className="font-medium">{std.name}</div>
            <p className="text-xs text-muted">{std.description}</p>
            {std.docs_url && <a className="text-xs text-primary hover:underline" href={std.docs_url} target="_blank" rel="noreferrer">Tài liệu chuẩn ↗</a>}
          </div>
          {!chat && list.length > 0 && (
            <div className="space-y-1">
              <label className="label" htmlFor="pg-model">Model</label>
              {modelSelect(modelA, setModelA, 'Model', 'pg-model')}
              {mA && <p className="font-mono text-xs text-subtle">{priceText(mA)}</p>}
            </div>
          )}
          {chat && (
            <div className="space-y-1">
              <label className="label" htmlFor="pg-sys">System prompt</label>
              <textarea id="pg-sys" className="input" rows={4} value={req.system ?? ''} onChange={(e) => setReq({ ...req, system: e.target.value })} placeholder="Hướng dẫn, ngữ cảnh hoặc ví dụ mẫu cho model…" />
              {compare && <p className="text-xs text-subtle">Áp dụng cho cả hai model.</p>}
            </div>
          )}
          {isFile(kind) && (
            <div className="space-y-1">
              <label className="label" htmlFor="pg-query">Tham số trên địa chỉ</label>
              <input id="pg-query" className="input font-mono" placeholder={std.id === 'turboocr' ? 'layout=1&tables=1' : 'tier=flash'} value={req.query ?? ''} onChange={(e) => setReq({ ...req, query: e.target.value })} />
            </div>
          )}
          {paramsOf(kind).map(([k, label, min, max, step]) => (
            <div key={k} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`pg-${k}`} className="text-sm font-medium">{label}</label>
                <input type="number" aria-label={label} className="input w-20 py-1 text-right font-mono" min={min} max={max} step={step} value={p[k] ?? ''}
                  onChange={(e) => setP({ ...p, [k]: Math.min(max, Math.max(min, Number(e.target.value))) })} />
              </div>
              <input id={`pg-${k}`} type="range" className="w-full accent-[var(--color-primary)]" min={min} max={max} step={step} value={p[k] ?? min}
                onChange={(e) => setP({ ...p, [k]: Number(e.target.value) })} />
            </div>
          ))}
          {paramsOf(kind).length === 0 && !isFile(kind) && <p className="text-sm text-muted">Thao tác này không có tham số sinh.</p>}
          {mA && <Link className="block text-sm font-medium text-primary hover:underline" to={`/models/${mA.id}`}>Xem model card của {mA.name} →</Link>}
        </aside>
      </div>

      <Modal open={showApi} title="<> API" onClose={() => setShowApi(false)}>
        {mA && <ApiExport std={std} op={op} model={mA} req={{ ...req, input: req.input || lastUser(convA) || op.examples[0]?.input || 'Xin chào', params: p }} />}
      </Modal>
    </>
  )
}

// toBase64 trả base64 thuần (không có tiền tố data URL), đúng yêu cầu của SystemOne.
async function toBase64(f: File) {
  const b = new Uint8Array(await f.arrayBuffer())
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

const lastUser = (c: Msg[]) => [...c].reverse().find((m) => m.role === 'user')?.content

function FileInput({ op, file, onFile }: { op: Op; file: File | null; onFile: (f: File | null) => void }) {
  const url = useMemo(() => (file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-ink">Tệp {op.accept?.includes('pdf') ? '(PDF hoặc ảnh)' : '(ảnh)'}</span>
        <label className="btn-secondary cursor-pointer focus-within:ring-2 focus-within:ring-primary">
          {file ? 'Chọn tệp khác' : 'Chọn tệp'}
          <input id="pg-file" type="file" className="sr-only" accept={op.accept} onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.target.value = '' }} />
        </label>
      </div>
      {!file && <p className="text-sm text-muted">Chưa chọn tệp. Chọn tệp của bạn hoặc bấm một ví dụ ở trên.</p>}
      {file && (
        <div className="flex flex-wrap items-start gap-3 rounded-md border border-slate-200 p-2">
          {url ? <img src={url} alt={file.name} className="max-h-56 max-w-full rounded border border-slate-100 object-contain" />
            : <span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs">PDF</span>}
          <span className="min-w-0 break-all font-mono text-xs text-muted">{file.name} · {num(Math.round(file.size / 1024))} KB</span>
        </div>
      )}
      <p className="text-xs text-warn">Chỉ dùng dữ liệu mẫu đã che thông tin khách hàng.</p>
    </div>
  )
}

// DocResult hiện kết quả OCR dễ đọc: các dòng chữ và bảng (TurboOCR), Markdown của từng tệp (MinerU).
function DocResult({ d }: { d: any }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const lines: { text: string; confidence?: number }[] = Array.isArray(d?.results) ? d.results : []
  const tables: { html?: string }[] = Array.isArray(d?.tables) ? d.tables : []
  const docs = d?.results && !Array.isArray(d.results) && typeof d.results === 'object'
    ? Object.entries(d.results as Record<string, { md_content?: string }>).filter(([, v]) => typeof v?.md_content === 'string') : []
  return (
    <div className="space-y-3">
      {lines.length > 0 && (
        <ol className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white text-sm">
          {lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3 px-3 py-1.5">
              <span className="min-w-0 break-words">{l.text}</span>
              {l.confidence !== undefined && <span className="shrink-0 font-mono text-xs text-subtle">{(l.confidence * 100).toFixed(0)}%</span>}
            </li>
          ))}
        </ol>
      )}
      {tables.map((t, i) => t.html && (
        <div key={i} className="markdown overflow-x-auto rounded-md border border-slate-200 bg-white p-2" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(t.html) }} />
      ))}
      {docs.map(([name, v]) => (
        <div key={name} className="rounded-md border border-slate-200 bg-white p-3">
          <div className="mb-2 font-mono text-xs text-subtle">{name}</div>
          <Markdown text={v.md_content!} />
        </div>
      ))}
    </div>
  )
}

// P5: mã xuất ra chứa đúng model, đầu vào và tham số đang đặt, theo chuẩn của model.
function ApiExport({ std, op, model, req }: { std: Standard; op: Op; model: Model; req: Req }) {
  const [lang, setLang] = useState<'curl' | 'python' | 'node'>('curl')
  const code = codeSamples(std, op, model, publicConfig.gateway_base_url, req)
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Mã dưới đây gọi <strong className="text-ink">{model.name}</strong> theo chuẩn {std.name}, với đúng đầu vào và tham số bạn đang đặt trong Playground.</p>
      <Tabs tabs={[['curl', 'cURL'], ['python', 'Python'], ['node', 'Node.js']]} value={lang} onChange={setLang} />
      <CodeBlock code={code[lang]} label={lang === 'curl' ? 'cURL' : lang === 'python' ? 'Python' : 'Node.js'} />
      <Link to="/budget?tab=mine" className="text-sm text-primary hover:underline">Xem key của tôi</Link>
    </div>
  )
}
