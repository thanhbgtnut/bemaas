import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, useApi, type Model } from '../api'
import { publicConfig } from '../auth'
import { Badge, CodeBlock, Empty, ErrorBox, Loading, Modal, Sparkline, Tabs, date, num, usd, useMe } from '../components/ui'
import { codeSamples, exampleReq, useStandards } from '../standards'
import ModelForm from '../components/ModelForm'
import { priceText, useStdNames } from './Models'
import Markdown from '../components/Markdown'

// Model card (M10–M13, M19–M21). Tab có địa chỉ riêng để chia sẻ link (G4).

type Detail = {
  model: Model & { card: string }
  daily_calls: { day: string; calls: number }[]
  skills: { id: string; domain: string; name: string; title: string }[]
  gateway_base_url: string
}

type Tab = 'card' | 'api' | 'versions' | 'discussion' | 'usage'

// M21: tab API theo chuẩn của model; mỗi thao tác có endpoint và mã mẫu dựng từ ví dụ đầu tiên của thao tác.
function ApiTab({ m, base }: { m: Model; base: string }) {
  const { standards, error } = useStandards()
  const [lang, setLang] = useState<'curl' | 'python' | 'node'>('curl')
  const std = standards?.find((s) => s.id === m.standard)
  if (error) return <ErrorBox error={error} />
  if (!standards) return <Loading />
  if (!std) return <Empty>Chuẩn API “{m.standard}” không có trong danh mục.</Empty>
  const ops = std.ops.filter((o) => m.modes.includes(o.id))
  return (
    <div className="space-y-4">
      <dl className="card grid grid-cols-1 gap-x-4 gap-y-1 p-4 text-sm sm:grid-cols-[140px_1fr] sm:gap-y-2">
        <dt className="text-subtle">Chuẩn</dt>
        <dd>
          <span className="font-medium">{std.name}</span>
          {std.unverified && <Badge tone="warn">định dạng tạm</Badge>}
          <span className="block text-muted">{std.description}</span>
          {std.docs_url && <a className="text-primary hover:underline" href={std.docs_url} target="_blank" rel="noreferrer">Tài liệu chuẩn ↗</a>}
        </dd>
        <dt className="text-subtle">Base URL</dt><dd className="break-all font-mono">{base}</dd>
        <dt className="text-subtle">Endpoint</dt><dd className="break-all font-mono">{m.endpoint}</dd>
        <dt className="text-subtle">Xác thực</dt><dd className="break-all font-mono">Authorization: Bearer &lt;API key&gt;</dd>
        <dt className="text-subtle">Tính giá</dt><dd>{std.unit === 'page' ? 'Theo trang' : 'Theo token (input, input đã cache, output)'}</dd>
      </dl>
      <Tabs tabs={[['curl', 'cURL'], ['python', 'Python'], ['node', 'Node.js']]} value={lang} onChange={setLang} />
      {ops.map((op) => {
        // Ví dụ dành cho chính model này (ví dụ có ảnh cho model vision) được ưu tiên làm mã mẫu.
        const exIdx = Math.max(0, op.examples.findIndex((e) => e.model === m.id))
        const code = codeSamples(std, op, m, base, { ...exampleReq(op, exIdx), params: { max_tokens: 800 } })
        return (
          <section key={op.id} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">{op.label} <span className="break-all font-mono font-normal text-subtle">POST {m.endpoint}{op.path}</span></h3>
              {m.enabled && <Link className="text-sm text-primary hover:underline" to={`/playground?std=${std.id}&op=${op.id}&model=${m.id}`}>Thử ở Playground →</Link>}
            </div>
            <CodeBlock code={code[lang]} label={`${op.label} · ${lang === 'curl' ? 'cURL' : lang === 'python' ? 'Python' : 'Node.js'}`} />
          </section>
        )
      })}
    </div>
  )
}

