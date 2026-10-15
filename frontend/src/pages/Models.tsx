import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, useApi, type Model } from '../api'
import { Badge, ErrorBox, Initials, Loading, Modal, PageHeader, Switch, Tabs, num, useMe, usd } from '../components/ui'
import ModelForm from '../components/ModelForm'
import { useStandards } from '../standards'

// Danh mục model (M1–M6): lọc theo chuẩn API, nhà cung cấp, use-case; sắp xếp; tab Tất cả / Đang bật.

type Sort = 'calls' | 'likes' | 'price' | 'name'

export function priceText(m: Model) {
  if (!m.price) return 'Chưa có giá'
  if (m.unit === 'page') return `${usd(m.price.per_page, 4)} / trang`
  return `${usd(m.price.input)} / 1M token vào`
}

function priceValue(m: Model) {
  if (!m.price) return Infinity
  return Number(m.unit === 'page' ? m.price.per_page : m.price.input)
}

function ChipGroup({ title, options, selected, onToggle }: {
  title: string; options: [string, string, number][]; selected: string[]; onToggle: (v: string) => void
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([value, label, count]) => {
          const on = selected.includes(value)
          return (
            <button
              key={value}
              aria-pressed={on}
              onClick={() => onToggle(value)}
              className={`chip ${on ? 'border-primary bg-primary text-white' : 'border-tint-200 bg-white text-ink hover:bg-tint-50'}`}
            >
              {label} <span className={on ? 'text-white/80' : 'text-subtle'}>{count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// stdNames: tên hiển thị của chuẩn API theo id.
export function useStdNames() {
  const { standards } = useStandards()
  return (id: string) => standards?.find((s) => s.id === id)?.name ?? id
}

export default function ModelsPage() {
  const me = useMe()
  const stdName = useStdNames()
  const { data, error, loading, reload } = useApi<{ items: Model[] }>('/models')
  const [tab, setTab] = useState<'all' | 'enabled'>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('calls')
  const [types, setTypes] = useState<string[]>([])
  const [providers, setProviders] = useState<string[]>([])
  const [uses, setUses] = useState<string[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  const [levels, setLevels] = useState<string[]>([])
  const [bulk, setBulk] = useState(false)
  const [adding, setAdding] = useState(false)
  const nav = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<Error | null>(null)

  const models = data?.items ?? []
  const toggle = (set: (f: (v: string[]) => string[]) => void) => (v: string) =>
    set((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]))

  const count = (key: (m: Model) => string[]) => {
    const map = new Map<string, number>()
    models.forEach((m) => key(m).forEach((k) => map.set(k, (map.get(k) ?? 0) + 1)))
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }

  const filtered = useMemo(() => {
    const out = models.filter((m) =>
      (tab === 'all' || m.enabled) &&
      (!types.length || types.includes(m.standard)) &&
      (!providers.length || providers.includes(m.provider_team)) &&
      (!uses.length || uses.some((u) => m.use_cases.includes(u))) &&
      (!statuses.length || statuses.includes(m.status)) &&
      (!levels.length || levels.includes(m.data_level)) &&
      (!q || `${m.name} ${m.id} ${m.description}`.toLowerCase().includes(q.toLowerCase())),
    )
    const cmp: Record<Sort, (a: Model, b: Model) => number> = {
      calls: (a, b) => b.calls_30d - a.calls_30d,
      likes: (a, b) => b.likes - a.likes,
      price: (a, b) => priceValue(a) - priceValue(b),
      name: (a, b) => a.name.localeCompare(b.name, 'vi'),
    }
    return out.sort(cmp[sort])
  }, [models, tab, types, providers, uses, statuses, levels, q, sort])

  const filters = (
    <>
      <ChipGroup title="Chuẩn API" options={count((m) => [m.standard]).map(([k, n]) => [k, stdName(k), n])} selected={types} onToggle={toggle(setTypes)} />
      <ChipGroup title="Nhà cung cấp" options={count((m) => [m.provider_team]).map(([k, n]) => [k, k, n])} selected={providers} onToggle={toggle(setProviders)} />
      <ChipGroup title="Use-case" options={count((m) => m.use_cases).map(([k, n]) => [k, k, n])} selected={uses} onToggle={toggle(setUses)} />
      <ChipGroup title="Trạng thái" options={count((m) => [m.status]).map(([k, n]) => [k, k === 'production' ? 'Production' : 'Beta', n])} selected={statuses} onToggle={toggle(setStatuses)} />
      <ChipGroup title="Mức dữ liệu" options={count((m) => [m.data_level]).map(([k, n]) => [k, k === 'mat' ? 'Mật' : 'Nội bộ', n])} selected={levels} onToggle={toggle(setLevels)} />
    </>
  )

  async function setEnabled(m: Model, on: boolean) {
    setBusy(m.id)
    setActionError(null)
    try {
      await api('/models/enabled', { method: 'PUT', json: { changes: { [m.id]: on } } })
      reload()
    } catch (e) {
      setActionError(e as Error)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Models"
        desc="Danh mục dịch vụ model gọi trực tiếp qua agentgateway. Đơn giá tính bằng USD."
        actions={me.is_platform_admin && (
          <>
            <button className="btn-secondary" onClick={() => setBulk(true)}>Bật/Tắt model</button>
            <button className="btn-primary" onClick={() => setAdding(true)}>Thêm model</button>
          </>
        )}
      />
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)]">
        {/* Màn hẹp: bộ lọc gập trong một khối bấm mở; màn rộng: cột trái luôn mở */}
        <details className="card group p-3 lg:hidden">
          <summary className="cursor-pointer text-sm font-medium">
            Bộ lọc{types.length + providers.length + uses.length + statuses.length + levels.length > 0 && ` (${types.length + providers.length + uses.length + statuses.length + levels.length})`}
          </summary>
          <div className="mt-3 space-y-4">{filters}</div>
        </details>
        <aside className="hidden space-y-5 lg:block">
          {filters}
        </aside>
        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Tabs tabs={[['all', 'Tất cả'], ['enabled', 'Đang bật']]} value={tab} onChange={setTab} />
            <input className="input w-full sm:max-w-xs" placeholder="Lọc theo tên" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Lọc theo tên" />
            <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sắp xếp">
              <option value="calls">Dùng nhiều nhất</option>
              <option value="likes">Được thích nhiều</option>
              <option value="price">Giá thấp nhất</option>
              <option value="name">Tên</option>
            </select>
            <span className="text-sm text-subtle">{filtered.length} model</span>
          </div>
          <ErrorBox error={error ?? actionError} />
          {loading && !data ? <Loading /> : (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3 min-[2200px]:grid-cols-4">
              {filtered.map((m) => (
                <article key={m.id} className="card flex flex-col gap-3 p-4 hover:border-tint-200 hover:shadow-sm">
                  <div className="flex gap-3">
                    <Initials text={m.name} />
                    <div className="min-w-0 flex-1">
                      <Link to={`/models/${m.id}`} className="block truncate font-mono text-sm font-medium hover:text-primary">
                        {m.provider_team}/{m.id}
                      </Link>
                      <p className="truncate text-sm text-muted">{m.description}</p>
                    </div>
                    {me.is_platform_admin && (
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                        <Switch checked={m.enabled} disabled={busy === m.id} label={`${m.enabled ? 'Tắt' : 'Bật'} ${m.name}`} onChange={(v) => setEnabled(m, v)} />
                        {m.enabled ? 'Bật' : 'Tắt'}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge tone="info">{stdName(m.standard)}</Badge>
                    <Badge tone={m.status === 'production' ? 'ok' : 'warn'}>{m.status === 'production' ? 'Production' : 'Beta'}</Badge>
                    <Badge>{m.data_level === 'mat' ? 'Mật' : 'Nội bộ'}</Badge>
                    {!m.enabled && <Badge tone="bad">Đang tắt</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted">
                    <span>{priceText(m)}</span>
                    <span>{num(m.calls_30d)} lượt / 30 ngày</span>
                    <span>♥ {m.likes}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      <Modal open={bulk} title="Bật/Tắt model" onClose={() => setBulk(false)}>
        <BulkToggle models={models} onDone={() => { setBulk(false); reload() }} />
      </Modal>
      <Modal open={adding} title="Thêm model" onClose={() => setAdding(false)}>
        <ModelForm onDone={(id) => { setAdding(false); reload(); nav(`/models/${id}`) }} />
      </Modal>
    </>
  )
}

// M6: tìm, lọc theo chuẩn và trạng thái, bật tắt hàng loạt rồi Lưu.
function BulkToggle({ models, onDone }: { models: Model[]; onDone: () => void }) {
  const stdName = useStdNames()
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [only, setOnly] = useState<'' | 'on' | 'off'>('')
  const [draft, setDraft] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<Error | null>(null)
  const state = (m: Model) => draft[m.id] ?? m.enabled
  const list = models.filter((m) =>
    (!q || `${m.name} ${m.id}`.toLowerCase().includes(q.toLowerCase())) && (!type || m.standard === type) &&
    (!only || (only === 'on') === state(m)))
  const changes = Object.fromEntries(Object.entries(draft).filter(([id, v]) => models.find((m) => m.id === id)?.enabled !== v))
  async function save() {
    try { await api('/models/enabled', { method: 'PUT', json: { changes } }); onDone() } catch (e) { setError(e as Error) }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-0 flex-1" placeholder="Tìm model" aria-label="Tìm model" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" aria-label="Chuẩn API" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Mọi chuẩn</option>{[...new Set(models.map((m) => m.standard))].map((k) => <option key={k} value={k}>{stdName(k)}</option>)}
        </select>
        <select className="input w-auto" aria-label="Trạng thái" value={only} onChange={(e) => setOnly(e.target.value as '' | 'on' | 'off')}>
          <option value="">Bật và tắt</option><option value="on">Đang bật</option><option value="off">Đang tắt</option>
        </select>
      </div>
      <div className="flex gap-2 text-sm">
        <button className="text-primary hover:underline" onClick={() => setDraft({ ...draft, ...Object.fromEntries(list.map((m) => [m.id, true])) })}>Bật tất cả</button>
        <span className="text-subtle">·</span>
        <button className="text-primary hover:underline" onClick={() => setDraft({ ...draft, ...Object.fromEntries(list.map((m) => [m.id, false])) })}>Tắt tất cả</button>
      </div>
      <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
        {list.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0"><div className="truncate text-sm font-medium">{m.name}</div><div className="truncate font-mono text-xs text-subtle">{m.provider_team}/{m.id} · {stdName(m.standard)}</div></div>
            <Switch checked={state(m)} label={`Bật ${m.name}`} onChange={(v) => setDraft({ ...draft, [m.id]: v })} />
          </li>
        ))}
      </ul>
      <ErrorBox error={error} />
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{Object.keys(changes).length} thay đổi</span>
        <button className="btn-primary" disabled={!Object.keys(changes).length} onClick={save}>Lưu</button>
      </div>
    </div>
  )
}
