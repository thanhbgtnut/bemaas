import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { accessTokenHeader, useApi, type Skill } from '../api'
import { CodeBlock, Empty, ErrorBox, Initials, Loading, Modal, useMe } from '../components/ui'
import { SkillCard, SkillSetForm } from './Skills'

// Chi tiết bộ skill theo vai trò (S9, S10): cài cả bộ bằng một lệnh, hoặc tải một .zip gồm mọi skill.
type Detail = { id: string; role_name: string; unit: string; scope: 'nghiep_vu' | 'cntt'; skills: Skill[] }

function slug(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function SkillSetPage() {
  const { id } = useParams()
  const me = useMe()
  const { data, error, loading, reload } = useApi<Detail>(`/skill-sets/${id}`)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dlError, setDlError] = useState<Error | null>(null)

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox error={error} />

  async function download() {
    setBusy(true); setDlError(null)
    try {
      const res = await fetch(`/api/v1/skill-sets/${id}/download`, { headers: accessTokenHeader() })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `Lỗi ${res.status}`)
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url; a.download = `bo-skill-${slug(data!.role_name)}.zip`; a.click()
      URL.revokeObjectURL(url)
      reload()
    } catch (e) { setDlError(e as Error) } finally { setBusy(false) }
  }

  const cmd = `maas skills add --set ${slug(data.role_name)}`
  return (
    <>
      <div className="bleed -mt-6 mb-6 border-b border-tint-200 bg-tint-50 py-5">
        <Link to="/skills?tab=sets" className="text-sm text-primary hover:underline">← Bộ skill theo vai trò</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Initials text={data.role_name} />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">{data.role_name}</h1>
            <p className="text-sm text-muted">{data.unit} · {data.scope === 'cntt' ? 'Khối CNTT' : 'Khối nghiệp vụ'} · {data.skills.length} skill</p>
          </div>
          <div className="hidden flex-1 sm:block" />
          {me.is_platform_admin && <button className="btn-secondary" onClick={() => setEditing(true)}>Sửa bộ skill</button>}
          <button className="btn-primary" disabled={busy || !data.skills.length} onClick={download}>{busy ? 'Đang đóng gói…' : 'Tải cả bộ (.zip)'}</button>
        </div>
      </div>
      <ErrorBox error={dlError} />
      <div className="mb-5 max-w-3xl space-y-2">
        <p className="text-sm text-muted">Bộ skill là gợi ý, không phải phân quyền: ai cũng cài được. Cài cả bộ bằng một lệnh:</p>
        <CodeBlock code={cmd} label="Lệnh cài" />
        <p className="text-xs text-subtle">Công cụ dòng lệnh <span className="font-mono">maas</span> chưa có (câu hỏi mở 14); hiện tải .zip rồi giải nén vào thư mục skills của agent.</p>
      </div>
      {data.skills.length === 0 ? <Empty>Bộ skill chưa có skill nào.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 min-[1800px]:grid-cols-4">
          {data.skills.map((s) => <SkillCard key={s.id} s={s} />)}
        </div>
      )}
      <Modal open={editing} title="Sửa bộ skill" onClose={() => setEditing(false)}>
        <SkillSetForm set={{ ...data, skill_count: data.skills.length }} onDone={() => { setEditing(false); reload() }} />
      </Modal>
    </>
  )
}
