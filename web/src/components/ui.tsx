import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ApiError, Me } from '../api'

export const MeContext = createContext<Me | null>(null)
export function useMe(): Me {
  const me = useContext(MeContext)
  if (!me) throw new Error('MeContext chưa có')
  return me
}

// --- Định dạng -------------------------------------------------------------

export const usd = (v: string | number, digits = 2) =>
  '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 2) })

export const num = (v: number) => v.toLocaleString('vi-VN')

export const date = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString('vi-VN') : '—')

export const modelTypeLabel: Record<string, string> = {
  chat: 'Chat', embedding: 'Embedding', rerank: 'Rerank', document: 'Tài liệu',
}

// --- Thành phần ------------------------------------------------------------

export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {desc && <p className="mt-1 max-w-3xl text-sm text-muted">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card min-w-0 p-3 sm:p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-subtle">{label}</div>
      <div className="mt-1 break-words font-mono text-lg font-medium sm:text-2xl">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  )
}

// Trạng thái luôn kèm biểu tượng và chữ (mục 4.2), không chỉ dựa vào màu.
const tones = {
  ok: 'border-ok/30 bg-ok-bg text-ok',
  warn: 'border-warn/30 bg-warn-bg text-warn',
  bad: 'border-bad/30 bg-bad-bg text-bad',
  info: 'border-tint-200 bg-tint-50 text-primary',
  neutral: 'border-slate-200 bg-slate-50 text-muted',
}
const icons = { ok: '●', warn: '▲', bad: '✕', info: '◆', neutral: '○' }

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return (
    <span className={`chip ${tones[tone]}`}>
      <span aria-hidden="true" className="text-[0.6rem]">{icons[tone]}</span>
      {children}
    </span>
  )
}

export function KeyStatus({ status }: { status: string }) {
  // Bốn trạng thái hiển thị (8.5): Hoạt động, Chờ nhận, Hết hạn mức, Đã thu hồi (gồm cả hết hạn).
  switch (status) {
    case 'active': return <Badge tone="ok">Hoạt động</Badge>
    case 'pending': return <Badge tone="info">Chờ nhận</Badge>
    case 'blocked_key': return <Badge tone="warn">Hết hạn mức</Badge>
    case 'blocked_dept': return <Badge tone="warn">Hết hạn mức (phòng)</Badge>
    default: return <Badge tone="bad">Đã thu hồi</Badge>
  }
}

export function Meter({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  const color = pct >= 100 ? 'bg-bad' : pct >= 80 ? 'bg-warn' : 'bg-primary'
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-tint-100" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  // Màn hẹp: dải tab cuộn ngang; luôn cuộn tab đang chọn vào tầm nhìn (chỉ cuộn trong dải, không cuộn trang).
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = list.current
    const active = el?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!el || !active) return
    if (active.offsetLeft < el.scrollLeft || active.offsetLeft + active.offsetWidth > el.scrollLeft + el.clientWidth) {
      el.scrollLeft = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2
    }
  }, [value])
  return (
    <div ref={list} role="tablist" className="relative flex max-w-full gap-1 overflow-x-auto border-b border-tint-200">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
            value === id ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function Initials({ text, className = '' }: { text: string; className?: string }) {
  const letters = text.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  return (
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-tint-100 font-mono text-sm font-medium text-primary ${className}`}>
      {letters}
    </div>
  )
}

export function ErrorBox({ error }: { error?: ApiError | Error | null }) {
  if (!error) return null
  return (
    <div role="alert" className="rounded-md border border-bad/30 bg-bad-bg px-3 py-2 text-sm text-bad">
      {error.message}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-tint-200 bg-tint-50 p-8 text-center text-sm text-muted">{children}</div>
}

export function Loading() {
  return <div className="p-8 text-center text-sm text-subtle">Đang tải…</div>
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} onClose={onClose} className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-lg p-0 backdrop:bg-ink/40">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <h2 className="font-semibold">{title}</h2>
        <button className="text-subtle hover:text-ink" onClick={onClose} aria-label="Đóng">✕</button>
      </div>
      <div className="p-4 sm:p-5">{open && children}</div>
    </dialog>
  )
}

export function Sparkline({ values, width = 240, height = 48 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null
  const max = Math.max(1, ...values)
  const step = width / (values.length - 1)
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * (height - 4) - 2).toFixed(1)}`).join(' ')
  return (
    <svg className="h-12 w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Lượt gọi theo ngày">
      <polyline points={pts} fill="none" stroke="var(--color-primary)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

// SecretOnce hiện key đầy đủ đúng một lần (K2) với nút chép.
export function SecretOnce({ secret }: { secret: string }) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-sm text-warn">
        Key chỉ hiện một lần. Hãy chép và lưu ở nơi an toàn; hệ thống không lưu bản đầy đủ.
      </div>
      <div className="flex gap-2">
        <code className="flex-1 break-all rounded-md bg-tint-50 px-3 py-2 font-mono text-sm">{secret}</code>
        <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(secret)}>Chép</button>
      </div>
    </div>
  )
}

// DataTable: khung bảng cuộn ngang trên màn hẹp, bảng giữ độ rộng tối thiểu để cột không bị ép.
export function DataTable({ minWidth = 720, children }: { minWidth?: number; children: ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full" style={{ minWidth }}>{children}</table>
    </div>
  )
}

// CodeBlock: khối mã có nút chép.
export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="overflow-hidden rounded-md bg-ink">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-xs text-white/70">
        <span>{label}</span>
        <button
          className="rounded px-2 py-0.5 hover:bg-white/10"
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
        >
          {copied ? 'Đã chép' : 'Chép'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-white">{code}</pre>
    </div>
  )
}

// Switch: công tắc bật/tắt có nhãn cho trình đọc màn hình.
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

// useTab: tab đang mở lưu trong ?tab= để chia sẻ được link (G4).
export function useTab<T extends string>(allowed: T[], def: T): [T, (t: T) => void] {
  const [params, setParams] = useSearchParams()
  const cur = params.get('tab') as T | null
  const tab = cur && allowed.includes(cur) ? cur : def
  const set = (t: T) => {
    const next = new URLSearchParams(params)
    if (t === def) next.delete('tab')
    else next.set('tab', t)
    setParams(next, { replace: true })
  }
  return [tab, set]
}

export const pct = (used: number, total: number) => (total > 0 ? Math.round((used / total) * 100) : 0)
