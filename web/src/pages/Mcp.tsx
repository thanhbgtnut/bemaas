import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, useApi, type Department } from '../api'
import {
  Badge, CodeBlock, DataTable, Empty, ErrorBox, Field, Initials, Loading, Modal, PageHeader, StatTile, Switch, Tabs, date, num, useMe, useTab,
} from '../components/ui'

// MCP & tools (spec mục 20). Quản trị nền tảng khai báo server, mở tool, đặt phạm vi; MaaS ghi cấu hình
// xuống agentgateway. Quản trị phòng và thành viên chỉ xem server phòng mình dùng được và cách kết nối.

type Server = {
  id: string; name: string; description: string; owner_unit: string; host?: string; port?: number; path?: string
  protocol: 'streamable_http' | 'sse'; enabled: boolean; scope: 'all' | 'departments'; health: 'ok' | 'down'
  last_error?: string | null; last_scanned_at: string | null; tools_open: number; tools_total?: number; calls_30d: number
  departments?: { id: string; name: string }[]
}
type Tool = { name: string; gateway_name: string; description: string; read_only: boolean; enabled: boolean; calls_30d: number; first_seen_at: string; reviewed_at: string | null }
type Sync = { synced_at: string | null; error: string | null; mode: string }

const Health = ({ s }: { s: Server }) =>
  !s.enabled ? <Badge>Tạm dừng</Badge> : s.health === 'ok' ? <Badge tone="ok">Kết nối tốt</Badge> : <Badge tone="bad">Không kết nối được</Badge>

function SyncBadge({ sync }: { sync?: Sync }) {
  if (!sync) return null
  if (sync.error) return <Badge tone="bad">Lỗi đồng bộ</Badge>
  if (sync.mode !== 'kubernetes') return <Badge tone="warn">Chế độ log (chưa ghi cụm)</Badge>
  return <Badge tone="ok">Đã đồng bộ</Badge>
}

