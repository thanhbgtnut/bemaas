import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, accessTokenHeader, api, useApi, type Skill } from '../api'
import { Badge, Empty, ErrorBox, Field, Initials, Loading, Modal, PageHeader, Tabs, date, num, useMe, useTab } from '../components/ui'

// Skill hub (mục 7): hub để chia sẻ, không phân quyền, không phê duyệt.

export const kindLabel: Record<string, string> = { guide: 'Chỉ hướng dẫn', script: 'Có script', tool: 'Gọi tool/API' }

export function SkillCard({ s }: { s: Skill }) {
  return (
    <article className="card flex flex-col gap-2 p-4 hover:shadow-sm">
      <div className="flex gap-3">
        <Initials text={s.title} />
        <div className="min-w-0">
          <Link to={`/skills/${s.id}`} className="block truncate font-medium hover:text-primary">{s.title}</Link>
          <div className="truncate font-mono text-xs text-subtle">{s.domain}/{s.name} · v{s.latest_version}</div>
        </div>
      </div>
      <p className="line-clamp-2 text-sm text-muted">{s.description}</p>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="info">{kindLabel[s.kind]}</Badge>
        {s.verified && <Badge tone="ok">Đã kiểm chứng</Badge>}
        {s.models.map((m) => <Badge key={m}>{m}</Badge>)}
      </div>
      <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
        <span>{s.author.name}{s.owner_unit && ` · ${s.owner_unit}`}</span>
        <span className="font-mono">↓ {num(s.installs)}</span>
        <span className="font-mono">♥ {s.likes}</span>
        <span>{date(s.updated_at)}</span>
      </div>
    </article>
  )
}

export default function SkillsPage() {
  const [section, setSection] = useTab(['explore', 'sets', 'wanted'], 'explore')
  const [sharing, setSharing] = useState<{ wishId?: string } | null>(null)
  const [tick, setTick] = useState(0)
  return (
    <>
      <PageHeader
        title="Skills"
        desc="Nơi chia sẻ agent skill cho cả ngân hàng: ai cũng xem, cài, góp ý và đăng skill được. Bộ skill theo vai trò giúp người mới nhận ngay cách làm đã được đồng nghiệp đúc kết."
        actions={<button className="btn-primary" onClick={() => setSharing({})}>Chia sẻ skill</button>}
      />
      <div className="mb-4">
        <Tabs tabs={[['explore', 'Khám phá'], ['sets', 'Bộ skill theo vai trò'], ['wanted', 'Skill đang cần']]} value={section} onChange={setSection} />
      </div>
      {section === 'explore' && <Explore key={tick} />}
      {section === 'sets' && <SkillSets />}
      {section === 'wanted' && <Wanted key={tick} onWrite={(wishId) => setSharing({ wishId })} />}
      <Modal open={!!sharing} title="Chia sẻ skill" onClose={() => setSharing(null)}>
        {sharing && <ShareForm wishId={sharing.wishId} onDone={() => { setSharing(null); setTick((t) => t + 1) }} />}
      </Modal>
    </>
  )
}

function Explore() {
  const [tab, setTab] = useState<'all' | 'liked' | 'mine'>('all')
  const [q, setQ] = useState('')
  const [domain, setDomain] = useState('')
  const [kind, setKind] = useState('')
  const [model, setModel] = useState('')
  const [sort, setSort] = useState('installs')
  const params = new URLSearchParams({ tab, sort, ...(q && { q }), ...(domain && { domain }), ...(kind && { kind }), ...(model && { model }) })
  const { data, error, loading } = useApi<{ items: Skill[] }>(`/skills?${params}`)
  const all = useApi<{ items: Skill[] }>('/skills')
  const domains = useMemo(() => [...new Set((all.data?.items ?? []).map((s) => s.domain))].sort(), [all.data])
  const models = useMemo(() => [...new Set((all.data?.items ?? []).flatMap((s) => s.models))].sort(), [all.data])

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs tabs={[['all', 'Tất cả'], ['liked', 'Yêu thích'], ['mine', 'Tôi chia sẻ']]} value={tab} onChange={setTab} />
        <input className="input w-full sm:max-w-xs" placeholder="Tìm skill" aria-label="Tìm skill" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Lĩnh vực">
          <option value="">Mọi lĩnh vực</option>
          {domains.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Loại skill">
          <option value="">Mọi loại</option>
          {Object.entries(kindLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="input w-auto" value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model sử dụng">
          <option value="">Mọi model</option>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sắp xếp">
          <option value="installs">Cài nhiều nhất</option><option value="likes">Được thích nhiều</option>
          <option value="updated">Mới cập nhật</option><option value="name">Tên</option>
        </select>
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : (data?.items.length ?? 0) === 0 ? <Empty>Chưa có skill nào phù hợp.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 min-[1800px]:grid-cols-4">
          {data!.items.map((s) => <SkillCard key={s.id} s={s} />)}
        </div>
      )}
    </>
  )
}

