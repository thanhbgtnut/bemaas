// ── Skill hub ────────────────────────────────────────────────────────
// Hub chia sẻ agent skill cho toàn ngân hàng. Skill = SKILL.md (frontmatter +
// hướng dẫn) kèm script, tài liệu tham chiếu. Hub không phân quyền: ai cũng xem,
// cài, góp ý và đăng skill được. Hub chỉ đếm được lượt cài/tải đi qua nó.
var h = React.createElement;
var T = {
  text: '#0B1342', muted: '#475569', subtle: '#64748B', border: '#E2E8F0', borderStrong: '#CBD5E1',
  primary: '#2F6BEA', primaryDark: '#141ED2', sky50: '#F2F6FE', sky100: '#E3ECFD', sky200: '#C5D7FB', sky500: '#5B8DEF',
  surface: '#F8FAFC', code: '#0B1342', codeText: '#E3ECFD'
};
var MONO = "'IBM Plex Mono', monospace";

function Ico(d, size, color) {
  return h('svg', { width: size || 16, height: size || 16, viewBox: '0 0 24 24', fill: 'none', stroke: color || 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, style: { flex: 'none' } },
    d.split('|').map(function (p, i) { return h('path', { key: i, d: p }); }));
}
var I = {
  check: 'M20 6 9 17l-5-5',
  clock: 'M12 7v5l3 2|M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  pencil: 'M12 20h9|M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  ban: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0|m5.7 5.7 12.6 12.6',
  alert: 'M12 9v4|M12 17h.01|M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  search: 'm21 21-4.3-4.3|M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0',
  plus: 'M12 5v14|M5 12h14',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6',
  folder: 'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z',
  copy: 'M9 9h12v12H9z|M5 15V5a2 2 0 0 1 2-2h10',
  x: 'M18 6 6 18|m6 6 12 12',
  left: 'm15 18-6-6 6-6',
  upload: 'M12 16V4|m6 10 6-6 6 6|M4 20h16',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z|m9 12 2 2 4-4',
  box: 'M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z|M3.3 7 12 12l8.7-5|M12 22V12',
  bot: 'M12 8V4H8|M4 8h16v12H4z|M2 14h2|M20 14h2|M15 13v2|M9 13v2',
  git: 'M6 3v12|M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M18 9a9 9 0 0 1-9 9',
  sort: 'm7 15 5 5 5-5|m7 9 5-5 5 5',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  download: 'M12 4v12|m6 12 6 6 6-6|M4 20h16',
  up: 'm6 14 6-6 6 6',
  pulse: 'M3 12h4l3-8 4 16 3-8h4'
};

var DATA = { 'Công khai': { bg: '#F1F5F9', fg: '#334155', slug: 'cong-khai' }, 'Nội bộ': { bg: '#DBEAFE', fg: '#1E40AF', slug: 'noi-bo' }, 'Mật': { bg: '#FEF3C7', fg: '#92400E', slug: 'mat' } };
var KIND = { guide: 'Chỉ hướng dẫn', script: 'Có script', tool: 'Gọi tool/API' };
// Lĩnh vực của skill: [id, tên, khối] — khối: 'nv' = nghiệp vụ, 'cntt' = công nghệ, 'chung' = toàn ngân hàng
var GROUPS = [['tin-dung', 'Tín dụng', 'nv'], ['thanh-toan', 'Thanh toán', 'nv'], ['tuan-thu', 'Tuân thủ & rủi ro', 'nv'], ['phat-trien', 'Phát triển phần mềm', 'cntt'], ['van-hanh-cntt', 'Vận hành CNTT', 'cntt'], ['attt', 'An toàn thông tin', 'cntt'], ['dung-chung', 'Dùng chung', 'chung']];
var GROUP_SCOPE = {};
GROUPS.forEach(function (g) { GROUP_SCOPE[g[0]] = g[2]; });
var SCOPES = [['all', 'Toàn ngân hàng'], ['nv', 'Khối nghiệp vụ'], ['cntt', 'Khối CNTT']];
var GROUP_NAME = {};
GROUPS.forEach(function (g) { GROUP_NAME[g[0]] = g[1]; });

var MODELS = ['code-llm', 'llm-noi-bo', 'embed-vi', 'rerank-vi', 'cppd-ocr', 'doc-kie', 'doc-classify'];

var SEED = [
  { id: 'doi-chieu-unc', group: 'thanh-toan', name: 'Đối chiếu ủy nhiệm chi', kind: 'script', version: '1.3.0', updated: '02/10/2026', owner: 'Khối Vận hành', author: 'Trần Quốc Bảo', installs: 1840, stars: 96, verified: true,
    desc: 'Đối chiếu UNC với hợp đồng và hoá đơn: số tiền, bên thụ hưởng, nội dung thanh toán.',
    trigger: 'Dùng khi người dùng gửi ủy nhiệm chi kèm hợp đồng hoặc hoá đơn và cần kiểm tra số tiền, bên thụ hưởng, nội dung có khớp nhau không.',
    models: ['cppd-ocr', 'doc-kie', 'llm-noi-bo'], tools: ['ocr.cppd', 'kie.doc', 'fs.read'],
    steps: ['Gọi cppd-ocr cho từng trang của UNC và chứng từ gốc.', 'Trích các trường số tiền, bên thụ hưởng, số tài khoản, nội dung bằng doc-kie.', 'Chạy scripts/doi_chieu.py để so khớp theo quy tắc trong references/quy_tac_doi_chieu.md.', 'Trả kết quả theo schemas/ket_qua.json; trường lệch được giải thích bằng tiếng Việt.'],
    output: 'JSON: danh sách trường, giá trị ở từng chứng từ, trạng thái khớp/lệch, lý do.',
    limits: 'Không tự phê duyệt thanh toán. Chứng từ viết tay hoặc ảnh mờ phải chuyển người xử lý.',
    changelog: [['1.3.0', 'Thêm so khớp số tài khoản thụ hưởng; giải thích lệch bằng tiếng Việt', '02/10/2026'], ['1.2.0', 'Hỗ trợ hoá đơn điện tử GTGT', '14/08/2026'], ['1.0.0', 'Phát hành lần đầu', '03/06/2026']] },
  { id: 'tra-cuu-quy-che-tin-dung', group: 'tin-dung', name: 'Tra cứu quy chế tín dụng', kind: 'tool', version: '2.1.0', updated: '28/09/2026', owner: 'Khối Tín dụng', author: 'Nguyễn Minh Anh', installs: 2310, stars: 121, verified: true,
    desc: 'Trả lời câu hỏi về quy chế cho vay, phân cấp phê duyệt tín dụng; luôn kèm trích dẫn điều khoản.',
    trigger: 'Dùng khi câu hỏi liên quan quy chế cho vay, hạn mức, phân cấp thẩm quyền phê duyệt tín dụng.',
    models: ['embed-vi', 'rerank-vi', 'llm-noi-bo'], tools: ['search.vanban', 'llm.chat'] },
  { id: 'sang-loc-aml', group: 'tuan-thu', name: 'Sàng lọc AML giao dịch', kind: 'tool', version: '1.0.2', updated: '19/09/2026', owner: 'Khối Tuân thủ', author: 'Lê Thu Hà', installs: 640, stars: 58, verified: true,
    desc: 'Đối chiếu bên giao dịch với danh sách cấm vận, PEP; đánh dấu giao dịch cần rà soát thủ công.',
    trigger: 'Dùng khi cần kiểm tra tên tổ chức, cá nhân trong giao dịch với danh sách cấm vận và PEP.',
    models: ['embed-vi', 'llm-noi-bo'], tools: ['api.watchlist (read-only)'] },
  { id: 'review-code-chuan-noi-bo', group: 'phat-trien', name: 'Review code theo chuẩn nội bộ', kind: 'script', version: '1.4.0', updated: '30/09/2026', owner: 'Khối CNTT', author: 'Phạm Đức Long', installs: 1520, stars: 143, verified: true,
    desc: 'Review merge request theo chuẩn lập trình, checklist bảo mật và quy ước đặt tên của Khối CNTT.',
    trigger: 'Dùng khi người dùng yêu cầu review một merge request, một diff hoặc một file mã nguồn trước khi merge.',
    models: ['code-llm'], tools: ['git.diff', 'fs.read', 'sonar.read'],
    steps: ['Đọc diff bằng git.diff; chỉ xét các dòng thay đổi và ngữ cảnh xung quanh.', 'Chạy scripts/kiem_tra_quy_uoc.py để bắt lỗi quy ước đặt tên, logging, xử lý ngoại lệ.', 'Đối chiếu với references/chuan_lap_trinh.md và references/checklist_bao_mat.md.', 'Trả nhận xét theo schemas/nhan_xet.json: file, dòng, mức độ, lý do, gợi ý sửa.'],
    output: 'JSON: danh sách nhận xét (file, dòng, mức độ, lý do, đoạn mã đề xuất).',
    limits: 'Không tự approve hay merge. Thay đổi liên quan mật mã, xác thực, core banking phải có người review thứ hai.', },
  { id: 'viet-unit-test', group: 'phat-trien', name: 'Viết unit test', kind: 'script', version: '1.1.0', updated: '30/08/2026', owner: 'Khối CNTT', author: 'Phạm Đức Long', installs: 1275, stars: 88,
    desc: 'Sinh unit test theo khung và quy ước của dự án, chạy thử và báo cáo độ phủ.',
    trigger: 'Dùng khi cần viết hoặc bổ sung unit test cho một class, hàm hoặc merge request.',
    models: ['code-llm'], tools: ['fs.read', 'fs.write', 'test.run'] },
  { id: 'phan-tich-log-su-co', group: 'van-hanh-cntt', name: 'Phân tích log sự cố', kind: 'tool', version: '2.0.1', updated: '25/09/2026', owner: 'Khối CNTT', author: 'Vũ Hải Nam', installs: 410, stars: 47,
    desc: 'Truy vấn log và metric production quanh thời điểm sự cố, dựng dòng thời gian và nêu giả thuyết nguyên nhân.',
    trigger: 'Dùng khi có cảnh báo hoặc sự cố production và cần khoanh vùng nguyên nhân từ log, metric.',
    models: ['llm-noi-bo', 'embed-vi'], tools: ['log.search (read-only)', 'metrics.query (read-only)'] },
  { id: 'ra-soat-cau-hinh-bao-mat', group: 'attt', name: 'Rà soát cấu hình bảo mật', kind: 'script', version: '1.0.3', updated: '11/09/2026', owner: 'Khối CNTT', author: 'Đỗ Ngọc Hân', installs: 265, stars: 31, verified: true,
    desc: 'So cấu hình máy chủ, container, CSDL với baseline bảo mật và liệt kê điểm lệch.',
    trigger: 'Dùng khi cần kiểm tra cấu hình một hệ thống so với baseline bảo mật trước khi go-live hoặc định kỳ.',
    models: ['code-llm'], tools: ['cmdb.read', 'fs.read'] },
  { id: 'tra-cuu-quy-dinh-noi-bo', group: 'dung-chung', name: 'Tra cứu quy định nội bộ', kind: 'tool', version: '2.2.0', updated: '19/09/2026', owner: 'Văn phòng Chuyển đổi số', author: 'Bùi Thanh Tùng', installs: 5620, stars: 204, verified: true, mine: true,
    desc: 'Trả lời câu hỏi về quy định, quy trình chung của ngân hàng (nhân sự, hành chính, ATTT, quản lý thay đổi); kèm trích dẫn.',
    trigger: 'Dùng khi nhân viên hỏi về quy định, quy trình nội bộ không thuộc một nghiệp vụ chuyên biệt.',
    models: ['embed-vi', 'rerank-vi', 'llm-noi-bo'], tools: ['search.vanban', 'llm.chat'] },
  { id: 'che-du-lieu-nhay-cam', group: 'dung-chung', name: 'Che dữ liệu nhạy cảm', kind: 'script', version: '3.0.0', updated: '11/09/2026', owner: 'Văn phòng Chuyển đổi số', author: 'Bùi Thanh Tùng', installs: 3980, stars: 167, verified: true, mine: true,
    desc: 'Che CCCD, số tài khoản, số điện thoại, token, mật khẩu trong văn bản và log trước khi đưa cho model khác hoặc chia sẻ.',
    trigger: 'Dùng trước mọi bước gửi văn bản, log hoặc dữ liệu có thể chứa thông tin khách hàng ra ngoài phạm vi dữ liệu Mật.',
    models: ['doc-kie', 'llm-noi-bo'], tools: ['fs.read'] },
  { id: 'bao-cao-ty-gia', group: 'dung-chung', name: 'Tổng hợp báo cáo tỷ giá ngày', kind: 'tool', version: '1.0.0', updated: '15/05/2026', owner: 'Khối Nguồn vốn', author: 'Ngô Gia Huy', installs: 120, stars: 9,
    desc: 'Đã thay bằng dashboard tỷ giá của khối Nguồn vốn. Giữ lại để tra cứu lịch sử.',
    trigger: 'Dùng khi cần bảng tỷ giá tổng hợp cuối ngày.',
    models: ['llm-noi-bo'], tools: ['api.tygia (read-only)'] }
];

