import { useEffect, useState } from 'react'
import { api, type Model } from './api'

// Danh mục chuẩn API lấy từ GET /standards (internal/standard). Mỗi model khai báo một chuẩn; Playground,
// tab API và mã mẫu dựng từ đây. Thêm chuẩn dùng lại Kind sẵn có thì không cần sửa giao diện.

export type Kind =
  | 'openai-chat' | 'openai-completion' | 'openai-embedding' | 'openai-rerank'
  | 'anthropic-messages' | 'systemone-decision' | 'json' | 'binary' | 'multipart'

// Câu hỏi của SystemOne (docs.ollama.com/api/systemone): choice chọn một phương án, noul cho xác suất đúng,
// score cho điểm trên thang từ thấp (chỉ số 0) đến cao.
export type Question =
  | { type: 'choice'; instructions: string; criteria: Record<string, string | null> }
  | { type: 'noul'; instructions: string; criteria?: { false?: string; true?: string } }
  | { type: 'score'; instructions: string; criteria: string[] }

export type Example = {
  title: string; input?: string; system?: string; docs?: string[]; body?: unknown; file?: string; query?: string
  state?: unknown; questions?: Record<string, Question>
  images?: string[]; model?: string // ảnh mẫu (SystemOne vision) và model nên chọn cho ví dụ
}
export type Op = {
  id: string; label: string; kind: Kind; path: string; file_field?: string; accept?: string
  image_accept?: string // nhận thêm ảnh base64 trong JSON (SystemOne `images`)
  stream: boolean; examples: Example[]
}
export type Standard = {
  id: string; name: string; description: string; docs_url?: string; default_endpoint: string
  model_in_path: boolean; unit: 'token' | 'page'; unverified: boolean; ops: Op[]
}

let loading: Promise<Standard[]> | null = null
let loaded: Standard[] | null = null

export function useStandards() {
  const [items, setItems] = useState<Standard[] | null>(loaded)
  const [error, setError] = useState<Error | null>(null)
  useEffect(() => {
    if (loaded) return
    loading ??= api<{ items: Standard[] }>('/standards').then((r) => (loaded = r.items))
    loading.then(setItems).catch((e) => { loading = null; setError(e) })
  }, [])
  return { standards: items, error }
}

export const isChat = (k: Kind) => k === 'openai-chat' || k === 'anthropic-messages'
export const isFile = (k: Kind) => k === 'binary' || k === 'multipart'

// Base URL của model (agentgateway riêng); rỗng thì dùng base chung GATEWAY_BASE_URL.
export const modelBase = (model: Model, base: string) => (model.base_url || base).replace(/\/$/, '')

export function opUrl(base: string, model: Model, op: Op, query?: string) {
  return modelBase(model, base) + model.endpoint + op.path + (query ? `?${query}` : '')
}

// Trạng thái yêu cầu dùng để dựng body và mã mẫu, giống nhau giữa Playground (P5) và tab API (M21).
export type Req = {
  input: string; system?: string; docs?: string[]; params?: Record<string, number>
  body?: string; fileName?: string; fileType?: string; query?: string
  state?: string; questions?: Record<string, Question>
  imageNames?: string[] // tên tệp ảnh gửi kèm, để mã mẫu đọc đúng tệp
}

// state nhập dạng văn bản; nếu là JSON object hoặc mảng thì gửi đúng kiểu đó.
export function parseState(text = ''): unknown {
  const t = text.trim()
  if (t.startsWith('{') || t.startsWith('[')) {
    try { return JSON.parse(t) } catch { /* không phải JSON: gửi nguyên văn */ }
  }
  return text
}

export function exampleReq(op: Op, i = 0): Req {
  const ex = op.examples[i] ?? op.examples[0] ?? { title: '' }
  return {
    input: ex.input ?? '', system: ex.system, docs: ex.docs, query: ex.query,
    body: ex.body !== undefined ? JSON.stringify(ex.body, null, 2) : undefined,
    state: ex.state === undefined ? undefined : typeof ex.state === 'string' ? ex.state : JSON.stringify(ex.state, null, 2),
    questions: ex.questions,
    imageNames: ex.images?.map((f) => f.split('/').pop() ?? f),
    fileName: ex.file?.split('/').pop(), fileType: ex.file?.endsWith('.pdf') ? 'application/pdf' : ex.file ? 'image/png' : undefined,
  }
}

