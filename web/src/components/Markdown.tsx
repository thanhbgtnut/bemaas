import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useMemo } from 'react'

// Model card và SKILL.md viết bằng markdown; HTML sinh ra luôn được lọc trước khi chèn vào trang.
export default function Markdown({ text }: { text: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false })), [text])
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
}