function full(s) {
  return Object.assign({
    steps: ['Đọc yêu cầu và kiểm tra đầu vào có thuộc phạm vi skill.', 'Gọi các model, tool theo thứ tự trong hướng dẫn.', 'Trả kết quả kèm nguồn trích dẫn hoặc lý do.'],
    output: '[Mô tả đầu ra]', limits: '[Trường hợp skill không xử lý được và cần người làm]',
    changelog: [[s.version, '[Thay đổi chính]', s.updated]]
  }, s);
}
function skillMd(s) {
  return '---\nname: ' + s.id + '\ndescription: ' + s.trigger + '\nversion: ' + s.version + '\nauthor: ' + s.author + ' (' + s.owner + ')' +
    '\nmodels: [' + s.models.join(', ') + ']\nallowed-tools: [' + s.tools.join(', ') + ']\n---\n\n# ' + s.name +
    '\n\n' + s.desc + '\n\n## Các bước\n' + s.steps.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n') +
    '\n\n## Đầu ra\n' + s.output + '\n\n## Lưu ý\n' + s.limits + '\n';
}
function files(s) {
  var f = [['SKILL.md', skillMd(s)]];
  if (s.id === 'doi-chieu-unc') {
    f.push(['scripts/doi_chieu.py', 'from decimal import Decimal\n\nTRUONG = ["so_tien", "ben_thu_huong", "so_tai_khoan", "noi_dung"]\n\n\ndef doi_chieu(unc: dict, goc: dict) -> list[dict]:\n    \"\"\"So khớp từng trường giữa UNC và chứng từ gốc.\"\"\"\n    ket_qua = []\n    for t in TRUONG:\n        a, b = unc.get(t), goc.get(t)\n        if t == "so_tien":\n            khop = a is not None and b is not None and Decimal(a) == Decimal(b)\n        else:\n            khop = chuan_hoa(a) == chuan_hoa(b)\n        ket_qua.append({"truong": t, "unc": a, "goc": b, "khop": khop})\n    return ket_qua\n']);
    f.push(['references/quy_tac_doi_chieu.md', '# Quy tắc đối chiếu\n\n- Số tiền: khớp tuyệt đối, không làm tròn.\n- Bên thụ hưởng: bỏ dấu, bỏ "CÔNG TY TNHH/CP" trước khi so.\n- Nội dung: chấp nhận khác biệt viết tắt (HĐ = hợp đồng).\n']);
    f.push(['schemas/ket_qua.json', '{\n  "type": "array",\n  "items": {\n    "type": "object",\n    "required": ["truong", "khop"],\n    "properties": {\n      "truong": { "type": "string" },\n      "unc": {}, "goc": {},\n      "khop": { "type": "boolean" },\n      "ly_do": { "type": "string" }\n    }\n  }\n}\n']);
    f.push(['tests/mau_unc_da_che.json', '[\n  { "unc": "mau_01.png", "goc": "hd_01.pdf", "ky_vong": "khop" },\n  { "unc": "mau_02.png", "goc": "hd_02.pdf", "ky_vong": "lech_so_tien" }\n]\n']);
  } else if (s.id === 'review-code-chuan-noi-bo') {
    f.push(['scripts/kiem_tra_quy_uoc.py', 'import re\n\nQUY_UOC = [\n    (r"System\\.out\\.print", "chan", "Dùng logger, không in ra stdout"),\n    (r"catch \\(Exception \\w+\\) \\{\\s*\\}", "chan", "Không nuốt ngoại lệ"),\n    (r"password|secret|token\\s*=\\s*\\"", "chan", "Nghi lộ bí mật trong mã"),\n]\n\n\ndef kiem_tra(diff: str) -> list[dict]:\n    \"\"\"Trả các vi phạm quy ước trên những dòng được thêm.\"\"\"\n    ket_qua = []\n    for so_dong, dong in dong_duoc_them(diff):\n        for mau, muc_do, ly_do in QUY_UOC:\n            if re.search(mau, dong):\n                ket_qua.append({"dong": so_dong, "muc_do": muc_do, "ly_do": ly_do})\n    return ket_qua\n']);
    f.push(['references/chuan_lap_trinh.md', '# Chuẩn lập trình Khối CNTT (rút gọn)\n\n- Tên class PascalCase, tên hàm camelCase, hằng số UPPER_SNAKE.\n- Mọi API công khai phải có kiểm tra quyền và ghi audit log.\n- Không log dữ liệu khách hàng; dùng mã giao dịch thay cho số tài khoản.\n']);
    f.push(['references/checklist_bao_mat.md', '# Checklist bảo mật khi review\n\n- Đầu vào từ ngoài được kiểm tra và giới hạn độ dài.\n- Truy vấn SQL dùng tham số, không nối chuỗi.\n- Không có khoá, mật khẩu, token trong mã hoặc cấu hình commit.\n']);
    f.push(['schemas/nhan_xet.json', '{\n  "type": "array",\n  "items": {\n    "type": "object",\n    "required": ["file", "dong", "muc_do", "ly_do"],\n    "properties": {\n      "file": { "type": "string" },\n      "dong": { "type": "integer" },\n      "muc_do": { "enum": ["chan", "nen_sua", "goi_y"] },\n      "ly_do": { "type": "string" },\n      "de_xuat": { "type": "string" }\n    }\n  }\n}\n']);
    f.push(['tests/mr_mau.json', '[\n  { "diff": "mr_0412.diff", "ky_vong": ["chan: nuốt ngoại lệ"] },\n  { "diff": "mr_0418.diff", "ky_vong": [] }\n]\n']);
  } else if (s.kind !== 'guide') {
    f.push([s.kind === 'script' ? 'scripts/main.py' : 'tools/' + s.tools[0].split(' ')[0] + '.yaml', '# [Nội dung tệp]\n']);
    f.push(['references/README.md', '# Tài liệu tham chiếu\n\n[—]\n']);
  }
  return f;
}

