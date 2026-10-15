import { useState } from 'react'
import { useApi, type UsageRow } from '../api'
import { DataTable, Empty, ErrorBox, Loading, Meter, PageHeader, StatTile, Tabs, num, usd, useMe } from '../components/ui'

// Sử dụng & chi phí (mục 9). Phạm vi do máy chủ tự giới hạn theo vai trò (U2).

type Row = UsageRow & { owner?: string; department?: string; limit_usd?: string; key_kind?: string }
type Resp = { items: Row[]; total: UsageRow; updated_at: string | null; budget: { scope: string; period: string; limit_usd: string; used_usd: string } }

// U5: xem 90 ngày thì gộp theo tuần (bắt đầu thứ Hai).
function byWeek(rows: UsageRow[]): UsageRow[] {
  const out = new Map<string, UsageRow>()
  for (const r of rows) {
    const d = new Date(r.group + 'T00:00:00')
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const k = d.toLocaleDateString('sv-SE')
    const cur = out.get(k) ?? { ...r, group: k, label: 'Tuần ' + d.toLocaleDateString('vi-VN'), requests: 0, input_tokens: 0, cache_tokens: 0, output_tokens: 0, pages: 0, cost_usd: '0' }
    cur.requests += r.requests
    cur.cost_usd = String(Number(cur.cost_usd) + Number(r.cost_usd))
    out.set(k, cur)
  }
  return [...out.values()]
}

function isoDay(d: Date) {
  return d.toLocaleDateString('sv-SE') // YYYY-MM-DD theo giờ máy
}

