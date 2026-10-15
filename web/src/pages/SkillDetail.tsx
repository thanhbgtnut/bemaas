import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { accessTokenHeader, api, apiText, useApi, type Skill } from '../api'
import { Badge, Empty, ErrorBox, Field, Loading, Modal, Tabs, date, num, useMe, useTab } from '../components/ui'
import { kindLabel } from './Skills'
import Markdown from '../components/Markdown'

// Chi tiết skill (S15–S18): Tổng quan, Tệp, Phiên bản, Góp ý.

type Detail = {
  skill: Skill
  versions: { version: string; changelog: string; size_bytes: number; created_at: string }[]
  skill_sets: { id: string; role_name: string }[]
  install_command: string
}
type Comment = { id: string; user: { name: string; email: string }; body: string; ts: string }

export default function SkillDetailPage() {
  const { id } = useParams()
  const { data, error, loading, reload } = useApi<Detail>(`/skills/${id}`)
  const [tab, setTab] = useTab(['overview', 'files', 'versions', 'comments'], 'overview')
  const me = useMe()
  const [newVersion, setNewVersion] = useState(false)
  const [actionError, setActionError] = useState<Error | null>(null)

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox error={error} />
  const s = data.skill

  async function like() {
    try { await api(`/skills/${s.id}/like`, { method: s.liked_by_me ? 'DELETE' : 'PUT' }); reload() } catch (e) { setActionError(e as Error) }
  }
  async function download() {
    try {
      const r = await api<{ url: string }>(`/skills/${s.id}/download?via=zip`)
      window.location.href = r.url
      reload()
    } catch (e) { setActionError(e as Error) }
  }

  return (
    <>
      <div className="bleed -mt-6 mb-6 border-b border-tint-200 bg-tint-50 pt-5">
        <div>
        <Link to="/skills" className="text-sm text-primary hover:underline">← Skills</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 break-words text-xl font-semibold">{s.title}</h1>
          <span className="break-all font-mono text-sm text-subtle">{s.domain}/{s.name} · v{s.latest_version}</span>
          <button className="btn-secondary" onClick={like} aria-pressed={s.liked_by_me}>{s.liked_by_me ? '♥' : '♡'} {s.likes}</button>
          <div className="hidden flex-1 sm:block" />
          {s.author.id === me.id && <button className="btn-secondary" onClick={() => setNewVersion(true)}>Đăng phiên bản mới</button>}
          <button className="btn-primary" onClick={download}>Tải .zip</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone="info">{kindLabel[s.kind]}</Badge>
          {s.verified && <Badge tone="ok">Đã kiểm chứng</Badge>}
        </div>
        <div className="mt-4">
          <Tabs tabs={[['overview', 'Tổng quan'], ['files', 'Tệp'], ['versions', 'Phiên bản'], ['comments', 'Góp ý']]} value={tab} onChange={setTab} />
        </div>
        </div>
      </div>
      <ErrorBox error={actionError} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          {tab === 'overview' && (
            <div className="space-y-4">
              <p className="text-sm">{s.description}</p>
              {s.trigger && <div className="card p-4 text-sm"><h3 className="mb-1 font-semibold">Khi nào agent dùng</h3>{s.trigger}</div>}
              <FileView skillId={s.id} path="SKILL.md" rendered />
            </div>
          )}
          {tab === 'files' && <Files skillId={s.id} />}
          {tab === 'versions' && (
            <ul className="space-y-2">
              {data.versions.map((v) => (
                <li key={v.version} className="card p-3 text-sm">
                  <span className="font-mono font-medium">v{v.version}</span> <span className="text-subtle">· {date(v.created_at)} · {num(Math.round(v.size_bytes / 1024))} KB</span>
                  {v.changelog && <p className="mt-1 text-muted">{v.changelog}</p>}
                </li>
              ))}
            </ul>
          )}
          {tab === 'comments' && <Comments skillId={s.id} />}
        </section>
        <aside className="space-y-4 text-sm">
          <div className="card p-4">
            <h3 className="mb-2 font-semibold">Cài skill</h3>
            <code className="block break-all rounded bg-tint-50 px-2 py-1.5 font-mono text-xs">{data.install_command}</code>
            <button className="mt-2 text-primary hover:underline" onClick={() => navigator.clipboard.writeText(data.install_command)}>Chép lệnh</button>
          </div>
          <div className="card p-4">
            <h3 className="mb-2 font-semibold">Skill này cần</h3>
            {s.models.length === 0 && s.tools.length === 0 ? <p className="text-muted">Không khai báo</p> : (
              <ul className="space-y-1 font-mono text-xs">
                {s.models.map((m) => <li key={m}><Link className="text-primary hover:underline" to={`/models/${m}`}>{m}</Link></li>)}
                {s.tools.map((t) => <li key={t}>{t}</li>)}
              </ul>
            )}
          </div>
          <div className="card p-4">
            <h3 className="mb-2 font-semibold">Có trong bộ skill</h3>
            {data.skill_sets.length === 0 ? <p className="text-muted">Chưa có</p> : data.skill_sets.map((x) => <div key={x.id}>{x.role_name}</div>)}
          </div>
          <dl className="card grid grid-cols-2 gap-y-1 p-4">
            <dt className="text-subtle">Người chia sẻ</dt><dd>{s.author.name}</dd>
            <dt className="text-subtle">Đơn vị</dt><dd>{s.owner_unit || '—'}</dd>
            <dt className="text-subtle">Cập nhật</dt><dd>{date(s.updated_at)}</dd>
            <dt className="text-subtle">Lượt cài</dt><dd className="font-mono">{num(s.installs)}</dd>
          </dl>
        </aside>
      </div>
      <Modal open={newVersion} title="Đăng phiên bản mới" onClose={() => setNewVersion(false)}>
        <NewVersion skill={s} onDone={() => { setNewVersion(false); reload() }} />
      </Modal>
    </>
  )
}