// ── Phân quyền skill ─────────────────────────────────────────────────
// Quyền hiệu lực của một người = skill của các nhóm họ thuộc về
//   + skill được cấp riêng (có hạn) − skill bị chặn riêng,
// và chỉ khi mức dữ liệu được phép của người đó ≥ mức dữ liệu của skill.
// Chỉ skill "Đã phát hành" mới cấp được.

// Bộ skill theo vai trò: bộ sưu tập gợi ý, không phải phân quyền. scope: 'nv' nghiệp vụ, 'cntt' công nghệ.
var SETS = [
  { id: 'can-bo-tin-dung', name: 'Cán bộ tín dụng DN', unit: 'Khối Tín dụng', scope: 'nv', installs: 186, skills: ['tra-cuu-quy-che-tin-dung', 'doi-chieu-unc', 'che-du-lieu-nhay-cam', 'tra-cuu-quy-dinh-noi-bo'] },
  { id: 'cv-thanh-toan', name: 'Chuyên viên thanh toán', unit: 'Khối Vận hành', scope: 'nv', installs: 142, skills: ['doi-chieu-unc', 'che-du-lieu-nhay-cam', 'tra-cuu-quy-dinh-noi-bo'] },
  { id: 'cv-aml', name: 'Chuyên viên AML', unit: 'Khối Tuân thủ', scope: 'nv', installs: 41, skills: ['sang-loc-aml', 'che-du-lieu-nhay-cam', 'tra-cuu-quy-dinh-noi-bo'] },
  { id: 'giao-dich-vien', name: 'Giao dịch viên', unit: 'Chi nhánh', scope: 'nv', installs: 1210, skills: ['tra-cuu-quy-dinh-noi-bo'] },
  { id: 'lap-trinh-vien', name: 'Lập trình viên', unit: 'Khối CNTT', scope: 'cntt', installs: 388, skills: ['review-code-chuan-noi-bo', 'viet-unit-test', 'tra-cuu-quy-dinh-noi-bo'] },
  { id: 'ky-su-van-hanh', name: 'Kỹ sư vận hành (SRE)', unit: 'Khối CNTT', scope: 'cntt', installs: 77, skills: ['phan-tich-log-su-co', 'che-du-lieu-nhay-cam', 'tra-cuu-quy-dinh-noi-bo'] },
  { id: 'chuyen-vien-attt', name: 'Chuyên viên ATTT', unit: 'Khối CNTT', scope: 'cntt', installs: 35, skills: ['ra-soat-cau-hinh-bao-mat', 'che-du-lieu-nhay-cam', 'tra-cuu-quy-dinh-noi-bo'] }
];
// Skill đang cần: few = chỉ vài người đang nắm cách làm; taker = đã có người nhận viết
var WANTED = [
  { id: 'w1', title: 'Tóm tắt hồ sơ vay thành tờ trình', desc: 'Gộp BCTC, phương án, tài sản bảo đảm thành tờ trình nháp theo mẫu của khối.', set: 'can-bo-tin-dung', votes: 41, by: 'Nguyễn Minh Anh', taker: 'Khối Tín dụng' },
  { id: 'w2', title: 'Hướng dẫn mở tài khoản doanh nghiệp', desc: 'Liệt kê hồ sơ cần thu theo loại hình doanh nghiệp và các bước nhập liệu.', set: 'giao-dich-vien', votes: 34, by: 'Hoàng Lan Chi' },
  { id: 'w3', title: 'Soạn báo cáo nguyên nhân gốc (RCA)', desc: 'Soạn RCA theo mẫu từ dòng thời gian sự cố và biên bản xử lý.', set: 'ky-su-van-hanh', votes: 27, by: 'Vũ Hải Nam', taker: 'Khối CNTT' },
  { id: 'w4', title: 'Phân tích BCTC doanh nghiệp', desc: 'Tính các chỉ số chính, so sánh nhiều kỳ và nêu điểm bất thường.', set: 'can-bo-tin-dung', votes: 23, by: 'Đặng Mai Phương' },
  { id: 'w5', title: 'Tích hợp core banking qua ESB', desc: 'Cách đăng ký dịch vụ, mẫu message và các lỗi thường gặp khi tích hợp.', set: 'lap-trinh-vien', votes: 18, by: 'Phạm Đức Long', few: true },
  { id: 'w6', title: 'Thẩm định tài sản bảo đảm', desc: 'Checklist hồ sơ pháp lý và cách đối chiếu giá theo từng loại tài sản.', set: 'can-bo-tin-dung', votes: 15, by: 'Nguyễn Minh Anh', few: true },
  { id: 'w7', title: 'Xử lý sự cố batch cuối ngày', desc: 'Trình tự kiểm tra và chạy lại khi job batch lỗi, kèm điều kiện dừng.', set: 'ky-su-van-hanh', votes: 14, by: 'Vũ Hải Nam', few: true },
  { id: 'w8', title: 'Xử lý tra soát giao dịch quốc tế', desc: 'Soạn điện tra soát và theo dõi phản hồi theo từng loại lỗi.', set: 'cv-thanh-toan', votes: 12, by: 'Trần Quốc Bảo', few: true },
  { id: 'w9', title: 'Lập báo cáo giao dịch đáng ngờ (STR)', desc: 'Điền mẫu STR từ kết quả sàng lọc và hồ sơ khách hàng.', set: 'cv-aml', votes: 9, by: 'Lê Thu Hà', few: true },
  { id: 'w10', title: 'Điều tra cảnh báo SIEM', desc: 'Các bước xác minh cảnh báo, nguồn log cần xem và tiêu chí đóng cảnh báo.', set: 'chuyen-vien-attt', votes: 8, by: 'Đỗ Ngọc Hân' }
];
//@@METHODS
  // ── hub: dữ liệu & tiện ích ──
  skills() { return this.state.skills || SEED; }
  skillById(id) { return this.skills().filter(function (s) { return s.id === id; })[0]; }
  sets() { return SETS; }
  wanted() { return this.state.wanted || WANTED; }
  starred(id) { return !!(this.state.stars || {})[id]; }
  toggleStar(id) { var s = Object.assign({}, this.state.stars || {}); s[id] = !s[id]; this.setState({ stars: s }); }
  starCount(s) { return s.stars + (this.starred(s.id) ? 1 : 0); }
  copy(text, key) {
    var self = this;
    try { navigator.clipboard && navigator.clipboard.writeText(text); } catch (e) {}
    this.setState({ copied: key });
    clearTimeout(this._copyT);
    this._copyT = setTimeout(function () { self.setState({ copied: null }); }, 2000);
  }
  toast(msg) {
    var self = this;
    this.setState({ toastMsg: msg });
    clearTimeout(this._toastT);
    this._toastT = setTimeout(function () { self.setState({ toastMsg: null }); }, 4000);
  }
  newReg(prefill) { return { step: 1, src: 'zip', f: Object.assign({ group: '', models: [], set: '' }, prefill || {}) }; }

  // ── thành phần dùng chung ──
  badge(bg, fg, text, icon) {
    return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', background: bg, color: fg, whiteSpace: 'nowrap' } }, icon ? Ico(icon, 12, fg) : null, text);
  }
  data(d) { var x = DATA[d]; return this.badge(x.bg, x.fg, 'Dữ liệu: ' + d); }
  verified() { return this.badge('#DCFCE7', '#166534', 'Đã kiểm chứng', I.shield); }
  btn(label, onClick, opts) {
    opts = opts || {};
    var pri = opts.primary;
    return h('button', { type: 'button', onClick: onClick, disabled: opts.disabled, className: pri ? 'mx-btn-pri' : 'mx-btn', 'aria-label': opts.aria, 'aria-pressed': opts.pressed,
      style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', minHeight: '40px', padding: '0 16px', borderRadius: '8px', border: '1px solid ' + (pri ? T.primary : T.borderStrong), background: pri ? T.primary : '#fff', color: pri ? '#fff' : T.text, font: 'inherit', fontSize: '14px', fontWeight: 600, cursor: opts.disabled ? 'not-allowed' : 'pointer', opacity: opts.disabled ? 0.5 : 1 } },
      opts.icon ? Ico(opts.icon, 16, opts.iconColor || (pri ? '#fff' : T.muted)) : null, label);
  }
  tabs(defs, cur, onPick) {
    return h('div', { role: 'tablist', style: { display: 'flex', flexWrap: 'wrap', gap: '4px', borderBottom: '1px solid ' + T.border } }, defs.map(function (d) {
      var on = d[0] === cur;
      return h('button', { key: d[0], role: 'tab', 'aria-selected': on, type: 'button', onClick: function () { onPick(d[0]); }, className: 'mx-tab',
        style: { display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '44px', padding: '0 14px', border: 'none', borderBottom: '2px solid ' + (on ? T.primary : 'transparent'), marginBottom: '-1px', background: 'transparent', font: 'inherit', fontSize: '14px', fontWeight: on ? 600 : 400, color: on ? T.primary : T.muted, cursor: 'pointer' } },
        d[1], d[2] != null ? h('span', { style: { fontSize: '11px', fontWeight: 700, minWidth: '18px', padding: '1px 6px', borderRadius: '999px', background: on ? T.primary : T.sky100, color: on ? '#fff' : T.primaryDark } }, d[2]) : null);
    }));
  }
  codeBlock(text, key, label) {
    var self = this, done = this.state.copied === key;
    return h('div', { style: { position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '1px solid ' + T.code } },
      label ? h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 6px 6px 12px', background: '#13286B', color: T.sky200, fontSize: '12px', fontFamily: MONO } }, label,
        h('button', { type: 'button', onClick: function () { self.copy(text, key); }, 'aria-label': 'Sao chép', style: { display: 'inline-flex', alignItems: 'center', gap: '4px', minHeight: '28px', padding: '0 8px', border: '1px solid #2A4A9A', borderRadius: '6px', background: 'transparent', color: done ? '#86EFAC' : T.sky200, font: 'inherit', fontSize: '12px', cursor: 'pointer' } }, Ico(done ? I.check : I.copy, 12), done ? 'Đã chép' : 'Chép')) : null,
      h('pre', { style: { margin: 0, padding: '12px 14px', background: T.code, color: T.codeText, fontFamily: MONO, fontSize: '12.5px', lineHeight: 1.65, overflowX: 'auto', whiteSpace: 'pre' } }, text));
  }
  section(title, body, extra) {
    return h('section', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('h3', { style: { margin: 0, fontSize: '18px', fontWeight: 600, color: T.text, paddingBottom: '6px', borderBottom: '1px solid ' + T.border, display: 'flex', alignItems: 'center', gap: '8px' } }, title, extra || null), body);
  }
  areaHead(title, desc, right) {
    return h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '12px 24px' } },
      h('div', { style: { flex: '1 1 480px', display: 'flex', flexDirection: 'column', gap: '6px' } },
        h('h1', { style: { margin: 0, fontSize: '26px', fontWeight: 700, color: T.text } }, title),
        h('p', { style: { margin: 0, fontSize: '15px', color: T.muted, maxWidth: '78ch', lineHeight: 1.6 } }, desc)),
      right || null);
  }
  scopeBar(note) {
    var self = this, sc = this.state.scope || 'all';
    return h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' } },
      h('span', { style: { fontSize: '13px', color: T.muted, marginRight: '4px' } }, 'Phạm vi:'),
      SCOPES.map(function (x) {
        var on = x[0] === sc;
        return h('button', { key: x[0], type: 'button', 'aria-pressed': on, onClick: function () { self.setState({ scope: x[0] }); }, className: on ? '' : 'mx-btn',
          style: { minHeight: '36px', padding: '0 14px', borderRadius: '999px', border: '1px solid ' + (on ? T.primary : T.borderStrong), background: on ? T.primary : '#fff', color: on ? '#fff' : T.text, font: 'inherit', fontSize: '13px', fontWeight: 600, cursor: 'pointer' } }, x[1]);
      }),
      note ? h('span', { style: { marginLeft: 'auto', fontSize: '13px', color: T.subtle } }, note) : null);
  }
  subnav() {
    var self = this, area = this.state.area || 'repo';
    var open = this.wanted().filter(function (w) { return !w.taker; }).length;
    var items = [['repo', 'Khám phá'], ['sets', 'Bộ skill theo vai trò'], ['wanted', 'Skill đang cần', open]];
    return h('nav', { 'aria-label': 'Skill hub', style: { display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '4px', background: T.sky50, border: '1px solid ' + T.sky100, borderRadius: '10px', alignSelf: 'flex-start' } }, items.map(function (it) {
      var on = it[0] === area;
      return h('button', { key: it[0], type: 'button', 'aria-current': on ? 'page' : undefined, onClick: function () { self.setState({ area: it[0], view: 'list' }); },
        style: { display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '36px', padding: '0 14px', borderRadius: '8px', border: 'none', background: on ? '#fff' : 'transparent', boxShadow: on ? '0 1px 2px rgba(11,19,66,.1), 0 0 0 1px ' + T.sky200 : 'none', font: 'inherit', fontSize: '14px', fontWeight: on ? 600 : 500, color: on ? T.primaryDark : T.muted, cursor: 'pointer' } },
        it[1], it[2] ? h('span', { style: { fontSize: '11px', fontWeight: 700, padding: '1px 7px', borderRadius: '999px', background: T.sky100, color: T.primaryDark } }, it[2]) : null);
    }));
  }
  dialog(title, body, actions, onClose) {
    return h('div', { onClick: onClose, style: { position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(11,19,66,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 16px' } },
      h('div', { role: 'dialog', 'aria-modal': true, 'aria-label': title, onClick: function (e) { e.stopPropagation(); }, style: { width: 'min(560px, 100%)', maxHeight: 'calc(100% - 40px)', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '14px', boxShadow: '0 24px 48px rgba(11,19,66,.2)', overflow: 'hidden' } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid ' + T.border } },
          h('h2', { style: { margin: 0, fontSize: '18px', fontWeight: 700 } }, title),
          h('button', { type: 'button', 'aria-label': 'Đóng', onClick: onClose, style: { width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid ' + T.border, borderRadius: '8px', background: '#fff', cursor: 'pointer' } }, Ico(I.x, 16, T.muted))),
        h('div', { style: { padding: '18px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' } }, body),
        h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: '1px solid ' + T.border, background: T.surface } }, actions)));
  }
  metric(icon, val, label) { return h('span', { title: label, style: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: MONO, fontSize: '13px', color: T.muted } }, Ico(icon, 14, T.subtle), val, h('span', { style: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' } }, ' ' + label)); }

  // ── hub: khám phá ──
  renderList() {
    var self = this, st = this.state, all = this.skills();
    var q = (st.q || '').trim().toLowerCase(), ltab = st.ltab || 'all', f = st.f || {};
    var has = function (k, v) { return !f[k] || !f[k].length || f[k].indexOf(v) >= 0; };
    var rows = all.filter(function (s) {
      if (ltab === 'starred' && !self.starred(s.id)) return false;
      if (ltab === 'mine' && !s.mine) return false;
      if (q && (s.name + ' ' + s.id + ' ' + s.desc + ' ' + s.owner).toLowerCase().indexOf(q) < 0) return false;
      if (f.verified && f.verified.length && !s.verified) return false;
      return has('group', s.group) && has('kind', s.kind) && (!f.model || !f.model.length || f.model.some(function (m) { return s.models.indexOf(m) >= 0; }));
    });
    var sort = st.sort || ['installs', -1];
    var key = function (s) { return sort[0] === 'name' ? s.name : sort[0] === 'installs' ? s.installs : sort[0] === 'stars' ? self.starCount(s) : s.updated.split('/').reverse().join(''); };
    rows = rows.slice().sort(function (a, b) { return key(a) < key(b) ? -sort[1] : key(a) > key(b) ? sort[1] : 0; });
    var toggle = function (k, v) { var nf = Object.assign({}, f), arr = (nf[k] || []).slice(), i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); nf[k] = arr; self.setState({ f: nf }); };
    var countFn = function (k, v) { return all.filter(function (s) { return k === 'model' ? s.models.indexOf(v) >= 0 : k === 'verified' ? s.verified : s[k] === v; }).length; };
    var usedModels = MODELS.filter(function (m) { return countFn('model', m); }).map(function (m) { return [m, m]; });
    var thS = { textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: T.muted, borderBottom: '1px solid ' + T.border, background: T.surface, whiteSpace: 'nowrap' };
    var tdS = { padding: '12px', borderBottom: '1px solid ' + T.border, verticalAlign: 'top', fontSize: '13px' };
    var sortHead = function (k, label) {
      var on = sort[0] === k;
      return h('th', { key: k, 'aria-sort': on ? (sort[1] > 0 ? 'ascending' : 'descending') : 'none', style: thS },
        h('button', { type: 'button', onClick: function () { self.setState({ sort: [k, on ? -sort[1] : (k === 'name' ? 1 : -1)] }); }, style: { display: 'inline-flex', alignItems: 'center', gap: '4px', border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontWeight: 600, color: on ? T.primary : T.muted, cursor: 'pointer' } }, label, Ico(I.sort, 12)));
    };
    var open = function (id) { self.openSkill(id); };
    var authors = all.map(function (s) { return s.author; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).length;

    var active = Object.keys(f).some(function (k) { return f[k].length; }) || q;
    var scopeColor = function (g) { var sc = GROUP_SCOPE[g]; return sc === 'cntt' ? '#0F766E' : sc === 'nv' ? '#2F6BEA' : '#475569'; };
    return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-start' } },
      h('aside', { 'aria-label': 'Bộ lọc', style: { flex: '1 1 260px', maxWidth: '300px', display: 'flex', flexDirection: 'column', gap: '22px' } },
        this.facetBox(f, toggle, 'group', 'Lĩnh vực', GROUPS, countFn),
        this.facetBox(f, toggle, 'kind', 'Loại skill', Object.keys(KIND).map(function (k) { return [k, KIND[k]]; }).filter(function (k) { return countFn('kind', k[0]); }), countFn),
        this.facetBox(f, toggle, 'model', 'Model sử dụng', usedModels, countFn),
        this.facetBox(f, toggle, 'verified', 'Chất lượng', [['yes', 'Đã kiểm chứng']], countFn),
        active ? this.linkBtn('Xoá bộ lọc', function () { self.setState({ f: {}, q: '' }); }) : null),
      h('div', { style: { flex: '999 1 640px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '14px' } },
        this.listBar('Skills', rows.length, this.searchBox(st.q, function (v) { self.setState({ q: v }); }, 'Lọc theo tên', 'Lọc skill theo tên'),
          this.selectEl(sort[0], function (v) { self.setState({ sort: [v, v === 'name' ? 1 : -1] }); }, [['installs', 'Sắp xếp: Cài nhiều nhất'], ['stars', 'Sắp xếp: Được thích nhiều'], ['updated', 'Sắp xếp: Mới cập nhật'], ['name', 'Sắp xếp: Tên A–Z']], 'Sắp xếp', { minHeight: '40px', fontSize: '13px' }),
          this.btn('Chia sẻ skill', function () { self.setState({ reg: self.newReg() }); }, { primary: true, icon: I.plus })),
        h('p', { style: { margin: 0, fontSize: '14px', color: T.muted, lineHeight: 1.6, maxWidth: '86ch' } }, 'Nơi mọi người trong ngân hàng chia sẻ agent skill: file SKILL.md kèm script và tài liệu tham chiếu. Tìm skill phù hợp, cài bằng một lệnh, hoặc đăng skill của bạn để đồng nghiệp dùng lại.'),
        this.tabs([['all', 'Tất cả'], ['starred', 'Yêu thích', Object.keys(st.stars || {}).filter(function (k) { return st.stars[k] && k.indexOf('m:') !== 0; }).length || null], ['mine', 'Tôi chia sẻ']], ltab, function (k) { self.setState({ ltab: k }); }),
        rows.length ? h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: '12px' } }, rows.map(function (s) {
          return h('article', { key: s.id, className: 'mx-card', onClick: function () { open(s.id); }, style: { display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px', border: '1px solid ' + T.border, borderRadius: '12px', background: '#fff', cursor: 'pointer' } },
            self.avatarBox(s.id.slice(0, 2).toUpperCase(), scopeColor(s.group)),
            h('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' } },
              h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '10px' } },
                h('div', { style: { minWidth: 0 } },
                  h('button', { type: 'button', onClick: function (e) { e.stopPropagation(); open(s.id); }, style: { border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontSize: '15px', fontWeight: 600, lineHeight: 1.3, color: T.text, cursor: 'pointer', textAlign: 'left' } }, s.name),
                  h('div', { style: { fontSize: '12px', color: T.subtle, marginTop: '2px', overflowWrap: 'anywhere' } }, s.group + '/' + s.id + ' · v' + s.version)),
                h('span', { style: { marginLeft: 'auto', flex: 'none' } }, self.likeBtn(s.id, s.stars, s.name))),
              h('div', { style: { fontSize: '13px', color: T.muted, lineHeight: 1.5 } }, s.desc),
              h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px', fontSize: '12px', color: T.muted } },
                h('span', { style: { fontWeight: 600, color: T.text } }, GROUP_NAME[s.group]),
                h('span', null, s.author + ' · ' + s.owner),
                self.metaItem(I.download, fmtN(s.installs), 'Lượt cài'),
                self.metaItem(I.clock, s.updated, 'Cập nhật')),
              h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } }, (s.verified ? [self.verified()] : []).concat([KIND[s.kind]].concat(s.models).map(function (m, i) {
                return h('span', { key: m, style: { fontFamily: i ? MONO : 'inherit', fontSize: '12px', padding: '1px 6px', borderRadius: '4px', background: i ? T.sky50 : '#F1F5F9', border: '1px solid ' + (i ? T.sky200 : T.border), color: i ? T.primaryDark : T.muted } }, m);
              })).map(function (x, i) { return h(React.Fragment, { key: i }, x); }))));
        })) : h('div', { style: { padding: '40px', textAlign: 'center', border: '1px dashed ' + T.borderStrong, borderRadius: '10px', color: T.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' } },
          ltab === 'starred' ? 'Bạn chưa đánh dấu yêu thích skill nào.' : 'Không có skill nào khớp. Có thể đây là skill đang cần người viết.',
          h('div', { style: { display: 'flex', gap: '8px' } }, this.btn('Xoá bộ lọc', function () { self.setState({ f: {}, q: '', ltab: 'all' }); }), this.btn('Đề xuất skill này', function () { self.setState({ area: 'wanted', propose: { title: st.q || '', desc: '', set: '' } }); }, { icon: I.pencil })))));
  }

  // ── hub: chi tiết skill ──
  renderDetail() {
    var self = this, st = this.state;
    var s = full(this.skillById(st.sel) || this.skills()[0]);
    var dtab = st.dtab || 'overview', fs = files(s), fi = Math.min(st.file || 0, fs.length - 1), on = this.starred(s.id);
    var cli = 'maas skills add ' + s.group + '/' + s.id;
    var inSets = this.sets().filter(function (g) { return g.skills.indexOf(s.id) >= 0; });
    var body;
    if (dtab === 'overview') {
      body = h('article', { style: { display: 'flex', flexDirection: 'column', gap: '26px', fontSize: '15px', lineHeight: 1.65, color: '#1E293B' } },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          h('h2', { style: { margin: 0, fontSize: '24px', fontWeight: 700, color: T.text } }, s.name),
          h('p', { style: { margin: 0, maxWidth: '75ch' } }, s.desc)),
        this.section('Agent dùng skill này khi nào', h('div', { style: { display: 'flex', gap: '12px', padding: '12px 14px', background: T.sky50, border: '1px solid ' + T.sky200, borderRadius: '8px' } },
          Ico(I.bot, 18, T.primary), h('div', null, h('div', { style: { fontSize: '12px', fontWeight: 600, color: T.primaryDark, marginBottom: '2px' } }, 'description trong SKILL.md'), s.trigger))),
        this.section('Các bước', h('ol', { style: { margin: 0, paddingLeft: '22px', display: 'flex', flexDirection: 'column', gap: '4px' } }, s.steps.map(function (x, i) { return h('li', { key: i }, x); }))),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' } },
          this.section('Đầu ra', h('p', { style: { margin: 0 } }, s.output)),
          this.section('Lưu ý khi dùng', h('div', { style: { display: 'flex', gap: '10px', padding: '12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', fontSize: '14px', color: '#78350F' } }, Ico(I.alert, 16, '#B45309'), s.limits))));
    } else if (dtab === 'files') {
      body = h('div', { style: { display: 'flex', flexWrap: 'wrap', border: '1px solid ' + T.border, borderRadius: '10px', overflow: 'hidden' } },
        h('nav', { 'aria-label': 'Tệp trong gói', style: { flex: '1 1 220px', maxWidth: '280px', background: T.surface, borderRight: '1px solid ' + T.border, padding: '8px', display: 'flex', flexDirection: 'column', gap: '2px' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', fontSize: '13px', fontWeight: 600 } }, Ico(I.folder, 14, T.primary), s.id + '/'),
          fs.map(function (f, i) {
            var cur = i === fi, depth = f[0].split('/').length - 1;
            return h('button', { key: f[0], type: 'button', 'aria-current': cur, onClick: function () { self.setState({ file: i }); }, className: 'mx-facet',
              style: { display: 'flex', alignItems: 'center', gap: '6px', minHeight: '32px', padding: '0 8px 0 ' + (16 + depth * 4) + 'px', border: 'none', borderRadius: '6px', background: cur ? T.sky100 : 'transparent', color: cur ? T.primaryDark : T.text, font: 'inherit', fontFamily: MONO, fontSize: '12.5px', fontWeight: cur ? 600 : 400, cursor: 'pointer', textAlign: 'left' } },
              Ico(I.file, 13, cur ? T.primary : T.subtle), f[0]);
          })),
        h('div', { style: { flex: '999 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '6px 8px 6px 12px', borderBottom: '1px solid ' + T.border, fontFamily: MONO, fontSize: '13px' } },
            h('span', null, fs[fi][0], h('span', { style: { color: T.subtle, fontSize: '12px', marginLeft: '10px' } }, fs[fi][1].split('\n').length + ' dòng')),
            h('button', { type: 'button', onClick: function () { self.copy(fs[fi][1], 'file'); }, className: 'mx-btn', style: { display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '30px', padding: '0 10px', border: '1px solid ' + T.borderStrong, borderRadius: '6px', background: '#fff', font: 'inherit', fontSize: '12px', cursor: 'pointer', color: T.text } }, Ico(st.copied === 'file' ? I.check : I.copy, 12), st.copied === 'file' ? 'Đã chép' : 'Chép nội dung')),
          h('pre', { style: { margin: 0, padding: '14px 16px', fontFamily: MONO, fontSize: '12.5px', lineHeight: 1.7, overflowX: 'auto', color: T.text, background: '#fff', minHeight: '360px' } },
            fs[fi][1].split('\n').map(function (ln, i) {
              return h('div', { key: i, style: { display: 'flex' } }, h('span', { 'aria-hidden': true, style: { width: '36px', flex: 'none', color: '#94A3B8', userSelect: 'none' } }, i + 1), h('span', null, ln || ' '));
            }))));
    } else if (dtab === 'versions') {
      body = h('div', { style: { border: '1px solid ' + T.border, borderRadius: '10px', overflow: 'hidden' } }, s.changelog.map(function (c, i) {
        return h('div', { key: c[0], style: { display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center', padding: '14px 16px', borderTop: i ? '1px solid ' + T.border : 'none', fontSize: '14px' } },
          h('span', { style: { fontFamily: MONO, fontWeight: 600, color: i ? T.muted : T.primaryDark, minWidth: '64px' } }, 'v' + c[0]),
          i === 0 ? self.badge(T.sky100, T.primaryDark, 'Mới nhất') : null,
          h('span', { style: { flex: 1, minWidth: '240px' } }, c[1]),
          h('span', { style: { color: T.muted, fontFamily: MONO, fontSize: '13px' } }, c[2]));
      }));
    } else {
      var threads = [['Gợi ý: thêm ví dụ đầu vào/đầu ra vào SKILL.md', '[Họ tên]', '3 trả lời'], ['Skill không kích hoạt khi câu hỏi viết tắt', '[Họ tên]', '1 trả lời']];
      body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' } }, h('div', { style: { fontSize: '14px', color: T.muted } }, 'Góp ý, báo lỗi, hỏi người chia sẻ'), this.btn('Viết góp ý', function () {}, { icon: I.plus })),
        h('div', { style: { border: '1px solid ' + T.border, borderRadius: '10px', overflow: 'hidden' } }, threads.map(function (t, i) {
          return h('a', { key: i, href: '#', className: 'mx-row', style: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '6px 16px', padding: '14px 16px', borderTop: i ? '1px solid ' + T.border : 'none', textDecoration: 'none', color: T.text, fontSize: '14px' } },
            h('span', { style: { fontWeight: 600 } }, t[0]), h('span', { style: { color: T.muted, fontSize: '13px' } }, t[1] + ' · ' + t[2]));
        })));
    }

    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '20px' } },
      h('div', { style: Object.assign(this.heroStyle(), { marginTop: 0 }) },
        h('nav', { 'aria-label': 'Breadcrumb', style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: T.muted } },
          h('button', { type: 'button', onClick: function () { self.setState({ view: 'list' }); }, style: { display: 'inline-flex', alignItems: 'center', gap: '4px', border: 'none', background: 'transparent', padding: '4px 0', font: 'inherit', color: T.primary, cursor: 'pointer', fontWeight: 600 } }, Ico(I.left, 14), 'Skill hub'),
          h('span', null, '/'), h('span', null, GROUP_NAME[s.group])),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' } },
          this.avatarBox(s.id.slice(0, 2).toUpperCase(), GROUP_SCOPE[s.group] === 'cntt' ? '#0F766E' : GROUP_SCOPE[s.group] === 'nv' ? '#2F6BEA' : '#475569', 36),
          h('h1', { style: { margin: 0, fontSize: '22px', fontWeight: 400 } }, h('span', { style: { color: T.subtle } }, s.group + ' / '), h('span', { style: { fontWeight: 700, color: T.text } }, s.id)),
          this.likeBtn(s.id, s.stars, s.name),
          h('button', { type: 'button', 'aria-label': 'Sao chép skill id', onClick: function () { self.copy(s.group + '/' + s.id, 'id'); }, style: { width: '36px', height: '36px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid ' + T.borderStrong, borderRadius: '6px', background: '#fff', cursor: 'pointer' } }, Ico(st.copied === 'id' ? I.check : I.copy, 16, st.copied === 'id' ? '#166534' : T.muted))),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px' } },
          this.badge(T.sky100, T.primaryDark, GROUP_NAME[s.group]), this.badge('#F1F5F9', '#334155', KIND[s.kind]), this.badge('#F1F5F9', '#334155', 'v' + s.version), s.verified ? this.verified() : null,
          h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: T.muted } }, Ico(I.download, 14, T.subtle), s.installs.toLocaleString('vi-VN') + ' lượt cài'),
          h('span', { style: { fontSize: '13px', color: T.muted } }, 'Chia sẻ bởi ' + s.author + ' · ' + s.owner)),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px' } },
          this.tabs([['overview', 'Tổng quan'], ['files', 'Tệp', fs.length], ['versions', 'Phiên bản'], ['discuss', 'Góp ý', 2]], dtab, function (k) { self.setState({ dtab: k }); }),
          h('div', { style: { display: 'flex', gap: '8px', paddingBottom: '6px' } },
            this.btn('Tải .zip', function () { self.toast('Đã tải ' + s.id + '-v' + s.version + '.zip (prototype).'); }, { icon: I.download }),
            this.btn(st.copied === 'cli' ? 'Đã chép lệnh cài' : 'Cài skill', function () { self.copy(cli, 'cli'); }, { primary: true, icon: st.copied === 'cli' ? I.check : I.plus })))),

      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-start' } },
        h('main', { style: { flex: '999 1 640px', minWidth: 0 } }, body),
        h('aside', { style: { flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' } },
          this.cardBox('Cài đặt', h(React.Fragment, null,
            this.codeBlock(cli, 'cli2', 'CLI'),
            h('div', { style: { fontSize: '13px', color: T.muted, lineHeight: 1.5 } }, 'Hoặc tải .zip và giải nén vào thư mục skills của agent bạn đang dùng. Skill là file văn bản nên có thể đọc và sửa trước khi dùng.'))),
          this.cardBox('Skill này cần', h(React.Fragment, null,
            h('div', { style: { fontSize: '12px', color: T.muted } }, 'Model'),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, s.models.map(function (m) {
              return h('a', { key: m, href: '#', className: 'mx-row', onClick: function (e) { e.preventDefault(); self.openModel(m); }, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minHeight: '38px', padding: '0 10px', border: '1px solid ' + T.border, borderRadius: '8px', textDecoration: 'none', color: T.text } },
                h('span', { style: { fontFamily: MONO, fontSize: '13px' } }, m), h('span', { style: { fontSize: '12px', color: T.primary, fontWeight: 600 } }, 'Xem model →'));
            })),
            h('div', { style: { fontSize: '12px', color: T.muted, marginTop: '4px' } }, 'Tool'),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } }, s.tools.map(function (t) { return h('span', { key: t, style: { fontFamily: MONO, fontSize: '12.5px', padding: '3px 8px', borderRadius: '6px', border: '1px solid ' + T.borderStrong, background: '#fff' } }, t); })),
            h('div', { style: { fontSize: '12px', color: T.subtle, lineHeight: 1.5 } }, 'Hub chỉ chia sẻ file. Quyền dùng model và tool do hệ thống của từng model, tool quyết định.'))),
          inSets.length ? this.cardBox('Có trong bộ skill', h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, inSets.map(function (g) {
            return h('button', { key: g.id, type: 'button', className: 'mx-row', onClick: function () { self.go({ area: 'sets', view: 'list' }); }, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minHeight: '38px', padding: '0 10px', border: '1px solid ' + T.border, borderRadius: '8px', background: '#fff', font: 'inherit', fontSize: '14px', color: T.text, cursor: 'pointer', textAlign: 'left' } },
              h('span', null, g.name), h('span', { style: { fontSize: '12px', color: T.subtle } }, g.unit));
          }))) : null,
          this.cardBox('Thông tin', h(React.Fragment, null,
            this.kvRow('Chia sẻ bởi', s.author), this.kvRow('Đơn vị', s.owner), this.kvRow('Cập nhật', h('span', { style: { fontFamily: MONO } }, s.updated)), this.kvRow('Lượt cài', h('span', { style: { fontFamily: MONO } }, s.installs.toLocaleString('vi-VN'))),
            this.kvRow('Kiểm chứng', s.verified ? 'Đơn vị nghiệp vụ đã xác nhận' : 'Chưa kiểm chứng'))))));
  }

  // ── hub: bộ skill theo vai trò ──
  renderSets() {
    var self = this, st = this.state, sc = st.scope || 'all';
    var sets = this.sets().filter(function (g) { return sc === 'all' || g.scope === sc; });
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px' } },
      this.areaHead('Bộ skill theo vai trò', 'Các skill hay dùng cùng nhau cho một vai trò, do những người làm vai trò đó chọn ra. Người mới cài cả bộ là có ngay cách làm đã được đồng nghiệp đúc kết. Đây là gợi ý, ai cũng cài được.'),
      this.scopeBar(sets.length + ' bộ skill'),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '16px' } }, sets.map(function (g) {
        var cli = 'maas skills add --set ' + g.id, need = self.wanted().filter(function (w) { return w.set === g.id && !w.taker; }).length;
        return h('section', { key: g.id, style: { display: 'flex', flexDirection: 'column', gap: '12px', padding: '18px', border: '1px solid ' + T.border, borderRadius: '12px', background: '#fff' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' } },
            h('div', null, h('h2', { style: { margin: 0, fontSize: '17px', fontWeight: 700 } }, g.name), h('div', { style: { fontSize: '13px', color: T.muted, marginTop: '2px' } }, g.unit + ' · ' + g.skills.length + ' skill')),
            h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: MONO, fontSize: '13px', color: T.muted, whiteSpace: 'nowrap' } }, Ico(I.download, 14, T.subtle), g.installs.toLocaleString('vi-VN'))),
          h('div', { style: { display: 'flex', flexDirection: 'column', border: '1px solid ' + T.border, borderRadius: '8px', overflow: 'hidden' } }, g.skills.map(function (sid, i) {
            var s = self.skillById(sid);
            return h('button', { key: sid, type: 'button', className: 'mx-row', onClick: function () { self.openSkill(sid); }, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', minHeight: '42px', padding: '6px 12px', border: 'none', borderTop: i ? '1px solid ' + T.border : 'none', background: '#fff', font: 'inherit', fontSize: '14px', color: T.text, cursor: 'pointer', textAlign: 'left' } },
              h('span', { style: { fontWeight: 600, color: T.primary } }, s.name), h('span', { style: { fontSize: '12px', color: T.subtle, whiteSpace: 'nowrap' } }, GROUP_NAME[s.group]));
          })),
          self.codeBlock(cli, 'set-' + g.id, 'Cài cả bộ'),
          need ? h('button', { type: 'button', onClick: function () { self.go({ area: 'wanted', wset: g.id }); }, style: { alignSelf: 'flex-start', border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontSize: '13px', fontWeight: 600, color: T.primary, cursor: 'pointer' } }, need + ' skill đang cần cho vai trò này →') : null);
      })));
  }

  // ── hub: skill đang cần ──
  renderWanted() {
    var self = this, st = this.state, votes = st.votes || {}, wset = st.wset || '';
    var list = this.wanted().filter(function (w) { return !wset || w.set === wset; }).slice().sort(function (a, b) { return (b.votes + (votes[b.id] ? 1 : 0)) - (a.votes + (votes[a.id] ? 1 : 0)); });
    var setName = function (id) { var g = self.sets().filter(function (x) { return x.id === id; })[0]; return g ? g.name : 'Dùng chung'; };
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px' } },
      this.areaHead('Skill đang cần', 'Những việc mọi người muốn có skill nhưng chưa ai viết. Bình chọn việc bạn cũng cần, hoặc nhận viết nếu bạn nắm nghiệp vụ. Việc chỉ vài người biết làm được ưu tiên, vì viết thành skill thì cách làm không mất khi người đó chuyển việc.',
        this.btn('Đề xuất skill', function () { self.setState({ propose: { title: '', desc: '', set: wset } }); }, { primary: true, icon: I.plus })),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' } },
        h('label', { htmlFor: 'w-set', style: { fontSize: '13px', color: T.muted } }, 'Vai trò:'),
        h('select', { id: 'w-set', value: wset, onChange: function (e) { self.setState({ wset: e.target.value }); }, style: { minHeight: '40px', padding: '0 10px', border: '1px solid ' + T.borderStrong, borderRadius: '8px', font: 'inherit', fontSize: '14px', background: '#fff', color: T.text } },
          h('option', { value: '' }, 'Tất cả vai trò'), this.sets().map(function (g) { return h('option', { key: g.id, value: g.id }, g.name); })),
        h('span', { style: { marginLeft: 'auto', fontSize: '13px', color: T.subtle } }, list.length + ' đề xuất')),
      list.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, list.map(function (w) {
        var on = !!votes[w.id];
        return h('article', { key: w.id, style: { display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', padding: '14px 16px', border: '1px solid ' + T.border, borderRadius: '12px', background: '#fff' } },
          h('button', { type: 'button', 'aria-pressed': on, 'aria-label': (on ? 'Bỏ bình chọn ' : 'Bình chọn ') + w.title, onClick: function () { var v = Object.assign({}, votes); v[w.id] = !on; self.setState({ votes: v }); },
            style: { flex: 'none', width: '56px', minHeight: '56px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', borderRadius: '10px', border: '1px solid ' + (on ? T.primary : T.borderStrong), background: on ? T.sky50 : '#fff', color: on ? T.primaryDark : T.muted, font: 'inherit', cursor: 'pointer' } },
            Ico(I.up, 16), h('span', { style: { fontFamily: MONO, fontSize: '14px', fontWeight: 600 } }, w.votes + (on ? 1 : 0))),
          h('div', { style: { flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' } },
            h('div', { style: { fontSize: '15px', fontWeight: 600 } }, w.title),
            h('div', { style: { fontSize: '14px', color: T.muted, lineHeight: 1.5 } }, w.desc),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', marginTop: '2px' } },
              self.badge(T.sky100, T.primaryDark, setName(w.set)),
              w.few ? self.badge('#FEF3C7', '#92400E', 'Ít người nắm nghiệp vụ', I.alert) : null,
              h('span', { style: { fontSize: '12px', color: T.subtle } }, 'Đề xuất bởi ' + w.by))),
          w.taker ? h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#166534', fontWeight: 600 } }, Ico(I.pencil, 14, '#166534'), 'Đang viết: ' + w.taker)
            : self.btn('Tôi sẽ viết', function () { self.setState({ reg: self.newReg({ name: w.title, trigger: 'Dùng khi cần ' + w.title.charAt(0).toLowerCase() + w.title.slice(1) + '.', set: w.set, wid: w.id }) }); }, { icon: I.pencil }));
      })) : h('div', { style: { padding: '40px', textAlign: 'center', border: '1px dashed ' + T.borderStrong, borderRadius: '10px', color: T.muted } }, 'Chưa có đề xuất nào cho vai trò này.'));
  }
  renderPropose() {
    var self = this, p = this.state.propose;
    if (!p) return null;
    var close = function () { self.setState({ propose: null }); };
    var set = function (k, v) { var n = Object.assign({}, p, { err: null }); n[k] = v; self.setState({ propose: n }); };
    var inS = { width: '100%', boxSizing: 'border-box', minHeight: '44px', padding: '10px 12px', border: '1px solid ' + T.borderStrong, borderRadius: '8px', font: 'inherit', fontSize: '14px', color: T.text, background: '#fff' };
    var save = function () {
      if ((p.title || '').trim().length < 5) { self.setState({ propose: Object.assign({}, p, { err: 'Nhập tên việc cần skill, tối thiểu 5 ký tự.' }) }); return; }
      var w = { id: 'w' + Date.now(), title: p.title.trim(), desc: (p.desc || '').trim() || 'Chưa có mô tả.', set: p.set, votes: 1, by: 'Bùi Thanh Tùng' };
      self.setState({ wanted: [w].concat(self.wanted()), propose: null, area: 'wanted' });
      self.toast('Đã đăng đề xuất "' + w.title + '".');
    };
    return this.dialog('Đề xuất skill', h(React.Fragment, null,
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        h('label', { htmlFor: 'pp-title', style: { fontSize: '14px', fontWeight: 600 } }, 'Việc cần skill', h('span', { style: { color: '#B91C1C' } }, ' *')),
        h('input', { id: 'pp-title', value: p.title, onChange: function (e) { set('title', e.target.value); }, placeholder: 'Ví dụ: Lập báo cáo giao dịch đáng ngờ', style: Object.assign({}, inS, p.err ? { borderColor: '#DC2626' } : {}) }),
        p.err ? h('div', { role: 'alert', style: { display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13px', color: '#B91C1C' } }, Ico(I.alert, 14), p.err) : null),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        h('label', { htmlFor: 'pp-desc', style: { fontSize: '14px', fontWeight: 600 } }, 'Mô tả'),
        h('textarea', { id: 'pp-desc', rows: 3, value: p.desc, onChange: function (e) { set('desc', e.target.value); }, style: Object.assign({}, inS, { resize: 'vertical' }) }),
        h('div', { style: { fontSize: '12px', color: T.subtle } }, 'Hiện làm thủ công thế nào, ai đang nắm cách làm.')),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        h('label', { htmlFor: 'pp-set', style: { fontSize: '14px', fontWeight: 600 } }, 'Dành cho vai trò'),
        h('select', { id: 'pp-set', value: p.set, onChange: function (e) { set('set', e.target.value); }, style: inS }, h('option', { value: '' }, 'Dùng chung'), this.sets().map(function (g) { return h('option', { key: g.id, value: g.id }, g.name); })))),
      [h(React.Fragment, { key: 'a' }, this.btn('Huỷ', close), this.btn('Đăng đề xuất', save, { primary: true }))], close);
  }

  // ── hub: chia sẻ skill ──
  renderRegister() {
    var self = this, r = this.state.reg;
    if (!r) return null;
    var f = r.f, err = r.err || {};
    var setF = function (k, v) { var nf = Object.assign({}, f); nf[k] = v; var ne = Object.assign({}, err); delete ne[k]; self.setState({ reg: Object.assign({}, r, { f: nf, err: ne }) }); };
    var close = function () { self.setState({ reg: null }); };
    var steps = ['Nguồn gói', 'Thông tin', 'Kiểm tra & đăng'];
    var field = function (k, label, ctrl, help, req) {
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        h('label', { htmlFor: 'rg-' + k, style: { fontSize: '14px', fontWeight: 600 } }, label, req ? h('span', { style: { color: '#B91C1C' } }, ' *') : null),
        ctrl, help ? h('div', { id: 'rg-' + k + '-help', style: { fontSize: '12px', color: T.subtle } }, help) : null,
        err[k] ? h('div', { role: 'alert', style: { display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13px', color: '#B91C1C' } }, Ico(I.alert, 14), err[k]) : null);
    };
    var inS = function (k) { return { width: '100%', boxSizing: 'border-box', minHeight: '44px', padding: '10px 12px', border: '1px solid ' + (err[k] ? '#DC2626' : T.borderStrong), borderRadius: '8px', font: 'inherit', fontSize: '14px', color: T.text, background: '#fff' }; };
    var next = function () {
      var e = {};
      if (r.step === 1 && !f.pkg) e.pkg = r.src === 'zip' ? 'Chọn tệp .zip chứa SKILL.md.' : 'Nhập URL repo Git nội bộ.';
      if (r.step === 2) {
        if (!f.name) e.name = 'Nhập tên hiển thị.';
        if (!/^[a-z0-9-]{3,}$/.test(f.id || '')) e.id = 'ID gồm chữ thường không dấu, số, gạch ngang; tối thiểu 3 ký tự.';
        if (!f.group) e.group = 'Chọn lĩnh vực.';
        if ((f.trigger || '').length < 30) e.trigger = 'Mô tả cần ít nhất 30 ký tự để agent chọn đúng skill.';
      }
      if (Object.keys(e).length) { self.setState({ reg: Object.assign({}, r, { err: e }) }); return; }
      if (r.step < 3) { self.setState({ reg: Object.assign({}, r, { step: r.step + 1, err: {} }) }); return; }
      var ns = { id: f.id, group: f.group, name: f.name, kind: 'script', version: '0.1.0', updated: '10/10/2026', owner: 'Văn phòng Chuyển đổi số', author: 'Bùi Thanh Tùng', installs: 0, stars: 0, mine: true, desc: f.trigger, trigger: f.trigger, models: f.models.length ? f.models : ['llm-noi-bo'], tools: ['fs.read'] };
      var patch = { skills: [ns].concat(self.skills()), reg: Object.assign({}, r, { done: true }) };
      if (f.wid) patch.wanted = self.wanted().filter(function (w) { return w.id !== f.wid; });
      self.setState(patch);
    };
    var content;
    if (r.done) {
      content = h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px', padding: '24px 8px' } },
        h('span', { style: { width: '48px', height: '48px', borderRadius: '999px', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, Ico(I.check, 24, '#166534')),
        h('div', { style: { fontSize: '18px', fontWeight: 700 } }, 'Đã đăng lên hub'),
        h('div', { style: { fontSize: '14px', color: T.muted, maxWidth: '44ch' } }, 'Skill ', h('span', { style: { fontFamily: MONO, color: T.text } }, f.group + '/' + f.id), ' đã có trên hub. Mọi người có thể tìm, cài và góp ý ngay.'),
        h('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } }, this.btn('Đóng', close), this.btn('Xem skill', function () { self.setState({ reg: null }); self.openSkill(f.id); }, { primary: true })));
    } else if (r.step === 1) {
      content = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
        h('div', { role: 'radiogroup', 'aria-label': 'Nguồn gói', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } },
          [['zip', 'Tải tệp .zip', I.upload], ['git', 'Repo Git nội bộ', I.git]].map(function (o) {
            var on = r.src === o[0];
            return h('button', { key: o[0], type: 'button', role: 'radio', 'aria-checked': on, onClick: function () { self.setState({ reg: Object.assign({}, r, { src: o[0], f: Object.assign({}, f, { pkg: '' }), err: {} }) }); },
              style: { display: 'flex', alignItems: 'center', gap: '10px', minHeight: '52px', padding: '0 14px', borderRadius: '8px', border: (on ? '2px solid ' + T.primary : '1px solid ' + T.borderStrong), background: on ? T.sky50 : '#fff', font: 'inherit', fontSize: '14px', fontWeight: 600, color: T.text, cursor: 'pointer' } }, Ico(o[2], 18, on ? T.primary : T.muted), o[1]);
          })),
        r.src === 'zip'
          ? field('pkg', 'Gói skill', h('label', { htmlFor: 'rg-pkg', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '140px', border: '1.5px dashed ' + (err.pkg ? '#DC2626' : T.sky500), borderRadius: '10px', background: T.sky50, cursor: 'pointer', fontSize: '14px', color: T.muted, textAlign: 'center', padding: '12px' } },
              Ico(I.upload, 24, T.primary),
              f.pkg ? h('span', { style: { fontFamily: MONO, color: T.text, fontWeight: 600 } }, f.pkg) : h(React.Fragment, null, h('span', { style: { fontWeight: 600, color: T.text } }, 'Kéo thả tệp .zip vào đây'), h('span', null, 'hoặc bấm để chọn')),
              h('input', { id: 'rg-pkg', type: 'file', accept: '.zip', onChange: function (e) { var x = e.target.files[0]; if (x) setF('pkg', x.name); }, style: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' } })),
              'Gói phải có SKILL.md ở thư mục gốc. Tối đa 20 MB.', true)
          : field('pkg', 'URL repo', h('input', { id: 'rg-pkg', value: f.pkg || '', onChange: function (e) { setF('pkg', e.target.value); }, placeholder: 'https://git.noi-bo/[nhom]/[skill].git', 'aria-describedby': 'rg-pkg-help', style: Object.assign(inS('pkg'), { fontFamily: MONO }) }), 'Hub đọc SKILL.md ở nhánh main và tự cập nhật khi có phiên bản mới.', true),
        h('button', { type: 'button', onClick: function () { setF('pkg', 'goi-skill-mau.zip'); }, style: { alignSelf: 'flex-start', border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontSize: '13px', color: T.primary, cursor: 'pointer', textDecoration: 'underline' } }, 'Dùng gói mẫu (prototype)'));
    } else if (r.step === 2) {
      content = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' } },
          field('name', 'Tên hiển thị', h('input', { id: 'rg-name', value: f.name || '', onChange: function (e) { setF('name', e.target.value); }, style: inS('name') }), null, true),
          field('id', 'Skill ID', h('input', { id: 'rg-id', value: f.id || '', onChange: function (e) { setF('id', e.target.value); }, 'aria-describedby': 'rg-id-help', style: Object.assign(inS('id'), { fontFamily: MONO }) }), 'Ví dụ: doi-chieu-bao-lanh', true)),
        field('group', 'Lĩnh vực', h('select', { id: 'rg-group', value: f.group, onChange: function (e) { setF('group', e.target.value); }, style: inS('group') },
          h('option', { value: '' }, 'Chọn…'), GROUPS.map(function (g) { return h('option', { key: g[0], value: g[0] }, g[1]); })), null, true),
        field('trigger', 'Mô tả: agent dùng skill khi nào', h('textarea', { id: 'rg-trigger', rows: 3, value: f.trigger || '', onChange: function (e) { setF('trigger', e.target.value); }, 'aria-describedby': 'rg-trigger-help', style: Object.assign(inS('trigger'), { resize: 'vertical' }) }),
          'Agent đọc đoạn này để quyết định có dùng skill hay không. Viết rõ "Dùng khi…". Hub lấy sẵn từ description trong SKILL.md nếu có.', true),
        h('fieldset', { style: { border: 'none', margin: 0, padding: 0 } },
          h('legend', { style: { fontSize: '14px', fontWeight: 600, marginBottom: '8px', padding: 0 } }, 'Model skill sử dụng'),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } }, MODELS.map(function (m) {
            var on = f.models.indexOf(m) >= 0;
            return h('label', { key: m, style: { display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid ' + (on ? T.primary : T.borderStrong), background: on ? T.sky50 : '#fff', fontFamily: MONO, fontSize: '13px', cursor: 'pointer' } },
              h('input', { type: 'checkbox', checked: on, onChange: function () { setF('models', on ? f.models.filter(function (x) { return x !== m; }) : f.models.concat([m])); }, style: { margin: 0, accentColor: T.primary } }), m);
          }))),
        field('set', 'Gợi ý cho bộ skill của vai trò', h('select', { id: 'rg-set', value: f.set || '', onChange: function (e) { setF('set', e.target.value); }, style: inS('set') },
          h('option', { value: '' }, 'Không'), this.sets().map(function (g) { return h('option', { key: g.id, value: g.id }, g.name); })), 'Người phụ trách bộ skill sẽ nhận gợi ý của bạn.'));
    } else {
      var chk = ['Có SKILL.md với name và description hợp lệ', 'Không chứa mật khẩu, khoá API, token', 'Không chứa dữ liệu khách hàng (CCCD, số tài khoản)'];
      content = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
        h('div', { style: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: '14px', padding: '14px 16px', background: T.surface, border: '1px solid ' + T.border, borderRadius: '10px' } },
          h('span', { style: { color: T.muted } }, 'Skill'), h('span', { style: { fontFamily: MONO } }, f.group + '/' + f.id),
          h('span', { style: { color: T.muted } }, 'Tên'), h('span', null, f.name),
          h('span', { style: { color: T.muted } }, 'Model'), h('span', { style: { fontFamily: MONO } }, f.models.join(', ') || '—'),
          h('span', { style: { color: T.muted } }, 'Gói'), h('span', { style: { fontFamily: MONO } }, f.pkg)),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          h('div', { style: { fontSize: '14px', fontWeight: 600 } }, 'Kiểm tra tự động'),
          chk.map(function (c) {
            return h('div', { key: c, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', fontSize: '14px', padding: '8px 0', borderBottom: '1px solid ' + T.border } }, c, self.badge('#DCFCE7', '#166534', 'Đạt', I.check));
          })),
        h('div', { style: { fontSize: '13px', color: T.muted, lineHeight: 1.5 } }, 'Skill xuất hiện trên hub ngay sau khi đăng. Nội dung hiển thị cho mọi nhân viên, nên đừng đưa thông tin nhạy cảm vào file.'));
    }
    return h('div', { style: { position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(11,19,66,.45)', display: 'flex', justifyContent: 'flex-end' }, onClick: close },
      h('div', { role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'rg-title', onClick: function (e) { e.stopPropagation(); },
        style: { width: 'min(560px, 100%)', height: '100%', background: '#fff', boxShadow: '-8px 0 24px rgba(11,19,66,.12)', display: 'flex', flexDirection: 'column', animation: 'mx-in .22s ease-out' } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '18px 24px', borderBottom: '1px solid ' + T.border } },
          h('h2', { id: 'rg-title', style: { margin: 0, fontSize: '18px', fontWeight: 700 } }, 'Chia sẻ skill'),
          h('button', { type: 'button', 'aria-label': 'Đóng', onClick: close, style: { width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid ' + T.border, borderRadius: '8px', background: '#fff', cursor: 'pointer' } }, Ico(I.x, 18, T.muted))),
        r.done ? null : h('ol', { 'aria-label': 'Các bước', style: { listStyle: 'none', margin: 0, padding: '14px 24px', display: 'flex', gap: '8px', borderBottom: '1px solid ' + T.border, background: T.sky50 } }, steps.map(function (sname, i) {
          var n = i + 1, cur = n === r.step, done = n < r.step;
          return h('li', { key: n, 'aria-current': cur ? 'step' : undefined, style: { flex: 1, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: cur ? 600 : 400, color: cur || done ? T.text : T.subtle } },
            h('span', { style: { flex: 'none', width: '24px', height: '24px', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, background: done ? T.primary : '#fff', color: done ? '#fff' : cur ? T.primary : T.subtle, border: '2px solid ' + (done || cur ? T.primary : T.borderStrong) } }, done ? Ico(I.check, 12, '#fff') : n), sname);
        })),
        h('div', { style: { flex: 1, overflowY: 'auto', padding: '20px 24px' } }, content),
        r.done ? null : h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '14px 24px', borderTop: '1px solid ' + T.border } },
          r.step > 1 ? this.btn('Quay lại', function () { self.setState({ reg: Object.assign({}, r, { step: r.step - 1, err: {} }) }); }) : this.btn('Huỷ', close),
          this.btn(r.step === 3 ? 'Đăng lên hub' : 'Tiếp tục', next, { primary: true }))));
  }