// jsonBody dựng body JSON của các chuẩn văn bản; tham số sinh chỉ đưa vào khi có.
export function jsonBody(op: Op, model: Model, r: Req): Record<string, unknown> | null {
  const p = r.params ?? {}
  const gen = (keys: string[]) => Object.fromEntries(keys.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]))
  switch (op.kind) {
    case 'openai-chat':
      return { model: model.id, messages: [...(r.system ? [{ role: 'system', content: r.system }] : []), { role: 'user', content: r.input }], ...gen(['max_tokens', 'temperature', 'top_p', 'presence_penalty']) }
    case 'openai-completion':
      return { model: model.id, prompt: r.input, ...gen(['max_tokens', 'temperature', 'top_p', 'presence_penalty']) }
    case 'openai-embedding':
      return { model: model.id, input: r.input }
    case 'openai-rerank':
      return { model: model.id, query: r.input, documents: r.docs ?? [], ...gen(['top_n']) }
    case 'anthropic-messages':
      return { model: model.id, max_tokens: p.max_tokens ?? 1024, ...(r.system ? { system: r.system } : {}), messages: [{ role: 'user', content: r.input }], ...gen(['temperature']) }
    case 'systemone-decision':
      return { model: model.id, state: parseState(r.state), questions: r.questions ?? {} }
    case 'json':
      try { return JSON.parse(r.body ?? '{}') } catch { return {} }
    default:
      return null
  }
}

