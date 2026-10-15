#!/usr/bin/env python3
"""Đóng gói prototype MaaS thành một file HTML tự chứa.

    python3 prototype/src/build.py

Nguồn: skills.js, gradio.js, mcp.js, app.js (mỗi file: hằng số  //@@METHODS  phương thức của Component).
Khung bundle (loader, dc-runtime, React, font) lấy từ file backup gốc.
"""
import json, base64, gzip, re, os
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, '..', 'Model Catalog – Model Cards.backup.html')
OUT = os.path.join(HERE, '..', 'Model Catalog – Model Cards.html')
CAT = '68b67ffa-6244-4a73-ac82-7346332c9418'      # trang gốc dùng làm khung (chứa runtime + font)
APP = 'c7a1e0d2-5b8f-4e3a-9d61-2f4b8a7c9e15'

CSS = """body{margin:0;background:#FFFFFF}
a{color:#2F6BEA}a:hover{color:#141ED2}
.mx-skip{position:absolute;left:-9999px;top:8px;z-index:200;background:#fff;color:#0B1342;padding:8px 12px;border-radius:8px;border:1px solid #CBD5E1}
.mx-skip:focus{left:16px}
@keyframes gr-spin{to{transform:rotate(360deg)}}
@keyframes mx-in{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
:focus-visible{outline:2px solid #2F6BEA;outline-offset:2px}
button,a,.mx-row,.mx-facet{transition:background-color .18s ease,border-color .18s ease,color .18s ease}
.mx-row:hover{background:#F2F6FE}
.mx-card{transition:border-color .18s ease,box-shadow .18s ease}
.mx-card:hover{border-color:#93B4F6!important;box-shadow:0 2px 8px rgba(47,107,234,.12)}
.mx-facet:hover{background:#F2F6FE}
.mx-btn:hover{background:#F2F6FE!important;border-color:#93B4F6!important}
.mx-btn-pri:hover:not(:disabled){background:#141ED2!important;border-color:#141ED2!important}
.mx-tab:hover{color:#0B1342!important}
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
"""
BOARDS = [('Models – danh mục', '#models', 900), ('Models – Bật/Tắt model', '#toggle', 950), ('Models – model card cppd-ocr', '#model', 1250),
          ('Models – tab API (llm-noi-bo)', '#model-api', 1000), ('Models – dùng thử model tài liệu (OCR)', '#model-try', 1350),
          ('Playground – Chat', '#playground', 1050), ('Playground – Compare', '#compare', 1050), ('Ngân sách & key – Quản trị nền tảng', '#keys', 900), ('Ngân sách & key – Quản trị phòng', '#keys-dept', 1000), ('Ngân sách & key – Cấp key', '#keys-issue', 1000), ('Ngân sách & key – Thành viên', '#keys-me', 800), ('Sử dụng & chi phí', '#usage', 1500),
          ('MCP & tools – danh sách server (quản trị nền tảng)', '#mcp', 800), ('MCP & tools – bật/tắt tool của một server', '#mcp-server', 1050), ('MCP & tools – phạm vi sử dụng theo phòng', '#mcp-access', 1050), ('MCP & tools – cấu hình ghi xuống agentgateway', '#mcp-gateway', 2050), ('MCP & tools – thêm MCP server', '#mcp-add', 1120), ('MCP & tools – thành viên xem cách kết nối', '#mcp-member', 1150),
          ('Skills – Khám phá', '#skills', 1320), ('Skills – chi tiết doi-chieu-unc', '#detail', 1320), ('Skills – xem tệp trong gói', '#files', 1000),
          ('Skills – Bộ skill theo vai trò', '#sets', 1350), ('Skills – Skill đang cần', '#wanted', 1520), ('Skills – Chia sẻ skill', '#register', 1000)]

def read(name): return open(os.path.join(HERE, name), encoding='utf-8').read()
def island_get(doc, tag): return re.search(rf'<script type="__bundler/{tag}">(.*?)</script>', doc, re.S)
def island_set(doc, tag, payload):
    m = island_get(doc, tag)
    return doc[:m.start(1)] + '\n' + payload + '\n  ' + doc[m.end(1):]
