// ── MaaS: Models, Playground, API key, Sử dụng & chi phí ─────────────────
// Bám theo cách tổ chức MaaS của GreenNode: danh mục model lọc theo nhà cung cấp /
// loại / use-case, bật–tắt model, Playground dùng chung (có Compare và xuất mã
// "<> API"), API tương thích OpenAI, tính phí theo 1 triệu token, trang Usage.
// Riêng model tài liệu (OCR, KIE, phân loại) có API và trang dùng thử riêng.
// Model ở đây là dịch vụ để gọi trực tiếp qua agentgateway, không phải weight để tải về tự host:
// không hiện hạ tầng triển khai, cây model gốc/fine-tune hay biểu tượng tải về.
var MSTATUS = { Production: { bg: '#DCFCE7', fg: '#166534', icon: I.check }, Beta: { bg: '#FEF3C7', fg: '#92400E', icon: I.clock } };
// price: USD / 1 triệu token (in, out, cache) hoặc USD / trang (page) — số mẫu, cùng đơn vị với bảng giá model của agentgateway
var MODEL_LIST = [
  { id: 'llm-noi-bo', name: 'LLM nội bộ', team: 'nen-tang-ai', teamName: 'Nền tảng AI', type: 'Chat', modes: ['chat', 'completion'], use: ['Tiếng Việt', 'Tác vụ chung', 'Tài chính'], status: 'Production', data: 'Nội bộ', endpoint: 'chat/completions', ctx: '32K', price: { in: 0.3, out: 0.9, cache: 0.08 }, speed: 1,
    desc: 'Mô hình ngôn ngữ dùng chung cho trợ lý nội bộ, tóm tắt và soạn thảo văn bản.', down: [], apps: ['Trợ lý nội bộ', 'Agent tín dụng doanh nghiệp', 'Trợ lý Service Desk'] },
  { id: 'code-llm', name: 'Code LLM', team: 'nen-tang-ai', teamName: 'Nền tảng AI', type: 'Chat', modes: ['chat', 'completion'], use: ['Lập trình', 'Tác vụ chung'], status: 'Production', data: 'Nội bộ', endpoint: 'chat/completions', ctx: '64K', price: { in: 0.45, out: 1.35, cache: 0.11 }, speed: 1.5,
    desc: 'Mô hình sinh và đọc hiểu mã nguồn cho trợ lý lập trình, review code, viết test và SQL.', down: [], apps: ['Trợ lý lập trình (IDE)', 'Agent review code (GitLab)'] },
  { id: 'embed-vi', name: 'Embed-VI', team: 'nen-tang-ai', teamName: 'Nền tảng AI', type: 'Embedding', modes: ['embedding'], use: ['Tiếng Việt', 'Tìm kiếm'], status: 'Production', data: 'Mật', endpoint: 'embeddings', ctx: '8K', price: { in: 0.06 }, speed: 0.2,
    desc: 'Biến văn bản tiếng Việt thành vector để tìm kiếm ngữ nghĩa trên văn bản nội bộ.', down: ['rerank-vi'], apps: ['Tìm kiếm hồ sơ phương án', 'Trợ lý nội bộ'] },
  { id: 'rerank-vi', name: 'Rerank-VI', team: 'nen-tang-ai', teamName: 'Nền tảng AI', type: 'Rerank', modes: ['rerank'], use: ['Tiếng Việt', 'Tìm kiếm'], status: 'Beta', data: 'Mật', endpoint: 'rerank', ctx: '8K', price: { in: 0.08 }, speed: 0.3,
    desc: 'Xếp hạng lại các đoạn văn bản tìm được theo mức liên quan với câu hỏi.', base: 'embed-vi', down: [], apps: ['Trợ lý nội bộ'] },
  { id: 'cppd-ocr', name: 'CPPD-OCR', team: 'ai-xu-ly-tai-lieu', teamName: 'AI Xử lý tài liệu', type: 'Tài liệu', modes: [], use: ['Tiếng Việt', 'Tài liệu & chứng từ'], taskLong: 'OCR · Ảnh → Văn bản', status: 'Production', data: 'Mật', app: 'ocr', endpoint: 'ocr', price: { page: 0.006 },
    desc: 'Nhận dạng chữ in tiếng Việt trên ảnh chứng từ, hợp đồng và tài liệu scan.', down: ['doc-kie', 'doc-classify'], apps: ['Xử lý hồ sơ thanh toán', 'Tìm kiếm hồ sơ phương án', 'Agent tín dụng doanh nghiệp'] },
  { id: 'doc-kie', name: 'Doc-KIE', team: 'ai-xu-ly-tai-lieu', teamName: 'AI Xử lý tài liệu', type: 'Tài liệu', modes: [], use: ['Tiếng Việt', 'Tài liệu & chứng từ', 'Tài chính'], taskLong: 'Trích xuất trường thông tin', status: 'Beta', data: 'Mật', endpoint: 'kie', price: { page: 0.009 },
    desc: 'Trích các trường thông tin (số tiền, bên thụ hưởng, số tài khoản…) từ văn bản đã OCR.', base: 'cppd-ocr', down: [], apps: ['Xử lý hồ sơ thanh toán'] },
  { id: 'doc-classify', name: 'Doc-Classify', team: 'ai-xu-ly-tai-lieu', teamName: 'AI Xử lý tài liệu', type: 'Tài liệu', modes: [], use: ['Tiếng Việt', 'Tài liệu & chứng từ'], taskLong: 'Phân loại chứng từ', status: 'Production', data: 'Mật', app: 'classify', endpoint: 'classify', price: { page: 0.0015 },
    desc: 'Nhận diện loại chứng từ từ văn bản đã OCR để định tuyến xử lý.', base: 'cppd-ocr', down: [], apps: ['Xử lý hồ sơ thanh toán'] }
];
var MLIKES = { 'llm-noi-bo': 312, 'code-llm': 268, 'embed-vi': 121, 'rerank-vi': 44, 'cppd-ocr': 187, 'doc-kie': 73, 'doc-classify': 59 };
var TYPE_COLOR = { 'Chat': '#2F6BEA', 'Embedding': '#0F766E', 'Rerank': '#475569', 'Tài liệu': '#0369A1' };
var ENABLED0 = { 'llm-noi-bo': true, 'code-llm': true, 'embed-vi': true, 'cppd-ocr': true };
var GW_BASE = 'https://[gateway-host]/v1';
var NAV = [['models', 'Models'], ['playground', 'Playground'], ['skills', 'Skills'], ['mcp', 'MCP & tools'], ['keys', 'Ngân sách & key'], ['usage', 'Sử dụng & chi phí']];
var PG_MODES = [['chat', 'Chat'], ['completion', 'Completion'], ['embedding', 'Embedding'], ['rerank', 'Rerank']];
var PG_PARAMS = {
  chat: [['past', 'Past messages included', 1, 20, 1, 10, 'Số tin nhắn gần nhất model được nhớ'], ['max', 'Maximum token output', 1, 10000, 1, 800], ['temp', 'Temperature', 0, 2, 0.1, 1, 'Thấp: ổn định, hợp hỏi đáp. Cao: sáng tạo hơn'], ['topp', 'Top P', 0, 1, 0.05, 0.7], ['pres', 'Presence Penalty', -2, 2, 0.1, 0, 'Giảm lặp từ']],
  completion: [['max', 'Maximum token output', 1, 10000, 1, 2048], ['temp', 'Temperature', 0, 2, 0.1, 1], ['topp', 'Top P', 0, 1, 0.05, 0.7]],
  embedding: [], rerank: []
};
var ROLES = [['admin', 'Quản trị nền tảng'], ['dept', 'Quản trị phòng'], ['member', 'Thành viên']];
var WHO = {
  admin: { name: 'Bùi Thanh Tùng', unit: 'Văn phòng Chuyển đổi số', dept: 'cds', ini: 'BT' },
  dept: { name: 'Phạm Đức Long', unit: 'Phòng Phát triển Kênh số', dept: 'kenhso', ini: 'PL' },
  member: { name: 'Vũ Hải Nam', unit: 'Phòng Phát triển Kênh số', dept: 'kenhso', ini: 'VN' }
};
// budget: USD / tháng
var SEED_DEPTS = [
  { id: 'kenhso', name: 'Phòng Phát triển Kênh số', block: 'Khối CNTT', admin: 'Phạm Đức Long', budget: 400, members: ['Phạm Đức Long', 'Vũ Hải Nam', 'Đỗ Ngọc Hân', 'Lý Gia Bảo'] },
  { id: 'thanhtoan', name: 'Phòng Thanh toán', block: 'Khối Vận hành', admin: 'Trần Quốc Bảo', budget: 300, members: ['Trần Quốc Bảo', 'Mai Thuỳ Dương'] },
  { id: 'thamdinh', name: 'Phòng Thẩm định tín dụng', block: 'Khối Tín dụng', admin: 'Nguyễn Minh Anh', budget: 150, members: ['Nguyễn Minh Anh', 'Đặng Mai Phương', 'Hồ Sỹ Khang'] },
  { id: 'cds', name: 'Văn phòng Chuyển đổi số', block: 'Khối Chiến lược', admin: 'Bùi Thanh Tùng', budget: 120, members: ['Bùi Thanh Tùng', 'Lê Văn Khôi'] },
  { id: 'aml', name: 'Phòng Phòng chống rửa tiền', block: 'Khối Tuân thủ', admin: 'Lê Thu Hà', budget: 60, members: ['Lê Thu Hà'] }
];
// limit: USD / tháng. share: phần chi phí tháng của toàn ngân hàng do key này gây ra (để số liệu các trang khớp nhau)
var ALLM = ['llm-noi-bo', 'code-llm', 'embed-vi', 'rerank-vi', 'cppd-ocr', 'doc-kie', 'doc-classify'];
var SEED_KEYS = [
  { id: 'k01', dept: 'kenhso', owner: null, name: 'tro-ly-lap-trinh-prod', mask: 'mk-live-••••••••a41f', limit: 180, share: 0.2, models: ['code-llm', 'llm-noi-bo', 'embed-vi'], created: '12/06/2026', last: '11/10/2026', exp: 'Không hết hạn', status: 'active' },
  { id: 'k02', dept: 'kenhso', owner: 'Phạm Đức Long', name: 'long-ide', mask: 'mk-live-••••••••9c20', limit: 40, share: 0.045, models: ['code-llm', 'llm-noi-bo'], created: '03/07/2026', last: '11/10/2026', exp: '03/07/2027', status: 'active' },
  { id: 'k03', dept: 'kenhso', owner: 'Vũ Hải Nam', name: 'nam-ide', mask: 'mk-live-••••••••5be7', limit: 40, share: 0.12, models: ['code-llm', 'llm-noi-bo'], created: '20/09/2026', last: '11/10/2026', exp: '19/12/2026', status: 'active' },
  { id: 'k04', dept: 'kenhso', owner: 'Vũ Hải Nam', name: 'nam-thu-nghiem-ocr', mask: '—', limit: 15, share: 0, models: ['cppd-ocr'], created: '10/10/2026', last: '—', exp: 'sau 30 ngày', status: 'pending' },
  { id: 'k05', dept: 'kenhso', owner: 'Đỗ Ngọc Hân', name: 'han-agent-review', mask: 'mk-live-••••••••77aa', limit: 25, share: 0.088, models: ['code-llm'], created: '01/08/2026', last: '09/10/2026', exp: '01/08/2027', status: 'active' },
  { id: 'k06', dept: 'kenhso', owner: null, name: 'demo-hoi-thao', mask: 'mk-test-••••••••01d3', limit: 20, share: 0, models: ALLM, created: '02/05/2026', last: '14/05/2026', exp: '—', status: 'revoked' },
  { id: 'k07', dept: 'thanhtoan', owner: null, name: 'ho-so-thanh-toan-prod', mask: 'mk-live-••••••••3e11', limit: 220, share: 0.27, models: ['cppd-ocr', 'doc-kie', 'doc-classify', 'llm-noi-bo'], created: '15/05/2026', last: '11/10/2026', exp: 'Không hết hạn', status: 'active' },
  { id: 'k08', dept: 'thanhtoan', owner: 'Mai Thuỳ Dương', name: 'duong-tra-soat', mask: 'mk-live-••••••••c0d4', limit: 30, share: 0.03, models: ['llm-noi-bo', 'cppd-ocr'], created: '22/08/2026', last: '10/10/2026', exp: '22/08/2027', status: 'active' },
  { id: 'k09', dept: 'thamdinh', owner: null, name: 'agent-tin-dung-prod', mask: 'mk-live-••••••••8f52', limit: 100, share: 0.14, models: ['llm-noi-bo', 'embed-vi', 'rerank-vi', 'cppd-ocr'], created: '30/06/2026', last: '11/10/2026', exp: 'Không hết hạn', status: 'active' },
  { id: 'k10', dept: 'thamdinh', owner: 'Đặng Mai Phương', name: 'phuong-tom-tat-ho-so', mask: 'mk-live-••••••••12ce', limit: 30, share: 0.035, models: ['llm-noi-bo', 'cppd-ocr'], created: '18/09/2026', last: '11/10/2026', exp: '17/12/2026', status: 'active' },
  { id: 'k11', dept: 'cds', owner: null, name: 'tro-ly-noi-bo-prod', mask: 'mk-live-••••••••b7e0', limit: 90, share: 0.06, models: ['llm-noi-bo', 'embed-vi', 'rerank-vi'], created: '12/06/2026', last: '11/10/2026', exp: 'Không hết hạn', status: 'active' },
  { id: 'k12', dept: 'aml', owner: 'Lê Thu Hà', name: 'ha-sang-loc', mask: 'mk-live-••••••••44b9', limit: 40, share: 0.012, models: ['llm-noi-bo', 'embed-vi'], created: '05/09/2026', last: '08/10/2026', exp: '05/09/2027', status: 'active' }
];
// Dữ liệu sử dụng mẫu, sinh ổn định theo (model, ngày) để các trang khớp số với nhau
var USE_BASE = { 'llm-noi-bo': [5200, 900, 380], 'code-llm': [2100, 1500, 520], 'embed-vi': [8800, 420, 0], 'rerank-vi': [900, 600, 0], 'cppd-ocr': [1900, 0, 0], 'doc-kie': [420, 0, 0], 'doc-classify': [1500, 0, 0] };
function usageDay(m, d) {            // d = số ngày trước hôm nay
  var b = USE_BASE[m.id], wd = (d + 6) % 7, wk = (wd === 0 || wd === 1) ? 0.35 : 1;
  var wob = 0.78 + 0.22 * Math.sin(d * 1.7 + m.id.length) + 0.12 * Math.cos(d * 0.6 + m.id.charCodeAt(0));
  var req = Math.round(b[0] * wk * wob * (1 - d * 0.004));
  if (m.price.page) { var pages = Math.round(req * 2.4); return { req: req, pages: pages, tin: 0, tout: 0, cache: 0, cost: pages * m.price.page }; }
  var tin = req * b[1], tout = req * b[2], cache = m.price.cache ? Math.round(tin * 0.3) : 0;
  return { req: req, pages: 0, tin: tin, tout: tout, cache: cache, cost: ((tin - cache) * m.price.in + cache * (m.price.cache || 0) + tout * (m.price.out || 0)) / 1e6 };
}
function usageSum(m, days) {
  var t = { req: 0, pages: 0, tin: 0, tout: 0, cache: 0, cost: 0 };
  for (var d = 0; d < days; d++) { var u = usageDay(m, d); for (var k in t) t[k] += u[k]; }
  return t;
}
function fmtN(n) { return Math.round(n).toLocaleString('vi-VN'); }
function fmtUsd(n) { return !n ? '$0' : n < 0.01 ? '$' + n.toFixed(5) : n < 1 ? '$' + n.toFixed(3) : n < 100 ? '$' + n.toFixed(2) : '$' + Math.round(n).toLocaleString('en-US'); }
function usdRate(n) { return '$' + (n < 0.01 ? String(n) : n.toFixed(2)); }
function fmtTok(n) { return n >= 1e9 ? (n / 1e9).toFixed(1).replace('.', ',') + ' tỷ' : n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' tr' : fmtN(n); }
function priceText(m) { return m.price.page ? usdRate(m.price.page) + ' / trang' : usdRate(m.price.in) + (m.price.out ? ' / ' + usdRate(m.price.out) : ''); }
function priceUnit(m) { return m.price.page ? 'mỗi trang tài liệu' : m.price.out ? 'input / output · mỗi 1 triệu token' : 'input · mỗi 1 triệu token'; }
function tok(s) { return Math.max(1, Math.ceil((s || '').length / 4)); }
function mockAnswer(m, msg) {
  var code = m.id === 'code-llm';
  if (/mật/i.test(msg)) return 'Không. Dữ liệu mức "Mật" chỉ được trao đổi qua kênh nội bộ đã mã hoá và phải che thông tin nhạy cảm trước khi chia sẻ. [Trích dẫn: Quy chế ATTT, Điều —]';
  if (/hạn mức/i.test(msg)) return 'Hạn mức phê duyệt phụ thuộc phân cấp chi nhánh và loại khách hàng. [Số liệu cụ thể lấy từ văn bản phân cấp hiện hành — prototype không có dữ liệu thật.]';
  if (code || /sql|code|hàm|python|java/i.test(msg)) return code
    ? 'def tinh_lai(goc: float, lai_suat_nam: float, so_ngay: int) -> float:\n    """Lãi đơn theo ngày, cơ sở 365."""\n    return goc * lai_suat_nam / 365 * so_ngay\n\nHàm trên tính lãi đơn. Cần lãi kép hoặc cơ sở 360 thì báo tôi sửa.'
    : 'Tôi có thể phác thảo đoạn mã cho yêu cầu này, nhưng với tác vụ lập trình bạn nên dùng code-llm: model đó được tinh chỉnh cho mã nguồn và có ngữ cảnh dài hơn.';
  return code ? 'Câu hỏi này không liên quan đến mã nguồn. Tôi trả lời ngắn gọn: đây là phản hồi mô phỏng của prototype.' : 'Đây là câu trả lời mô phỏng của prototype. Khi nối backend, nội dung sẽ được stream từ model qua gateway MaaS, kèm số token và độ trễ thật.';
}
//@@METHODS
  // ── app: vòng đời & điều hướng ──
  componentDidMount() {
    this._timers = []; this._pgT = [];
    var demo = [['u', 'Dữ liệu "Mật" có được gửi qua email không?']];
    var ans = function (id, ms) { var m = MODEL_LIST.filter(function (x) { return x.id === id; })[0], t = mockAnswer(m, demo[0][1]); return demo.concat([['a', t, { ms: ms, tin: 46, tout: tok(t) }]]); };
    var R = {
      '#models': { page: 'models' }, '#toggle': { page: 'models', tgl: { q: '', type: '', draft: {} } },
      '#model': { page: 'model', mid: 'cppd-ocr' }, '#model-try': { page: 'model', mid: 'cppd-ocr', mtab: 'try', grKey: 'ocr' }, '#model-api': { page: 'model', mid: 'llm-noi-bo', mtab: 'api' },
      '#playground': { page: 'playground', pg: Object.assign(this.pgNew('chat'), { a: ans('llm-noi-bo', 1180) }) },
      '#compare': { page: 'playground', pg: Object.assign(this.pgNew('chat'), { compare: true, a: ans('llm-noi-bo', 1180), b: ans('code-llm', 1720) }) },
      '#keys': { page: 'keys' }, '#keys-dept': { page: 'keys', role: 'dept' }, '#keys-issue': { page: 'keys', role: 'dept', kDlg: { dept: 'kenhso', kind: 'member', owner: 'Lý Gia Bảo', name: 'bao-ide', limit: '30', models: ['code-llm', 'llm-noi-bo'], exp: '90' } }, '#keys-me': { page: 'keys', role: 'member' }, '#usage': { page: 'usage' },
      '#mcp': { page: 'mcp' }, '#mcp-server': { page: 'mcpd', mcpId: 'ho-so-tin-dung', mcpTab: 'tools' }, '#mcp-access': { page: 'mcpd', mcpId: 'tra-soat-thanh-toan', mcpTab: 'access' }, '#mcp-gateway': { page: 'mcp', mcpLtab: 'gw' },
      '#mcp-add': { page: 'mcp', mcpDlg: { id: 'kho-du-lieu', name: 'Kho dữ liệu báo cáo', desc: 'Truy vấn các bảng báo cáo đã được phê duyệt.', team: 'Khối CNTT', host: 'mcp-dwh.du-lieu.svc.cluster.local', port: '8080', proto: 'http' } }, '#mcp-member': { page: 'mcpd', role: 'member', mcpId: 'gitlab-noi-bo', mcpTab: 'connect' },
      '#skills': { page: 'skills' }, '#detail': { page: 'skills', view: 'detail', sel: 'doi-chieu-unc' }, '#files': { page: 'skills', view: 'detail', sel: 'doi-chieu-unc', dtab: 'files' },
      '#sets': { page: 'skills', area: 'sets' }, '#wanted': { page: 'skills', area: 'wanted' }, '#register': { page: 'skills', reg: this.newReg() }
    };
    this.setState(R[location.hash] || { page: 'models' });
    var self = this;
    this._key = function (e) {
      if (e.key !== 'Escape') return;
      var s = self.state;
      if (s.pgApi) self.setState({ pgApi: false }); else if (s.mcpAsk) self.setState({ mcpAsk: null }); else if (s.mcpDlg) self.setState({ mcpDlg: null }); else if (s.tgl) self.setState({ tgl: null }); else if (s.kDlg) self.setState({ kDlg: null }); else if (s.kEdit) self.setState({ kEdit: null }); else if (s.dDlg) self.setState({ dDlg: null }); else if (s.ask) self.setState({ ask: null }); else if (s.rotate) self.setState({ rotate: null }); else if (s.revoke) self.setState({ revoke: null });
      else if (s.propose) self.setState({ propose: null }); else if (s.reg) self.setState({ reg: null });
    };
    document.addEventListener('keydown', this._key);
  }
  componentWillUnmount() { this.grStop(); this.pgStop(); document.removeEventListener('keydown', this._key); clearTimeout(this._copyT); clearTimeout(this._toastT); clearTimeout(this._mcpT); }
  go(patch) { this.setState(patch); try { window.scrollTo(0, 0); } catch (e) {} }
  modelById(id) { return MODEL_LIST.filter(function (x) { return x.id === id; })[0]; }
  openModel(id, tab) {
    var m = this.modelById(id);
    if (!m) return;
    this.grStop();
    this.go({ page: 'model', mid: id, mtab: tab || 'card', grKey: m.app || null, grVals: null, grPending: {}, grRunning: false, grToast: null, grAcc: {}, grLast: null, grShowApi: false, grShowCfg: false });
  }
  openSkill(id) { this.go({ page: 'skills', area: 'repo', view: 'detail', sel: id, dtab: 'overview', file: 0 }); }
  openPlayground(id) {
    var m = this.modelById(id), pg = this.pgNew(m.modes[0]);
    pg.model = id;
    this.pgStop();
    this.go({ page: 'playground', pg: pg });
  }
  enabled() { return this.state.enabled || ENABLED0; }
  isOn(id) { return !!this.enabled()[id]; }
  setEnabled(id, on) {
    if (this.role() !== 'admin') { this.toast('Chỉ quản trị nền tảng bật hoặc tắt model cho toàn ngân hàng.'); return; }
    if (on && !this.hasKey()) { this.toast('Cần có API key đang hoạt động trước khi bật model.'); return; }
    var e = Object.assign({}, this.enabled()); e[id] = on;
    this.setState({ enabled: e });
    this.toast((on ? 'Đã bật ' : 'Đã tắt ') + id + '.');
  }

  // ── app: thành phần dùng chung ──
  cardBox(title, body) {
    return h('section', { style: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px', border: '1px solid ' + T.border, borderRadius: '10px', background: '#fff' } },
      h('h2', { style: { margin: 0, fontSize: '14px', fontWeight: 600, color: T.text } }, title), body);
  }
  kvRow(k, v) { return h('div', { key: k, style: { display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '13px' } }, h('span', { style: { color: T.muted } }, k), h('span', { style: { textAlign: 'right' } }, v)); }
  statTile(label, val, note) {
    return h('div', { key: label, style: { flex: '1 1 180px', padding: '14px 16px', border: '1px solid ' + T.border, borderRadius: '10px', background: '#fff' } },
      h('div', { style: { fontSize: '13px', color: T.muted } }, label),
      h('div', { style: { fontFamily: MONO, fontSize: '24px', fontWeight: 500, marginTop: '4px', color: T.text } }, val),
      note ? h('div', { style: { fontSize: '12px', color: T.subtle, marginTop: '2px' } }, note) : null);
  }
  facetBox(f, onToggle, k, title, opts, countFn) {
    return h('fieldset', { key: k, style: { border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' } },
      h('legend', { style: { fontSize: '13px', fontWeight: 700, color: T.text, marginBottom: '8px', padding: 0 } }, title),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } }, opts.map(function (o) {
        var on = (f[k] || []).indexOf(o[0]) >= 0;
        return h('button', { key: o[0], type: 'button', 'aria-pressed': on, onClick: function () { onToggle(k, o[0]); }, className: on ? '' : 'mx-btn',
          style: { display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '32px', padding: '0 10px', borderRadius: '8px', border: '1px solid ' + (on ? T.primary : T.border), background: on ? T.primary : '#fff', color: on ? '#fff' : T.text, font: 'inherit', fontSize: '13px', cursor: 'pointer' } },
          o[1], h('span', { style: { fontFamily: MONO, fontSize: '11px', color: on ? 'rgba(255,255,255,.8)' : T.subtle } }, countFn(k, o[0])));
      })));
  }
  // dải tiêu đề của trang chi tiết (kiểu Hugging Face): nền nhạt tràn hết khung nội dung
  heroStyle() { return { display: 'flex', flexDirection: 'column', gap: '12px', margin: '-24px -32px 0', padding: '20px 32px 0', background: 'linear-gradient(180deg, #EEF3FE, #F8FAFF)', borderBottom: '1px solid ' + T.border }; }
  avatarBox(text, color, size) {
    return h('span', { 'aria-hidden': true, style: { flex: 'none', width: (size || 40) + 'px', height: (size || 40) + 'px', borderRadius: '10px', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: (size || 40) > 44 ? '16px' : '13px', fontWeight: 600 } }, text);
  }
  likeBtn(key, base, label) {
    var self = this, on = this.starred(key), n = base + (on ? 1 : 0);
    return h('button', { type: 'button', 'aria-pressed': on, 'aria-label': (on ? 'Bỏ thích ' : 'Thích ') + label, onClick: function (e) { e.stopPropagation(); self.toggleStar(key); },
      style: { display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '32px', padding: '0 10px', borderRadius: '8px', border: '1px solid ' + (on ? '#FCD34D' : T.borderStrong), background: on ? '#FFFBEB' : '#fff', font: 'inherit', fontSize: '13px', color: on ? '#92400E' : T.muted, cursor: 'pointer' } },
      Ico(I.star, 14, on ? '#D97706' : T.subtle), h('span', { style: { fontFamily: MONO } }, fmtN(n)));
  }
  listBar(title, count, search, sortEl, right) {
    return h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 14px' } },
      h('h1', { style: { margin: 0, fontSize: '22px', fontWeight: 700 } }, title), h('span', { style: { fontFamily: MONO, fontSize: '14px', color: T.subtle } }, count),
      search, h('div', { style: { marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' } }, sortEl, right));
  }
  metaItem(icon, text, title) { return h('span', { title: title, style: { display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' } }, icon ? Ico(icon, 13, T.subtle) : null, text); }
  searchBox(value, onChange, placeholder, label) {
    return h('label', { style: { position: 'relative', flex: '0 1 320px', display: 'block' } },
      h('span', { style: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' } }, label),
      h('span', { style: { position: 'absolute', left: '12px', top: '12px', color: T.subtle, display: 'flex' } }, Ico(I.search, 16)),
      h('input', { type: 'search', value: value || '', placeholder: placeholder, onChange: function (e) { onChange(e.target.value); },
        style: { width: '100%', boxSizing: 'border-box', minHeight: '40px', padding: '0 12px 0 36px', border: '1px solid ' + T.borderStrong, borderRadius: '8px', font: 'inherit', fontSize: '14px', color: T.text, background: '#fff' } }));
  }
  mstatus(s) { var x = MSTATUS[s]; return this.badge(x.bg, x.fg, s, x.icon); }
  linkBtn(label, onClick) { return h('button', { type: 'button', onClick: onClick, style: { border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontSize: '14px', fontWeight: 600, color: T.primary, cursor: 'pointer', textAlign: 'left' } }, label); }
  switchEl(on, onChange, label, disabled) {
    return h('button', { type: 'button', role: 'switch', 'aria-checked': on, 'aria-label': label, disabled: disabled, onClick: function (e) { e.stopPropagation(); onChange(); },
      style: { position: 'relative', flex: 'none', width: '44px', height: '24px', borderRadius: '999px', border: 'none', padding: 0, background: disabled ? '#E2E8F0' : on ? T.primary : '#CBD5E1', cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background-color .18s' } },
      h('span', { style: { position: 'absolute', top: '3px', left: '3px', width: '18px', height: '18px', borderRadius: '999px', background: '#fff', boxShadow: '0 1px 2px rgba(11,19,66,.25)', transform: on ? 'translateX(20px)' : 'none', transition: 'transform .18s ease' } }));
  }
  typeBadge(m) { return this.badge(T.sky100, T.primaryDark, m.type); }
  selectEl(value, onChange, opts, label, style) {
    return h('select', { 'aria-label': label, value: value, onChange: function (e) { onChange(e.target.value); }, style: Object.assign({ minHeight: '40px', padding: '0 10px', border: '1px solid ' + T.borderStrong, borderRadius: '8px', font: 'inherit', fontSize: '14px', background: '#fff', color: T.text }, style || {}) },
      opts.map(function (o) { return h('option', { key: o[0], value: o[0], disabled: o[2] }, o[1]); }));
  }

  // ── models: danh sách ──
  renderModels() {
    var self = this, st = this.state, all = MODEL_LIST, f = st.mf || {}, q = (st.mq || '').trim().toLowerCase(), tab = st.mltab || 'all', sort = st.msort || 'used';
    var has = function (k, v) { return !f[k] || !f[k].length || f[k].indexOf(v) >= 0; };
    var rows = all.filter(function (m) {
      if (tab === 'on' && !self.isOn(m.id)) return false;
      if (q && (m.name + ' ' + m.id + ' ' + m.desc + ' ' + m.type).toLowerCase().indexOf(q) < 0) return false;
      if (f.use && f.use.length && !f.use.some(function (u) { return m.use.indexOf(u) >= 0; })) return false;
      return has('teamName', m.teamName) && has('type', m.type) && has('status', m.status) && has('data', m.data);
    });
    var u30 = {}; all.forEach(function (m) { u30[m.id] = usageSum(m, 30); });
    var key = { used: function (m) { return -u30[m.id].req; }, liked: function (m) { return -(MLIKES[m.id] + (self.starred('m:' + m.id) ? 1 : 0)); }, name: function (m) { return m.name; }, price: function (m) { return m.price.page ? 1e9 + m.price.page : m.price.in; } }[sort];
    rows = rows.slice().sort(function (x, y) { return key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0; });
    var uniq = function (k) { return all.map(function (m) { return m[k]; }).filter(function (x, i, arr) { return arr.indexOf(x) === i; }).map(function (x) { return [x, x]; }); };
    var uses = []; all.forEach(function (m) { m.use.forEach(function (u) { if (uses.indexOf(u) < 0) uses.push(u); }); });
    var toggle = function (k, v) { var nf = Object.assign({}, f), arr = (nf[k] || []).slice(), i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); nf[k] = arr; self.setState({ mf: nf }); };
    var countFn = function (k, v) { return all.filter(function (m) { return k === 'use' ? m.use.indexOf(v) >= 0 : m[k] === v; }).length; };
    var onCount = all.filter(function (m) { return self.isOn(m.id); }).length;
    var active = Object.keys(f).some(function (k) { return f[k].length; }) || q;

    return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-start' } },
      h('aside', { 'aria-label': 'Bộ lọc', style: { flex: '1 1 260px', maxWidth: '300px', display: 'flex', flexDirection: 'column', gap: '22px' } },
        this.facetBox(f, toggle, 'type', 'Loại model', uniq('type'), countFn),
        this.facetBox(f, toggle, 'use', 'Use-case', uses.map(function (u) { return [u, u]; }), countFn),
        this.facetBox(f, toggle, 'teamName', 'Nhà cung cấp', uniq('teamName'), countFn),
        this.facetBox(f, toggle, 'status', 'Trạng thái', uniq('status'), countFn),
        this.facetBox(f, toggle, 'data', 'Mức dữ liệu', uniq('data'), countFn),
        active ? this.linkBtn('Xoá bộ lọc', function () { self.setState({ mf: {}, mq: '' }); }) : null),
      h('div', { style: { flex: '999 1 640px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '14px' } },
        this.listBar('Models', rows.length, this.searchBox(st.mq, function (v) { self.setState({ mq: v }); }, 'Lọc theo tên', 'Lọc model theo tên'),
          this.selectEl(sort, function (v) { self.setState({ msort: v }); }, [['used', 'Sắp xếp: Dùng nhiều nhất'], ['liked', 'Sắp xếp: Được thích nhiều'], ['price', 'Sắp xếp: Giá thấp nhất'], ['name', 'Sắp xếp: Tên A–Z']], 'Sắp xếp', { minHeight: '40px', fontSize: '13px' }),
          this.btn('Bật/Tắt model', function () { self.setState({ tgl: { q: '', type: '', draft: {} } }); }, { primary: true, icon: I.sort })),
        h('p', { style: { margin: 0, fontSize: '14px', color: T.muted, lineHeight: 1.6, maxWidth: '86ch' } }, 'Các mô hình AI dùng chung cho toàn ngân hàng, cung cấp dưới dạng dịch vụ và gọi trực tiếp qua agentgateway. Bật model bạn cần, thử trong Playground, rồi tích hợp bằng API key. Không có weight để tải về, không phải tự host hay vận hành model.'),
        this.hasKey() ? null : h('div', { role: 'alert', style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', padding: '12px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', fontSize: '14px', color: '#78350F' } },
          Ico(I.alert, 16, '#B45309'), h('span', { style: { flex: 1 } }, 'Bạn chưa có API key đang hoạt động để gọi model.'), this.btn('Xem key', function () { self.go({ page: 'keys' }); })),
        this.tabs([['all', 'Tất cả'], ['on', 'Đang bật', onCount]], tab, function (k) { self.setState({ mltab: k }); }),
        rows.length ? h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: '12px' } }, rows.map(function (m) {
          var on = self.isOn(m.id), u = u30[m.id];
          return h('article', { key: m.id, className: 'mx-card', onClick: function () { self.openModel(m.id); }, style: { display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px', border: '1px solid ' + T.border, borderRadius: '12px', background: '#fff', cursor: 'pointer' } },
            self.avatarBox(m.id.slice(0, 2).toUpperCase(), TYPE_COLOR[m.type]),
            h('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                h('button', { type: 'button', onClick: function (e) { e.stopPropagation(); self.openModel(m.id); }, style: { border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontSize: '15px', lineHeight: 1.3, cursor: 'pointer', textAlign: 'left', color: T.text, minWidth: 0, overflowWrap: 'anywhere' } }, h('span', { style: { color: T.subtle } }, m.team + '/'), h('span', { style: { fontWeight: 600 } }, m.id)),
                h('span', { style: { marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '8px', flex: 'none' } }, h('span', { style: { fontSize: '12px', color: on ? '#166534' : T.subtle, fontWeight: on ? 600 : 400 } }, on ? 'Đang bật' : 'Tắt'), self.switchEl(on, function () { self.setEnabled(m.id, !on); }, (on ? 'Tắt ' : 'Bật ') + m.name))),
              h('div', { style: { fontSize: '13px', color: T.muted, lineHeight: 1.5 } }, m.desc),
              h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px', fontSize: '12px', color: T.muted } },
                h('span', { style: { fontWeight: 600, color: T.text } }, m.type),
                h('span', { style: { fontFamily: MONO }, title: priceUnit(m) }, priceText(m)),
                self.metaItem(I.pulse, fmtTok(u.req), 'Lượt gọi 30 ngày'),
                self.metaItem(I.star, fmtN(MLIKES[m.id] + (self.starred('m:' + m.id) ? 1 : 0)), 'Lượt thích')),
              h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } }, self.mstatus(m.status), self.badge(DATA[m.data].bg, DATA[m.data].fg, 'Dữ liệu: ' + m.data))));
        })) : h('div', { style: { padding: '40px', textAlign: 'center', border: '1px dashed ' + T.borderStrong, borderRadius: '10px', color: T.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' } },
          tab === 'on' ? 'Chưa có model nào đang bật khớp bộ lọc.' : 'Không có model nào khớp bộ lọc.', this.btn('Xoá bộ lọc', function () { self.setState({ mf: {}, mq: '', mltab: 'all' }); }))));
  }
  renderToggle() {
    var self = this, t = this.state.tgl;
    if (!t) return null;
    var cur = this.enabled(), close = function () { self.setState({ tgl: null }); };
    var val = function (id) { return id in t.draft ? t.draft[id] : !!cur[id]; };
    var set = function (patch) { self.setState({ tgl: Object.assign({}, t, patch) }); };
    var rows = MODEL_LIST.filter(function (m) { return (!t.q || (m.name + m.id).toLowerCase().indexOf(t.q.toLowerCase()) >= 0) && (!t.type || m.type === t.type) && (!t.st || (t.st === 'on') === val(m.id)); });
    var bulk = function (on) { var d = Object.assign({}, t.draft); rows.forEach(function (m) { d[m.id] = on; }); set({ draft: d }); };
    var changed = Object.keys(t.draft).filter(function (id) { return t.draft[id] !== !!cur[id]; });
    var types = MODEL_LIST.map(function (m) { return m.type; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
    var save = function () {
      if (self.role() !== 'admin') { self.toast('Chỉ quản trị nền tảng bật hoặc tắt model cho toàn ngân hàng.'); return; }
      if (!self.hasKey() && changed.some(function (id) { return t.draft[id]; })) { self.toast('Cần có API key đang hoạt động trước khi bật model.'); return; }
      self.setState({ enabled: Object.assign({}, cur, t.draft), tgl: null });
      self.toast('Đã lưu: ' + changed.length + ' model thay đổi trạng thái.');
    };
    return this.dialog('Bật/Tắt model', h(React.Fragment, null,
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
        h('div', { style: { flex: '1 1 180px' } }, this.searchBox(t.q, function (v) { set({ q: v }); }, 'Tìm model…', 'Tìm model')),
        this.selectEl(t.type, function (v) { set({ type: v }); }, [['', 'Mọi loại']].concat(types.map(function (x) { return [x, x]; })), 'Lọc loại model'),
        this.selectEl(t.st || '', function (v) { set({ st: v }); }, [['', 'Mọi trạng thái'], ['on', 'Đang bật'], ['off', 'Đang tắt']], 'Lọc trạng thái')),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: T.muted } },
        h('span', null, rows.length + ' model'), h('span', { style: { marginLeft: 'auto' } }), this.linkBtn('Bật tất cả', function () { bulk(true); }), this.linkBtn('Tắt tất cả', function () { bulk(false); })),
      h('div', { style: { border: '1px solid ' + T.border, borderRadius: '10px', overflow: 'hidden' } }, rows.length ? rows.map(function (m, i) {
        var on = val(m.id), dirty = on !== !!cur[m.id];
        return h('div', { key: m.id, style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderTop: i ? '1px solid ' + T.border : 'none', background: dirty ? '#FFFBEB' : '#fff' } },
          h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { style: { fontSize: '14px', fontWeight: 600 } }, m.name, dirty ? h('span', { style: { marginLeft: '8px', fontSize: '11px', fontWeight: 600, color: '#92400E' } }, 'chưa lưu') : null),
            h('div', { style: { fontSize: '12px', color: T.subtle } }, m.type + ' · ' + m.teamName + ' · ' + priceText(m))),
          self.switchEl(on, function () { var d = Object.assign({}, t.draft); d[m.id] = !on; set({ draft: d }); }, (on ? 'Tắt ' : 'Bật ') + m.name));
      }) : h('div', { style: { padding: '24px', textAlign: 'center', color: T.muted, fontSize: '14px' } }, 'Không có model nào khớp.')),
      h('div', { style: { fontSize: '12px', color: T.subtle, lineHeight: 1.5 } }, 'Model đang tắt không nhận lời gọi API và không phát sinh chi phí. Chi phí tính theo mức dùng thực tế, trừ vào ngân sách của đơn vị.')),
      [h(React.Fragment, { key: 'a' }, h('span', { style: { marginRight: 'auto', alignSelf: 'center', fontSize: '13px', color: T.muted } }, changed.length ? changed.length + ' thay đổi' : 'Chưa có thay đổi'), this.btn('Huỷ', close), this.btn('Lưu', save, { primary: true, disabled: !changed.length }))], close);
  }

  // ── models: chi tiết ──
  modelApi(m, lang, o) {
    o = o || {};
    var base = GW_BASE, doc = m.type === 'Tài liệu', mode = o.mode || (m.modes[0] || 'doc');
    var q = function (s) { return JSON.stringify(s || ''); };
    if (doc) {
      if (lang === 'curl') return 'curl ' + base + '/' + m.endpoint + ' \\\n  -H "Authorization: Bearer $MAAS_API_KEY" \\\n  -F "model=' + m.id + '" \\\n  -F "file=@chung_tu.pdf"';
      if (lang === 'python') return 'import requests\n\nresp = requests.post(\n    "' + base + '/' + m.endpoint + '",\n    headers={"Authorization": "Bearer " + API_KEY},\n    data={"model": "' + m.id + '"},\n    files={"file": open("chung_tu.pdf", "rb")},\n)\nprint(resp.json())';
      return 'const form = new FormData();\nform.append("model", "' + m.id + '");\nform.append("file", new Blob([await fs.readFile("chung_tu.pdf")]), "chung_tu.pdf");\n\nconst resp = await fetch("' + base + '/' + m.endpoint + '", {\n  method: "POST",\n  headers: { Authorization: `Bearer ${process.env.MAAS_API_KEY}` },\n  body: form,\n});\nconsole.log(await resp.json());';
    }
    var p = o.params || {}, sys = o.sys, user = o.user || 'Xin chào';
    var body, path, call;
    if (mode === 'chat') {
      var msgs = (sys ? [{ role: 'system', content: sys }] : []).concat([{ role: 'user', content: user }]);
      path = 'chat/completions';
      body = { model: m.id, messages: msgs, max_tokens: p.max != null ? p.max : 800, temperature: p.temp != null ? p.temp : 1, top_p: p.topp != null ? p.topp : 0.7, presence_penalty: p.pres || 0, stream: true };
    } else if (mode === 'completion') { path = 'completions'; body = { model: m.id, prompt: user, max_tokens: p.max != null ? p.max : 2048, temperature: p.temp != null ? p.temp : 1, top_p: p.topp != null ? p.topp : 0.7 }; }
    else if (mode === 'embedding') { path = 'embeddings'; body = { model: m.id, input: user }; }
    else { path = 'rerank'; body = { model: m.id, query: user, documents: o.docs || ['Đoạn văn 1', 'Đoạn văn 2'] }; }
    var json = JSON.stringify(body, null, 2);
    if (lang === 'curl') return 'curl ' + base + '/' + path + ' \\\n  -H "Authorization: Bearer $MAAS_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'' + json + '\'';
    var args = function (ind, py) { return Object.keys(body).map(function (k) { var v = JSON.stringify(body[k]); if (py) v = v.replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False'); return ind + k + (py ? '=' : ': ') + v + ','; }).join('\n'); };
    if (lang === 'python') {
      if (mode === 'rerank') return 'import requests\n\nresp = requests.post(\n    "' + base + '/rerank",\n    headers={"Authorization": "Bearer " + API_KEY},\n    json=' + json.replace(/\n/g, '\n    ') + ',\n)\nprint(resp.json()["results"])';
      call = mode === 'chat' ? 'client.chat.completions.create' : mode === 'completion' ? 'client.completions.create' : 'client.embeddings.create';
      return 'from openai import OpenAI\n\nclient = OpenAI(base_url="' + base + '", api_key=API_KEY)\n\n' + (mode === 'chat' ? 'stream' : 'resp') + ' = ' + call + '(\n' + args('    ', true) + '\n)\n' +
        (mode === 'chat' ? 'for chunk in stream:\n    print(chunk.choices[0].delta.content or "", end="")' : mode === 'completion' ? 'print(resp.choices[0].text)' : 'print(len(resp.data[0].embedding))');
    }
    if (mode === 'rerank') return 'const resp = await fetch("' + base + '/rerank", {\n  method: "POST",\n  headers: { Authorization: `Bearer ${process.env.MAAS_API_KEY}`, "Content-Type": "application/json" },\n  body: JSON.stringify(' + json.replace(/\n/g, '\n  ') + '),\n});\nconsole.log((await resp.json()).results);';
    call = mode === 'chat' ? 'client.chat.completions.create' : mode === 'completion' ? 'client.completions.create' : 'client.embeddings.create';
    return 'import OpenAI from "openai";\n\nconst client = new OpenAI({ baseURL: "' + base + '", apiKey: process.env.MAAS_API_KEY });\n\nconst ' + (mode === 'chat' ? 'stream' : 'resp') + ' = await ' + call + '({\n' + args('  ') + '\n});\n' +
      (mode === 'chat' ? 'for await (const chunk of stream) process.stdout.write(chunk.choices[0]?.delta?.content ?? "");' : mode === 'completion' ? 'console.log(resp.choices[0].text);' : 'console.log(resp.data[0].embedding.length);');
  }
  langTabs(lang, onPick) {
    return h('div', { style: { display: 'flex', gap: '4px' } }, [['curl', 'cURL'], ['python', 'Python'], ['node', 'Node.js']].map(function (d) {
      var on = d[0] === lang;
      return h('button', { key: d[0], type: 'button', 'aria-pressed': on, onClick: function () { onPick(d[0]); }, style: { minHeight: '34px', padding: '0 12px', borderRadius: '6px', border: '1px solid ' + (on ? T.sky200 : 'transparent'), background: on ? '#fff' : 'transparent', font: 'inherit', fontSize: '13px', fontWeight: on ? 600 : 400, color: on ? T.primaryDark : T.muted, cursor: 'pointer' } }, d[1]);
    }));
  }
  renderModelCard(m) {
    var ocr = m.id === 'cppd-ocr';
    var li = function (items) { return h('ul', { style: { margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' } }, items.map(function (x, i) { return h('li', { key: i }, x); })); };
    var thS = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid ' + T.borderStrong, fontWeight: 600, fontSize: '12px', color: T.muted };
    var td = function (x, mono, last) { return h('td', { style: { padding: '8px 10px', borderBottom: last ? 'none' : '1px solid ' + T.border, fontFamily: mono ? MONO : 'inherit', fontSize: mono ? '13px' : '14px' } }, x); };
    var evalRows = ocr ? ['Chứng từ thanh toán', 'Hợp đồng scan', 'Dòng dài (> [N] ký tự)'] : ['[Bộ đánh giá 1]', '[Bộ đánh giá 2]'];
    var metrics = ocr ? ['CER', 'WER'] : ['[Chỉ số 1]', '[Chỉ số 2]'];
    return h('article', { style: { display: 'flex', flexDirection: 'column', gap: '26px', fontSize: '15px', lineHeight: 1.65, color: '#1E293B' } },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        h('h2', { style: { margin: 0, fontSize: '24px', fontWeight: 700, color: T.text } }, ocr ? 'CPPD-OCR — nhận dạng chữ in tiếng Việt' : m.name + ' — ' + (m.taskLong || m.type).toLowerCase()),
        h('p', { style: { margin: 0, maxWidth: '75ch' } }, ocr ? 'Nhận dạng chữ in trên ảnh chứng từ, hợp đồng và tài liệu scan. Trả về văn bản theo từng dòng kèm toạ độ khung và độ tin cậy; là đầu vào cho các model trích xuất trường thông tin và tìm kiếm hồ sơ.' : m.desc)),
      this.section('Mục đích sử dụng & hạn chế', h(React.Fragment, null,
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' } },
          h('div', null, h('div', { style: { fontSize: '13px', fontWeight: 600, color: '#166534', marginBottom: '6px' } }, 'Phù hợp'), li(ocr ? ['Chứng từ thanh toán, hợp đồng scan', 'Hồ sơ tín dụng, hồ sơ phương án nhiều file', 'Số hoá tài liệu lưu trữ chữ in'] : ['[Trường hợp sử dụng phù hợp]'])),
          h('div', null, h('div', { style: { fontSize: '13px', fontWeight: 600, color: '#92400E', marginBottom: '6px' } }, 'Không dùng cho'), li(ocr ? ['Chữ viết tay, chữ ký', 'Ra quyết định tự động không có người duyệt'] : ['Ra quyết định tự động không có người duyệt', '[Trường hợp ngoài phạm vi]']))),
        h('div', { style: { display: 'flex', gap: '10px', padding: '12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', fontSize: '14px', color: '#78350F' } }, Ico(I.alert, 16, '#B45309'),
          ocr ? 'Độ chính xác giảm với dòng văn bản dài. Nên tách dòng trước khi gọi. Bảng biểu phức tạp hiện chỉ trả văn bản, chưa trả cấu trúc bảng.' : '[Hạn chế đã biết của model]'))),
      this.section('Kết quả đánh giá', h('div', { style: { overflowX: 'auto' } }, h('table', { style: { width: '100%', minWidth: '520px', borderCollapse: 'collapse' } },
        h('thead', null, h('tr', null, ['Bộ đánh giá', 'Số mẫu', metrics[0], metrics[1], 'Ngày đo'].map(function (x) { return h('th', { key: x, style: thS }, x); }))),
        h('tbody', null, evalRows.map(function (r, i) { var last = i === evalRows.length - 1; return h('tr', { key: r }, td(r, false, last), td('[—]', true, last), td('[—%]', true, last), td('[—%]', true, last), td('[—]', true, last)); }))))),
      this.section('Xử lý dữ liệu khi gọi', h('p', { style: { margin: 0 } }, '[Dữ liệu gửi lên đi qua agentgateway tới model: có được lưu hay ghi log không, lưu bao lâu, có dùng để huấn luyện không, mức dữ liệu được phép gửi.]')),
      this.section('Đầu vào / đầu ra', h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '14px' } },
        [['Đầu vào', ocr ? 'PDF, PNG, JPG · tối đa [— MB]' : '[Định dạng đầu vào]'], ['Đầu ra', ocr ? 'JSON: dòng, toạ độ, độ tin cậy' : '[Định dạng đầu ra]'], ['Giới hạn mặc định', '[— request/phút] mỗi key']].map(function (x) {
          return h('div', { key: x[0] }, h('div', { style: { fontSize: '12px', color: T.muted } }, x[0]), h('div', null, x[1]));
        }))));
  }
  renderModel() {
    var self = this, st = this.state;
    var m = this.modelById(st.mid) || MODEL_LIST[0];
    var tab = st.mtab || 'card', lang = st.lang || 'curl', on = this.isOn(m.id), doc = m.type === 'Tài liệu';
    var skills = this.skills().filter(function (s) { return s.models.indexOf(m.id) >= 0; });
    var u30 = usageSum(m, 30);
    var dashed = function (t) { return h('div', { style: { padding: '32px', textAlign: 'center', border: '1px dashed ' + T.borderStrong, borderRadius: '10px', color: T.muted, fontSize: '14px' } }, t); };
    var empty = function (title, text, action) { return h('div', { style: { padding: '48px 24px', textAlign: 'center', border: '1px dashed ' + T.borderStrong, borderRadius: '10px', color: T.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' } }, Ico(I.box, 28, '#94A3B8'), h('div', { style: { fontSize: '16px', fontWeight: 600, color: T.text } }, title), h('div', { style: { fontSize: '14px', maxWidth: '56ch', lineHeight: 1.6 } }, text), action || null); };
    var body;
    if (tab === 'card') body = this.renderModelCard(m);
    else if (tab === 'try') body = doc
      ? (m.app ? this.grRender() : empty('Model này chưa có trang dùng thử', 'Model tài liệu dùng trang thử riêng do đội sở hữu khai báo bằng một Gradio app. Trong lúc chờ, bạn có thể gọi thử bằng mã ở tab API.'))
      : empty('Dùng thử ' + m.name + ' trong Playground', 'Model loại ' + m.type + ' dùng chung một Playground: chỉnh system prompt và tham số, so sánh với model khác, rồi xuất mã gọi API.', this.btn('Mở Playground', function () { self.openPlayground(m.id); }, { primary: true }));
    else if (tab === 'api') body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' } },
        [['Base URL · agentgateway', GW_BASE], ['Endpoint', 'POST /v1/' + m.endpoint], ['Xác thực', 'Authorization: Bearer <API key>'], ['Chuẩn', doc ? 'API riêng của model' : 'Tương thích OpenAI' + (m.modes.indexOf('chat') >= 0 ? ' · có streaming' : '')]].map(function (x) {
          return h('div', { key: x[0], style: { padding: '12px 14px', border: '1px solid ' + T.border, borderRadius: '10px' } }, h('div', { style: { fontSize: '12px', color: T.muted } }, x[0]), h('div', { style: { fontFamily: MONO, fontSize: '13px', marginTop: '4px', overflowWrap: 'anywhere' } }, x[1]));
        })),
      doc ? h('div', { style: { display: 'flex', gap: '10px', padding: '12px 14px', background: T.sky50, border: '1px solid ' + T.sky200, borderRadius: '8px', fontSize: '14px', lineHeight: 1.55 } }, Ico(I.file, 16, T.primary),
        'Model tài liệu nhận file và trả kết quả có cấu trúc, nên dùng endpoint riêng thay vì chuẩn OpenAI. Mỗi model có thể theo một chuẩn đầu vào/đầu ra khác nhau; xem mục Đầu vào / đầu ra trong model card.') : null,
      h('section', { style: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', border: '1px solid ' + T.border, borderRadius: '10px', background: T.surface } },
        h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' } }, this.langTabs(lang, function (k) { self.setState({ lang: k }); }),
          h('span', { style: { marginLeft: 'auto', fontSize: '12px', color: T.muted } }, 'Chi phí tính vào API key dùng để gọi')),
        this.codeBlock(this.modelApi(m, lang), 'snip', lang === 'curl' ? 'cURL' : lang === 'python' ? 'Python' : 'Node.js')),
      this.hasKey() ? null : h('div', { style: { fontSize: '14px', color: T.muted } }, 'Chưa có API key? ', this.linkBtn('Xem Ngân sách & key', function () { self.go({ page: 'keys' }); })));
    else if (tab === 'versions') body = h('div', { style: { border: '1px solid ' + T.border, borderRadius: '10px', overflow: 'hidden' } }, [0, 1].map(function (i) {
      return h('div', { key: i, style: { display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center', padding: '14px 16px', borderTop: i ? '1px solid ' + T.border : 'none', fontSize: '14px' } },
        h('span', { style: { fontFamily: MONO, fontWeight: 600, color: i ? T.muted : T.primaryDark, minWidth: '64px' } }, 'v[x.y]'), i === 0 ? self.badge(T.sky100, T.primaryDark, 'Đang phục vụ') : null,
        h('span', { style: { flex: 1, minWidth: '240px' } }, '[Thay đổi chính]'), h('span', { style: { color: T.muted, fontSize: '13px' } }, '[Người phê duyệt] · [ngày]'));
    }));
    else if (tab === 'discuss') body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' } }, h('div', { style: { fontSize: '14px', color: T.muted } }, 'Báo lỗi, yêu cầu tính năng, hỏi đáp với đội sở hữu'), this.btn('Mở thảo luận mới', function () {}, { icon: I.plus })), dashed('[Danh sách thảo luận]'));
    else body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px' } },
        this.statTile('Lượt gọi 30 ngày', fmtN(u30.req)), doc ? this.statTile('Số trang', fmtN(u30.pages)) : this.statTile('Token input / output', fmtTok(u30.tin) + ' / ' + (u30.tout ? fmtTok(u30.tout) : '—')), this.statTile('Chi phí 30 ngày', fmtUsd(u30.cost))),
      h('div', { style: { fontSize: '14px', color: T.muted } }, 'Xem theo ngày và theo API key ở trang ', this.linkBtn('Sử dụng & chi phí →', function () { self.go({ page: 'usage' }); })));

    var nameOf = function (id) { return h('button', { key: id, type: 'button', onClick: function () { self.openModel(id); }, style: { border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontFamily: MONO, fontSize: '13px', color: T.primary, cursor: 'pointer', textDecoration: 'underline' } }, id); };

    var spark = (function () {
      var v = []; for (var d = 29; d >= 0; d--) v.push(usageDay(m, d).req);
      var mx = Math.max.apply(null, v), W2 = 280, H2 = 48, pts = v.map(function (x, i) { return (i * W2 / 29).toFixed(1) + ',' + (H2 - 3 - x / mx * (H2 - 8)).toFixed(1); });
      return h('svg', { viewBox: '0 0 ' + W2 + ' ' + H2, role: 'img', 'aria-label': 'Lượt gọi theo ngày trong 30 ngày', preserveAspectRatio: 'none', style: { width: '100%', height: '48px', display: 'block' } },
        h('path', { d: 'M0,' + H2 + ' L' + pts.join(' L') + ' L' + W2 + ',' + H2 + ' Z', fill: T.sky100 }), h('path', { d: 'M' + pts.join(' L'), fill: 'none', stroke: T.primary, strokeWidth: 2, strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' }));
    })();
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '20px' } },
      h('div', { style: this.heroStyle() },
        h('nav', { 'aria-label': 'Breadcrumb', style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: T.muted } },
          h('button', { type: 'button', onClick: function () { self.go({ page: 'models' }); }, style: { display: 'inline-flex', alignItems: 'center', gap: '4px', border: 'none', background: 'transparent', padding: '4px 0', font: 'inherit', color: T.primary, cursor: 'pointer', fontWeight: 600 } }, Ico(I.left, 14), 'Models'),
          h('span', null, '/'), h('span', null, m.type)),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' } },
          this.avatarBox(m.id.slice(0, 2).toUpperCase(), TYPE_COLOR[m.type], 36),
          h('h1', { style: { margin: 0, fontSize: '22px', fontWeight: 400 } }, h('span', { style: { color: T.subtle } }, m.team + ' / '), h('span', { style: { fontWeight: 700, color: T.text } }, m.id)),
          this.likeBtn('m:' + m.id, MLIKES[m.id], m.name),
          h('button', { type: 'button', 'aria-label': 'Sao chép model id', onClick: function () { self.copy(m.id, 'mid'); }, style: { width: '36px', height: '36px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid ' + T.borderStrong, borderRadius: '6px', background: '#fff', cursor: 'pointer' } }, Ico(st.copied === 'mid' ? I.check : I.copy, 16, st.copied === 'mid' ? '#166534' : T.muted)),
          on ? this.badge('#DCFCE7', '#166534', 'Đang bật', I.check) : this.badge('#F1F5F9', '#475569', 'Đang tắt')),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
          [this.typeBadge(m)].concat(m.use.map(function (u) { return self.badge('#F1F5F9', '#334155', u); })).concat([this.badge('#F1F5F9', '#334155', 'Dịch vụ API'), this.mstatus(m.status), this.data(m.data)]).map(function (b, i) { return h(React.Fragment, { key: i }, b); })),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px' } },
          this.tabs([['card', 'Model card'], ['try', 'Dùng thử'], ['api', 'API'], ['versions', 'Phiên bản'], ['discuss', 'Thảo luận'], ['usage', 'Sử dụng']], tab, function (k) { self.setState({ mtab: k }); }),
          h('div', { style: { display: 'flex', gap: '8px', paddingBottom: '6px' } },
            on ? this.btn('Tắt model', function () { self.setEnabled(m.id, false); }) : null,
            on ? (doc ? this.btn('Dùng thử', function () { self.setState({ mtab: 'try' }); }, { primary: true }) : this.btn('Mở Playground', function () { self.openPlayground(m.id); }, { primary: true }))
               : this.btn('Bật model', function () { self.setEnabled(m.id, true); }, { primary: true, icon: I.plus })))),

      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-start' } },
        h('main', { style: { flex: '999 1 640px', minWidth: 0 } }, body),
        tab === 'try' && doc && m.app ? null : h('aside', { style: { flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' } },
          this.cardBox('Lượt gọi 30 ngày', h(React.Fragment, null, h('div', { style: { fontFamily: MONO, fontSize: '22px', fontWeight: 500 } }, fmtN(u30.req)), spark)),
          this.cardBox('Đơn giá', h(React.Fragment, null,
            m.price.page ? this.kvRow('Mỗi trang', h('span', { style: { fontFamily: MONO } }, usdRate(m.price.page))) : h(React.Fragment, null,
              this.kvRow('Input', h('span', { style: { fontFamily: MONO } }, usdRate(m.price.in))),
              m.price.cache ? this.kvRow('Input đã cache', h('span', { style: { fontFamily: MONO } }, usdRate(m.price.cache))) : null,
              m.price.out ? this.kvRow('Output', h('span', { style: { fontFamily: MONO } }, usdRate(m.price.out))) : null),
            h('div', { style: { fontSize: '12px', color: T.subtle } }, m.price.page ? 'Tính theo số trang đã xử lý.' : 'Tính trên mỗi 1 triệu token.'))),
          this.cardBox('Thông số', h(React.Fragment, null, m.ctx ? this.kvRow('Ngữ cảnh', h('span', { style: { fontFamily: MONO } }, m.ctx + ' token')) : null, this.kvRow('p95', h('span', { style: { fontFamily: MONO } }, '[— ms]')), this.kvRow('SLA', h('span', { style: { fontFamily: MONO } }, '[—%]')))),
          this.cardBox('Kết nối dịch vụ', h(React.Fragment, null,
            this.kvRow('Cổng', 'agentgateway'), this.kvRow('Base URL', h('span', { style: { fontFamily: MONO, overflowWrap: 'anywhere' } }, GW_BASE)),
            this.kvRow('Endpoint', h('span', { style: { fontFamily: MONO } }, 'POST /v1/' + m.endpoint)), this.kvRow('Model id', h('span', { style: { fontFamily: MONO } }, m.id)),
            m.base ? this.kvRow('Nhận đầu vào từ', nameOf(m.base)) : null,
            m.down.length ? this.kvRow('Thường gọi tiếp', h('span', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' } }, m.down.map(nameOf))) : null,
            h('div', { style: { fontSize: '12px', color: T.subtle } }, 'Model chạy trên hạ tầng của nền tảng. Bạn chỉ gọi API, không tải weight về.'))),
          this.cardBox('Skill dùng model này', skills.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, skills.map(function (s) {
            return h('button', { key: s.id, type: 'button', className: 'mx-row', onClick: function () { self.openSkill(s.id); }, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minHeight: '40px', padding: '6px 10px', border: '1px solid ' + T.border, borderRadius: '8px', background: '#fff', font: 'inherit', fontSize: '14px', color: T.text, cursor: 'pointer', textAlign: 'left' } },
              h('span', null, s.name), h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: MONO, fontSize: '12px', color: T.subtle, whiteSpace: 'nowrap' } }, Ico(I.download, 12), fmtN(s.installs)));
          })) : h('div', { style: { fontSize: '13px', color: T.muted } }, 'Chưa có skill nào dùng model này.')),
          this.cardBox('Quản trị', h(React.Fragment, null, this.kvRow('Nhà cung cấp', m.teamName), this.kvRow('Người phụ trách', '[Họ tên]'), this.kvRow('Phê duyệt bởi', '[QLRR / ATTT]'), this.kvRow('Rà soát tiếp theo', '[dd/mm/yyyy]'))))));
  }

  // ── playground ──
  pgNew(mode) {
    var p = {}; (PG_PARAMS[mode] || []).forEach(function (x) { p[x[0]] = x[5]; });
    var list = MODEL_LIST.filter(function (m) { return m.modes.indexOf(mode) >= 0; });
    return { mode: mode, model: list[0].id, model2: (list[1] || list[0]).id, compare: false, sys: '', params: p, a: [], b: [], input: '', out: null, docs: 'Thay đổi khẩn cấp cần quản lý ca trực phê duyệt.\nNhân viên được nghỉ phép 12 ngày mỗi năm.\nHồ sơ thay đổi phải bổ sung trong 24 giờ sau khi thực hiện.' };
  }
  pgStop() { (this._pgT || []).forEach(function (t) { clearTimeout(t); }); this._pgT = []; this._pgRun = (this._pgRun || 0) + 1; }
  pgSet(patch) { this.setState({ pg: Object.assign({}, this.state.pg, patch) }); }
  pgSend() {
    var self = this, pg = this.state.pg, text = (pg.input || '').trim();
    if (!text || pg.busy) return;
    var panes = pg.compare ? [['a', pg.model], ['b', pg.model2]] : [['a', pg.model]];
    panes = panes.filter(function (x) { return self.isOn(x[1]); });
    if (!panes.length) { this.toast('Model đang tắt. Bật model để gửi yêu cầu.'); return; }
    var run = (this._pgRun = (this._pgRun || 0) + 1), patch = { input: '', busy: panes.length };
    panes.forEach(function (x) { patch[x[0]] = pg[x[0]].concat([['u', text], ['a', '', null]]); });
    this.pgSet(patch);
    panes.forEach(function (x) {
      var m = self.modelById(x[1]), full = mockAnswer(m, text), words = full.split(' '), i = 0, t0 = Date.now(), first = 350 + m.speed * 500;
      var step = function () {
        if (self._pgRun !== run) return;
        i += 2;
        var cur = self.state.pg, list = cur[x[0]].slice(), done = i >= words.length, p2 = {};
        list[list.length - 1] = ['a', words.slice(0, i).join(' '), done ? { ms: Date.now() - t0, tin: tok(text) + tok(cur.sys) + 12, tout: tok(full) } : null];
        p2[x[0]] = list;
        if (done) p2.busy = cur.busy - 1;
        self.pgSet(p2);
        if (!done) self._pgT.push(setTimeout(step, 30 + m.speed * 30));
      };
      self._pgT.push(setTimeout(step, first));
    });
  }
  pgRunOnce() {
    var self = this, pg = this.state.pg, m = this.modelById(pg.model), text = (pg.input || '').trim();
    if (!text || pg.busy) return;
    if (!this.isOn(m.id)) { this.toast('Model đang tắt. Bật model để gửi yêu cầu.'); return; }
    var run = (this._pgRun = (this._pgRun || 0) + 1);
    this.pgSet({ busy: 1, out: null });
    this._pgT.push(setTimeout(function () {
      if (self._pgRun !== run) return;
      var out;
      if (pg.mode === 'completion') { var t = mockAnswer(m, text); out = { text: t, ms: 900 + m.speed * 400, tin: tok(text), tout: tok(t) }; }
      else if (pg.mode === 'embedding') { var v = []; for (var i = 0; i < 8; i++) v.push((Math.sin(text.length * (i + 1) * 0.37) * 0.09).toFixed(5)); out = { vec: v, dim: 1024, ms: 85, tin: tok(text) }; }
      else {
        var docs = pg.docs.split('\n').filter(function (d) { return d.trim(); }), qw = text.toLowerCase().split(/\s+/);
        var res = docs.map(function (d, i) { var hit = qw.filter(function (w) { return w.length > 2 && d.toLowerCase().indexOf(w) >= 0; }).length; return { i: i, d: d, score: Math.min(0.98, 0.08 + hit * 0.21 + (d.length % 7) * 0.01) }; }).sort(function (a, b) { return b.score - a.score; });
        out = { rank: res, ms: 140, tin: tok(text) + tok(pg.docs) };
      }
      self.pgSet({ busy: 0, out: out });
    }, 500));
  }
  pgCost(m, tin, tout) { return ((tin || 0) * m.price.in + (tout || 0) * (m.price.out || 0)) / 1e6; }
  renderPlayground() {
    var self = this, st = this.state, pg = st.pg || this.pgNew('chat');
    if (!st.pg) st.pg = pg;
    var mode = pg.mode, list = MODEL_LIST.filter(function (m) { return m.modes.indexOf(mode) >= 0; }), chat = mode === 'chat';
    var opts = list.map(function (m) { return [m.id, m.name + (self.isOn(m.id) ? '' : ' (đang tắt)')]; });
    var ta = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid ' + T.borderStrong, borderRadius: '8px', font: 'inherit', fontSize: '14px', color: T.text, background: '#fff', resize: 'vertical' };
    var meta = function (m, x) { return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontFamily: MONO, fontSize: '12px', color: T.subtle } }, h('span', null, (x.ms / 1000).toFixed(2).replace('.', ',') + ' s'), h('span', null, fmtN(x.tin) + ' token vào'), x.tout != null ? h('span', null, fmtN(x.tout) + ' token ra') : null, h('span', null, '≈ ' + fmtUsd(self.pgCost(m, x.tin, x.tout)))); };
    var offNote = function (m) { return h('div', { style: { margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', textAlign: 'center', color: T.muted, fontSize: '14px', padding: '16px' } }, Ico(I.ban, 24, '#94A3B8'), h('div', null, m.name + ' đang tắt.'), self.btn('Bật model', function () { self.setEnabled(m.id, true); }, { icon: I.plus })); };
    var pane = function (key, mid, label) {
      var m = self.modelById(mid), msgs = pg[key];
      return h('section', { key: key, 'aria-label': label, style: { flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', border: '1px solid ' + T.border, borderRadius: '12px', background: '#fff', overflow: 'hidden' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderBottom: '1px solid ' + T.border, background: T.surface } },
          self.selectEl(mid, function (v) { var p = {}; p[key === 'a' ? 'model' : 'model2'] = v; self.pgSet(p); }, opts, 'Model ' + label, { minHeight: '34px', fontWeight: 600, flex: '0 1 240px' }),
          h('span', { style: { marginLeft: 'auto', fontFamily: MONO, fontSize: '12px', color: T.subtle } }, priceText(m))),
        h('div', { style: { flex: 1, minHeight: '360px', maxHeight: '520px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', padding: '14px' } },
          !self.isOn(mid) ? offNote(m) : msgs.length ? msgs.map(function (x, i) {
            var mine = x[0] === 'u';
            return h('div', { key: i, style: { alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '86%', display: 'flex', flexDirection: 'column', gap: '4px' } },
              h('div', { style: { padding: '10px 14px', borderRadius: mine ? '12px 12px 2px 12px' : '12px 12px 12px 2px', background: mine ? T.sky50 : '#F1F5F9', border: '1px solid ' + (mine ? T.sky200 : T.border), fontSize: '14px', lineHeight: 1.55, whiteSpace: 'pre-wrap', fontFamily: !mine && /^def |^SELECT /m.test(x[1]) ? MONO : 'inherit' } }, x[1] || h('span', { style: { color: T.muted } }, '…')),
              x[2] ? meta(m, x[2]) : null);
          }) : h('div', { style: { margin: 'auto', color: T.muted, fontSize: '14px', textAlign: 'center' } }, 'Gửi một câu để xem ' + m.name + ' trả lời.')));
    };
    var slider = function (x) {
      var v = pg.params[x[0]], set = function (n) { var p = Object.assign({}, pg.params); p[x[0]] = Math.min(x[3], Math.max(x[2], n)); self.pgSet({ params: p }); };
      return h('div', { key: x[0], style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } },
          h('label', { htmlFor: 'pg-' + x[0], style: { fontSize: '13px', fontWeight: 600 } }, x[1]),
          h('input', { type: 'number', 'aria-label': x[1], value: v, min: x[2], max: x[3], step: x[4], onChange: function (e) { set(Number(e.target.value)); }, style: { width: '76px', minHeight: '30px', padding: '0 6px', border: '1px solid ' + T.borderStrong, borderRadius: '6px', font: 'inherit', fontFamily: MONO, fontSize: '13px', textAlign: 'right' } })),
        h('input', { id: 'pg-' + x[0], type: 'range', value: v, min: x[2], max: x[3], step: x[4], onChange: function (e) { set(Number(e.target.value)); }, style: { width: '100%', accentColor: T.primary } }),
        x[6] ? h('div', { style: { fontSize: '12px', color: T.subtle } }, x[6]) : null);
    };
    var m1 = this.modelById(pg.model), out = pg.out;
    var main;
    if (chat) main = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'stretch' } }, pane('a', pg.model, pg.compare ? 'A' : 'chính'), pg.compare ? pane('b', pg.model2, 'B') : null),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-end' } },
        h('textarea', { 'aria-label': 'Câu lệnh', rows: 2, value: pg.input, placeholder: pg.compare ? 'Gửi cùng một câu tới cả hai model… (Enter để gửi)' : 'Nhập câu lệnh… (Enter để gửi, Shift+Enter xuống dòng)', onChange: function (e) { self.pgSet({ input: e.target.value }); }, onKeyDown: function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self.pgSend(); } }, style: Object.assign({}, ta, { flex: 1, resize: 'none' }) }),
        this.btn(pg.busy ? 'Đang trả lời…' : 'Gửi', function () { self.pgSend(); }, { primary: true, disabled: !!pg.busy })));
    else main = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid ' + T.border, borderRadius: '12px', padding: '16px', background: '#fff' } },
      h('label', { htmlFor: 'pg-in', style: { fontSize: '13px', fontWeight: 600 } }, mode === 'completion' ? 'Prompt' : mode === 'embedding' ? 'Văn bản cần tạo vector' : 'Câu truy vấn'),
      h('textarea', { id: 'pg-in', rows: mode === 'rerank' ? 2 : 5, value: pg.input, placeholder: mode === 'completion' ? 'Viết phần mở đầu, model sẽ viết tiếp…' : mode === 'embedding' ? 'Dán một đoạn văn bản…' : 'Ví dụ: thay đổi khẩn cấp cần ai phê duyệt', onChange: function (e) { self.pgSet({ input: e.target.value }); }, style: ta }),
      mode === 'rerank' ? h(React.Fragment, null, h('label', { htmlFor: 'pg-docs', style: { fontSize: '13px', fontWeight: 600 } }, 'Các đoạn văn bản (mỗi dòng một đoạn)'), h('textarea', { id: 'pg-docs', rows: 4, value: pg.docs, onChange: function (e) { self.pgSet({ docs: e.target.value }); }, style: ta })) : null,
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } }, this.btn(pg.busy ? 'Đang chạy…' : 'Chạy', function () { self.pgRunOnce(); }, { primary: true, disabled: !!pg.busy }), !this.isOn(m1.id) ? h('span', { style: { fontSize: '13px', color: '#92400E' } }, m1.name + ' đang tắt.') : null),
      out ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px', background: T.surface, border: '1px solid ' + T.border, borderRadius: '10px' } },
        out.text ? h('div', { style: { fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap' } }, out.text) : null,
        out.vec ? h(React.Fragment, null, h('div', { style: { fontSize: '14px' } }, 'Vector ', h('strong', null, fmtN(out.dim) + ' chiều')), h('div', { style: { fontFamily: MONO, fontSize: '12.5px', color: T.muted, overflowWrap: 'anywhere' } }, '[' + out.vec.join(', ') + ', …]')) : null,
        out.rank ? h('ol', { style: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' } }, out.rank.map(function (r, i) {
          return h('li', { key: r.i, style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '14px' } }, h('span', null, h('strong', { style: { fontFamily: MONO, marginRight: '8px' } }, (i + 1) + '.'), r.d), h('span', { style: { fontFamily: MONO, color: T.muted } }, r.score.toFixed(2).replace('.', ','))),
            h('div', { style: { height: '6px', borderRadius: '999px', background: '#E2E8F0', overflow: 'hidden' } }, h('div', { style: { width: (r.score * 100) + '%', height: '100%', borderRadius: '999px', background: T.primary } })));
        })) : null,
        meta(m1, out)) : null);

    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px' } },
      this.areaHead('Playground', 'Thử model trước khi tích hợp, không cần viết mã. Chỉnh system prompt và tham số, so sánh hai model với cùng một câu lệnh, rồi xuất đúng cấu hình đó thành mã gọi API.'),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px' } },
        this.tabs(PG_MODES, mode, function (k) { self.pgStop(); self.setState({ pg: self.pgNew(k) }); }),
        h('div', { style: { display: 'flex', gap: '8px', paddingBottom: '6px' } },
          chat ? this.btn('Compare', function () { self.pgSet({ compare: !pg.compare }); }, { icon: I.sort, pressed: pg.compare, iconColor: pg.compare ? T.primary : T.muted }) : null,
          chat ? this.btn('Xoá hội thoại', function () { self.pgStop(); self.pgSet({ a: [], b: [], busy: 0 }); }) : null,
          this.btn('<> API', function () { self.setState({ pgApi: true }); }, { primary: true }))),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-start' } },
        h('div', { style: { flex: '999 1 600px', minWidth: 0 } }, main),
        h('aside', { 'aria-label': 'Cấu hình', style: { flex: '1 1 300px', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', border: '1px solid ' + T.border, borderRadius: '12px', background: '#fff' } },
          chat ? null : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, h('span', { style: { fontSize: '13px', fontWeight: 600 } }, 'Model'), this.selectEl(pg.model, function (v) { self.pgSet({ model: v, out: null }); }, opts, 'Model'), h('span', { style: { fontFamily: MONO, fontSize: '12px', color: T.subtle } }, priceText(m1) + ' · ' + priceUnit(m1))),
          chat ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
            h('label', { htmlFor: 'pg-sys', style: { fontSize: '13px', fontWeight: 600 } }, 'System prompt'),
            h('textarea', { id: 'pg-sys', rows: 4, value: pg.sys, placeholder: 'Hướng dẫn, ngữ cảnh hoặc ví dụ mẫu cho model…', onChange: function (e) { self.pgSet({ sys: e.target.value }); }, style: ta }),
            pg.compare ? h('div', { style: { fontSize: '12px', color: T.subtle } }, 'Áp dụng cho cả hai model.') : null) : null,
          (PG_PARAMS[mode] || []).map(slider),
          !(PG_PARAMS[mode] || []).length ? h('div', { style: { fontSize: '13px', color: T.muted } }, 'Loại model này không có tham số sinh.') : null,
          h('button', { type: 'button', onClick: function () { self.openModel(pg.model); }, style: { alignSelf: 'flex-start', border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontSize: '13px', fontWeight: 600, color: T.primary, cursor: 'pointer' } }, 'Xem model card của ' + m1.name + ' →'))));
  }
  renderPgApi() {
    var self = this, st = this.state, pg = st.pg;
    if (!st.pgApi || !pg) return null;
    var lang = st.lang || 'curl', m = this.modelById(pg.model), close = function () { self.setState({ pgApi: false }); };
    var lastUser = pg.a.filter(function (x) { return x[0] === 'u'; }).pop();
    var code = this.modelApi(m, lang, { mode: pg.mode, params: pg.params, sys: pg.sys, user: pg.mode === 'chat' ? (lastUser ? lastUser[1] : 'Xin chào') : (pg.input || 'Xin chào'), docs: pg.docs.split('\n').filter(function (d) { return d.trim(); }) });
    return this.dialog('<> API', h(React.Fragment, null,
      h('div', { style: { fontSize: '14px', color: T.muted, lineHeight: 1.55 } }, 'Mã dưới đây gọi ', h('strong', { style: { color: T.text } }, m.name), ' với đúng system prompt và tham số bạn đang đặt trong Playground.'),
      this.langTabs(lang, function (k) { self.setState({ lang: k }); }),
      this.codeBlock(code, 'pgapi', lang === 'curl' ? 'cURL' : lang === 'python' ? 'Python' : 'Node.js')),
      [h(React.Fragment, { key: 'a' }, this.btn('Xem key của tôi', function () { self.setState({ pgApi: false }); self.go({ page: 'keys' }); }), this.btn(st.copied === 'pgapi' ? 'Đã chép' : 'Chép mã', function () { self.copy(code, 'pgapi'); }, { primary: true, icon: st.copied === 'pgapi' ? I.check : I.copy }))], close);
  }

  // ── ngân sách & API key (theo vai trò) ──
  // Quản trị nền tảng: cấp ngân sách tháng (USD) cho từng phòng.
  // Quản trị phòng: cấp key cho thành viên / ứng dụng của phòng, mỗi key một hạn mức tháng trong ngân sách phòng.
  // Thành viên: nhận key của mình (chỉ xem được một lần), theo dõi hạn mức.
  // Gateway (agentgateway) xác thực key và đo chi phí; backend MaaS cộng chi phí và khoá key khi vượt hạn mức.
  role() { return this.state.role || 'admin'; }
  me() { return WHO[this.role()]; }
  depts() { return this.state.depts || SEED_DEPTS; }
  keys() { return this.state.keys || SEED_KEYS; }
  monthTotal() { if (this._mt == null) { var t = 0; MODEL_LIST.forEach(function (m) { t += usageSum(m, 11).cost; }); this._mt = t; } return this._mt; }
  keySpent(k) { return k.share * this.monthTotal(); }
  keyState(k) { return k.status === 'revoked' ? 'revoked' : k.status === 'pending' ? 'pending' : this.keySpent(k) >= k.limit ? 'blocked' : 'active'; }
  deptStat(d) {
    var self = this, ks = this.keys().filter(function (k) { return k.dept === d.id; }), live = ks.filter(function (k) { return k.status !== 'revoked'; });
    var spent = ks.reduce(function (a, k) { return a + self.keySpent(k); }, 0), alloc = live.reduce(function (a, k) { return a + k.limit; }, 0);
    return { keys: ks, live: live, spent: spent, alloc: alloc, free: d.budget - alloc, pct: d.budget ? spent / d.budget * 100 : 0 };
  }
  scopeKeys() {
    var r = this.role(), me = this.me();
    return this.keys().filter(function (k) { return r === 'admin' || (r === 'dept' ? k.dept === me.dept : k.owner === me.name); });
  }
  scopeShare() { return this.scopeKeys().reduce(function (a, k) { return a + k.share; }, 0); }
  hasKey() { var self = this; return this.scopeKeys().some(function (k) { return self.keyState(k) === 'active'; }); }
  stateBadge(s) {
    var m = { active: ['#DCFCE7', '#166534', 'Hoạt động', I.check], pending: [T.sky100, T.primaryDark, 'Chờ nhận', I.clock], blocked: ['#FEF3C7', '#92400E', 'Hết hạn mức', I.alert], revoked: ['#FEE2E2', '#991B1B', 'Đã thu hồi', I.ban] }[s];
    return this.badge(m[0], m[1], m[2], m[3]);
  }
  meter(spent, limit, w) {
    var pct = limit ? Math.min(100, spent / limit * 100) : 0, col = pct >= 100 ? '#B91C1C' : pct >= 80 ? '#D97706' : T.primary;
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: w || '150px' } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', fontFamily: MONO, fontSize: '13px' } }, h('span', null, fmtUsd(spent)), h('span', { style: { color: T.subtle } }, Math.round(limit ? spent / limit * 100 : 0) + '%')),
      h('div', { role: 'progressbar', 'aria-valuenow': Math.round(pct), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Đã dùng ' + Math.round(pct) + '% hạn mức', style: { height: '6px', borderRadius: '999px', background: '#E2E8F0', overflow: 'hidden' } }, h('div', { style: { width: pct + '%', height: '100%', borderRadius: '999px', background: col } })));
  }
  usdInput(id, value, onChange, err) {
    return h('div', { style: { position: 'relative' } },
      h('span', { 'aria-hidden': true, style: { position: 'absolute', left: '12px', top: '11px', fontFamily: MONO, color: T.muted } }, '$'),
      h('input', { id: id, type: 'number', min: 0, step: 1, value: value, onChange: function (e) { onChange(e.target.value); }, style: { width: '100%', boxSizing: 'border-box', minHeight: '44px', padding: '10px 96px 10px 26px', border: '1px solid ' + (err ? '#DC2626' : T.borderStrong), borderRadius: '8px', font: 'inherit', fontFamily: MONO, fontSize: '14px', color: T.text, background: '#fff' } }),
      h('span', { 'aria-hidden': true, style: { position: 'absolute', right: '12px', top: '12px', fontSize: '13px', color: T.subtle } }, 'USD / tháng'));
  }
  fieldRow(id, label, ctrl, help, err, req) {
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      h('label', { htmlFor: id, style: { fontSize: '14px', fontWeight: 600 } }, label, req ? h('span', { style: { color: '#B91C1C' } }, ' *') : null), ctrl,
      help ? h('div', { style: { fontSize: '12px', color: T.subtle, lineHeight: 1.5 } }, help) : null,
      err ? h('div', { role: 'alert', style: { display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13px', color: '#B91C1C' } }, Ico(I.alert, 14), err) : null);
  }
  renderKeys() {
    var r = this.role();
    if (r === 'member') return this.renderMyKeys();
    if (r === 'dept') return this.renderDeptKeys(this.me().dept);
    return this.state.kdept ? this.renderDeptKeys(this.state.kdept) : this.renderDepts();
  }
  renderDepts() {
    var self = this, depts = this.depts();
    var rows = depts.map(function (d) { return [d, self.deptStat(d)]; });
    var sum = function (f) { return rows.reduce(function (a, x) { return a + f(x); }, 0); };
    var thS = { textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: T.muted, borderBottom: '1px solid ' + T.border, background: T.surface, whiteSpace: 'nowrap' };
    var tdS = { padding: '14px 12px', borderBottom: '1px solid ' + T.border, verticalAlign: 'middle', fontSize: '14px' }, num = Object.assign({}, tdS, { fontFamily: MONO, textAlign: 'right' });
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px' } },
      this.areaHead('Ngân sách & API key', 'Cấp ngân sách tháng cho từng phòng. Quản trị phòng tự chia ngân sách đó thành hạn mức cho key của thành viên và ứng dụng. Khi một key hoặc cả phòng dùng hết hạn mức, gateway ngừng nhận lời gọi cho đến kỳ sau hoặc khi được cấp thêm.',
        this.btn('Thêm phòng', function () { self.setState({ dDlg: { id: null, name: '', block: '', admin: '', budget: '' } }); }, { primary: true, icon: I.plus })),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px' } },
        this.statTile('Ngân sách tháng 10', fmtUsd(sum(function (x) { return x[0].budget; })), depts.length + ' phòng'),
        this.statTile('Đã dùng', fmtUsd(sum(function (x) { return x[1].spent; })), 'tính đến 11/10'),
        this.statTile('Đã chia cho key', fmtUsd(sum(function (x) { return x[1].alloc; })), sum(function (x) { return x[1].live.length; }) + ' key đang hiệu lực'),
        this.statTile('Phòng dùng trên 80%', rows.filter(function (x) { return x[1].pct >= 80; }).length, 'cần xem xét cấp thêm')),
      h('div', { style: { overflowX: 'auto', border: '1px solid ' + T.border, borderRadius: '10px' } },
        h('table', { style: { width: '100%', minWidth: '960px', borderCollapse: 'collapse' } },
          h('thead', null, h('tr', null, h('th', { style: thS }, 'Phòng'), h('th', { style: thS }, 'Quản trị phòng'), h('th', { style: Object.assign({}, thS, { textAlign: 'right' }) }, 'Ngân sách / tháng'), h('th', { style: thS }, 'Đã dùng'), h('th', { style: Object.assign({}, thS, { textAlign: 'right' }) }, 'Đã chia cho key'), h('th', { style: Object.assign({}, thS, { textAlign: 'right' }) }, 'Key'), h('th', { style: thS }, ''))),
          h('tbody', null, rows.map(function (x) {
            var d = x[0], s = x[1];
            return h('tr', { key: d.id, className: 'mx-row', onClick: function () { self.go({ kdept: d.id, ktab: 'keys' }); }, style: { cursor: 'pointer' } },
              h('td', { style: tdS }, h('button', { type: 'button', onClick: function (e) { e.stopPropagation(); self.go({ kdept: d.id, ktab: 'keys' }); }, style: { border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontWeight: 600, color: T.primary, cursor: 'pointer', textAlign: 'left' } }, d.name), h('div', { style: { fontSize: '12px', color: T.subtle } }, d.block)),
              h('td', { style: tdS }, d.admin),
              h('td', { style: num }, fmtUsd(d.budget)),
              h('td', { style: tdS }, self.meter(s.spent, d.budget, '180px')),
              h('td', { style: num }, fmtUsd(s.alloc)),
              h('td', { style: num }, s.live.length),
              h('td', { style: Object.assign({}, tdS, { textAlign: 'right' }) }, h('button', { type: 'button', className: 'mx-btn', onClick: function (e) { e.stopPropagation(); self.setState({ dDlg: { id: d.id, name: d.name, block: d.block, admin: d.admin, budget: String(d.budget) } }); }, style: { minHeight: '34px', padding: '0 12px', border: '1px solid ' + T.borderStrong, borderRadius: '8px', background: '#fff', font: 'inherit', fontSize: '13px', fontWeight: 600, color: T.text, cursor: 'pointer' } }, 'Sửa ngân sách')));
          })))),
      h('div', { style: { fontSize: '13px', color: T.subtle } }, 'Ngân sách tính bằng USD, làm mới vào ngày 1 hằng tháng. Số "đã dùng" cộng từ chi phí từng lời gọi do gateway ghi nhận.'));
  }
  renderDeptKeys(did) {
    var self = this, st = this.state, d = this.depts().filter(function (x) { return x.id === did; })[0], s = this.deptStat(d), isAdmin = this.role() === 'admin', tab = st.ktab || 'keys';
    var thS = { textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: T.muted, borderBottom: '1px solid ' + T.border, background: T.surface, whiteSpace: 'nowrap' };
    var tdS = { padding: '12px', borderBottom: '1px solid ' + T.border, verticalAlign: 'middle', fontSize: '14px' };
    var issue = function (owner) { self.setState({ kDlg: { dept: d.id, kind: owner === null ? 'app' : 'member', owner: owner || d.members[0], name: '', limit: '', models: MODEL_LIST.filter(function (m) { return self.isOn(m.id); }).map(function (m) { return m.id; }), exp: '90' } }); };
    var small = function (label, fn, danger) { return h('button', { type: 'button', className: 'mx-btn', onClick: fn, style: { minHeight: '32px', padding: '0 10px', border: '1px solid ' + (danger ? '#FCA5A5' : T.borderStrong), borderRadius: '8px', background: '#fff', font: 'inherit', fontSize: '13px', fontWeight: 600, color: danger ? '#B91C1C' : T.text, cursor: 'pointer', whiteSpace: 'nowrap' } }, label); };
    var keyTable = h('div', { style: { overflowX: 'auto', border: '1px solid ' + T.border, borderRadius: '10px' } },
      h('table', { style: { width: '100%', minWidth: '1000px', borderCollapse: 'collapse' } },
        h('thead', null, h('tr', null, ['Cấp cho', 'Key', 'Hạn mức / tháng', 'Đã dùng tháng này', 'Model', 'Dùng gần nhất', 'Trạng thái', ''].map(function (x, i) { return h('th', { key: i, style: Object.assign({}, thS, i === 2 ? { textAlign: 'right' } : {}) }, x); }))),
        h('tbody', null, s.keys.map(function (k) {
          var state = self.keyState(k), dead = state === 'revoked';
          return h('tr', { key: k.id, style: { opacity: dead ? 0.55 : 1 } },
            h('td', { style: tdS }, k.owner ? h('div', { style: { fontWeight: 600 } }, k.owner) : self.badge('#F1F5F9', '#334155', 'Ứng dụng', I.box)),
            h('td', { style: tdS }, h('div', { style: { fontWeight: 600 } }, k.name), h('div', { style: { fontFamily: MONO, fontSize: '12px', color: T.subtle } }, k.mask)),
            h('td', { style: Object.assign({}, tdS, { fontFamily: MONO, textAlign: 'right' }) }, fmtUsd(k.limit)),
            h('td', { style: tdS }, self.meter(self.keySpent(k), k.limit)),
            h('td', { style: Object.assign({}, tdS, { fontSize: '13px', color: T.muted }) }, k.models.length >= MODEL_LIST.length ? 'Tất cả' : k.models.length + ' model'),
            h('td', { style: Object.assign({}, tdS, { fontFamily: MONO, fontSize: '13px', color: T.muted }) }, k.last),
            h('td', { style: tdS }, self.stateBadge(state)),
            h('td', { style: Object.assign({}, tdS, { textAlign: 'right' }) }, dead ? null : h('div', { style: { display: 'inline-flex', gap: '6px' } }, small('Sửa hạn mức', function () { self.setState({ kEdit: { id: k.id, limit: String(k.limit) } }); }), small('Thu hồi', function () { self.setState({ revoke: k.id }); }, true))));
        }))));
    var memTable = h('div', { style: { overflowX: 'auto', border: '1px solid ' + T.border, borderRadius: '10px' } },
      h('table', { style: { width: '100%', minWidth: '720px', borderCollapse: 'collapse' } },
        h('thead', null, h('tr', null, ['Thành viên', 'Key', 'Tổng hạn mức', 'Đã dùng tháng này', ''].map(function (x, i) { return h('th', { key: i, style: Object.assign({}, thS, i === 2 ? { textAlign: 'right' } : {}) }, x); }))),
        h('tbody', null, d.members.map(function (name) {
          var ks = s.live.filter(function (k) { return k.owner === name; }), lim = ks.reduce(function (a, k) { return a + k.limit; }, 0), sp = ks.reduce(function (a, k) { return a + self.keySpent(k); }, 0);
          return h('tr', { key: name },
            h('td', { style: tdS }, h('span', { style: { fontWeight: 600 } }, name), name === d.admin ? h('span', { style: { marginLeft: '8px' } }, self.badge(T.sky100, T.primaryDark, 'Quản trị phòng')) : null),
            h('td', { style: Object.assign({}, tdS, { fontFamily: MONO }) }, ks.length),
            h('td', { style: Object.assign({}, tdS, { fontFamily: MONO, textAlign: 'right' }) }, ks.length ? fmtUsd(lim) : '—'),
            h('td', { style: tdS }, ks.length ? self.meter(sp, lim) : h('span', { style: { fontSize: '13px', color: T.subtle } }, 'Chưa có key')),
            h('td', { style: Object.assign({}, tdS, { textAlign: 'right' }) }, small('Cấp key', function () { issue(name); })));
        }))));
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px' } },
      isAdmin ? h('nav', { 'aria-label': 'Breadcrumb', style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: T.muted } },
        h('button', { type: 'button', onClick: function () { self.go({ kdept: null }); }, style: { display: 'inline-flex', alignItems: 'center', gap: '4px', border: 'none', background: 'transparent', padding: '4px 0', font: 'inherit', color: T.primary, cursor: 'pointer', fontWeight: 600 } }, Ico(I.left, 14), 'Ngân sách & API key'), h('span', null, '/'), h('span', null, d.name)) : null,
      this.areaHead(d.name, d.block + ' · Quản trị phòng: ' + d.admin + '. Chia ngân sách của phòng thành hạn mức cho từng key. Tổng hạn mức các key không vượt ngân sách phòng.',
        h('div', { style: { display: 'flex', gap: '8px' } },
          isAdmin ? this.btn('Sửa ngân sách', function () { self.setState({ dDlg: { id: d.id, name: d.name, block: d.block, admin: d.admin, budget: String(d.budget) } }); }) : this.btn('Xin thêm ngân sách', function () { self.setState({ ask: { kind: 'dept', amount: '', why: '' } }); }),
          this.btn('Cấp key', function () { issue(d.members[0]); }, { primary: true, icon: I.plus }))),
      st.newKey ? this.renderNewKey() : null,
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px' } },
        this.statTile('Ngân sách tháng 10', fmtUsd(d.budget), 'làm mới ngày 01/11'),
        h('div', { style: { flex: '1 1 180px', padding: '14px 16px', border: '1px solid ' + (s.pct >= 80 ? '#FDE68A' : T.border), borderRadius: '10px', background: s.pct >= 80 ? '#FFFBEB' : '#fff', display: 'flex', flexDirection: 'column', gap: '8px' } }, h('div', { style: { fontSize: '13px', color: T.muted } }, 'Đã dùng'), this.meter(s.spent, d.budget), h('div', { style: { fontSize: '12px', color: T.subtle } }, 'còn ' + fmtUsd(Math.max(0, d.budget - s.spent)))),
        this.statTile('Đã chia cho key', fmtUsd(s.alloc), s.live.length + ' key đang hiệu lực'),
        this.statTile('Còn chia được', fmtUsd(Math.max(0, s.free)), 'cho key mới hoặc tăng hạn mức')),
      this.tabs([['keys', 'Key', s.keys.length], ['members', 'Thành viên', d.members.length]], tab, function (k) { self.setState({ ktab: k }); }),
      tab === 'keys' ? keyTable : memTable,
      h('div', { style: { fontSize: '13px', color: T.subtle, lineHeight: 1.6 } }, 'Key của thành viên chỉ hiển thị đầy đủ một lần cho chính người đó khi họ nhận key; quản trị phòng không xem được. Key ứng dụng hiển thị một lần cho người tạo.'));
  }
  renderNewKey() {
    var self = this, nk = this.state.newKey;
    return h('div', { role: 'status', style: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px', border: '1px solid #BBF7D0', background: '#F0FDF4', borderRadius: '12px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600, color: '#166534' } }, Ico(I.check, 16, '#166534'), 'Key "' + nk.name + '" đã sẵn sàng'),
      h('div', { style: { fontSize: '14px', color: '#14532D' } }, 'Chép key ngay bây giờ. Vì lý do bảo mật, key đầy đủ chỉ hiển thị một lần này.'),
      this.codeBlock(nk.secret, 'newkey', 'API key'),
      h('div', null, this.btn('Tôi đã lưu key', function () { self.setState({ newKey: null }); })));
  }
  renderMyKeys() {
    var self = this, st = this.state, me = this.me(), mine = this.keys().filter(function (k) { return k.owner === me.name; });
    var d = this.depts().filter(function (x) { return x.id === me.dept; })[0];
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px' } },
      this.areaHead('Key của tôi', 'Key do quản trị phòng ' + d.name + ' (' + d.admin + ') cấp cho bạn. Mỗi key có hạn mức chi phí theo tháng; dùng hết thì lời gọi bị từ chối cho đến kỳ sau hoặc khi được tăng hạn mức.'),
      st.newKey ? this.renderNewKey() : null,
      mine.length ? h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))', gap: '14px' } }, mine.map(function (k) {
        var state = self.keyState(k), spent = self.keySpent(k), dead = state === 'revoked';
        return h('section', { key: k.id, style: { display: 'flex', flexDirection: 'column', gap: '12px', padding: '18px', border: '1px solid ' + (state === 'blocked' ? '#FDE68A' : T.border), borderRadius: '12px', background: state === 'blocked' ? '#FFFBEB' : '#fff', opacity: dead ? 0.6 : 1 } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' } },
            h('div', null, h('h2', { style: { margin: 0, fontSize: '16px', fontWeight: 700 } }, k.name), h('div', { style: { fontFamily: MONO, fontSize: '13px', color: T.subtle, marginTop: '2px' } }, state === 'pending' ? 'Chưa nhận' : k.mask)),
            self.stateBadge(state)),
          state === 'pending' ? h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', padding: '12px 14px', background: T.sky50, border: '1px solid ' + T.sky200, borderRadius: '8px', fontSize: '14px' } },
            h('span', { style: { flex: 1, minWidth: '200px' } }, 'Key mới chờ bạn nhận. Bạn chỉ xem được key đầy đủ một lần.'), self.btn('Nhận key', function () { var sec = 'mk-live-9Tq4vXc2LmB7nRe1Ky5' + k.id; self.setState({ keys: self.keys().map(function (x) { return x.id === k.id ? Object.assign({}, x, { status: 'active', mask: 'mk-live-••••••••' + sec.slice(-4) }) : x; }), newKey: { name: k.name, secret: sec } }); }, { primary: true }))
            : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: T.muted } }, h('span', null, 'Đã dùng tháng này'), h('span', { style: { fontFamily: MONO } }, fmtUsd(spent) + ' / ' + fmtUsd(k.limit))),
                self.meter(spent, k.limit, '100%'),
                state === 'blocked' ? h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13px', color: '#92400E', fontWeight: 600 } }, Ico(I.alert, 14, '#B45309'), 'Đã hết hạn mức. Lời gọi bằng key này đang bị từ chối.') : null),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: '13px', color: T.muted } },
            h('span', null, 'Model: ' + (k.models.length >= MODEL_LIST.length ? 'tất cả' : k.models.join(', '))), h('span', null, 'Hết hạn: ' + k.exp), h('span', null, 'Dùng gần nhất: ' + k.last)),
          dead || state === 'pending' ? null : h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
            self.btn('Xin tăng hạn mức', function () { self.setState({ ask: { kind: 'key', key: k.id, amount: '', why: '' } }); }),
            self.btn('Đổi key', function () { self.setState({ rotate: k.id }); })));
      })) : h('div', { style: { padding: '48px 24px', textAlign: 'center', border: '1px dashed ' + T.borderStrong, borderRadius: '10px', color: T.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' } },
        Ico(I.box, 28, '#94A3B8'), h('div', { style: { fontSize: '16px', fontWeight: 600, color: T.text } }, 'Bạn chưa có key nào'), h('div', { style: { fontSize: '14px' } }, 'Liên hệ quản trị phòng (' + d.admin + ') để được cấp key.')),
      h('div', { style: { fontSize: '13px', color: T.subtle } }, 'Không đưa API key vào mã nguồn hay skill. Đặt key trong biến môi trường hoặc kho bí mật của ứng dụng.'));
  }
  renderKeyDialogs() {
    var self = this, st = this.state;
    var inS = function (err) { return { width: '100%', boxSizing: 'border-box', minHeight: '44px', padding: '10px 12px', border: '1px solid ' + (err ? '#DC2626' : T.borderStrong), borderRadius: '8px', font: 'inherit', fontSize: '14px', color: T.text, background: '#fff' }; };
    var dangerBtn = function (label, fn) { return h('button', { type: 'button', onClick: fn, style: { minHeight: '40px', padding: '0 16px', borderRadius: '8px', border: '1px solid #B91C1C', background: '#B91C1C', color: '#fff', font: 'inherit', fontSize: '14px', fontWeight: 600, cursor: 'pointer' } }, label); };
    var tail = function () { return (Date.now() % 65536).toString(16).padStart(4, '0'); };
    if (st.revoke) {
      var k = this.keys().filter(function (x) { return x.id === st.revoke; })[0], c1 = function () { self.setState({ revoke: null }); };
      return this.dialog('Thu hồi "' + k.name + '"?', h('div', { style: { fontSize: '14px', lineHeight: 1.6 } }, (k.owner ? 'Key của ' + k.owner : 'Key ứng dụng này') + ' sẽ ngừng hoạt động ngay. Hạn mức ' + fmtUsd(k.limit) + ' được trả về ngân sách của phòng. Thao tác không hoàn tác được.'),
        [h(React.Fragment, { key: 'a' }, this.btn('Huỷ', c1), dangerBtn('Thu hồi key', function () { self.setState({ revoke: null, keys: self.keys().map(function (x) { return x.id === k.id ? Object.assign({}, x, { status: 'revoked' }) : x; }) }); self.toast('Đã thu hồi key ' + k.name + '.'); }))], c1);
    }
    if (st.rotate) {
      var kr = this.keys().filter(function (x) { return x.id === st.rotate; })[0], c2 = function () { self.setState({ rotate: null }); };
      return this.dialog('Đổi key "' + kr.name + '"?', h('div', { style: { fontSize: '14px', lineHeight: 1.6 } }, 'Key cũ ngừng hoạt động ngay và bạn nhận một key mới. Hạn mức và chi phí đã dùng trong tháng được giữ nguyên. Dùng khi nghi key bị lộ.'),
        [h(React.Fragment, { key: 'a' }, this.btn('Huỷ', c2), this.btn('Đổi key', function () { var sec = 'mk-live-3Hd8sWq6ZpN1xVu4Jt9' + tail(); self.setState({ rotate: null, keys: self.keys().map(function (x) { return x.id === kr.id ? Object.assign({}, x, { mask: 'mk-live-••••••••' + sec.slice(-4) }) : x; }), newKey: { name: kr.name, secret: sec } }); }, { primary: true }))], c2);
    }
    if (st.ask) {
      var a = st.ask, c3 = function () { self.setState({ ask: null }); }, setA = function (kk, v) { var n = Object.assign({}, a, { err: null }); n[kk] = v; self.setState({ ask: n }); };
      var to = a.kind === 'dept' ? 'quản trị nền tảng' : 'quản trị phòng';
      return this.dialog(a.kind === 'dept' ? 'Xin thêm ngân sách cho phòng' : 'Xin tăng hạn mức key', h(React.Fragment, null,
        this.fieldRow('ak-amt', 'Mức đề nghị', this.usdInput('ak-amt', a.amount, function (v) { setA('amount', v); }, a.err), 'Mức mới cho mỗi tháng, không phải phần tăng thêm.', a.err, true),
        this.fieldRow('ak-why', 'Lý do', h('textarea', { id: 'ak-why', rows: 3, value: a.why, onChange: function (e) { setA('why', e.target.value); }, style: Object.assign(inS(), { resize: 'vertical' }) }), 'Yêu cầu được gửi tới ' + to + '.')),
        [h(React.Fragment, { key: 'a' }, this.btn('Huỷ', c3), this.btn('Gửi yêu cầu', function () { if (!(Number(a.amount) > 0)) { self.setState({ ask: Object.assign({}, a, { err: 'Nhập mức đề nghị lớn hơn 0.' }) }); return; } self.setState({ ask: null }); self.toast('Đã gửi yêu cầu ' + fmtUsd(Number(a.amount)) + ' / tháng tới ' + to + '.'); }, { primary: true }))], c3);
    }
    if (st.dDlg) {
      var dd = st.dDlg, c4 = function () { self.setState({ dDlg: null }); }, setD = function (kk, v) { var n = Object.assign({}, dd, { err: null }); n[kk] = v; self.setState({ dDlg: n }); };
      var cur = dd.id ? this.depts().filter(function (x) { return x.id === dd.id; })[0] : null, alloc = cur ? this.deptStat(cur).alloc : 0;
      var saveD = function () {
        var b = Number(dd.budget);
        if (!dd.name.trim()) { self.setState({ dDlg: Object.assign({}, dd, { err: 'Nhập tên phòng.', ef: 'name' }) }); return; }
        if (!(b > 0)) { self.setState({ dDlg: Object.assign({}, dd, { err: 'Nhập ngân sách lớn hơn 0.', ef: 'budget' }) }); return; }
        if (b < alloc) { self.setState({ dDlg: Object.assign({}, dd, { err: 'Không thể thấp hơn tổng hạn mức đã chia cho key (' + fmtUsd(alloc) + '). Giảm hạn mức key trước.', ef: 'budget' }) }); return; }
        var list = cur ? self.depts().map(function (x) { return x.id === dd.id ? Object.assign({}, x, { name: dd.name, block: dd.block, admin: dd.admin, budget: b }) : x; })
          : self.depts().concat([{ id: 'd' + Date.now(), name: dd.name, block: dd.block || '—', admin: dd.admin || '[Chưa chỉ định]', budget: b, members: dd.admin ? [dd.admin] : [] }]);
        self.setState({ depts: list, dDlg: null }); self.toast(cur ? 'Đã cập nhật ngân sách ' + dd.name + ': ' + fmtUsd(b) + ' / tháng.' : 'Đã thêm phòng ' + dd.name + '.');
      };
      return this.dialog(cur ? 'Sửa ngân sách phòng' : 'Thêm phòng', h(React.Fragment, null,
        this.fieldRow('dd-name', 'Tên phòng', h('input', { id: 'dd-name', value: dd.name, onChange: function (e) { setD('name', e.target.value); }, style: inS(dd.ef === 'name' && dd.err) }), null, dd.ef === 'name' ? dd.err : null, true),
        this.fieldRow('dd-block', 'Khối', h('input', { id: 'dd-block', value: dd.block, onChange: function (e) { setD('block', e.target.value); }, style: inS() })),
        this.fieldRow('dd-admin', 'Quản trị phòng', h('input', { id: 'dd-admin', value: dd.admin, onChange: function (e) { setD('admin', e.target.value); }, style: inS() }), 'Người này được cấp và thu hồi key trong phòng.'),
        this.fieldRow('dd-budget', 'Ngân sách', this.usdInput('dd-budget', dd.budget, function (v) { setD('budget', v); }, dd.ef === 'budget' && dd.err), cur ? 'Đã chia cho key: ' + fmtUsd(alloc) + '. Thay đổi có hiệu lực ngay trong tháng này.' : null, dd.ef === 'budget' ? dd.err : null, true)),
        [h(React.Fragment, { key: 'a' }, this.btn('Huỷ', c4), this.btn('Lưu', saveD, { primary: true }))], c4);
    }
    if (st.kEdit) {
      var e = st.kEdit, ke = this.keys().filter(function (x) { return x.id === e.id; })[0], de = this.depts().filter(function (x) { return x.id === ke.dept; })[0], room = this.deptStat(de).free + ke.limit, spent = this.keySpent(ke), c5 = function () { self.setState({ kEdit: null }); };
      var saveE = function () {
        var v = Number(e.limit);
        if (!(v > 0)) { self.setState({ kEdit: Object.assign({}, e, { err: 'Nhập hạn mức lớn hơn 0.' }) }); return; }
        if (v > room) { self.setState({ kEdit: Object.assign({}, e, { err: 'Vượt phần ngân sách còn chia được của phòng. Tối đa ' + fmtUsd(room) + '.' }) }); return; }
        self.setState({ kEdit: null, keys: self.keys().map(function (x) { return x.id === ke.id ? Object.assign({}, x, { limit: v }) : x; }) }); self.toast('Đã đặt hạn mức ' + fmtUsd(v) + ' / tháng cho ' + ke.name + '.');
      };
      return this.dialog('Sửa hạn mức "' + ke.name + '"', h(React.Fragment, null,
        this.fieldRow('ke-limit', 'Hạn mức', this.usdInput('ke-limit', e.limit, function (v) { self.setState({ kEdit: { id: e.id, limit: v } }); }, e.err), 'Tối đa ' + fmtUsd(room) + ' (phần ngân sách phòng còn chia được). Tháng này key đã dùng ' + fmtUsd(spent) + '.', e.err, true),
        Number(e.limit) > 0 && Number(e.limit) <= spent ? h('div', { style: { display: 'flex', gap: '8px', padding: '10px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', fontSize: '13px', color: '#78350F' } }, Ico(I.alert, 16, '#B45309'), 'Hạn mức này không cao hơn mức đã dùng: key sẽ bị khoá ngay cho đến tháng sau.') : null),
        [h(React.Fragment, { key: 'a' }, this.btn('Huỷ', c5), this.btn('Lưu', saveE, { primary: true }))], c5);
    }
    var d = st.kDlg;
    if (!d) return null;
    var dep = this.depts().filter(function (x) { return x.id === d.dept; })[0], free = this.deptStat(dep).free, c6 = function () { self.setState({ kDlg: null }); };
    var set = function (kk, v) { var n = Object.assign({}, d, { err: null, ef: null }); n[kk] = v; self.setState({ kDlg: n }); };
    var avail = MODEL_LIST.filter(function (m) { return self.isOn(m.id); });
    var create = function () {
      var lim = Number(d.limit), fail = function (ef, err) { self.setState({ kDlg: Object.assign({}, d, { ef: ef, err: err }) }); };
      if (!/^[a-z0-9-]{3,}$/.test(d.name)) return fail('name', 'Tên gồm chữ thường không dấu, số, gạch ngang; tối thiểu 3 ký tự.');
      if (!(lim > 0)) return fail('limit', 'Nhập hạn mức lớn hơn 0.');
      if (lim > free) return fail('limit', 'Phòng chỉ còn chia được ' + fmtUsd(Math.max(0, free)) + '. Giảm hạn mức, thu hồi key khác hoặc xin thêm ngân sách.');
      if (!d.models.length) return fail('models', 'Chọn ít nhất một model.');
      var app = d.kind === 'app', sec = 'mk-live-5Vn2cKx8RqW4mTb7Ls0' + tail();
      var nk = { id: 'k' + Date.now(), dept: d.dept, owner: app ? null : d.owner, name: d.name, mask: app ? 'mk-live-••••••••' + sec.slice(-4) : '—', limit: lim, share: 0, models: d.models, created: '11/10/2026', last: '—', exp: d.exp === '0' ? 'Không hết hạn' : 'sau ' + d.exp + ' ngày', status: app ? 'active' : 'pending' };
      self.setState({ keys: [nk].concat(self.keys()), kDlg: null, ktab: 'keys', newKey: app ? { name: d.name, secret: sec } : null });
      self.toast(app ? 'Đã tạo key ứng dụng ' + d.name + '.' : 'Đã cấp key cho ' + d.owner + '. Họ sẽ thấy key một lần khi mở "Key của tôi".');
    };
    return this.dialog('Cấp key · ' + dep.name, h(React.Fragment, null,
      h('div', { role: 'radiogroup', 'aria-label': 'Cấp cho', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } }, [['member', 'Thành viên', I.bot], ['app', 'Ứng dụng', I.box]].map(function (o) {
        var on = d.kind === o[0];
        return h('button', { key: o[0], type: 'button', role: 'radio', 'aria-checked': on, onClick: function () { set('kind', o[0]); }, style: { display: 'flex', alignItems: 'center', gap: '10px', minHeight: '48px', padding: '0 14px', borderRadius: '8px', border: (on ? '2px solid ' + T.primary : '1px solid ' + T.borderStrong), background: on ? T.sky50 : '#fff', font: 'inherit', fontSize: '14px', fontWeight: 600, color: T.text, cursor: 'pointer' } }, Ico(o[2], 18, on ? T.primary : T.muted), o[1]);
      })),
      d.kind === 'member' ? this.fieldRow('kd-owner', 'Thành viên', this.selectEl(d.owner, function (v) { set('owner', v); }, dep.members.map(function (n) { return [n, n]; }), 'Thành viên', { width: '100%', minHeight: '44px' }), 'Chỉ người này xem được key, một lần duy nhất.') : null,
      this.fieldRow('kd-name', 'Tên key', h('input', { id: 'kd-name', value: d.name, onChange: function (e2) { set('name', e2.target.value); }, placeholder: d.kind === 'app' ? 'ten-ung-dung-prod' : 'ten-thanh-vien-ide', style: Object.assign(inS(d.ef === 'name'), { fontFamily: MONO }) }), 'Hiện trong báo cáo chi phí.', d.ef === 'name' ? d.err : null, true),
      this.fieldRow('kd-limit', 'Hạn mức chi phí', this.usdInput('kd-limit', d.limit, function (v) { set('limit', v); }, d.ef === 'limit'), 'Phòng còn chia được ' + fmtUsd(Math.max(0, free)) + '. Dùng hết hạn mức thì key bị khoá đến tháng sau.', d.ef === 'limit' ? d.err : null, true),
      h('fieldset', { style: { border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' } },
        h('legend', { style: { fontSize: '14px', fontWeight: 600, padding: 0, marginBottom: '8px' } }, 'Model được dùng'),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } }, avail.map(function (m) {
          var on = d.models.indexOf(m.id) >= 0;
          return h('label', { key: m.id, style: { display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid ' + (on ? T.primary : T.borderStrong), background: on ? T.sky50 : '#fff', fontFamily: MONO, fontSize: '13px', cursor: 'pointer' } },
            h('input', { type: 'checkbox', checked: on, onChange: function () { set('models', on ? d.models.filter(function (x) { return x !== m.id; }) : d.models.concat([m.id])); }, style: { margin: 0, accentColor: T.primary } }), m.id);
        })),
        h('div', { style: { fontSize: '12px', color: T.subtle } }, 'Chỉ liệt kê model đang bật.'),
        d.ef === 'models' ? h('div', { role: 'alert', style: { fontSize: '13px', color: '#B91C1C' } }, d.err) : null),
      this.fieldRow('kd-exp', 'Thời hạn', this.selectEl(d.exp, function (v) { set('exp', v); }, [['30', '30 ngày'], ['90', '90 ngày'], ['365', '1 năm'], ['0', 'Không hết hạn']], 'Thời hạn', { width: '100%', minHeight: '44px' }))),
      [h(React.Fragment, { key: 'a' }, this.btn('Huỷ', c6), this.btn('Cấp key', create, { primary: true }))], c6);
  }

  // ── sử dụng & chi phí ──
  renderUsage() {
    var self = this, st = this.state, days = st.urange || 30, by = st.uby || 'model', view = st.uview || 'chart';
    var sh = this.scopeShare(), scale = function (u) { var o = {}; for (var k in u) o[k] = u[k] * sh; return o; }, role = this.role(), me = this.me();
    var per = MODEL_LIST.map(function (m) { return [m, scale(usageSum(m, days))]; }).sort(function (a, b) { return b[1].cost - a[1].cost; });
    var tot = { req: 0, pages: 0, tin: 0, tout: 0, cache: 0, cost: 0 }; per.forEach(function (x) { for (var k in tot) tot[k] += x[1][k]; });
    var step = days > 31 ? 7 : 1, pts = [];
    for (var d = days - 1; d >= 0; d -= step) { var c = 0; for (var j = 0; j < step && d - j >= 0; j++) MODEL_LIST.forEach(function (m) { c += usageDay(m, d - j).cost * sh; }); var dt = new Date(2026, 9, 11 - d); pts.push({ label: ('0' + dt.getDate()).slice(-2) + '/' + ('0' + (dt.getMonth() + 1)).slice(-2), cost: c }); }
    var max = Math.max.apply(null, pts.map(function (p) { return p.cost; })), unit = Math.pow(10, Math.floor(Math.log10(max))), top = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].filter(function (k) { return k * unit >= max; })[0] * unit;
    var W = 1000, H = 230, L = 64, R = 8, Tp = 12, B = 28, pw = (W - L - R) / pts.length, bw = Math.max(4, pw - 2), ph = H - Tp - B, hov = st.uhov;
    var bar = function (p, i) {
      var x = L + i * pw + (pw - bw) / 2, hh = Math.max(1, p.cost / top * ph), y = Tp + ph - hh, r = Math.min(4, bw / 2, hh);
      return h('path', { key: i, d: 'M' + x + ',' + (y + hh) + ' V' + (y + r) + ' Q' + x + ',' + y + ' ' + (x + r) + ',' + y + ' H' + (x + bw - r) + ' Q' + (x + bw) + ',' + y + ' ' + (x + bw) + ',' + (y + r) + ' V' + (y + hh) + ' Z', fill: hov === i ? T.primaryDark : T.primary });
    };
    var sk = this.scopeKeys(), month = sk.reduce(function (a2, k) { return a2 + self.keySpent(k); }, 0);
    var myDept = this.depts().filter(function (x) { return x.id === me.dept; })[0];
    var budget = role === 'admin' ? this.depts().reduce(function (a2, x) { return a2 + x.budget; }, 0) : role === 'dept' ? myDept.budget : sk.filter(function (k) { return k.status !== 'revoked'; }).reduce(function (a2, k) { return a2 + k.limit; }, 0);
    var bLabel = role === 'admin' ? 'Ngân sách tháng 10 · toàn ngân hàng' : role === 'dept' ? 'Ngân sách tháng 10 · ' + myDept.name : 'Hạn mức tháng 10 · key của tôi';
    var pct = budget ? Math.min(100, month / budget * 100) : 0;
    var thS = { textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: T.muted, borderBottom: '1px solid ' + T.border, background: T.surface, whiteSpace: 'nowrap' };
    var tdS = { padding: '12px', borderBottom: '1px solid ' + T.border, fontSize: '14px' }, num = Object.assign({}, tdS, { fontFamily: MONO, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }), thR = Object.assign({}, thS, { textAlign: 'right' });
    var seg = function (cur, opts, onPick, label) {
      return h('div', { role: 'group', 'aria-label': label, style: { display: 'inline-flex', padding: '3px', background: T.sky50, border: '1px solid ' + T.sky100, borderRadius: '8px' } }, opts.map(function (o) {
        var on = o[0] === cur;
        return h('button', { key: o[0], type: 'button', 'aria-pressed': on, onClick: function () { onPick(o[0]); }, style: { minHeight: '32px', padding: '0 12px', borderRadius: '6px', border: 'none', background: on ? '#fff' : 'transparent', boxShadow: on ? '0 0 0 1px ' + T.sky200 : 'none', font: 'inherit', fontSize: '13px', fontWeight: on ? 600 : 500, color: on ? T.primaryDark : T.muted, cursor: 'pointer' } }, o[1]);
      }));
    };
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px' } },
      this.areaHead('Sử dụng & chi phí', (role === 'admin' ? 'Toàn ngân hàng. ' : role === 'dept' ? myDept.name + '. ' : 'Các key của tôi. ') + 'Chi phí tính bằng USD theo mức dùng thực tế: model ngôn ngữ theo 1 triệu token input, cache và output; model tài liệu theo số trang. Mọi khoản đều gắn với API key đã gọi.',
        seg(days, [[7, '7 ngày'], [30, '30 ngày'], [90, '90 ngày']], function (v) { self.setState({ urange: v, uhov: null }); }, 'Khoảng thời gian')),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px' } },
        this.statTile('Chi phí', fmtUsd(tot.cost), days + ' ngày gần nhất'),
        this.statTile('Lượt gọi', fmtN(tot.req)),
        this.statTile('Token input / output', fmtTok(tot.tin) + ' / ' + fmtTok(tot.tout), fmtTok(tot.cache) + ' token đọc từ cache'),
        this.statTile('Trang tài liệu', fmtN(tot.pages), 'OCR, trích xuất, phân loại')),
      h('section', { style: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px 16px', border: '1px solid ' + T.border, borderRadius: '10px' } },
        h('div', { style: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '8px', fontSize: '14px' } }, h('span', { style: { fontWeight: 600 } }, bLabel), h('span', { style: { fontFamily: MONO } }, fmtUsd(month) + ' / ' + fmtUsd(budget))),
        h('div', { role: 'progressbar', 'aria-valuenow': Math.round(pct), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Đã dùng ngân sách tháng', style: { height: '8px', borderRadius: '999px', background: '#E2E8F0', overflow: 'hidden' } }, h('div', { style: { width: pct + '%', height: '100%', borderRadius: '999px', background: pct > 85 ? '#D97706' : T.primary } })),
        h('div', { style: { fontSize: '12px', color: T.subtle } }, 'Đã dùng ' + Math.round(pct) + '% sau 11 ngày. Dùng hết thì gateway từ chối lời gọi cho đến ngày 01/11 hoặc khi được cấp thêm.')),

      h('section', { style: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px', border: '1px solid ' + T.border, borderRadius: '10px' } },
        h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } },
          h('h2', { style: { margin: 0, fontSize: '16px', fontWeight: 600 } }, 'Chi phí theo ' + (step === 7 ? 'tuần' : 'ngày')),
          seg(view, [['chart', 'Biểu đồ'], ['table', 'Bảng']], function (v) { self.setState({ uview: v }); }, 'Cách xem')),
        view === 'chart' ? h('div', { style: { position: 'relative' } },
          h('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Biểu đồ cột chi phí theo ' + (step === 7 ? 'tuần' : 'ngày') + ', tổng ' + fmtUsd(tot.cost), style: { width: '100%', height: 'auto', display: 'block' }, onMouseLeave: function () { self.setState({ uhov: null }); } },
            [0, 0.5, 1].map(function (g) { var y = Tp + ph - g * ph; return h('g', { key: g }, h('line', { x1: L, x2: W - R, y1: y, y2: y, stroke: '#E2E8F0', strokeWidth: 1 }), h('text', { x: L - 8, y: y + 4, textAnchor: 'end', fontSize: 11, fill: T.subtle, fontFamily: 'IBM Plex Mono, monospace' }, g ? fmtUsd(top * g) : '0')); }),
            pts.map(bar),
            pts.map(function (p, i) { var every = Math.ceil(pts.length / 8), last = pts.length - 1; return ((i % every === 0 && last - i >= every / 2) || i === last) ? h('text', { key: 't' + i, x: L + i * pw + pw / 2, y: H - 8, textAnchor: 'middle', fontSize: 11, fill: T.subtle, fontFamily: 'IBM Plex Mono, monospace' }, p.label) : null; }),
            pts.map(function (p, i) { return h('rect', { key: 'h' + i, x: L + i * pw, y: Tp, width: pw, height: ph, fill: 'transparent', tabIndex: 0, 'aria-label': p.label + ': ' + fmtUsd(p.cost), onMouseEnter: function () { self.setState({ uhov: i }); }, onFocus: function () { self.setState({ uhov: i }); }, onBlur: function () { self.setState({ uhov: null }); } }); })),
          hov != null && pts[hov] ? h('div', { style: { position: 'absolute', top: 0, left: 'calc(' + ((L + hov * pw + pw / 2) / W * 100) + '% )', transform: 'translateX(' + (hov > pts.length * 0.8 ? '-100%' : hov < pts.length * 0.2 ? '0' : '-50%') + ')', pointerEvents: 'none', padding: '6px 10px', borderRadius: '8px', background: T.text, color: '#fff', fontSize: '12px', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(11,19,66,.25)' } },
            h('div', { style: { opacity: 0.75 } }, (step === 7 ? 'Tuần đến ' : '') + pts[hov].label), h('div', { style: { fontFamily: MONO, fontSize: '13px', fontWeight: 600 } }, fmtUsd(pts[hov].cost))) : null)
          : h('div', { style: { maxHeight: '260px', overflowY: 'auto', border: '1px solid ' + T.border, borderRadius: '8px' } }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
              h('thead', null, h('tr', null, h('th', { style: thS }, step === 7 ? 'Tuần đến ngày' : 'Ngày'), h('th', { style: thR }, 'Chi phí'))),
              h('tbody', null, pts.slice().reverse().map(function (p) { return h('tr', { key: p.label }, h('td', { style: Object.assign({}, tdS, { fontFamily: MONO, fontSize: '13px' }) }, p.label), h('td', { style: num }, fmtUsd(p.cost))); }))))),

      h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } },
        h('h2', { style: { margin: 0, fontSize: '16px', fontWeight: 600 } }, 'Chi tiết'), seg(by, [['model', 'Theo model'], ['key', 'Theo API key']], function (v) { self.setState({ uby: v }); }, 'Nhóm theo')),
      h('div', { style: { overflowX: 'auto', border: '1px solid ' + T.border, borderRadius: '10px' } }, by === 'model'
        ? h('table', { style: { width: '100%', minWidth: '900px', borderCollapse: 'collapse' } },
            h('thead', null, h('tr', null, h('th', { style: thS }, 'Model'), h('th', { style: thS }, 'Loại'), h('th', { style: thR }, 'Lượt gọi'), h('th', { style: thR }, 'Token input'), h('th', { style: thR }, 'Trong đó cache'), h('th', { style: thR }, 'Token output'), h('th', { style: thR }, 'Trang'), h('th', { style: thR }, 'Chi phí'))),
            h('tbody', null, per.map(function (x) {
              var m = x[0], u = x[1], dash = h('span', { style: { color: T.subtle } }, '—');
              return h('tr', { key: m.id, className: 'mx-row' },
                h('td', { style: tdS }, self.linkBtn(m.name, function () { self.openModel(m.id, 'usage'); }), h('div', { style: { fontFamily: MONO, fontSize: '12px', color: T.subtle } }, m.id)),
                h('td', { style: tdS }, self.typeBadge(m)), h('td', { style: num }, fmtN(u.req)), h('td', { style: num }, u.tin ? fmtTok(u.tin) : dash), h('td', { style: num }, u.cache ? fmtTok(u.cache) : dash), h('td', { style: num }, u.tout ? fmtTok(u.tout) : dash), h('td', { style: num }, u.pages ? fmtN(u.pages) : dash), h('td', { style: Object.assign({}, num, { fontWeight: 600 }) }, fmtUsd(u.cost)));
            })),
            h('tfoot', null, h('tr', null, h('td', { style: Object.assign({}, tdS, { fontWeight: 700, borderBottom: 'none' }), colSpan: 2 }, 'Tổng'), h('td', { style: Object.assign({}, num, { borderBottom: 'none' }) }, fmtN(tot.req)), h('td', { style: Object.assign({}, num, { borderBottom: 'none' }) }, fmtTok(tot.tin)), h('td', { style: Object.assign({}, num, { borderBottom: 'none' }) }, fmtTok(tot.cache)), h('td', { style: Object.assign({}, num, { borderBottom: 'none' }) }, fmtTok(tot.tout)), h('td', { style: Object.assign({}, num, { borderBottom: 'none' }) }, fmtN(tot.pages)), h('td', { style: Object.assign({}, num, { fontWeight: 700, borderBottom: 'none' }) }, fmtUsd(tot.cost)))))
        : h('table', { style: { width: '100%', minWidth: '820px', borderCollapse: 'collapse' } },
            h('thead', null, h('tr', null, h('th', { style: thS }, 'API key'), h('th', { style: thS }, 'Cấp cho'), h('th', { style: thS }, 'Phòng'), h('th', { style: thR }, 'Lượt gọi'), h('th', { style: thR }, 'Chi phí'), h('th', { style: thR }, 'Hạn mức tháng'))),
            h('tbody', null, sk.filter(function (k) { return k.share; }).sort(function (x, y) { return y.share - x.share; }).map(function (k) {
              var dn = self.depts().filter(function (x) { return x.id === k.dept; })[0];
              return h('tr', { key: k.id, className: 'mx-row' }, h('td', { style: tdS }, h('div', { style: { fontWeight: 600 } }, k.name), h('div', { style: { fontFamily: MONO, fontSize: '12px', color: T.subtle } }, k.mask)), h('td', { style: tdS }, k.owner || 'Ứng dụng'), h('td', { style: tdS }, dn.name),
                h('td', { style: num }, fmtN(tot.req * k.share / sh)), h('td', { style: Object.assign({}, num, { fontWeight: 600 }) }, fmtUsd(tot.cost * k.share / sh)), h('td', { style: num }, fmtUsd(k.limit)));
            })))));
  }

  // ── app: khung ──
  renderHeader() {
    var self = this, st = this.state, page = st.page || 'models', cur = page === 'model' ? 'models' : page === 'mcpd' ? 'mcp' : page;
    return h('header', { style: { position: 'sticky', top: 0, zIndex: 50, background: '#fff', borderBottom: '1px solid ' + T.border } },
      h('div', { style: { maxWidth: '1440px', margin: '0 auto', padding: '0 32px', minHeight: '60px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 24px' } },
        h('button', { type: 'button', onClick: function () { self.go({ page: 'models' }); }, 'aria-label': 'MaaS – về trang Models', style: { display: 'flex', alignItems: 'center', gap: '10px', border: 'none', background: 'transparent', padding: 0, font: 'inherit', cursor: 'pointer', color: T.text } },
          h('span', { style: { position: 'relative', width: '30px', height: '30px', borderRadius: '8px', background: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, Ico('M4 4h6v6H4z|M14 4h6v6h-6z|M4 14h6v6H4z|M14 14h6v6h-6z', 16, '#fff'),
            h('span', { style: { position: 'absolute', top: '-3px', right: '-3px', width: '9px', height: '9px', borderRadius: '999px', background: '#EB2D4B', border: '2px solid #fff' } })),
          h('span', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 } }, h('span', { style: { fontWeight: 700, fontSize: '16px' } }, 'MaaS'), h('span', { style: { fontSize: '11px', color: T.subtle } }, 'Nền tảng AI toàn ngân hàng'))),
        h('nav', { 'aria-label': 'Chính', style: { display: 'flex', flexWrap: 'wrap', alignSelf: 'stretch', gap: '4px' } }, NAV.map(function (n) {
          var on = n[0] === cur;
          return h('button', { key: n[0], type: 'button', 'aria-current': on ? 'page' : undefined, className: 'mx-tab', onClick: function () { self.go(n[0] === 'skills' ? { page: 'skills', area: 'repo', view: 'list' } : { page: n[0] }); },
            style: { display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '60px', padding: '0 12px', border: 'none', borderBottom: '2px solid ' + (on ? T.primary : 'transparent'), background: 'transparent', font: 'inherit', fontSize: '14px', fontWeight: on ? 600 : 500, color: on ? T.primary : T.muted, cursor: 'pointer' } },
            n[1]);
        })),
        h('div', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '14px', flex: '0 1 420px' } },
          h('label', { style: { position: 'relative', flex: 1, display: 'block' } },
            h('span', { style: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' } }, 'Tìm model, skill'),
            h('span', { style: { position: 'absolute', left: '12px', top: '11px', color: T.subtle, display: 'flex' } }, Ico(I.search, 16)),
            h('input', { type: 'search', value: st.gq || '', placeholder: 'Tìm model, skill… (Enter)', onChange: function (e) { self.setState({ gq: e.target.value }); },
              onKeyDown: function (e) { if (e.key !== 'Enter') return; var v = st.gq || ''; var inSkills = self.skills().some(function (s) { return (s.name + s.id).toLowerCase().indexOf(v.toLowerCase()) >= 0; }) && !MODEL_LIST.some(function (m) { return (m.name + m.id).toLowerCase().indexOf(v.toLowerCase()) >= 0; }); self.go(inSkills ? { page: 'skills', area: 'repo', view: 'list', q: v } : { page: 'models', mq: v }); },
              style: { width: '100%', boxSizing: 'border-box', minHeight: '38px', padding: '0 12px 0 36px', border: '1px solid ' + T.border, borderRadius: '8px', font: 'inherit', fontSize: '14px', color: T.text, background: T.sky50 } })),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flex: 'none' } },
            h('span', { 'aria-hidden': true, style: { width: '32px', height: '32px', borderRadius: '999px', background: T.sky100, color: T.primaryDark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 } }, this.me().ini),
            h('span', { style: { display: 'flex', flexDirection: 'column', lineHeight: 1.2 } }, h('span', { style: { fontSize: '13px', fontWeight: 600 } }, this.me().name),
              h('select', { 'aria-label': 'Xem với vai trò (chỉ có trong prototype)', title: 'Đổi vai trò để xem giao diện của từng vai trò (chỉ có trong prototype)', value: this.role(), onChange: function (e) { self.setState({ role: e.target.value, kdept: null, newKey: null, uby: 'model' }); },
                style: { border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontSize: '11px', color: T.primary, fontWeight: 600, cursor: 'pointer' } }, ROLES.map(function (r) { return h('option', { key: r[0], value: r[0] }, r[1]); })))))));
  }
  renderSkills() {
    var st = this.state, area = st.area || 'repo';
    var page = area === 'sets' ? this.renderSets() : area === 'wanted' ? this.renderWanted() : st.view === 'detail' ? this.renderDetail() : this.renderList();
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '22px' } }, this.subnav(), page);
  }
  renderVals() {
    var st = this.state, page = st.page || 'models';
    var content = page === 'models' ? this.renderModels() : page === 'model' ? this.renderModel() : page === 'playground' ? this.renderPlayground() : page === 'skills' ? this.renderSkills()
      : page === 'mcp' ? this.renderMcp() : page === 'mcpd' ? this.renderMcpServer() : page === 'keys' ? this.renderKeys() : this.renderUsage();
    return {
      app: h('div', { style: { minHeight: '100vh', background: '#fff', color: T.text, fontFamily: "'IBM Plex Sans', sans-serif" } },
        h('a', { href: '#main', className: 'mx-skip' }, 'Bỏ qua tới nội dung'),
        this.renderHeader(),
        h('div', { id: 'main', style: { maxWidth: '1440px', margin: '0 auto', padding: '24px 32px 64px' } }, content),
        this.renderToggle(), this.renderPgApi(), this.renderKeyDialogs(), this.renderMcpDialogs(), this.renderRegister(), this.renderPropose(),
        st.toastMsg ? h('div', { role: 'status', 'aria-live': 'polite', style: { position: 'fixed', top: '76px', right: '24px', zIndex: 130, display: 'flex', gap: '10px', alignItems: 'center', maxWidth: '420px', padding: '12px 16px', borderRadius: '10px', background: '#fff', border: '1px solid #BBF7D0', borderLeft: '4px solid #16A34A', boxShadow: '0 8px 24px rgba(11,19,66,.12)', fontSize: '14px' } }, Ico(I.check, 16, '#166534'), st.toastMsg) : null)
    };
  }
