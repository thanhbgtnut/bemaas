import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, useApi, type Department, type Key, type Model, type UserRef } from '../api'
import {
  DataTable, Empty, ErrorBox, Field, KeyStatus, Loading, Meter, Modal, PageHeader, SecretOnce, StatTile, Tabs, date, usd, useMe,
} from '../components/ui'
import { RequestForm } from './Budget'

// Chi tiết phòng (8.5): 4 ô số liệu, tab Key và tab Thành viên; cấp key, sửa hạn mức, thu hồi, xin thêm ngân sách.

type Member = UserRef & { joined_at: string; is_admin: boolean }

export default function DepartmentPage() {
  const { id } = useParams()
  const me = useMe()
  const { data, error, loading, reload } = useApi<{ department: Department; period: string }>(`/departments/${id}`)
  const [tab, setTab] = useState<'keys' | 'members'>('keys')
  const [editBudget, setEditBudget] = useState(false)
  const [askBudget, setAskBudget] = useState(false)
  const [editAdmins, setEditAdmins] = useState(false)

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox error={error} />
  const d = data.department
  const canManage = me.is_platform_admin || me.admin_of.includes(d.id)

  return (
    <>
      <Link to="/budget" className="text-sm text-primary hover:underline">← Ngân sách & key</Link>
      <PageHeader
        title={d.name}
        desc={`${d.block} · Kỳ ${data.period} · Quản trị: ${d.admins.map((a) => a.name || a.email).join(', ') || 'chưa có'}`}
        actions={
          me.is_platform_admin ? <>
            <button className="btn-secondary" onClick={() => setEditAdmins(true)}>Quản trị phòng</button>
            <button className="btn-secondary" onClick={() => setEditBudget(true)}>Sửa ngân sách</button>
          </>
          : me.admin_of.includes(d.id) ? <button className="btn-secondary" onClick={() => setAskBudget(true)}>Xin thêm ngân sách</button>
          : null
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Ngân sách tháng" value={usd(d.monthly_budget_usd)} />
        <StatTile label="Đã dùng" value={usd(d.used_usd)} hint={<Meter used={Number(d.used_usd)} total={Number(d.monthly_budget_usd)} />} />
        <StatTile label="Đã chia cho key" value={usd(d.allocated_usd)} />
        <StatTile label="Còn chia được" value={usd(d.unallocated_usd)} />
      </div>
      <div className="mb-4"><Tabs tabs={[['keys', `Key (${d.key_count})`], ['members', 'Thành viên']]} value={tab} onChange={setTab} /></div>
      {tab === 'keys' ? <Keys dept={d} canManage={canManage} onChange={reload} /> : <Members dept={d} canManage={canManage} />}

      <Modal open={editBudget} title="Sửa ngân sách phòng" onClose={() => setEditBudget(false)}>
        <BudgetForm dept={d} onDone={() => { setEditBudget(false); reload() }} />
      </Modal>
      <Modal open={editAdmins} title="Quản trị phòng" onClose={() => setEditAdmins(false)}>
        <AdminsForm dept={d} onDone={() => { setEditAdmins(false); reload() }} />
      </Modal>
      <Modal open={askBudget} title="Xin thêm ngân sách" onClose={() => setAskBudget(false)}>
        <RequestForm kind="dept_budget" targetId={d.id} current={d.monthly_budget_usd} onDone={() => setAskBudget(false)} />
      </Modal>
    </>
  )
}

function BudgetForm({ dept, onDone }: { dept: Department; onDone: () => void }) {
  const [budget, setBudget] = useState(dept.monthly_budget_usd)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<Error | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await api(`/departments/${dept.id}`, { method: 'PATCH', json: { monthly_budget_usd: budget, reason } })
      onDone()
    } catch (err) { setError(err as Error) }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Ngân sách tháng (USD)" hint={`Không thấp hơn tổng hạn mức đã chia: ${usd(dept.allocated_usd)} (B4)`}>
        <input className="input font-mono" type="number" min="0" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} />
      </Field>
      <Field label="Lý do"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <ErrorBox error={error} />
      <div className="flex justify-end"><button className="btn-primary">Lưu</button></div>
    </form>
  )
}