const KEY = '$MAAS_API_KEY'
const sq = (s: string) => s.replace(/'/g, "'\\''")
const py = (v: unknown, indent = 4) =>
  JSON.stringify(v, null, indent).replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None')

export function codeSamples(std: Standard, op: Op, model: Model, base: string, r: Req): Record<'curl' | 'python' | 'node', string> {
  const root = modelBase(model, base)
  const url = opUrl(base, model, op, r.query)
  const file = r.fileName ?? 'tai-lieu.pdf'
  const ctype = r.fileType ?? 'application/octet-stream'

  if (op.kind === 'binary') {
    return {
      curl: `curl -X POST "${url}" \\\n  -H "Authorization: Bearer ${KEY}" \\\n  -H "Content-Type: ${ctype}" \\\n  --data-binary @${file}`,
      python: `import os, requests\n\nwith open("${file}", "rb") as f:\n    r = requests.post(\n        "${url}",\n        headers={"Authorization": f"Bearer {os.environ['MAAS_API_KEY']}", "Content-Type": "${ctype}"},\n        data=f.read(),\n    )\nprint(r.json())`,
      node: `import fs from 'node:fs/promises'\n\nconst r = await fetch('${url}', {\n  method: 'POST',\n  headers: { Authorization: \`Bearer \${process.env.MAAS_API_KEY}\`, 'Content-Type': '${ctype}' },\n  body: await fs.readFile('${file}'),\n})\nconsole.log(await r.json())`,
    }
  }
  if (op.kind === 'multipart') {
    const field = op.file_field ?? 'file'
    return {
      curl: `curl -X POST "${url}" \\\n  -H "Authorization: Bearer ${KEY}" \\\n  -F "${field}=@${file}"`,
      python: `import os, requests\n\nwith open("${file}", "rb") as f:\n    r = requests.post(\n        "${url}",\n        headers={"Authorization": f"Bearer {os.environ['MAAS_API_KEY']}"},\n        files={"${field}": ("${file}", f, "${ctype}")},\n    )\nprint(r.json())`,
      node: `import fs from 'node:fs/promises'\n\nconst form = new FormData()\nform.append('${field}', new Blob([await fs.readFile('${file}')], { type: '${ctype}' }), '${file}')\nconst r = await fetch('${url}', {\n  method: 'POST',\n  headers: { Authorization: \`Bearer \${process.env.MAAS_API_KEY}\` },\n  body: form,\n})\nconsole.log(await r.json())`,
    }
  }

  const body = jsonBody(op, model, r) ?? {}
  const json = JSON.stringify(body, null, 2)
  // SystemOne có ảnh: ảnh gửi base64 thuần trong `images`, mã mẫu đọc tệp rồi mã hoá.
  const imgs = op.kind === 'systemone-decision' ? r.imageNames ?? [] : []
  if (imgs.length) {
    const withVars = JSON.stringify({ ...body, images: imgs.map((_, i) => `$IMG${i + 1}`) }, null, 2)
    return {
      curl: `${imgs.map((f, i) => `IMG${i + 1}=$(base64 < ${f} | tr -d '\\n')`).join('\n')}\ncurl "${url}" \\\n  -H "Authorization: Bearer ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d @- <<EOF\n${withVars}\nEOF`,
      python: `import base64, os, requests\n\nbody = ${py(body)}\nbody["images"] = [base64.b64encode(open(f, "rb").read()).decode() for f in ${py(imgs, 0).replace(/,/g, ', ')}]\n\nr = requests.post(\n    "${url}",\n    headers={"Authorization": f"Bearer {os.environ['MAAS_API_KEY']}"},\n    json=body,\n)\nprint(r.json())`,
      node: `import fs from 'node:fs/promises'\n\nconst body = ${json}\nbody.images = await Promise.all(${JSON.stringify(imgs)}.map(async (f) => (await fs.readFile(f)).toString('base64')))\nconst r = await fetch('${url}', {\n  method: 'POST',\n  headers: { Authorization: \`Bearer \${process.env.MAAS_API_KEY}\`, 'Content-Type': 'application/json' },\n  body: JSON.stringify(body),\n})\nconsole.log(await r.json())`,
    }
  }
  const anthropic = op.kind === 'anthropic-messages'
  const extraHeader = anthropic ? `\\\n  -H "anthropic-version: 2023-06-01" ` : ''
  const nodeHeaders = `{ Authorization: \`Bearer \${process.env.MAAS_API_KEY}\`, 'Content-Type': 'application/json'${anthropic ? ", 'anthropic-version': '2023-06-01'" : ''} }`
  const kwargs = Object.entries(body).map(([k, v]) => `    ${k}=${py(v).replace(/\n/g, '\n    ')},`).join('\n')

  let python: string
  if (std.id === 'openai' && op.kind !== 'openai-rerank') {
    const fn = op.kind === 'openai-chat' ? 'chat.completions' : op.kind === 'openai-completion' ? 'completions' : 'embeddings'
    python = `import os\nfrom openai import OpenAI\n\nclient = OpenAI(base_url="${root}${model.endpoint}", api_key=os.environ["MAAS_API_KEY"])\nresp = client.${fn}.create(\n${kwargs}\n)\nprint(resp)`
  } else if (anthropic) {
    // Thư viện anthropic tự nối /v1/messages vào base_url; auth_token gửi key ở Authorization: Bearer.
    const sdkBase = root + model.endpoint.replace(/\/v1$/, '')
    python = `import os\nfrom anthropic import Anthropic\n\nclient = Anthropic(base_url="${sdkBase}", auth_token=os.environ["MAAS_API_KEY"])\nresp = client.messages.create(\n${kwargs}\n)\nprint(resp.content[0].text)`
  } else {
    python = `import os, requests\n\nr = requests.post(\n    "${url}",\n    headers={"Authorization": f"Bearer {os.environ['MAAS_API_KEY']}"},\n    json=${py(body).replace(/\n/g, '\n    ')},\n)\nprint(r.json())`
  }
  return {
    curl: `curl "${url}" \\\n  -H "Authorization: Bearer ${KEY}" \\\n  -H "Content-Type: application/json" ${extraHeader}\\\n  -d '${sq(json)}'`,
    python,
    node: `const r = await fetch('${url}', {\n  method: 'POST',\n  headers: ${nodeHeaders},\n  body: JSON.stringify(${json.replace(/\n/g, '\n  ')}),\n})\nconsole.log(await r.json())`,
  }
}

// Đọc số token, trang từ phản hồi của từng chuẩn (P6).
export type Usage = { tin: number; tout: number; cache: number; pages: number }

export function readUsage(kind: Kind, d: any): Usage { // eslint-disable-line @typescript-eslint/no-explicit-any
  const u = d?.usage ?? {}
  if (isFile(kind)) {
    const results = d?.results
    let pages = 0
    if (results && !Array.isArray(results) && typeof results === 'object') {
      for (const v of Object.values(results) as { pages?: number }[]) pages += v?.pages ?? 1
    }
    return { tin: 0, tout: 0, cache: 0, pages: pages || d?.pages || 1 }
  }
  const cache = u.cache_read_input_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0
  const tin = u.prompt_tokens ?? (u.input_tokens !== undefined ? u.input_tokens + (u.cache_read_input_tokens ?? 0) : u.total_tokens ?? 0)
  return { tin, tout: u.completion_tokens ?? u.output_tokens ?? 0, cache, pages: 0 }
}

export function estimateCost(m: Model | undefined, u: Usage) {
  if (!m?.price) return 0
  if (m.unit === 'page') return u.pages * Number(m.price.per_page)
  const uncached = Math.max(0, u.tin - u.cache)
  return (uncached * Number(m.price.input) + u.cache * Number(m.price.cache_read) + u.tout * Number(m.price.output)) / 1e6
}