export default function ModelDetailPage() {
  const { id, tab: rawTab } = useParams()
  // Link cũ /models/:id/try (trang dùng thử Gradio đã bỏ) mở tab Model card.
  const tab: Tab = (['api', 'versions', 'discussion', 'usage'] as Tab[]).includes(rawTab as Tab) ? rawTab as Tab : 'card'
  const nav = useNavigate()
  const me = useMe()
  const { data, error, loading, reload } = useApi<Detail>(`/models/${id}`)
  const stdName = useStdNames()
  const [actionError, setActionError] = useState<Error | null>(null)
  const [editing, setEditing] = useState(false)

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox error={error} />
  const m = data.model
  const base = data.gateway_base_url || publicConfig.gateway_base_url

  async function toggleLike() {
    try {
      await api(`/models/${m.id}/like`, { method: m.liked_by_me ? 'DELETE' : 'PUT' })
      reload()
    } catch (e) { setActionError(e as Error) }
  }
  async function enable() {
    try {
      await api('/models/enabled', { method: 'PUT', json: { changes: { [m.id]: true } } })
      reload()
    } catch (e) { setActionError(e as Error) }
  }

  return (
    <>
      <div className="bleed -mt-6 mb-6 border-b border-tint-200 bg-tint-50 pt-5">
        <div>
        <Link to="/models" className="text-sm text-primary hover:underline">← Models</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 break-all font-mono text-lg font-medium sm:text-xl">{m.provider_team} / {m.id}</h1>
          <button className="btn-secondary" onClick={toggleLike} aria-pressed={m.liked_by_me}>
            {m.liked_by_me ? '♥' : '♡'} {m.likes}
          </button>
          <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(m.id)}>Chép ID</button>
          <div className="hidden flex-1 sm:block" />
          {!m.enabled
            ? (me.is_platform_admin ? <button className="btn-primary" onClick={enable}>Bật model</button> : <Badge tone="bad">Đang tắt</Badge>)
            : <Link className="btn-primary" to={`/playground?std=${m.standard}&op=${m.modes[0] ?? ''}&model=${m.id}`}>Mở Playground</Link>}
          {me.is_platform_admin && <button className="btn-secondary" onClick={() => setEditing(true)}>Sửa model</button>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone="info">{stdName(m.standard)}</Badge>
          <Badge tone={m.status === 'production' ? 'ok' : 'warn'}>{m.status === 'production' ? 'Production' : 'Beta'}</Badge>
          <Badge>{m.data_level === 'mat' ? 'Mật' : 'Nội bộ'}</Badge>
          {m.use_cases.map((u) => <Badge key={u}>{u}</Badge>)}
        </div>
        <div className="mt-4">
          <Tabs<Tab>
            tabs={[['card', 'Model card'], ['api', 'API'], ['versions', 'Phiên bản'], ['discussion', 'Thảo luận'], ['usage', 'Sử dụng']]}
            value={tab as Tab}
            onChange={(t) => nav(t === 'card' ? `/models/${m.id}` : `/models/${m.id}/${t}`)}
          />
        </div>
        </div>
      </div>
      <ErrorBox error={actionError} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          {tab === 'card' && (
            m.card ? <Markdown text={m.card} />
              : <Empty>Đội cung cấp chưa viết model card.</Empty>
          )}
          {tab === 'api' && <ApiTab m={m} base={base} />}
          {tab === 'versions' && <Versions modelId={m.id} canAdd={me.is_platform_admin} />}
          {tab === 'discussion' && <Discussion modelId={m.id} />}
          {tab === 'usage' && (
            <div className="card overflow-x-auto">
              <table className="w-full">
                <thead><tr><th className="th">Ngày</th><th className="th text-right">Lượt gọi</th></tr></thead>
                <tbody>
                  {[...data.daily_calls].reverse().map((d) => (
                    <tr key={d.day} className="border-t border-slate-100"><td className="td font-mono">{d.day}</td><td className="td text-right font-mono">{num(d.calls)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="card p-4">
            <h3 className="text-sm font-semibold">Lượt gọi 30 ngày</h3>
            <div className="mt-1 font-mono text-2xl">{num(m.calls_30d)}</div>
            <Sparkline values={data.daily_calls.map((d) => d.calls)} />
          </div>
          <div className="card p-4 text-sm">
            <h3 className="mb-2 font-semibold">Đơn giá (USD)</h3>
            {!m.price ? <p className="text-muted">Chưa có giá</p> : m.unit === 'page' ? (
              <p className="font-mono">{priceText(m)}</p>
            ) : (
              <dl className="grid grid-cols-2 gap-y-1 font-mono">
                <dt className="font-sans text-subtle">Input / 1M</dt><dd>{usd(m.price.input)}</dd>
                <dt className="font-sans text-subtle">Input cache / 1M</dt><dd>{usd(m.price.cache_read)}</dd>
                <dt className="font-sans text-subtle">Output / 1M</dt><dd>{usd(m.price.output)}</dd>
              </dl>
            )}
          </div>
          <div className="card p-4 text-sm">
            <h3 className="mb-2 font-semibold">Kết nối dịch vụ</h3>
            <dl className="space-y-1">
              <div><dt className="text-subtle">Cổng</dt><dd className="font-mono">agentgateway</dd></div>
              <div><dt className="text-subtle">Base URL</dt><dd className="break-all font-mono">{base}</dd></div>
              <div><dt className="text-subtle">Endpoint</dt><dd className="break-all font-mono">{m.endpoint}</dd></div>
              <div><dt className="text-subtle">Model id</dt><dd className="font-mono">{m.id}</dd></div>
              {m.context_length && <div><dt className="text-subtle">Ngữ cảnh</dt><dd className="font-mono">{num(m.context_length)} token</dd></div>}
            </dl>
          </div>
          <div className="card p-4 text-sm">
            <h3 className="mb-2 font-semibold">Skill dùng model này</h3>
            {data.skills.length === 0 ? <p className="text-muted">Chưa có</p> : (
              <ul className="space-y-1">
                {data.skills.map((s) => (
                  <li key={s.id}><Link className="text-primary hover:underline" to={`/skills/${s.id}`}>{s.domain}/{s.name}</Link></li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
      <Modal open={editing} title="Sửa model" onClose={() => setEditing(false)}>
        <ModelForm model={m} onDone={() => { setEditing(false); reload() }} />
      </Modal>
    </>
  )
}

function Versions({ modelId, canAdd }: { modelId: string; canAdd: boolean }) {
  const { data, error, reload } = useApi<{ items: { version: string; notes: string; created_at: string; name: string }[] }>(`/models/${modelId}/versions`)
  const [form, setForm] = useState({ version: '', notes: '' })
  const [err, setErr] = useState<Error | null>(null)
  async function add(e: FormEvent) {
    e.preventDefault()
    try { await api(`/models/${modelId}/versions`, { method: 'POST', json: form }); setForm({ version: '', notes: '' }); reload() }
    catch (x) { setErr(x as Error) }
  }
  return (
    <div className="space-y-3">
      <ErrorBox error={error ?? err} />
      {(data?.items.length ?? 0) === 0 ? <Empty>Chưa có phiên bản nào được ghi.</Empty> : (
        <ol className="space-y-2">
          {data!.items.map((v) => (
            <li key={v.version} className="card p-3 text-sm">
              <span className="font-mono font-medium">{v.version}</span> <span className="text-subtle">· {date(v.created_at)} · {v.name}</span>
              {v.notes && <p className="mt-1 whitespace-pre-wrap text-muted">{v.notes}</p>}
            </li>
          ))}
        </ol>
      )}
      {canAdd && (
        <form onSubmit={add} className="card space-y-2 p-3">
          <div className="text-sm font-semibold">Ghi phiên bản mới</div>
          <input className="input font-mono" required placeholder="2026.10.1" aria-label="Phiên bản" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
          <textarea className="input" rows={3} placeholder="Thay đổi so với phiên bản trước" aria-label="Ghi chú" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button className="btn-primary">Ghi phiên bản</button>
        </form>
      )}
    </div>
  )
}

function Discussion({ modelId }: { modelId: string }) {
  const { data, error, reload } = useApi<{ items: { id: string; user: { name: string; email: string }; body: string; ts: string }[] }>(`/models/${modelId}/comments`)
  const [body, setBody] = useState('')
  const [err, setErr] = useState<Error | null>(null)
  async function send(e: FormEvent) {
    e.preventDefault()
    try { await api(`/models/${modelId}/comments`, { method: 'POST', json: { body } }); setBody(''); reload() }
    catch (x) { setErr(x as Error) }
  }
  return (
    <div className="space-y-3">
      <ErrorBox error={error ?? err} />
      {(data?.items.length ?? 0) === 0 ? <Empty>Chưa có thảo luận. Đặt câu hỏi cho đội cung cấp model ở đây.</Empty> : data!.items.map((c) => (
        <div key={c.id} className="card p-3 text-sm">
          <div className="mb-1 text-xs text-subtle">{c.user.name || c.user.email} · {date(c.ts)}</div>
          <p className="whitespace-pre-wrap">{c.body}</p>
        </div>
      ))}
      <form onSubmit={send} className="space-y-2">
        <label className="label" htmlFor="model-comment">Thảo luận</label>
        <textarea id="model-comment" className="input" rows={3} required value={body} onChange={(e) => setBody(e.target.value)} />
        <button className="btn-primary">Gửi</button>
      </form>
    </div>
  )
}