function DailyBars({ rows, weekly }: { rows: UsageRow[]; weekly: boolean }) {
  const [asTable, setAsTable] = useState(false)
  if (rows.length === 0) return null
  const max = Math.max(...rows.map((r) => Number(r.cost_usd)), 0.0001)
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Chi phí theo {weekly ? 'tuần' : 'ngày'}</h3>
        <button className="text-sm text-primary hover:underline" onClick={() => setAsTable(!asTable)}>
          {asTable ? 'Xem biểu đồ' : 'Xem dạng bảng'}
        </button>
      </div>
      {asTable ? (
        <table className="w-full">
          <thead><tr><th className="th">{weekly ? 'Tuần' : 'Ngày'}</th><th className="th text-right">Lượt gọi</th><th className="th text-right">Chi phí</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.group} className="border-t border-slate-100"><td className="td font-mono">{r.label}</td><td className="td text-right font-mono">{num(r.requests)}</td><td className="td text-right font-mono">{usd(r.cost_usd)}</td></tr>
          ))}</tbody>
        </table>
      ) : (
        <div className="flex h-40 items-end gap-px sm:gap-1" role="img" aria-label={`Biểu đồ cột chi phí theo ${weekly ? 'tuần' : 'ngày'}`}>
          {rows.map((r) => (
            <div key={r.group} className="group relative flex-1">
              <div className="w-full rounded-t bg-primary/80 group-hover:bg-primary-hover" style={{ height: `${(Number(r.cost_usd) / max) * 150}px` }} />
              <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 font-mono text-xs text-white group-hover:block">
                {r.label}: {usd(r.cost_usd)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function UsagePage() {
  const me = useMe()
  const [days, setDays] = useState(30)
  const [groupBy, setGroupBy] = useState<'model' | 'key' | 'department'>('model')
  const from = isoDay(new Date(Date.now() - (days - 1) * 86400000))
  const to = isoDay(new Date())
  const range = `from=${from}&to=${to}`
  const table = useApi<Resp>(`/usage?${range}&group_by=${groupBy}`)
  const daily = useApi<Resp>(`/usage?${range}&group_by=day`)

  const scope = me.is_platform_admin || me.is_auditor ? 'Toàn ngân hàng' : me.admin_of.length ? 'Phòng của tôi' : 'Key của tôi'
  const t = table.data?.total

  return (
    <>
      <PageHeader
        title="Sử dụng & chi phí"
        desc={`Phạm vi: ${scope}. Chi phí USD theo mức dùng thực tế do agentgateway ghi nhận.`}
        actions={
          <select className="input w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Khoảng thời gian">
            <option value={7}>7 ngày</option><option value={30}>30 ngày</option><option value={90}>90 ngày</option>
          </select>
        }
      />
      <ErrorBox error={table.error ?? daily.error} />
      {table.loading && !table.data ? <Loading /> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile label="Chi phí" value={usd(t?.cost_usd ?? 0)} />
            <StatTile label="Lượt gọi" value={num(t?.requests ?? 0)} />
            <StatTile label="Token vào / ra" value={`${num(t?.input_tokens ?? 0)} / ${num(t?.output_tokens ?? 0)}`} hint={`trong đó cache ${num(t?.cache_tokens ?? 0)}`} />
            <StatTile label="Trang tài liệu" value={num(t?.pages ?? 0)} />
          </div>
          <p className="mb-4 text-xs text-subtle">
            Cập nhật gần nhất: {table.data?.updated_at ? new Date(table.data.updated_at).toLocaleString('vi-VN') : 'chưa có dữ liệu'}
          </p>
          {table.data?.budget && (
            <div className="card mb-4 space-y-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold">Ngân sách tháng {table.data.budget.period} · {table.data.budget.scope}</span>
                <span className="font-mono">{usd(table.data.budget.used_usd)} / {usd(table.data.budget.limit_usd)}</span>
              </div>
              <Meter used={Number(table.data.budget.used_usd)} total={Number(table.data.budget.limit_usd)} />
            </div>
          )}
          <div className="mb-6"><DailyBars rows={days > 30 ? byWeek(daily.data?.items ?? []) : daily.data?.items ?? []} weekly={days > 30} /></div>
          <div className="mb-3">
            <Tabs
              tabs={[['model', 'Theo model'], ['key', 'Theo API key'], ...(me.is_platform_admin || me.is_auditor ? [['department', 'Theo phòng'] as ['department', string]] : [])]}
              value={groupBy}
              onChange={setGroupBy}
            />
          </div>
          {(table.data?.items.length ?? 0) === 0 ? <Empty>Không có lời gọi nào trong khoảng này.</Empty> : (
            <DataTable minWidth={760}>
                <thead className="bg-tint-50"><tr>
                  <th className="th">{groupBy === 'model' ? 'Model' : groupBy === 'key' ? 'API key' : 'Phòng'}</th>
                  {groupBy === 'key' && <><th className="th">Cấp cho</th><th className="th">Phòng</th></>}
                  <th className="th text-right">Lượt gọi</th><th className="th text-right">Token vào</th><th className="th text-right">Trong đó cache</th>
                  <th className="th text-right">Token ra</th><th className="th text-right">Trang</th><th className="th text-right">Chi phí</th>
                  {groupBy === 'key' && <th className="th text-right">Hạn mức</th>}
                </tr></thead>
                <tbody>
                  {table.data!.items.map((r) => (
                    <tr key={r.group} className="border-t border-slate-100 font-mono">
                      <td className="td font-sans">{r.label}</td>
                      {groupBy === 'key' && <><td className="td font-sans">{r.key_kind === 'app' ? 'Ứng dụng' : r.owner}</td><td className="td font-sans">{r.department}</td></>}
                      <td className="td text-right">{num(r.requests)}</td>
                      <td className="td text-right">{num(r.input_tokens)}</td>
                      <td className="td text-right">{num(r.cache_tokens)}</td>
                      <td className="td text-right">{num(r.output_tokens)}</td>
                      <td className="td text-right">{num(r.pages)}</td>
                      <td className="td text-right">{usd(r.cost_usd)}</td>
                      {groupBy === 'key' && <td className="td text-right">{r.limit_usd ? usd(r.limit_usd) : '—'}</td>}
                    </tr>
                  ))}
                </tbody>
            </DataTable>
          )}
        </>
      )}
    </>
  )
}
