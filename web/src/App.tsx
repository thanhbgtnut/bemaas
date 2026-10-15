import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { Me } from './api'
import { logout } from './auth'
import { MeContext } from './components/ui'
import ModelsPage from './pages/Models'
import ModelDetailPage from './pages/ModelDetail'
import SkillsPage from './pages/Skills'
import SkillDetailPage from './pages/SkillDetail'
import BudgetPage from './pages/Budget'
import DepartmentPage from './pages/Department'
import UsagePage from './pages/Usage'
import Placeholder from './pages/Placeholder'
import PlaygroundPage from './pages/Playground'
import McpPage, { McpDetailPage } from './pages/Mcp'
import SkillSetPage from './pages/SkillSet'
import { HeaderSearch, NotificationBell } from './components/HeaderTools'

// Menu chính (G2): không có mục Tài liệu, không có mục Ứng dụng.
const nav: [string, string][] = [
  ['/models', 'Models'],
  ['/playground', 'Playground'],
  ['/skills', 'Skills'],
  ['/mcp', 'MCP & tools'],
  ['/budget', 'Ngân sách & key'],
  ['/usage', 'Sử dụng & chi phí'],
]

function roleLabel(me: Me) {
  if (me.is_platform_admin) return 'Quản trị nền tảng'
  if (me.is_auditor) return 'Kiểm soát'
  if (me.admin_of.length) return 'Quản trị phòng'
  return 'Thành viên'
}

export default function App({ me }: { me: Me }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const location = useLocation()
  useEffect(() => { setMenuOpen(false); setSearchOpen(false) }, [location.pathname])

  const navLink = (mobile: boolean) => ({ isActive }: { isActive: boolean }) =>
    `${mobile ? 'block px-3 py-2' : 'whitespace-nowrap px-3 py-1.5'} rounded-md text-sm font-medium ${
      isActive ? 'bg-tint-100 text-primary' : 'text-muted hover:bg-tint-50 hover:text-ink'
    }`

  return (
    <MeContext.Provider value={me}>
      <header className="sticky top-0 z-20 border-b border-tint-200 bg-white/95 backdrop-blur">
        <div className="page-x flex h-14 items-center gap-3 xl:gap-6">
          <NavLink to="/models" className="flex shrink-0 items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-primary text-xs font-bold text-white">
              M<span className="text-mb-red">·</span>
            </span>
            MaaS
          </NavLink>
          {/* Màn rộng: menu ngang */}
          <nav className="hidden flex-1 gap-1 lg:flex" aria-label="Menu chính">
            {nav.map(([to, label]) => <NavLink key={to} to={to} className={navLink(false)}>{label}</NavLink>)}
          </nav>
          <div className="flex-1 lg:hidden" />
          {/* Ô tìm: hiện thẳng từ xl; lg–xl mở bằng nút kính lúp; dưới lg nằm trong menu */}
          <div className="hidden w-60 xl:block 2xl:w-72"><HeaderSearch /></div>
          <button className="btn-secondary hidden px-2.5 lg:inline-flex xl:hidden" aria-label="Tìm model và skill" aria-expanded={searchOpen} onClick={() => setSearchOpen(!searchOpen)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </button>
          <NotificationBell />
          <div className="hidden items-center gap-3 text-sm sm:flex">
            <div className="hidden text-right leading-tight 2xl:block">
              <div className="max-w-40 truncate font-medium">{me.name || me.email}</div>
              <div className="text-xs text-subtle">{roleLabel(me)}</div>
            </div>
            <button className="btn-secondary" title={`${me.name || me.email} · ${roleLabel(me)}`} onClick={() => logout()}>Đăng xuất</button>
          </div>
          {/* Màn hẹp: nút mở menu */}
          <button
            className="btn-secondary lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span aria-hidden="true">{menuOpen ? '✕' : '☰'}</span> Menu
          </button>
        </div>
        {searchOpen && (
          <div className="page-x hidden border-t border-tint-200 bg-white py-2 lg:block xl:hidden"><HeaderSearch onPick={() => setSearchOpen(false)} /></div>
        )}
        {menuOpen && (
          <div id="mobile-menu" className="page-x border-t border-tint-200 bg-white pb-3 pt-2 lg:hidden">
            <div className="mb-2"><HeaderSearch onPick={() => setMenuOpen(false)} /></div>
            <nav className="grid gap-1 sm:grid-cols-2" aria-label="Menu chính">
              {nav.map(([to, label]) => <NavLink key={to} to={to} className={navLink(true)}>{label}</NavLink>)}
            </nav>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm sm:hidden">
              <div className="min-w-0 leading-tight">
                <div className="truncate font-medium">{me.name || me.email}</div>
                <div className="text-xs text-subtle">{roleLabel(me)}</div>
              </div>
              <button className="btn-secondary" onClick={() => logout()}>Đăng xuất</button>
            </div>
          </div>
        )}
      </header>
      <main className="page-x py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/models" replace />} />
          <Route path="/models" element={<ModelsPage />} />
          <Route path="/models/:id" element={<ModelDetailPage />} />
          <Route path="/models/:id/:tab" element={<ModelDetailPage />} />
          <Route path="/playground" element={<PlaygroundPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/skills/sets/:id" element={<SkillSetPage />} />
          <Route path="/skills/:id" element={<SkillDetailPage />} />
          <Route path="/mcp" element={<McpPage />} />
          <Route path="/mcp/:id" element={<McpDetailPage />} />
          <Route path="/budget" element={<BudgetPage />} />
          <Route path="/budget/departments/:id" element={<DepartmentPage />} />
          <Route path="/usage" element={<UsagePage />} />
          <Route path="*" element={<Placeholder title="Không tìm thấy trang" desc="Đường dẫn không tồn tại." />} />
        </Routes>
      </main>
    </MeContext.Provider>
  )
}