export default function McpPage() {
  const me = useMe()
  const nav = useNavigate()
  const [tab, setTab] = useTab(['servers', 'gateway'], 'servers')
  const { data, error, loading, reload } = useApi<{ items: Server[]; sync?: Sync; gateway_base_url: string }>('/mcp-servers')
  const [adding, setAdding] = useState(false)
  const [actionError, setActionError] = useState<Error | null>(null)
  const admin = me.is_platform_admin
  const items = data?.items ?? []

  async function setEnabled(s: Server, enabled: boolean) {
    try { await api(`/mcp-servers/${s.id}`, { method: 'PATCH', json: { enabled } }); reload() } catch (e) { setActionError(e as Error) }
  }

  return (
    <>
      <PageHeader
        title="MCP & tools"
        desc={admin
          ? 'Khai báo MCP server, mở từng tool và đặt phòng được dùng. MaaS ghi cấu hình xuống agentgateway; agent nối một endpoint /mcp bằng API key.'
          : 'Các MCP server và tool phòng bạn được dùng, cùng cách kết nối từ agent hoặc IDE bằng API key của bạn.'}
        actions={admin && <button className="btn-primary" onClick={() => setAdding(true)}>Thêm MCP server</button>}
      />
      {admin && (
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile label="Server" value={items.length} hint={`${items.filter((s) => s.enabled).length} đang bật`} />
          <StatTile label="Tool đang mở" value={`${items.reduce((a, s) => a + s.tools_open, 0)} / ${items.reduce((a, s) => a + (s.tools_total ?? 0), 0)}`} />
          <StatTile label="Lượt gọi tool 30 ngày" value={num(items.reduce((a, s) => a + Number(s.calls_30d), 0))} />
          <StatTile label="Đồng bộ gateway" value={<SyncBadge sync={data?.sync} />} hint={data?.sync?.synced_at ? new Date(data.sync.synced_at).toLocaleString('vi-VN') : 'Chưa đồng bộ'} />
        </div>
      )}
      {admin && <div className="mb-4"><Tabs tabs={[['servers', 'Server'], ['gateway', 'Cấu hình gateway']]} value={tab} onChange={setTab} /></div>}
      <ErrorBox error={error ?? actionError} />
      {tab === 'gateway' && admin ? <GatewayConfig /> : loading && !data ? <Loading /> : items.length === 0 ? (
        <Empty>{admin ? 'Chưa có MCP server nào. Bấm “Thêm MCP server”.' : 'Phòng bạn chưa được mở MCP server nào.'}</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {items.map((s) => (
            <article key={s.id} className={`card flex gap-3 p-4 ${s.enabled ? '' : 'opacity-70'}`}>
              <Initials text={s.name} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/mcp/${s.id}`} className="min-w-0 break-all font-mono text-sm font-medium hover:text-primary">{s.id}</Link>
                  {admin && <Switch checked={s.enabled} label={`${s.enabled ? 'Tạm dừng' : 'Bật'} ${s.id}`} onChange={(v) => setEnabled(s, v)} />}
                </div>
                <div className="text-sm">{s.name}</div>
                <p className="line-clamp-2 text-sm text-muted">{s.description}</p>
                <div className="flex flex-wrap gap-1.5"><Health s={s} />
                  <Badge tone="info">{s.tools_open}{admin ? ` / ${s.tools_total}` : ''} tool đang mở</Badge>
                  {admin && <Badge>{s.scope === 'all' ? 'Mọi phòng' : `${s.departments?.length ?? 0} phòng`}</Badge>}
                </div>
                <div className="flex flex-wrap gap-x-3 text-xs text-subtle"><span>{s.owner_unit}</span><span className="font-mono">{num(Number(s.calls_30d))} lượt / 30 ngày</span></div>
              </div>
            </article>
          ))}
        </div>
      )}
      <Modal open={adding} title="Thêm MCP server" onClose={() => setAdding(false)}>
        <AddServer onDone={(id) => { setAdding(false); nav(`/mcp/${id}`) }} />
      </Modal>
    </>
  )
}

function AddServer({ onDone }: { onDone: (id: string) => void }) {
  const [f, setF] = useState({ id: '', name: '', description: '', owner_unit: '', host: '', port: '', path: '/mcp', protocol: 'streamable_http' })
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await api('/mcp-servers', { method: 'POST', json: { ...f, port: Number(f.port) } })
      onDone(f.id)
    } catch (err) { setError(err as Error) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Tên server trên gateway" hint="Chữ thường, số, gạch ngang; không đổi được. Gateway ghép vào trước tên tool: <server>_<tool>.">
        <input className="input font-mono" required pattern="[a-z0-9][a-z0-9\-]{1,62}" value={f.id} onChange={set('id')} placeholder="ho-so-tin-dung" />
      </Field>
      <Field label="Tên hiển thị"><input className="input" required value={f.name} onChange={set('name')} /></Field>
      <Field label="Mô tả"><input className="input" value={f.description} onChange={set('description')} /></Field>
      <Field label="Đội sở hữu"><input className="input" value={f.owner_unit} onChange={set('owner_unit')} /></Field>
      <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
        <Field label="Host"><input className="input font-mono" required value={f.host} onChange={set('host')} placeholder="mcp-ho-so.noi-bo.svc" /></Field>
        <Field label="Cổng"><input className="input font-mono" required type="number" min="1" max="65535" value={f.port} onChange={set('port')} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Giao thức">
          <select className="input" value={f.protocol} onChange={(e) => setF({ ...f, protocol: e.target.value, path: e.target.value === 'sse' ? '/sse' : '/mcp' })}>
            <option value="streamable_http">Streamable HTTP</option><option value="sse">SSE</option>
          </select>
        </Field>
        <Field label="Đường dẫn"><input className="input font-mono" value={f.path} onChange={set('path')} /></Field>
      </div>
      <p className="text-xs text-subtle">MaaS kết nối thử và quét tools/list. Server mới chưa phòng nào dùng được; mọi tool ở trạng thái đóng (T4).</p>
      <ErrorBox error={error} />
      <div className="flex justify-end"><button className="btn-primary" disabled={busy}>{busy ? 'Đang kết nối…' : 'Kết nối và quét tool'}</button></div>
    </form>
  )
}

function GatewayConfig() {
  const { data, error } = useApi<{ config: unknown; synced_at: string | null; error: string | null; mode: string; backend_name: string; policy_name: string; api_version: string }>('/mcp-gateway-config')
  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading />
  const cfg = data.config as { backend: unknown; policy: unknown }
  const yaml = (kind: string, name: string, spec: unknown) =>
    `apiVersion: ${data.api_version}\nkind: ${kind}\nmetadata:\n  name: ${name}\nspec: ${JSON.stringify(spec, null, 2)}`
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted">
        Đồng bộ lần cuối: {data.synced_at ? new Date(data.synced_at).toLocaleString('vi-VN') : 'chưa có'} · Chế độ: <span className="font-mono">{data.mode}</span>
        {data.mode !== 'kubernetes' && ' (chỉ ghi log, chưa áp dụng lên cụm; đổi GATEWAY_SYNC_MODE=kubernetes trong .env)'}
      </div>
      {data.error && <div role="alert" className="rounded-md border border-bad/30 bg-bad-bg px-3 py-2 text-sm text-bad">{data.error}</div>}
      <CodeBlock label={`AgentgatewayBackend ${data.backend_name}`} code={yaml('AgentgatewayBackend', data.backend_name, cfg.backend)} />
      <CodeBlock label={`AgentgatewayPolicy ${data.policy_name}`} code={yaml('AgentgatewayPolicy', data.policy_name, cfg.policy)} />
    </div>
  )
}

export function McpDetailPage() {
  const { id } = useParams()
  const me = useMe()
  const admin = me.is_platform_admin
  const tabs: ['tools' | 'scope' | 'connect' | 'gateway', string][] = admin
    ? [['tools', 'Tools'], ['scope', 'Phạm vi sử dụng'], ['connect', 'Kết nối'], ['gateway', 'Cấu hình gateway']]
    : [['tools', 'Tools'], ['connect', 'Kết nối']]
  const [tab, setTab] = useTab(tabs.map((t) => t[0]), 'tools')
  const { data, error, loading, reload } = useApi<{
    server: Server; tools: Tool[]; endpoint: string; active_keys?: number; gateway?: { target: unknown; rule: string }
  }>(`/mcp-servers/${id}`)
  const [actionError, setActionError] = useState<Error | null>(null)
  const [scanMsg, setScanMsg] = useState<string | null>(null)
  const [confirmWrite, setConfirmWrite] = useState<Tool | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const nav = useNavigate()

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox error={error} />
  const s = data.server

  async function setTools(changes: Record<string, boolean>) {
    try { await api(`/mcp-servers/${s.id}/tools`, { method: 'PUT', json: { changes } }); reload() } catch (e) { setActionError(e as Error) }
  }
  function toggle(t: Tool, on: boolean) {
    if (on && !t.read_only) { setConfirmWrite(t); return } // T5: tool ghi dữ liệu phải xác nhận
    setTools({ [t.name]: on })
  }
  async function scan() {
    setScanMsg(null)
    try {
      const r = await api<{ tools: number; added: string[] | null; removed: string[] | null }>(`/mcp-servers/${s.id}/scan`, { method: 'POST' })
      setScanMsg(`Đã quét ${r.tools} tool. Mới: ${r.added?.join(', ') || 'không có'}. Bỏ: ${r.removed?.join(', ') || 'không có'}.`)
      reload()
    } catch (e) { setActionError(e as Error); reload() }
  }
  async function remove() {
    try { await api(`/mcp-servers/${s.id}`, { method: 'DELETE' }); nav('/mcp') } catch (e) { setActionError(e as Error) }
  }

  const exTool = data.tools.find((t) => t.enabled)?.gateway_name ?? `${s.id}_<tool>`
  return (
    <>
      <div className="bleed -mt-6 mb-6 border-b border-tint-200 bg-tint-50 pt-5">
        <Link to="/mcp" className="text-sm text-primary hover:underline">← MCP & tools</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 break-all font-mono text-lg font-medium sm:text-xl">{s.id}</h1>
          <span className="text-sm text-muted">{s.name}</span>
          <Health s={s} />
          <div className="hidden flex-1 sm:block" />
          {admin && <button className="btn-secondary" onClick={scan}>Quét lại tool</button>}
        </div>
        <p className="mt-1 text-sm text-muted">{s.description}{s.owner_unit && ` · ${s.owner_unit}`}</p>
        {admin && s.host && <p className="mt-1 font-mono text-xs text-subtle">{s.protocol === 'sse' ? 'SSE' : 'Streamable HTTP'} · {s.host}:{s.port}{s.path} · quét lần cuối {date(s.last_scanned_at)}</p>}
        {admin && s.health === 'down' && s.last_error && <p className="mt-1 text-xs text-bad">{s.last_error}</p>}
        <div className="mt-4"><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
      </div>
      <ErrorBox error={actionError} />
      {scanMsg && <div className="mb-3 rounded-md border border-tint-200 bg-tint-50 px-3 py-2 text-sm text-primary">{scanMsg}</div>}

      {tab === 'tools' && (
        <div className="space-y-3">
          {admin && (
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={() => setTools(Object.fromEntries(data.tools.filter((t) => t.read_only).map((t) => [t.name, true])))}>Mở mọi tool chỉ đọc</button>
            </div>
          )}
          {data.tools.length === 0 ? <Empty>{admin ? 'Server chưa có tool nào.' : 'Chưa có tool nào được mở.'}</Empty> : (
            <DataTable minWidth={720}>
              <thead className="bg-tint-50"><tr>
                {admin && <th className="th w-16">Mở</th>}
                <th className="th">Tool</th><th className="th">Mô tả</th><th className="th">Loại</th><th className="th text-right">Lượt gọi 30 ngày</th>
              </tr></thead>
              <tbody>
                {data.tools.map((t) => (
                  <tr key={t.name} className="border-t border-slate-100 align-top">
                    {admin && <td className="td"><Switch checked={t.enabled} label={`${t.enabled ? 'Đóng' : 'Mở'} ${t.name}`} onChange={(v) => toggle(t, v)} /></td>}
                    <td className="td"><div className="font-mono font-medium">{t.name}</div><div className="font-mono text-xs text-subtle">{t.gateway_name}</div></td>
                    <td className="td text-muted">{t.description}</td>
                    <td className="td">{t.read_only ? <Badge tone="ok">Chỉ đọc</Badge> : <Badge tone="warn">Ghi dữ liệu</Badge>}</td>
                    <td className="td text-right font-mono">{num(Number(t.calls_30d))}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </div>
      )}
      {tab === 'scope' && admin && <Scope server={s} activeKeys={data.active_keys ?? 0} onDone={reload} />}
      {tab === 'connect' && (
        <div className="max-w-3xl space-y-4 text-sm">
          <dl className="card grid grid-cols-1 gap-x-4 gap-y-1 p-4 sm:grid-cols-[140px_1fr] sm:gap-y-2">
            <dt className="text-subtle">Endpoint</dt><dd className="break-all font-mono">{data.endpoint}</dd>
            <dt className="text-subtle">Xác thực</dt><dd className="font-mono">Authorization: Bearer &lt;API key&gt;</dd>
            <dt className="text-subtle">Tên tool</dt><dd><span className="font-mono">{s.id}_&lt;tool&gt;</span>, ví dụ <span className="font-mono">{exTool}</span></dd>
          </dl>
          <p className="text-muted">Agent chỉ thấy các tool mình được dùng. Key bị thu hồi hoặc bị khoá do hạn mức cũng không gọi được tool; lời gọi tool không tính chi phí USD.</p>
          <CodeBlock label="Cấu hình agent / IDE (JSON)" code={`{\n  "mcpServers": {\n    "maas": {\n      "type": "http",\n      "url": "${data.endpoint}",\n      "headers": { "Authorization": "Bearer \${MAAS_API_KEY}" }\n    }\n  }\n}`} />
          <CodeBlock label="Python" code={`import os\nfrom mcp import ClientSession\nfrom mcp.client.streamable_http import streamablehttp_client\n\nheaders = {"Authorization": "Bearer " + os.environ["MAAS_API_KEY"]}\nasync with streamablehttp_client("${data.endpoint}", headers=headers) as (read, write, _):\n    async with ClientSession(read, write) as session:\n        await session.initialize()\n        tools = await session.list_tools()   # chỉ gồm tool bạn được phép\n        result = await session.call_tool("${exTool}", {})`} />
        </div>
      )}
      {tab === 'gateway' && admin && (
        <div className="space-y-3">
          <p className="text-sm text-muted">Phần target và luật cho phép của riêng server này trong cấu hình MaaS ghi xuống agentgateway.</p>
          <CodeBlock label="Target trong AgentgatewayBackend" code={JSON.stringify(data.gateway?.target ?? null, null, 2)} />
          <CodeBlock label="Luật trong AgentgatewayPolicy (matchExpressions)" code={data.gateway?.rule ?? '—'} />
          <div className="pt-4">
            <button className="btn-danger" onClick={() => setConfirmDelete(true)}>Gỡ server khỏi MaaS</button>
          </div>
        </div>
      )}

      <Modal open={!!confirmWrite} title="Mở tool ghi dữ liệu" onClose={() => setConfirmWrite(null)}>
        {confirmWrite && (
          <div className="space-y-3 text-sm">
            <p>Tool <span className="font-mono font-medium">{confirmWrite.name}</span> có thể ghi hoặc thay đổi dữ liệu ở hệ thống phía sau. Agent của các phòng được phép sẽ gọi được tool này.</p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirmWrite(null)}>Huỷ</button>
              <button className="btn-primary" onClick={() => { setTools({ [confirmWrite.name]: true }); setConfirmWrite(null) }}>Mở tool</button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={confirmDelete} title="Gỡ MCP server" onClose={() => setConfirmDelete(false)}>
        <div className="space-y-3 text-sm">
          <p>Gỡ hẳn <span className="font-mono">{s.id}</span> khỏi MaaS và cấu hình gateway. Thao tác không hoàn tác được; muốn ngừng tạm thời thì dùng công tắc tạm dừng.</p>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>Huỷ</button>
            <button className="btn-danger" onClick={remove}>Gỡ server</button>
          </div>
        </div>
      </Modal>
    </>
  )
}

function Scope({ server, activeKeys, onDone }: { server: Server; activeKeys: number; onDone: () => void }) {
  const depts = useApi<{ items: Department[] }>('/departments')
  const [scope, setScope] = useState(server.scope)
  const [chosen, setChosen] = useState<string[]>(server.departments?.map((d) => d.id) ?? [])
  const [error, setError] = useState<Error | null>(null)
  const [saved, setSaved] = useState(false)
  async function save() {
    try { await api(`/mcp-servers/${server.id}/scope`, { method: 'PUT', json: { scope, department_ids: chosen } }); setSaved(true); onDone() }
    catch (e) { setError(e as Error) }
  }
  return (
    <div className="max-w-3xl space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {([['all', 'Mọi phòng', 'Mọi key đang hoạt động của ngân hàng'], ['departments', 'Chọn phòng', 'Chỉ key của các phòng được chọn']] as const).map(([v, l, d]) => (
          <button key={v} type="button" aria-pressed={scope === v} onClick={() => { setScope(v); setSaved(false) }}
            className={`rounded-lg border p-3 text-left ${scope === v ? 'border-2 border-primary bg-tint-50' : 'border-slate-300 bg-white'}`}>
            <div className="font-medium">{l}</div><div className="text-xs text-muted">{d}</div>
          </button>
        ))}
      </div>
      {scope === 'departments' && (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {depts.data?.items.map((d) => (
            <li key={d.id}>
              <label className="flex items-center gap-3 px-3 py-2 text-sm">
                <input type="checkbox" checked={chosen.includes(d.id)} onChange={(e) => { setSaved(false); setChosen(e.target.checked ? [...chosen, d.id] : chosen.filter((x) => x !== d.id)) }} />
                <span className="flex-1">{d.name}</span><span className="text-xs text-subtle">{d.block}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted">Hiện có {num(activeKeys)} key đang hoạt động gọi được server này (theo phạm vi đã lưu).</p>
      <ErrorBox error={error} />
      <div className="flex items-center gap-3"><button className="btn-primary" onClick={save}>Lưu phạm vi</button>{saved && <span className="text-sm text-ok">Đã lưu</span>}</div>
    </div>
  )
}
