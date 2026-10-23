import { useState, type FormEvent } from 'react'
import { api, type Model } from '../api'
import { publicConfig } from '../auth'
import { useStandards } from '../standards'
import { ErrorBox, Field, Loading } from './ui'

// Thêm hoặc sửa model và đơn giá (Quản trị nền tảng). Model khai báo một chuẩn API (M14); đơn giá USD
// theo đơn vị của chuẩn: token (trên 1 triệu token) hoặc trang (M4). Sửa đơn giá kích hoạt sinh lại
// catalog.json cho gateway.

export default function ModelForm({ model, onDone }: { model?: Model & { governance?: unknown }; onDone: (id: string) => void }) {
  const [f, setF] = useState({
    id: model?.id ?? '', name: model?.name ?? '', provider_team: model?.provider_team ?? '', standard: model?.standard ?? 'openai',
    modes: model?.modes ?? ['chat'], use_cases: (model?.use_cases ?? []).join(', '), status: model?.status ?? 'beta',
    data_level: model?.data_level ?? 'noi_bo', base_url: model?.base_url ?? '', endpoint: model?.endpoint ?? '',
    context_length: model?.context_length?.toString() ?? '',
    description: model?.description ?? '', card: model?.card ?? '',
    provider_id: model?.price?.provider_id ?? '', input: model?.price?.input ?? '0', output: model?.price?.output ?? '0',
    cache_read: model?.price?.cache_read ?? '0', per_page: model?.price?.per_page ?? '0',
  })
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  const { standards, error: stdError } = useStandards()
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const std = standards?.find((s) => s.id === f.standard)
  const doc = std?.unit === 'page'
  // Endpoint để trống thì backend dùng endpoint mặc định của chuẩn.
  const defaultEndpoint = std?.default_endpoint.replace('{model}', model?.id ?? (f.id.trim() || '{model}')) ?? ''

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const body = {
      ...(model ? {} : { id: f.id.trim() }),
      name: f.name, provider_team: f.provider_team, standard: f.standard,
      modes: std && std.ops.length === 1 ? [std.ops[0].id] : f.modes,
      use_cases: f.use_cases.split(',').map((s) => s.trim()).filter(Boolean), status: f.status, data_level: f.data_level,
      deploy: '', base_url: f.base_url.trim(), endpoint: f.endpoint.trim(), context_length: f.context_length ? Number(f.context_length) : null,
      description: f.description, card: f.card,
      ...(model?.governance ? { governance: model.governance } : {}),
    }
    try {
      const id = model?.id ?? f.id.trim()
      if (model) await api(`/models/${id}`, { method: 'PATCH', json: body })
      else await api('/models', { method: 'POST', json: body })
      await api('/model-prices', {
        method: 'PUT',
        json: { items: [{ model_id: id, provider_id: f.provider_id, input: doc ? '0' : f.input, output: doc ? '0' : f.output, cache_read: doc ? '0' : f.cache_read, per_page: doc ? f.per_page : '0' }] },
      })
      onDone(id)
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  if (stdError) return <ErrorBox error={stdError} />
  if (!standards) return <Loading />

  return (
    <form onSubmit={submit} className="space-y-3">
      {!model && (
        <Field label="ID model" hint="Tên model khi gọi API, ví dụ llm-noi-bo. Không đổi được sau khi tạo.">
          <input className="input font-mono" required pattern="[a-z0-9][a-z0-9.\-]*" value={f.id} onChange={set('id')} />
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tên hiển thị"><input className="input" required value={f.name} onChange={set('name')} /></Field>
        <Field label="Đội cung cấp"><input className="input font-mono" required value={f.provider_team} onChange={set('provider_team')} /></Field>
        <Field label="Chuẩn API" hint={std?.description}>
          <select className="input" value={f.standard} onChange={(e) => {
            const next = standards.find((s) => s.id === e.target.value)
            setF({ ...f, standard: e.target.value, modes: next ? [next.ops[0].id] : [], endpoint: '' })
          }}>
            {standards.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Base URL agentgateway" hint="Để trống: dùng base URL chung của MaaS">
          <input className="input font-mono" type="url" placeholder={publicConfig.gateway_base_url} value={f.base_url} onChange={set('base_url')} />
        </Field>
        <Field label="Endpoint trên gateway" hint="Để trống: dùng endpoint mặc định của chuẩn">
          <input className="input font-mono" placeholder={defaultEndpoint} value={f.endpoint} onChange={set('endpoint')} />
        </Field>
        <Field label="Trạng thái">
          <select className="input" value={f.status} onChange={set('status')}><option value="production">Production</option><option value="beta">Beta</option></select>
        </Field>
        <Field label="Mức dữ liệu được gửi">
          <select className="input" value={f.data_level} onChange={set('data_level')}><option value="noi_bo">Nội bộ</option><option value="mat">Mật</option></select>
        </Field>
      </div>
      {std && std.ops.length > 1 && (
        <fieldset>
          <legend className="label">Thao tác model hỗ trợ</legend>
          <div className="flex flex-wrap gap-3">
            {std.ops.map((o) => (
              <label key={o.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={f.modes.includes(o.id)} onChange={(e) => setF({ ...f, modes: e.target.checked ? [...f.modes, o.id] : f.modes.filter((x) => x !== o.id) })} />{o.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <Field label="Use-case" hint="Cách nhau bằng dấu phẩy"><input className="input" value={f.use_cases} onChange={set('use_cases')} /></Field>
      {!doc && (
        <Field label="Ngữ cảnh (token)"><input className="input font-mono" type="number" min="0" value={f.context_length} onChange={set('context_length')} /></Field>
      )}
      <Field label="Mô tả một dòng"><input className="input" value={f.description} onChange={set('description')} /></Field>
      <Field label="Model card (markdown)" hint="Mục đích sử dụng và hạn chế, xử lý dữ liệu khi gọi, đầu vào và đầu ra (M11)">
        <textarea className="input font-mono" rows={6} value={f.card} onChange={set('card')} />
      </Field>
      <fieldset className="rounded-md border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold">Đơn giá USD</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Provider trên gateway" hint="Dùng trong catalog.json"><input className="input font-mono" value={f.provider_id} onChange={set('provider_id')} /></Field>
          {doc ? (
            <Field label="USD / trang"><input className="input font-mono" type="number" min="0" step="0.0001" value={f.per_page} onChange={set('per_page')} /></Field>
          ) : (
            <>
              <Field label="Input / 1M token"><input className="input font-mono" type="number" min="0" step="0.0001" value={f.input} onChange={set('input')} /></Field>
              <Field label="Input đã cache / 1M token"><input className="input font-mono" type="number" min="0" step="0.0001" value={f.cache_read} onChange={set('cache_read')} /></Field>
              <Field label="Output / 1M token"><input className="input font-mono" type="number" min="0" step="0.0001" value={f.output} onChange={set('output')} /></Field>
            </>
          )}
        </div>
      </fieldset>
      <ErrorBox error={error} />
      <div className="flex justify-end"><button className="btn-primary" disabled={busy}>{model ? 'Lưu' : 'Thêm model'}</button></div>
    </form>
  )
}