type SkillSet = { id: string; role_name: string; unit: string; scope: 'nghiep_vu' | 'cntt'; skill_count: number }

function SkillSets() {
  const me = useMe()
  const [scope, setScope] = useState<'' | 'nghiep_vu' | 'cntt'>('')
  const { data, error, loading, reload } = useApi<{ items: SkillSet[] }>(`/skill-sets${scope ? `?scope=${scope}` : ''}`)
  const [adding, setAdding] = useState(false)
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={[['', 'Toàn ngân hàng'], ['nghiep_vu', 'Khối nghiệp vụ'], ['cntt', 'Khối CNTT']]} value={scope} onChange={setScope} />
        {me.is_platform_admin && <button className="btn-secondary" onClick={() => setAdding(true)}>Thêm bộ skill</button>}
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : (data?.items.length ?? 0) === 0 ? <Empty>Chưa có bộ skill nào.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 min-[1800px]:grid-cols-4">
          {data!.items.map((x) => (
            <Link key={x.id} to={`/skills/sets/${x.id}`} className="card flex gap-3 p-4 hover:border-tint-200 hover:shadow-sm">
              <Initials text={x.role_name} />
              <div className="min-w-0">
                <div className="font-medium">{x.role_name}</div>
                <div className="text-xs text-subtle">{x.unit} · {x.scope === 'cntt' ? 'Khối CNTT' : 'Khối nghiệp vụ'}</div>
                <div className="mt-1 text-sm text-muted">{x.skill_count} skill</div>
              </div>
            </Link>
          ))}
        </div>
      )}
      <Modal open={adding} title="Thêm bộ skill" onClose={() => setAdding(false)}>
        <SkillSetForm onDone={() => { setAdding(false); reload() }} />
      </Modal>
    </>
  )
}

export function SkillSetForm({ set, onDone }: { set?: SkillSet & { skills?: Skill[] }; onDone: () => void }) {
  const all = useApi<{ items: Skill[] }>('/skills?sort=name')
  const [f, setF] = useState({ role_name: set?.role_name ?? '', unit: set?.unit ?? '', scope: set?.scope ?? 'nghiep_vu' })
  const [ids, setIds] = useState<string[]>(set?.skills?.map((s) => s.id) ?? [])
  const [error, setError] = useState<Error | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      if (set) await api(`/skill-sets/${set.id}`, { method: 'PUT', json: { ...f, skill_ids: ids } })
      else await api('/skill-sets', { method: 'POST', json: { ...f, skill_ids: ids } })
      onDone()
    } catch (err) { setError(err as Error) }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Vai trò công việc"><input className="input" required value={f.role_name} onChange={(e) => setF({ ...f, role_name: e.target.value })} placeholder="Cán bộ tín dụng" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Đơn vị"><input className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></Field>
        <Field label="Phạm vi">
          <select className="input" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value as 'nghiep_vu' | 'cntt' })}>
            <option value="nghiep_vu">Khối nghiệp vụ</option><option value="cntt">Khối CNTT</option>
          </select>
        </Field>
      </div>
      <fieldset>
        <legend className="label">Skill trong bộ ({ids.length})</legend>
        <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
          {all.data?.items.map((s) => (
            <li key={s.id}><label className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <input type="checkbox" checked={ids.includes(s.id)} onChange={(e) => setIds(e.target.checked ? [...ids, s.id] : ids.filter((x) => x !== s.id))} />
              <span className="flex-1">{s.title}</span><span className="font-mono text-xs text-subtle">{s.domain}/{s.name}</span>
            </label></li>
          ))}
        </ul>
      </fieldset>
      <ErrorBox error={error} />
      <div className="flex justify-end"><button className="btn-primary">{set ? 'Lưu' : 'Thêm bộ skill'}</button></div>
    </form>
  )
}

