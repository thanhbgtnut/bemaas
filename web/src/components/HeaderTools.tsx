import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'

// G3: ô tìm chung trên header (tìm model và skill).
type Hit = { kind: 'model' | 'skill'; id: string; title: string; sub: string }

export function HeaderSearch({ onPick }: { onPick?: () => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const nav = useNavigate()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setHits([]); return }
    const t = window.setTimeout(async () => {
      try {
        const r = await api<{ models: { id: string; name: string; provider_team: string }[]; skills: { id: string; domain: string; name: string; title: string }[] }>(`/search?q=${encodeURIComponent(term)}`)
        setHits([
          ...r.models.map((m) => ({ kind: 'model' as const, id: m.id, title: m.name, sub: `${m.provider_team}/${m.id}` })),
          ...r.skills.map((s) => ({ kind: 'skill' as const, id: s.id, title: s.title, sub: `${s.domain}/${s.name}` })),
        ])
        setActive(0)
        setOpen(true)
      } catch { setHits([]) }
    }, 200)
    return () => window.clearTimeout(t)
  }, [q])

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  function pick(h: Hit) {
    setOpen(false); setQ('')
    nav(h.kind === 'model' ? `/models/${h.id}` : `/skills/${h.id}`)
    onPick?.()
  }

  return (
    <div ref={box} className="relative w-full">
      <input
        type="search" className="input py-1" placeholder="Tìm model, skill…" aria-label="Tìm model và skill"
        role="combobox" aria-expanded={open && hits.length > 0} aria-controls="search-results"
        value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          if (e.key === 'Enter' && hits[active]) pick(hits[active])
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && q.trim().length >= 2 && (
        <ul id="search-results" role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-96 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {hits.length === 0 ? <li className="px-3 py-2 text-sm text-subtle">Không tìm thấy</li> : hits.map((h, i) => (
            <li key={h.kind + h.id} role="option" aria-selected={i === active}>
              <button className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${i === active ? 'bg-tint-50' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => pick(h)}>
                <span className="w-12 shrink-0 text-[11px] font-semibold uppercase text-subtle">{h.kind === 'model' ? 'Model' : 'Skill'}</span>
                <span className="min-w-0"><span className="block truncate text-sm">{h.title}</span><span className="block truncate font-mono text-xs text-subtle">{h.sub}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Chuông thông báo (mục 13): số chưa đọc, danh sách gần đây, đánh dấu đã đọc.
type Note = { id: number; kind: string; title: string; body: string; link: string; created_at: string; read_at: string | null }

export function NotificationBell() {
  const [items, setItems] = useState<Note[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const nav = useNavigate()
  const loc = useLocation()

  async function load() {
    try {
      const r = await api<{ items: Note[]; unread: number }>('/notifications')
      setItems(r.items); setUnread(r.unread)
    } catch { /* không làm hỏng header khi API lỗi */ }
  }
  useEffect(() => { load(); const t = window.setInterval(load, 60_000); return () => window.clearInterval(t) }, [])
  useEffect(() => { setOpen(false) }, [loc.pathname])
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  async function markAll() {
    await api('/notifications/read', { method: 'POST', json: {} }).catch(() => {})
    load()
  }
  async function openNote(n: Note) {
    if (!n.read_at) await api('/notifications/read', { method: 'POST', json: { ids: [n.id] } }).catch(() => {})
    load()
    if (n.link) nav(n.link)
  }

  return (
    <div ref={box} className="relative">
      <button className="btn-secondary relative px-2.5" aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {unread > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-primary px-1 text-center font-mono text-[11px] text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-sm font-semibold">Thông báo</span>
            {unread > 0 && <button className="text-xs text-primary hover:underline" onClick={markAll}>Đánh dấu đã đọc tất cả</button>}
          </div>
          <ul className="max-h-[70vh] overflow-y-auto">
            {items.length === 0 ? <li className="px-3 py-6 text-center text-sm text-subtle">Chưa có thông báo</li> : items.map((n) => (
              <li key={n.id} className="border-b border-slate-50 last:border-0">
                <button className={`block w-full px-3 py-2 text-left hover:bg-tint-50 ${n.read_at ? '' : 'bg-tint-50/60'}`} onClick={() => openNote(n)}>
                  <span className="flex items-start gap-2">
                    {!n.read_at && <span aria-label="chưa đọc" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{n.title}</span>
                      {n.body && <span className="block text-xs text-muted">{n.body}</span>}
                      <span className="block text-[11px] text-subtle">{new Date(n.created_at).toLocaleString('vi-VN')}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
