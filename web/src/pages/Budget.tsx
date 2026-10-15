import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, useApi, type Department, type Key } from '../api'
import {
  DataTable, Empty, ErrorBox, Field, KeyStatus, Loading, Meter, Modal, PageHeader, SecretOnce, StatTile, Tabs, date, usd, useMe, useTab,
} from '../components/ui'

// Ngân sách & key (mục 8.5): danh sách phòng (Nền tảng, quản trị phòng) và Key của tôi (thành viên).

export default function BudgetPage() {
  const me = useMe()
  const managesAny = me.is_platform_admin || me.is_auditor || me.admin_of.length > 0
  type T = 'departments' | 'mine' | 'requests' | 'audit' | 'roles'
  const [tab, setTab] = useTab<T>(['departments', 'mine', 'requests', 'audit', 'roles'], managesAny ? 'departments' : 'mine')
  return (
    <>
      <PageHeader
        title="Ngân sách & key"
        desc="Quản trị nền tảng cấp ngân sách tháng (USD) cho từng phòng; mỗi phòng tự cấp key có hạn mức cho thành viên và ứng dụng."
      />
      <div className="mb-5">
        <Tabs
          tabs={[
            ...(managesAny ? [['departments', me.is_platform_admin || me.is_auditor ? 'Danh sách phòng' : 'Phòng của tôi'] as ['departments', string]] : []),
            ['mine', 'Key của tôi'],
            ['requests', 'Yêu cầu tăng hạn mức'],
            ['audit', 'Nhật ký thao tác'],
            ...(me.is_platform_admin ? [['roles', 'Vai trò'] as ['roles', string]] : []),
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === 'departments' && <Departments />}
      {tab === 'mine' && <MyKeys />}
      {tab === 'requests' && <LimitRequests />}
      {tab === 'audit' && <AuditLog />}
      {tab === 'roles' && me.is_platform_admin && <Roles />}
    </>
  )
}

function Departments() {
  const me = useMe()
  const { data, error, loading, reload } = useApi<{ items: Department[]; period: string }>('/departments')
  const [creating, setCreating] = useState(false)
  if (loading && !data) return <Loading />
  const items = data?.items ?? []
  const total = items.reduce((s, d) => s + Number(d.monthly_budget_usd), 0)
  const used = items.reduce((s, d) => s + Number(d.used_usd), 0)
  return (
    <>
      <ErrorBox error={error} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Tổng ngân sách tháng" value={usd(total)} hint={`Kỳ ${data?.period}`} />
        <StatTile label="Đã dùng" value={usd(used)} />
        <StatTile label="Số phòng" value={items.length} />
      </div>
      {me.is_platform_admin && (
        <div className="mb-3 flex justify-end">
          <button className="btn-primary" onClick={() => setCreating(true)}>Thêm phòng</button>
        </div>
      )}
      {items.length === 0 ? <Empty>Chưa có phòng nào.</Empty> : (
        <>
        {/* Màn hẹp: mỗi phòng một thẻ */}
        <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
          {items.map((d) => (
            <Link key={d.id} to={`/budget/departments/${d.id}`} className="card block space-y-2 p-4 hover:border-tint-200">
              <div className="font-medium text-primary">{d.name}</div>
              <div className="text-xs text-subtle">{d.block} · {d.key_count} key · Quản trị: {d.admins.map((a) => a.name || a.email).join(', ') || '—'}</div>
              <div className="flex justify-between font-mono text-xs"><span>{usd(d.used_usd)} đã dùng</span><span>{usd(d.monthly_budget_usd)}</span></div>
              <Meter used={Number(d.used_usd)} total={Number(d.monthly_budget_usd)} />
              <div className="text-xs text-muted">Đã chia cho key: <span className="font-mono">{usd(d.allocated_usd)}</span></div>
            </Link>
          ))}
        </div>
        <div className="card hidden overflow-x-auto lg:block">
          <table className="w-full">
            <thead className="bg-tint-50">
              <tr>
                <th className="th">Phòng</th><th className="th">Quản trị</th><th className="th">Ngân sách</th>
                <th className="th w-48">Đã dùng</th><th className="th">Đã chia cho key</th><th className="th text-right">Số key</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="td">
                    <Link to={`/budget/departments/${d.id}`} className="font-medium text-primary hover:underline">{d.name}</Link>
                    <div className="text-xs text-subtle">{d.block}</div>
                  </td>
                  <td className="td text-muted">{d.admins.map((a) => a.name || a.email).join(', ') || '—'}</td>
                  <td className="td font-mono">{usd(d.monthly_budget_usd)}</td>
                  <td className="td">
                    <div className="mb-1 font-mono text-xs">{usd(d.used_usd)}</div>
                    <Meter used={Number(d.used_usd)} total={Number(d.monthly_budget_usd)} />
                  </td>
                  <td className="td font-mono">{usd(d.allocated_usd)}</td>
                  <td className="td text-right font-mono">{d.key_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      <Modal open={creating} title="Thêm phòng" onClose={() => setCreating(false)}>
        <CreateDepartment onDone={() => { setCreating(false); reload() }} />
      </Modal>
    </>
  )
}

function CreateDepartment({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: '', block: '', budget: '0', admins: '' })
  const [error, setError] = useState<Error | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await api('/departments', {
        method: 'POST',
        json: {
          name: form.name, block: form.block, monthly_budget_usd: form.budget,
          admin_emails: form.admins.split(',').map((s) => s.trim()).filter(Boolean),
        },
      })
      onDone()
    } catch (err) { setError(err as Error) }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Tên phòng"><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Khối"><input className="input" value={form.block} onChange={(e) => setForm({ ...form, block: e.target.value })} /></Field>
      <Field label="Ngân sách tháng (USD)"><input className="input font-mono" type="number" min="0" step="0.01" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></Field>
      <Field label="Email quản trị phòng" hint="Cách nhau bằng dấu phẩy. Người này cần đăng nhập MaaS ít nhất một lần.">
        <input className="input" value={form.admins} onChange={(e) => setForm({ ...form, admins: e.target.value })} />
      </Field>
      <ErrorBox error={error} />
      <div className="flex justify-end"><button className="btn-primary">Tạo phòng</button></div>
    </form>
  )
}

function MyKeys() {
  const { data, error, loading, reload } = useApi<{ items: Key[] }>('/me/keys')
  const [secret, setSecret] = useState<string | null>(null)
  const [requestFor, setRequestFor] = useState<Key | null>(null)
  const [actionError, setActionError] = useState<Error | null>(null)

  async function act(k: Key, action: 'claim' | 'rotate' | 'revoke') {
    if (action === 'revoke' && !confirm(`Thu hồi key ${k.name}? Thao tác không hoàn tác được.`)) return
    if (action === 'rotate' && !confirm(`Đổi key ${k.name}? Key cũ mất hiệu lực ngay.`)) return
    setActionError(null)
    try {
      const res = await api<{ secret?: string }>(`/keys/${k.id}/${action}`, { method: 'POST' })
      if (res?.secret) setSecret(res.secret)
      reload()
    } catch (e) { setActionError(e as Error) }
  }

  if (loading && !data) return <Loading />
  const items = data?.items ?? []
  return (
    <>
      <ErrorBox error={error ?? actionError} />
      {items.length === 0 ? <Empty>Bạn chưa được cấp key nào. Liên hệ quản trị phòng để được cấp.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {items.map((k) => (
            <article key={k.id} className="card space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-sm font-medium">{k.name}</div>
                  <div className="text-xs text-subtle">{k.department_name} · {k.last4 ? `mk-••••${k.last4}` : 'chưa nhận'}</div>
                </div>
                <KeyStatus status={k.status} />
              </div>
              <div>
                <div className="mb-1 flex justify-between font-mono text-xs">
                  <span>{usd(k.used_usd)} đã dùng</span><span>hạn mức {usd(k.monthly_limit_usd)}</span>
                </div>
                <Meter used={Number(k.used_usd)} total={Number(k.monthly_limit_usd)} />
              </div>
              <div className="text-xs text-muted">Model: <span className="font-mono">{k.allowed_models.join(', ')}</span></div>
              <div className="text-xs text-muted">Hết hạn: {k.expires_at ? date(k.expires_at) : 'Không hết hạn'}</div>
              <div className="flex flex-wrap gap-2">
                {k.status === 'pending' && <button className="btn-primary" onClick={() => act(k, 'claim')}>Nhận key</button>}
                {['active', 'blocked_key', 'blocked_dept'].includes(k.status) && (
                  <>
                    <button className="btn-secondary" onClick={() => act(k, 'rotate')}>Đổi key</button>
                    <button className="btn-secondary" onClick={() => setRequestFor(k)}>Xin tăng hạn mức</button>
                    <button className="btn-danger" onClick={() => act(k, 'revoke')}>Thu hồi</button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <Modal open={!!secret} title="Key của bạn" onClose={() => setSecret(null)}>
        {secret && <SecretOnce secret={secret} />}
      </Modal>
      <Modal open={!!requestFor} title="Xin tăng hạn mức" onClose={() => setRequestFor(null)}>
        {requestFor && <RequestForm kind="key_limit" targetId={requestFor.id} current={requestFor.monthly_limit_usd} onDone={() => setRequestFor(null)} />}
      </Modal>
    </>
  )
}

export function RequestForm({ kind, targetId, current, onDone }: { kind: 'key_limit' | 'dept_budget'; targetId: string; current: string; onDone: () => void }) {
  const [amount, setAmount] = useState(current)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<Error | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await api('/limit-requests', { method: 'POST', json: { kind, target_id: targetId, requested_usd: amount, reason } })
      onDone()
    } catch (err) { setError(err as Error) }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={kind === 'key_limit' ? 'Hạn mức đề nghị (USD/tháng)' : 'Ngân sách đề nghị (USD/tháng)'} hint={`Hiện tại: ${usd(current)}`}>
        <input className="input font-mono" type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Lý do"><textarea className="input" required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <ErrorBox error={error} />
      <div className="flex justify-end"><button className="btn-primary">Gửi yêu cầu</button></div>
    </form>
  )
}

type LimitRequest = {
  id: string; kind: string; target_name: string; department_id: string; requested_usd: string; reason: string
  status: 'open' | 'approved' | 'rejected'; requested_by: { name: string; email: string }; created_at: string; decision_note: string | null
}

function LimitRequests() {
  const me = useMe()
  const { data, error, loading, reload } = useApi<{ items: LimitRequest[] }>('/limit-requests')
  const [actionError, setActionError] = useState<Error | null>(null)
  async function decide(r: LimitRequest, approve: boolean) {
    const note = approve ? '' : prompt('Lý do từ chối') ?? ''
    if (!approve && !note) return
    try {
      await api(`/limit-requests/${r.id}/${approve ? 'approve' : 'reject'}`, { method: 'POST', json: { note } })
      reload()
    } catch (e) { setActionError(e as Error) }
  }
  const canDecide = (r: LimitRequest) =>
    r.status === 'open' && (r.kind === 'dept_budget' ? me.is_platform_admin : me.is_platform_admin || me.admin_of.includes(r.department_id))

  if (loading && !data) return <Loading />
  const items = data?.items ?? []
  return (
    <>
      <ErrorBox error={error ?? actionError} />
      {items.length === 0 ? <Empty>Chưa có yêu cầu nào.</Empty> : (
        <DataTable minWidth={860}>
            <thead className="bg-tint-50"><tr>
              <th className="th">Loại</th><th className="th">Đối tượng</th><th className="th">Người gửi</th>
              <th className="th">Mức đề nghị</th><th className="th">Lý do</th><th className="th">Trạng thái</th><th className="th" />
            </tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="td">{r.kind === 'key_limit' ? 'Hạn mức key' : 'Ngân sách phòng'}</td>
                  <td className="td font-mono">{r.target_name}</td>
                  <td className="td">{r.requested_by.name || r.requested_by.email}<div className="text-xs text-subtle">{date(r.created_at)}</div></td>
                  <td className="td font-mono">{usd(r.requested_usd)}</td>
                  <td className="td text-muted">{r.reason}{r.decision_note && <div className="text-xs">Phản hồi: {r.decision_note}</div>}</td>
                  <td className="td">{r.status === 'open' ? 'Chờ duyệt' : r.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}</td>
                  <td className="td whitespace-nowrap">
                    {canDecide(r) && (
                      <div className="flex gap-2">
                        <button className="btn-primary" onClick={() => decide(r, true)}>Duyệt</button>
                        <button className="btn-secondary" onClick={() => decide(r, false)}>Từ chối</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
        </DataTable>
      )}
    </>
  )
}

type AuditRow = {
  id: number; ts: string; actor_user_id: string; name: string; action: string; target_type: string; target_id: string
  department_id: string | null; before: unknown; after: unknown; reason: string | null
}

const actionLabel: Record<string, string> = {
  'key.create': 'Cấp key', 'key.claim': 'Nhận key', 'key.update': 'Sửa key', 'key.rotate': 'Đổi key', 'key.revoke': 'Thu hồi key',
  'key.status': 'Đổi trạng thái key', 'department.create': 'Tạo phòng', 'department.update': 'Sửa phòng', 'department.admins': 'Gán quản trị phòng',
  'member.add': 'Thêm thành viên', 'member.remove': 'Bớt thành viên', 'model.enabled': 'Bật/tắt model', 'model.price': 'Sửa đơn giá',
  'model.create': 'Thêm model', 'model.update': 'Sửa model', 'model.version': 'Ghi phiên bản model',
  'limit_request.create': 'Gửi yêu cầu', 'limit_request.approved': 'Duyệt yêu cầu', 'limit_request.rejected': 'Từ chối yêu cầu',
  'mcp.create': 'Thêm MCP server', 'mcp.update': 'Sửa MCP server', 'mcp.pause': 'Tạm dừng MCP server', 'mcp.resume': 'Bật MCP server',
  'mcp.delete': 'Gỡ MCP server', 'mcp.scan': 'Quét tool', 'mcp.tool.open': 'Mở tool', 'mcp.tool.close': 'Đóng tool', 'mcp.scope': 'Đổi phạm vi MCP',
  'role.platform': 'Vai trò Quản trị nền tảng', 'role.auditor': 'Vai trò Kiểm soát',
  'skill_set.create': 'Thêm bộ skill', 'skill_set.update': 'Sửa bộ skill', 'skill_set.delete': 'Xoá bộ skill',
}

// Mục 14: Nền tảng, Kiểm soát xem tất cả; quản trị phòng xem phòng mình; thành viên xem thao tác của mình.
function AuditLog() {
  const { data, error, loading } = useApi<{ items: AuditRow[] }>('/audit-log?limit=300')
  const [open, setOpen] = useState<AuditRow | null>(null)
  if (loading && !data) return <Loading />
  return (
    <>
      <ErrorBox error={error} />
      {(data?.items.length ?? 0) === 0 ? <Empty>Chưa có thao tác nào trong phạm vi bạn được xem.</Empty> : (
        <DataTable minWidth={760}>
          <thead className="bg-tint-50"><tr><th className="th">Thời điểm</th><th className="th">Người thực hiện</th><th className="th">Thao tác</th><th className="th">Đối tượng</th><th className="th">Lý do</th><th className="th" /></tr></thead>
          <tbody>
            {data!.items.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="td whitespace-nowrap font-mono text-xs">{new Date(r.ts).toLocaleString('vi-VN')}</td>
                <td className="td">{r.actor_user_id === 'system' ? <span className="font-mono text-xs">system</span> : r.name}</td>
                <td className="td">{actionLabel[r.action] ?? r.action}</td>
                <td className="td font-mono text-xs">{r.target_type}:{r.target_id.slice(0, 24)}</td>
                <td className="td text-muted">{r.reason ?? ''}</td>
                <td className="td text-right">{(r.before != null || r.after != null) && <button className="text-xs text-primary hover:underline" onClick={() => setOpen(r)}>Trước / sau</button>}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      <Modal open={!!open} title="Giá trị trước và sau" onClose={() => setOpen(null)}>
        {open && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><div className="label">Trước</div><pre className="max-h-80 overflow-auto rounded bg-tint-50 p-2 font-mono text-xs">{JSON.stringify(open.before, null, 2)}</pre></div>
            <div><div className="label">Sau</div><pre className="max-h-80 overflow-auto rounded bg-tint-50 p-2 font-mono text-xs">{JSON.stringify(open.after, null, 2)}</pre></div>
          </div>
        )}
      </Modal>
    </>
  )
}

// Vai trò toàn ngân hàng (mục 3): Quản trị nền tảng và Kiểm soát. Vai trò lưu trong CSDL MaaS, không ở Keycloak.
function Roles() {
  const me = useMe()
  const { data, error, reload } = useApi<{ items: { id: string; email: string; name: string; role: 'platform' | 'auditor' }[] }>('/roles')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'platform' | 'auditor'>('auditor')
  const [actionError, setActionError] = useState<Error | null>(null)
  async function setGrant(r: 'platform' | 'auditor', mail: string, grant: boolean) {
    setActionError(null)
    try { await api(`/roles/${r}`, { method: 'PUT', json: { email: mail, grant } }); setEmail(''); reload() } catch (e) { setActionError(e as Error) }
  }
  return (
    <div className="max-w-3xl space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); setGrant(role, email, true) }} className="flex flex-col gap-2 sm:flex-row">
        <input className="input sm:max-w-sm" type="email" required placeholder="email@maas.local" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className="input sm:w-auto" aria-label="Vai trò" value={role} onChange={(e) => setRole(e.target.value as 'platform' | 'auditor')}>
          <option value="auditor">Kiểm soát (chỉ xem)</option><option value="platform">Quản trị nền tảng</option>
        </select>
        <button className="btn-primary">Gán vai trò</button>
      </form>
      <p className="text-xs text-subtle">Người được gán cần đăng nhập MaaS ít nhất một lần. Quản trị phòng gán ở trang chi tiết phòng.</p>
      <ErrorBox error={error ?? actionError} />
      <DataTable minWidth={520}>
        <thead className="bg-tint-50"><tr><th className="th">Người</th><th className="th">Vai trò</th><th className="th" /></tr></thead>
        <tbody>
          {data?.items.map((u) => (
            <tr key={u.role + u.id} className="border-t border-slate-100">
              <td className="td">{u.name}<div className="text-xs text-subtle">{u.email}</div></td>
              <td className="td">{u.role === 'platform' ? 'Quản trị nền tảng' : 'Kiểm soát'}</td>
              <td className="td text-right">{!(u.role === 'platform' && u.id === me.id) && <button className="btn-danger" onClick={() => setGrant(u.role, u.email, false)}>Gỡ</button>}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  )
}