type Wish = {
  id: string; title: string; description: string; few_experts: boolean; created_at: string; proposed_by: string
  taker: string | null; taken_by_me: boolean | null; votes: number; voted_by_me: boolean
  fulfilled_skill_id: string | null; fulfilled_skill: string | null; skill_set: string | null
}

// S13, S14: đề xuất việc cần skill; bình chọn; "Tôi sẽ viết"; đóng khi skill được đăng.
function Wanted({ onWrite }: { onWrite: (wishId: string) => void }) {
  const { data, error, loading, reload } = useApi<{ items: Wish[] }>('/skill-wishes')
  const sets = useApi<{ items: SkillSet[] }>('/skill-sets')
  const [form, setForm] = useState({ title: '', description: '', skill_set_id: '', few_experts: false })
  const [adding, setAdding] = useState(false)
  const [actionError, setActionError] = useState<Error | null>(null)
  async function act(path: string, method: string) {
    try { await api(path, { method }); reload() } catch (e) { setActionError(e as Error) }
  }
  async function propose(e: FormEvent) {
    e.preventDefault()
    try {
      await api('/skill-wishes', { method: 'POST', json: { ...form, skill_set_id: form.skill_set_id || null } })
      setForm({ title: '', description: '', skill_set_id: '', few_experts: false }); setAdding(false); reload()
    } catch (err) { setActionError(err as Error) }
  }
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted">Việc cần skill mà chưa ai viết. Bình chọn để ưu tiên, hoặc bấm “Tôi sẽ viết” để nhận. Việc chỉ vài người biết làm được gắn nhãn “Ít người nắm nghiệp vụ”.</p>
        <button className="btn-secondary" onClick={() => setAdding(true)}>Đề xuất skill</button>
      </div>
      <ErrorBox error={error ?? actionError} />
      {loading && !data ? <Loading /> : (data?.items.length ?? 0) === 0 ? <Empty>Chưa có đề xuất nào.</Empty> : (
        <ul className="space-y-2">
          {data!.items.map((w) => (
            <li key={w.id} className={`card flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${w.fulfilled_skill_id ? 'opacity-70' : ''}`}>
              <button className={`btn-secondary shrink-0 flex-col gap-0 px-3 ${w.voted_by_me ? 'border-primary text-primary' : ''}`} aria-pressed={w.voted_by_me}
                disabled={!!w.fulfilled_skill_id} onClick={() => act(`/skill-wishes/${w.id}/vote`, w.voted_by_me ? 'DELETE' : 'PUT')}>
                <span aria-hidden="true">▲</span><span className="font-mono">{w.votes}</span><span className="sr-only">bình chọn</span>
              </button>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="font-medium">{w.title}</div>
                {w.description && <p className="text-sm text-muted">{w.description}</p>}
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {w.few_experts && <Badge tone="warn">Ít người nắm nghiệp vụ</Badge>}
                  {w.skill_set && <Badge>{w.skill_set}</Badge>}
                  {w.fulfilled_skill_id ? <Badge tone="ok">Đã có skill</Badge> : w.taker ? <Badge tone="info">{w.taker} đang viết</Badge> : null}
                  <span className="text-subtle">Đề xuất bởi {w.proposed_by} · {date(w.created_at)}</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {w.fulfilled_skill_id
                  ? <Link className="btn-secondary" to={`/skills/${w.fulfilled_skill_id}`}>Xem {w.fulfilled_skill}</Link>
                  : !w.taker ? <button className="btn-secondary" onClick={() => act(`/skill-wishes/${w.id}/take`, 'POST')}>Tôi sẽ viết</button>
                  : w.taken_by_me ? <button className="btn-primary" onClick={() => onWrite(w.id)}>Đăng skill cho đề xuất này</button> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={adding} title="Đề xuất skill" onClose={() => setAdding(false)}>
        <form onSubmit={propose} className="space-y-3">
          <Field label="Việc cần skill"><input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Mô tả"><textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Thuộc bộ skill (không bắt buộc)">
            <select className="input" value={form.skill_set_id} onChange={(e) => setForm({ ...form, skill_set_id: e.target.value })}>
              <option value="">Không</option>{sets.data?.items.map((x) => <option key={x.id} value={x.id}>{x.role_name}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.few_experts} onChange={(e) => setForm({ ...form, few_experts: e.target.checked })} />Ít người nắm nghiệp vụ</label>
          <div className="flex justify-end"><button className="btn-primary">Gửi đề xuất</button></div>
        </form>
      </Modal>
    </>
  )
}

// Ba bước gộp trong một form (S19): gói .zip → thông tin → kiểm tra tự động và đăng.
function ShareForm({ onDone, wishId }: { onDone: () => void; wishId?: string }) {
  const nav = useNavigate()
  const models = useApi<{ items: { id: string }[] }>('/models')
  const [file, setFile] = useState<File | null>(null)
  const [meta, setMeta] = useState({ domain: '', name: '', title: '', kind: 'guide', description: '', trigger: '', owner_unit: '', version: '1.0.0' })
  const [chosen, setChosen] = useState<string[]>([])
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!file) return
    setBusy(true)
    setError(null)
    const form = new FormData()
    form.append('meta', JSON.stringify({ ...meta, models: chosen, ...(wishId ? { wish_id: wishId } : {}) }))
    form.append('package', file)
    const res = await fetch('/api/v1/skills', { method: 'POST', headers: accessTokenHeader(), body: form })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setError(new ApiError(res.status, data.code, data.message, data.details))
      return
    }
    onDone()
    nav(`/skills/${data.id}`)
  }

  const problems = (error?.details?.problems as string[] | undefined) ?? []
  const set = (k: keyof typeof meta) => (e: { target: { value: string } }) => setMeta({ ...meta, [k]: e.target.value })
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Gói skill (.zip)" hint="Thư mục có SKILL.md (frontmatter name, description), kèm script và tài liệu tham chiếu.">
        <input className="input" type="file" accept=".zip" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Lĩnh vực"><input className="input font-mono" required placeholder="tin-dung" value={meta.domain} onChange={set('domain')} /></Field>
        <Field label="ID"><input className="input font-mono" required placeholder="tom-tat-ho-so" value={meta.name} onChange={set('name')} /></Field>
      </div>
      <Field label="Tên hiển thị" hint="Để trống thì lấy name trong SKILL.md"><input className="input" value={meta.title} onChange={set('title')} /></Field>
      <Field label="Loại skill">
        <select className="input" value={meta.kind} onChange={set('kind')}>
          {Object.entries(kindLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      <Field label="Khi nào agent dùng skill này"><textarea className="input" rows={2} value={meta.trigger} onChange={set('trigger')} /></Field>
      <Field label="Đơn vị"><input className="input" value={meta.owner_unit} onChange={set('owner_unit')} /></Field>
      <fieldset>
        <legend className="label">Model sử dụng</legend>
        <div className="flex flex-wrap gap-2">
          {models.data?.items.map((m) => (
            <label key={m.id} className="flex items-center gap-1.5 font-mono text-xs">
              <input type="checkbox" checked={chosen.includes(m.id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, m.id] : chosen.filter((x) => x !== m.id))} />
              {m.id}
            </label>
          ))}
        </div>
      </fieldset>
      <ErrorBox error={error} />
      {problems.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-bad">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
      )}
      <p className="text-xs text-subtle">Chỉ kiểm tra tự động: SKILL.md hợp lệ, không chứa mật khẩu, khoá API, token hay dữ liệu khách hàng. Đạt là đăng ngay.</p>
      <div className="flex justify-end"><button className="btn-primary" disabled={busy}>{busy ? 'Đang kiểm tra…' : 'Kiểm tra và đăng'}</button></div>
    </form>
  )
}
