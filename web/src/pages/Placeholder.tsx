import { Empty, PageHeader } from '../components/ui'

export default function Placeholder({ title, desc, step }: { title: string; desc: string; step?: string }) {
  return (
    <>
      <PageHeader title={title} desc={desc} />
      <Empty>{step ? `Chưa làm: thuộc ${step} trong thứ tự triển khai (mục 19 của spec).` : desc}</Empty>
    </>
  )
}