def enc(x): return json.dumps(x, ensure_ascii=False).replace('</', '<\\u002F')

tops, methods = [], []
for name in ('skills.js', 'gradio.js', 'mcp.js', 'app.js'):       # thứ tự quan trọng: app.js dùng hằng số của các file trước
    t, m = read(name).split('//@@METHODS\n')
    tops.append(t.rstrip()); methods.append(m.rstrip())
logic = '\n\n'.join(tops) + '\n\nclass Component extends DCLogic {\n' + '\n\n'.join(methods) + '\n}\n'
assert '</script' not in logic and '{{' not in logic

outer = open(BASE, encoding='utf-8').read()
man = json.loads(island_get(outer, 'manifest').group(1))
shell = gzip.decompress(base64.b64decode(man[CAT]['data'])).decode('utf-8')
cat_tpl = json.loads(island_get(shell, 'template').group(1))
head = cat_tpl[:cat_tpl.index('<x-dc>')].replace('<title>Model Catalog</title>', '<title>MaaS – Nền tảng AI toàn ngân hàng</title>')
helmet = cat_tpl[cat_tpl.index('<helmet>'):cat_tpl.index('</helmet>') + len('</helmet>')]
a = helmet.rindex('<style>'); helmet = helmet[:a] + '<style>\n' + CSS + '</style>\n</helmet>'
tpl = (head + '<x-dc>\n' + helmet + '\n{{app}}\n</x-dc>\n<script type="text/x-dc" data-dc-script="" data-props="{&quot;$preview&quot;:{&quot;width&quot;:1440,&quot;height&quot;:1300}}">\n'
       + logic + '</script>\n\n\n</body></html>')
page = island_set(shell.replace('Model Catalog', 'MaaS'), 'template', enc(tpl))

entry = dict(man[CAT]); entry['data'] = base64.b64encode(gzip.compress(page.encode('utf-8'), mtime=0)).decode(); entry['compressed'] = True
outer = island_set(outer, 'manifest', json.dumps({APP: entry}))
outer = island_set(outer, 'page_order', json.dumps([APP]))
def board(title, frag, hgt):
    return f'<section class="board"><h2>{title}</h2><iframe src="about:blank#{APP}{frag}" title="{title}" width="1440" height="{hgt}" loading="eager" style="width:1440px;height:{hgt}px"></iframe></section>'
ot = ('<!DOCTYPE html>\n<html lang="vi"><head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>MaaS – Prototype</title>\n<style>\n'
      'html{background:#F2F6FE;color:#0B1342;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}\nbody{margin:0;padding:48px;display:flex;flex-direction:column;align-items:flex-start;gap:48px}\n'
      '.note{max-width:1440px;margin:0;font-size:14px;color:#475569;line-height:1.6}\n.note strong{color:#0B1342}\n'
      '.board h2{margin:0 0 12px;font-size:13px;font-weight:600;color:#475569}\n.board iframe{display:block;border:0;background:#fff;box-shadow:0 1px 3px rgba(11,19,66,.15)}\n</style>\n</head>\n<body>\n'
      '<p class="note"><strong>MaaS – prototype.</strong> Mỗi khung bên dưới là cùng một ứng dụng, mở sẵn ở một màn khác nhau. Trong bất kỳ khung nào cũng dùng được menu trên cùng để đi giữa Models, Playground, Skills, MCP & tools, Ngân sách & key và Sử dụng & chi phí. Đổi vai trò ở góc trên bên phải để xem giao diện của quản trị nền tảng, quản trị phòng và thành viên.</p>\n'
      + '\n'.join(board(*x) for x in BOARDS) + '\n\n\n</body></html>')
outer = island_set(outer, 'template', enc(ot))
outer = outer.replace('<title>Model Catalog – Model Cards</title>', '<title>MaaS – Prototype</title>').replace('Loading Model Catalog – Model Cards...', 'Đang tải MaaS…')
open(OUT, 'w', encoding='utf-8').write(outer)
print('ok', os.path.basename(OUT), len(outer.encode()), 'bytes')