function Keys({ dept, canManage, onChange }: { dept: Department; canManage: boolean; onChange: () => void }) {
  const me = useMe()
  // Đổi key ứng dụng: chỉ quản trị phòng, Quản trị nền tảng không đổi key (ma trận quyền).
  const canRotateApp = me.admin_of.includes(dept.id)
  const { data, error, loading, reload } = useApi<{ items: Key[] }>(`/departments/${dept.id}/keys`)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Key | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [actionError, setActionError] = useState<Error | null>(null)
  const refresh = () => { reload(); onChange() }

  async function revoke(k: Key) {
    if (!confirm(`Thu hồi key ${k.name}? Thao tác không hoàn tác được.`)) return
    try { await api(`/keys/${k.id}/revoke`, { method: 'POST' }); refresh() } catch (e) { setActionError(e as Error) }
  }
  async function rotate(k: Key) {
    if (!confirm(`Đổi key ứng dụng ${k.name}? Key cũ mất hiệu lực ngay.`)) return
    try {
      const r = await api<{ secret: string }>(`/keys/${k.id}/rotate`, { method: 'POST' })
      setSecret(r.secret)
      refresh()
    } catch (e) { setActionError(e as Error) }
  }

  if (loading && !data) return <Loading />
  const items = data?.items ?? []
  return (
    <>
      <ErrorBox error={error ?? actionError} />
      {canManage && <div className="mb-3 flex justify-end"><button className="btn-primary" onClick={() => setCreating(true)}>Cấp key</button></div>}
      {items.length === 0 ? <Empty>Phòng chưa có key.</Empty> : (
        <>
        <div className="grid gap-3 md:grid-cols-2 xl:hidden">
          {items.map((k) => {
            const live = !['revoked', 'expired'].includes(k.status)
            return (
              <article key={k.id} className="card space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm font-medium">{k.name}</div>
                    <div className="text-xs text-subtle">{k.kind === 'app' ? 'Ứng dụng' : k.owner?.name || k.owner?.email} · {k.last4 ? `mk-••••${k.last4}` : 'chưa nhận'}</div>
                  </div>
                  <KeyStatus status={k.status} />
                </div>
                <div className="flex justify-between font-mono text-xs"><span>{usd(k.used_usd)}</span><span>{usd(k.monthly_limit_usd)}</span></div>
                <Meter used={Number(k.used_usd)} total={Number(k.monthly_limit_usd)} />
                <div className="break-words font-mono text-xs text-muted">{k.allowed_models.join(', ')}</div>
                <div className="text-xs text-muted">Hết hạn: {k.expires_at ? date(k.expires_at) : 'Không'}</div>
                {canManage && live && (
                  <div className="flex flex-wrap gap-1.5">
                    <button className="btn-secondary" onClick={() => setEditing(k)}>Sửa</button>
                    {k.kind === 'app' && canRotateApp && k.status !== 'pending' && <button className="btn-secondary" onClick={() => rotate(k)}>Đổi</button>}
                    <button className="btn-danger" onClick={() => revoke(k)}>Thu hồi</button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
        <div className="card hidden overflow-x-auto xl:block">
          <table className="w-full">
            <thead className="bg-tint-50"><tr>
              <th className="th">Key</th><th className="th">Cấp cho</th><th className="th w-44">Đã dùng / hạn mức</th>
              <th className="th">Model</th><th className="th">Hết hạn</th><th className="th">Trạng thái</th><th className="th" />
            </tr></thead>
            <tbody>
              {items.map((k) => {
                const live = !['revoked', 'expired'].includes(k.status)
                return (
                  <tr key={k.id} className="border-t border-slate-100 align-top">
                    <td className="td"><div className="font-mono font-medium">{k.name}</div><div className="font-mono text-xs text-subtle">{k.last4 ? `mk-••••${k.last4}` : '—'}</div></td>
                    <td className="td">{k.kind === 'app' ? 'Ứng dụng' : k.owner?.name || k.owner?.email}</td>
                    <td className="td">
                      <div className="mb-1 font-mono text-xs">{usd(k.used_usd)} / {usd(k.monthly_limit_usd)}</div>
                      <Meter used={Number(k.used_usd)} total={Number(k.monthly_limit_usd)} />
                    </td>
                    <td className="td font-mono text-xs">{k.allowed_models.join(', ')}</td>
                    <td className="td text-xs">{k.expires_at ? date(k.expires_at) : 'Không'}</td>
                    <td className="td"><KeyStatus status={k.status} /></td>
                    <td className="td whitespace-nowrap">
                      {canManage && live && (
                        <div className="flex gap-1.5">
                          <button className="btn-secondary" onClick={() => setEditing(k)}>Sửa</button>
                          {k.kind === 'app' && canRotateApp && k.status !== 'pending' && <button className="btn-secondary" onClick={() => rotate(k)}>Đổi</button>}
                          <button className="btn-danger" onClick={() => revoke(k)}>Thu hồi</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
      <Modal open={creating} title="Cấp key" onClose={() => setCreating(false)}>
        <KeyForm dept={dept} onDone={(s) => { setCreating(false); if (s) setSecret(s); refresh() }} />
      </Modal>
      <Modal open={!!editing} title="Sửa key" onClose={() => setEditing(null)}>
        {editing && <KeyForm dept={dept} editing={editing} onDone={() => { setEditing(null); refresh() }} />}
      </Modal>
      <Modal open={!!secret} title="Key ứng dụng" onClose={() => setSecret(null)}>
        {secret && <SecretOnce secret={secret} />}
      </Modal>
    </>
  )
}

function KeyForm({ dept, editing, onDone }: { dept: Department; editing?: Key; onDone: (secret?: string) => void }) {
  const models = useApi<{ items: Model[] }>('/models')
  const members = useApi<{ items: Member[] }>(editing ? null : `/departments/${dept.id}/members`)
  const [kind, setKind] = useState<'member' | 'app'>('member')
  const [owner, setOwner] = useState('')
  const [name, setName] = useState(editing?.name ?? '')
  const [limit, setLimit] = useState(editing?.monthly_limit_usd ?? '')
  const [allowed, setAllowed] = useState<string[]>(editing?.allowed_models ?? [])
  const [expires, setExpires] = useState<number | null>(editing ? null : 90)
  const [error, setError] = useState<Error | null>(null)

  const headroom = Number(dept.unallocated_usd) + (editing ? Number(editing.monthly_limit_usd) : 0)
  const belowUsed = editing && limit !== '' && Number(limit) <= Number(editing.used_usd)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (belowUsed && !confirm('Hạn mức mới thấp hơn số đã dùng trong tháng; key sẽ bị khoá ngay (B5). Tiếp tục?')) return
    const body: Record<string, unknown> = { name, monthly_limit_usd: limit, allowed_models: allowed }
    if (expires !== null) body.expires_in_days = expires
    try {
      if (editing) {
        await api(`/keys/${editing.id}`, { method: 'PATCH', json: body })
        onDone()
      } else {
        const r = await api<{ secret?: string }>(`/departments/${dept.id}/keys`, {
          method: 'POST', json: { ...body, kind, owner_user_id: kind === 'member' ? owner : '' },
        })
        onDone(r.secret)
      }
    } catch (err) { setError(err as Error) }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {!editing && (
        <>
          <fieldset className="flex gap-4 text-sm">
            <legend className="label">Loại key</legend>
            <label className="flex items-center gap-1.5"><input type="radio" checked={kind === 'member'} onChange={() => setKind('member')} /> Thành viên</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={kind === 'app'} onChange={() => setKind('app')} /> Ứng dụng</label>
          </fieldset>
          {kind === 'member' && (
            <Field label="Thành viên" hint="Thành viên tự bấm “Nhận key” để thấy key đầy đủ; quản trị phòng không thấy.">
              <select className="input" required value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="">Chọn thành viên</option>
                {members.data?.items.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
              </select>
            </Field>
          )}
        </>
      )}
      <Field label="Tên key" hint="Duy nhất trong phòng, ví dụ nam-ide hoặc ho-so-thanh-toan-prod">
        <input className="input font-mono" required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Hạn mức tháng (USD)" hint={`Còn chia được: ${usd(headroom)}`}>
        <input className="input font-mono" type="number" min="0" step="0.01" required value={limit} onChange={(e) => setLimit(e.target.value)} />
      </Field>
      {belowUsed && <p className="text-sm text-warn">Hạn mức thấp hơn số đã dùng ({usd(editing!.used_usd)}): key sẽ bị khoá ngay.</p>}
      <fieldset>
        <legend className="label">Model được dùng</legend>
        <div className="flex flex-wrap gap-2">
          {models.data?.items.filter((m) => m.enabled).map((m) => (
            <label key={m.id} className="flex items-center gap-1.5 font-mono text-xs">
              <input type="checkbox" checked={allowed.includes(m.id)} onChange={(e) => setAllowed(e.target.checked ? [...allowed, m.id] : allowed.filter((x) => x !== m.id))} />
              {m.id}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Thời hạn">
        <select className="input" value={expires ?? ''} onChange={(e) => setExpires(e.target.value === '' ? null : Number(e.target.value))}>
          {editing && <option value="">Giữ nguyên</option>}
          <option value={30}>30 ngày</option>
          <option value={90}>90 ngày</option>
          <option value={365}>365 ngày</option>
          <option value={0}>Không hết hạn</option>
        </select>
      </Field>
      <ErrorBox error={error} />
      <div className="flex justify-end"><button className="btn-primary">{editing ? 'Lưu' : 'Cấp key'}</button></div>
    </form>
  )
}

function Members({ dept, canManage }: { dept: Department; canManage: boolean }) {
  const { data, error, loading, reload } = useApi<{ items: Member[] }>(`/departments/${dept.id}/members`)
  const [email, setEmail] = useState('')
  const [actionError, setActionError] = useState<Error | null>(null)
  async function add(e: FormEvent) {
    e.preventDefault()
    try { await api(`/departments/${dept.id}/members`, { method: 'POST', json: { email } }); setEmail(''); reload() }
    catch (err) { setActionError(err as Error) }
  }
  async function remove(m: Member) {
    if (!confirm(`Bớt ${m.name || m.email} khỏi phòng? Mọi key thành viên của họ sẽ bị thu hồi (K7).`)) return
    try { await api(`/departments/${dept.id}/members/${m.id}`, { method: 'DELETE' }); reload() }
    catch (err) { setActionError(err as Error) }
  }
  if (loading && !data) return <Loading />
  return (
    <>
      <ErrorBox error={error ?? actionError} />
      {canManage && (
        <form onSubmit={add} className="mb-3 flex flex-col gap-2 sm:flex-row">
          <input className="input sm:max-w-sm" type="email" required placeholder="email@mbai.local" aria-label="Email thành viên" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-primary">Thêm thành viên</button>
        </form>
      )}
      {(data?.items.length ?? 0) === 0 ? <Empty>Phòng chưa có thành viên.</Empty> : (
        <DataTable minWidth={560}>
            <thead className="bg-tint-50"><tr><th className="th">Tên</th><th className="th">Email</th><th className="th">Tham gia</th><th className="th" /></tr></thead>
            <tbody>
              {data!.items.map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="td">{m.name}{m.is_admin && <span className="ml-2 text-xs text-primary">Quản trị</span>}</td>
                  <td className="td text-muted">{m.email}</td>
                  <td className="td text-xs">{date(m.joined_at)}</td>
                  <td className="td text-right">{canManage && <button className="btn-danger" onClick={() => remove(m)}>Bớt</button>}</td>
                </tr>
              ))}
            </tbody>
        </DataTable>
      )}
    </>
  )
}

function AdminsForm({ dept, onDone }: { dept: Department; onDone: () => void }) {
  const [emails, setEmails] = useState(dept.admins.map((a) => a.email).join(', '))
  const [error, setError] = useState<Error | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await api(`/departments/${dept.id}/admins`, { method: 'PUT', json: { emails: emails.split(',').map((x) => x.trim()).filter(Boolean) } })
      onDone()
    } catch (err) { setError(err as Error) }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Email quản trị phòng" hint="Cách nhau bằng dấu phẩy. Một phòng có thể có nhiều quản trị; người được gán cần đăng nhập MaaS ít nhất một lần.">
        <textarea className="input" rows={3} value={emails} onChange={(e) => setEmails(e.target.value)} />
      </Field>
      <ErrorBox error={error} />
      <div className="flex justify-end"><button className="btn-primary">Lưu</button></div>
    </form>
  )
}