function bump(v: string) {
  const [a, b, c] = v.split('.').map(Number)
  return `${a}.${b}.${(c || 0) + 1}`
}

function NewVersion({ skill, onDone }: { skill: Skill; onDone: () => void }) {
  const [version, setVersion] = useState(bump(skill.latest_version))
  const [changelog, setChangelog] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!file) return
    setBusy(true); setError(null); setProblems([])
    const form = new FormData()
    form.append('version', version); form.append('changelog', changelog); form.append('package', file)
    const res = await fetch(`/api/v1/skills/${skill.id}/versions`, { method: 'POST', headers: accessTokenHeader(), body: form })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(data.message ?? `Lỗi ${res.status}`); setProblems(data.details?.problems ?? []); return }
    onDone()
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Gói skill (.zip)"><input className="input" type="file" accept=".zip" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
      <Field label="Phiên bản" hint={`Hiện tại: ${skill.latest_version}`}><input className="input font-mono" required pattern="\d+\.\d+\.\d+" value={version} onChange={(e) => setVersion(e.target.value)} /></Field>
      <Field label="Thay đổi"><textarea className="input" rows={3} value={changelog} onChange={(e) => setChangelog(e.target.value)} /></Field>
      {error && <div role="alert" className="rounded-md border border-bad/30 bg-bad-bg px-3 py-2 text-sm text-bad">{error}</div>}
      {problems.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-bad">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      <div className="flex justify-end"><button className="btn-primary" disabled={busy}>{busy ? 'Đang kiểm tra…' : 'Kiểm tra và đăng'}</button></div>
    </form>
  )
}

function FileView({ skillId, path, rendered }: { skillId: string; path: string; rendered?: boolean }) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)
  useEffect(() => {
    setText(null)
    apiText(`/skills/${skillId}/file?path=${encodeURIComponent(path)}`).then(setText).catch(setError)
  }, [skillId, path])
  if (error) return <ErrorBox error={error} />
  if (text === null) return <Loading />
  if (rendered) return <div className="card p-4"><Markdown text={text.replace(/^---[\s\S]*?\n---\s*/, '')} /></div>
  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <span className="font-mono text-xs">{path}</span>
        <button className="text-xs text-primary hover:underline" onClick={() => navigator.clipboard.writeText(text)}>Chép</button>
      </div>
      <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap p-3 font-mono text-xs">{text}</pre>
    </div>
  )
}

function Files({ skillId }: { skillId: string }) {
  const { data, error } = useApi<{ items: { path: string; size: number }[] }>(`/skills/${skillId}/files`)
  const [open, setOpen] = useState('SKILL.md')
  if (error) return <ErrorBox error={error} />
  return (
    <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
      <ul className="card divide-y divide-slate-100 text-sm">
        {data?.items.map((f) => (
          <li key={f.path}>
            <button className={`w-full px-3 py-1.5 text-left font-mono text-xs ${open === f.path ? 'bg-tint-100 text-primary' : 'hover:bg-tint-50'}`} onClick={() => setOpen(f.path)}>
              {f.path}
            </button>
          </li>
        ))}
      </ul>
      <FileView skillId={skillId} path={open} />
    </div>
  )
}

function Comments({ skillId }: { skillId: string }) {
  const { data, error, reload } = useApi<{ items: Comment[] }>(`/skills/${skillId}/comments`)
  const [body, setBody] = useState('')
  const [actionError, setActionError] = useState<Error | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    try { await api(`/skills/${skillId}/comments`, { method: 'POST', json: { body } }); setBody(''); reload() }
    catch (err) { setActionError(err as Error) }
  }
  return (
    <div className="space-y-3">
      <ErrorBox error={error ?? actionError} />
      {(data?.items.length ?? 0) === 0 ? <Empty>Chưa có góp ý.</Empty> : data!.items.map((c) => (
        <div key={c.id} className="card p-3 text-sm">
          <div className="mb-1 text-xs text-subtle">{c.user.name || c.user.email} · {date(c.ts)}</div>
          <p className="whitespace-pre-wrap">{c.body}</p>
        </div>
      ))}
      <form onSubmit={submit} className="space-y-2">
        <label className="label" htmlFor="comment">Góp ý</label>
        <textarea id="comment" className="input" rows={3} required value={body} onChange={(e) => setBody(e.target.value)} />
        <button className="btn-primary">Gửi góp ý</button>
      </form>
    </div>
  )
}
