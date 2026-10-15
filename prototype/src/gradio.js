// ── Dùng thử: renderer giao diện Gradio ──────────────────────────────
// Tab "Dùng thử" không vẽ cứng UI. Nó đọc cấu hình Gradio (cùng dạng JSON
// mà GET /config của một Gradio app trả về: components + layout +
// dependencies) và dựng giao diện từ đó. Model khác → config khác → UI khác.
// `mock` trên dependency chỉ có trong prototype, thay cho lời gọi thật
// tới backend Gradio qua gateway.

function docSample(title, rows, tone) {
  var y = 70, body = '';
  rows.forEach(function (r) {
    if (r === '#') { body += '<rect x="24" y="' + (y - 11) + '" width="150" height="13" fill="#1f2937"/>'; }
    else { body += '<text x="24" y="' + y + '" font-size="12" fill="#1f2937">' + r + '</text>'; }
    y += 22;
  });
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="' + (y + 10) + '" viewBox="0 0 360 ' + (y + 10) + '">' +
    '<rect width="100%" height="100%" fill="' + (tone || '#fffdf7') + '"/>' +
    '<rect x="12" y="12" width="336" height="' + (y - 14) + '" fill="none" stroke="#cbd5e1"/>' +
    '<text x="180" y="42" font-size="15" font-weight="700" text-anchor="middle" fill="#111827" font-family="sans-serif">' + title + '</text>' +
    '<g font-family="monospace">' + body + '</g></svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

var OCR_SAMPLES = {
  unc: {
    name: 'uy_nhiem_chi.png',
    url: docSample('ỦY NHIỆM CHI', ['Số: UNC-2026-00418', 'Ngày: 03/10/2026', 'Đơn vị trả tiền:', '#', 'Số tiền: 125.000.000 VND', 'Bằng chữ: Một trăm hai mươi lăm triệu đồng', 'Nội dung: Thanh toán HĐ 18/2026']),
    lines: [['ỦY NHIỆM CHI', 0.99], ['Số: UNC-2026-00418', 0.98], ['Ngày: 03/10/2026', 0.97], ['Đơn vị trả tiền:', 0.96], ['[đã che]', 0.0], ['Số tiền: 125.000.000 VND', 0.95], ['Bằng chữ: Một trăm hai mươi lăm triệu đồng', 0.41], ['Nội dung: Thanh toán HĐ 18/2026', 0.88]]
  },
  hd: {
    name: 'hop_dong_scan.jpg',
    url: docSample('HỢP ĐỒNG TÍN DỤNG', ['Số: 18/2026/HĐTD', 'Bên vay:', '#', 'Hạn mức: 2.000.000.000 VND', 'Thời hạn: 12 tháng', 'Lãi suất: theo từng khế ước nhận nợ'], '#f8f7f2'),
    lines: [['HỢP ĐỒNG TÍN DỤNG', 0.99], ['Số: 18/2026/HĐTD', 0.97], ['Bên vay:', 0.96], ['[đã che]', 0.0], ['Hạn mức: 2.000.000.000 VND', 0.93], ['Thời hạn: 12 tháng', 0.95], ['Lãi suất: theo từng khế ước nhận nợ', 0.46]]
  },
  hddt: {
    name: 'hoa_don_gtgt.pdf',
    url: docSample('HOÁ ĐƠN GTGT', ['Ký hiệu: 1C26TAA', 'Số: 0001523', 'Người mua:', '#', 'Cộng tiền hàng: 48.200.000', 'Thuế GTGT 10%: 4.820.000', 'Tổng thanh toán: 53.020.000'], '#fbfaf5'),
    lines: [['HOÁ ĐƠN GTGT', 0.99], ['Ký hiệu: 1C26TAA', 0.92], ['Số: 0001523', 0.98], ['Người mua:', 0.96], ['[đã che]', 0.0], ['Cộng tiền hàng: 48.200.000', 0.94], ['Thuế GTGT 10%: 4.820.000', 0.9], ['Tổng thanh toán: 53.020.000', 0.62]]
  }
};

var GR_CONFIGS = {
  ocr: {
    tag: 'cppd-ocr', kind: 'Blocks',
    space: 'ai-xu-ly-tai-lieu/cppd-ocr-demo',
    version: '4.44.1', mode: 'blocks', title: 'CPPD-OCR demo', theme: 'maas',
    components: [
      { id: 1, type: 'markdown', props: { value: '### Nhận dạng chữ in tiếng Việt\nTải lên ảnh chứng từ **đã che thông tin khách hàng**. Model trả về từng dòng văn bản, toạ độ và độ tin cậy.' } },
      { id: 2, type: 'row', props: {} },
      { id: 3, type: 'column', props: { scale: 1 } },
      { id: 4, type: 'image', props: { label: 'Ảnh chứng từ', sources: ['upload', 'clipboard'], height: 300, api_param: 'image' } },
      { id: 5, type: 'accordion', props: { label: 'Tuỳ chọn nâng cao', open: false } },
      { id: 6, type: 'dropdown', props: { label: 'Ngôn ngữ', choices: [['Tiếng Việt', 'vi'], ['Tiếng Việt + Anh', 'vi+en']], value: 'vi', api_param: 'lang' } },
      { id: 7, type: 'slider', props: { label: 'Ngưỡng tin cậy', info: 'Dòng có độ tin cậy dưới ngưỡng sẽ được đánh dấu', minimum: 0, maximum: 1, step: 0.05, value: 0.5, api_param: 'threshold' } },
      { id: 8, type: 'checkbox', props: { label: 'Trả kèm toạ độ (bbox)', value: true, api_param: 'return_boxes' } },
      { id: 9, type: 'row', props: {} },
      { id: 10, type: 'clearbutton', props: { value: 'Xoá', variant: 'secondary', components: [4, 13, 14] } },
      { id: 11, type: 'button', props: { value: 'Chạy nhận dạng', variant: 'primary' } },
      { id: 12, type: 'column', props: { scale: 1 } },
      { id: 13, type: 'highlightedtext', props: { label: 'Văn bản nhận dạng', color_map: { 'tin cậy thấp': '#D97706', 'đã che': '#64748b' }, show_legend: true } },
      { id: 14, type: 'json', props: { label: 'Kết quả JSON' } },
      { id: 15, type: 'dataset', props: { label: 'Ví dụ (ảnh mẫu đã che)', components: [4], samples: [[{ key: 'unc' }], [{ key: 'hd' }], [{ key: 'hddt' }]] } }
    ],
    layout: { id: 0, children: [{ id: 1 }, { id: 2, children: [
      { id: 3, children: [{ id: 4 }, { id: 5, children: [{ id: 6 }, { id: 7 }, { id: 8 }] }, { id: 9, children: [{ id: 10 }, { id: 11 }] }] },
      { id: 12, children: [{ id: 13 }, { id: 14 }] }
    ] }, { id: 15 }] },
    dependencies: [{ targets: [[11, 'click']], inputs: [4, 6, 7, 8], outputs: [13, 14], api_name: 'predict', mock: 'ocr' }]
  },

  classify: {
    tag: 'doc-classify', kind: 'Interface',
    space: 'ai-xu-ly-tai-lieu/doc-classify-demo',
    version: '4.44.1', mode: 'interface', title: 'Phân loại chứng từ', theme: 'maas',
    components: [
      { id: 1, type: 'markdown', props: { value: '### Phân loại chứng từ\nDán đoạn văn bản đã OCR, model trả về loại chứng từ và xác suất.' } },
      { id: 2, type: 'row', props: {} },
      { id: 3, type: 'column', props: { scale: 1 } },
      { id: 4, type: 'textbox', props: { label: 'Văn bản', lines: 6, placeholder: 'Dán nội dung chứng từ…', api_param: 'text' } },
      { id: 5, type: 'radio', props: { label: 'Số nhãn trả về', choices: [['Top 3', 3], ['Top 5', 5]], value: 3, api_param: 'top_k' } },
      { id: 6, type: 'row', props: {} },
      { id: 7, type: 'clearbutton', props: { value: 'Clear', variant: 'secondary', components: [4, 9] } },
      { id: 8, type: 'button', props: { value: 'Submit', variant: 'primary' } },
      { id: 10, type: 'column', props: { scale: 1 } },
      { id: 9, type: 'label', props: { label: 'Loại chứng từ', num_top_classes: 5 } },
      { id: 11, type: 'button', props: { value: 'Flag', variant: 'secondary' } },
      { id: 12, type: 'dataset', props: { label: 'Examples', components: [4], samples: [['Ủy nhiệm chi số UNC-2026-00418, số tiền 125.000.000 VND, nội dung thanh toán hợp đồng 18/2026'], ['Hợp đồng tín dụng số 18/2026/HĐTD, hạn mức 2.000.000.000 VND, thời hạn 12 tháng'], ['Hoá đơn giá trị gia tăng ký hiệu 1C26TAA, thuế GTGT 10%']] } }
    ],
    layout: { id: 0, children: [{ id: 1 }, { id: 2, children: [
      { id: 3, children: [{ id: 4 }, { id: 5 }, { id: 6, children: [{ id: 7 }, { id: 8 }] }] },
      { id: 10, children: [{ id: 9 }, { id: 11 }] }
    ] }, { id: 12 }] },
    dependencies: [
      { targets: [[8, 'click'], [4, 'submit']], inputs: [4, 5], outputs: [9], api_name: 'predict', mock: 'classify' },
      { targets: [[11, 'click']], inputs: [], outputs: [], api_name: false, mock: 'flag' }
    ]
  },

  chat: {
    tag: 'tro-ly-noi-bo', kind: 'ChatInterface',
    space: 'nen-tang-ai/tro-ly-noi-bo-demo',
    version: '4.44.1', mode: 'chat_interface', title: 'Trợ lý nội bộ', theme: 'maas',
    components: [
      { id: 1, type: 'chatbot', props: { label: 'Trợ lý nội bộ', height: 360, placeholder: 'Hỏi về quy định, quy trình, sản phẩm, tài liệu nội bộ…' } },
      { id: 2, type: 'row', props: {} },
      { id: 3, type: 'textbox', props: { show_label: false, lines: 1, placeholder: 'Nhập câu hỏi…', scale: 7, api_param: 'message' } },
      { id: 4, type: 'button', props: { value: 'Gửi', variant: 'primary', scale: 1 } },
      { id: 5, type: 'row', props: {} },
      { id: 6, type: 'button', props: { value: 'Thử lại', variant: 'secondary', size: 'sm' } },
      { id: 7, type: 'button', props: { value: 'Hoàn tác', variant: 'secondary', size: 'sm' } },
      { id: 8, type: 'clearbutton', props: { value: 'Xoá hội thoại', variant: 'secondary', size: 'sm', components: [1, 3] } },
      { id: 9, type: 'accordion', props: { label: 'Tham số sinh', open: false } },
      { id: 10, type: 'slider', props: { label: 'Temperature', minimum: 0, maximum: 1, step: 0.1, value: 0.3, api_param: 'temperature' } },
      { id: 11, type: 'number', props: { label: 'Max tokens', value: 512, api_param: 'max_tokens' } },
      { id: 12, type: 'dataset', props: { label: 'Gợi ý', components: [3], samples: [['Thay đổi khẩn cấp trên production cần ai phê duyệt?'], ['Hạn mức phê duyệt tín dụng của chi nhánh cấp 1 là bao nhiêu?'], ['Log production mức "Mật" có được dán vào ticket không?']] } }
    ],
    layout: { id: 0, children: [{ id: 1 }, { id: 2, children: [{ id: 3 }, { id: 4 }] }, { id: 5, children: [{ id: 6 }, { id: 7 }, { id: 8 }] }, { id: 9, children: [{ id: 10 }, { id: 11 }] }, { id: 12 }] },
    dependencies: [
      { targets: [[4, 'click'], [3, 'submit']], inputs: [3, 1, 10, 11], outputs: [1, 3], api_name: 'chat', mock: 'chat', show_progress: 'minimal' },
      { targets: [[6, 'click']], inputs: [1], outputs: [1], api_name: false, mock: 'retry', show_progress: 'minimal' },
      { targets: [[7, 'click']], inputs: [1], outputs: [1, 3], api_name: false, mock: 'undo' }
    ]
  }
};

var THEMES = {
  maas: { p: '#2F6BEA', ph: '#141ED2', p50: '#F2F6FE', p100: '#E3ECFD', p300: '#93B4F6', pt: '#141ED2' },
  default: { p: '#f97316', ph: '#ea580c', p50: '#fff7ed', p100: '#ffedd5', p300: '#fdba74', pt: '#c2410c' },
  soft: { p: '#6366f1', ph: '#4f46e5', p50: '#eef2ff', p100: '#e0e7ff', p300: '#a5b4fc', pt: '#4338ca' }
};

var MOCKS = {
  ocr: function (inp, ctx) {
    var img = inp[0], thr = inp[2], boxes = inp[3];
    if (!img) { ctx.error('Chưa có ảnh đầu vào. Tải ảnh lên hoặc chọn một ví dụ.'); return; }
    var sample = OCR_SAMPLES[img.key];
    var lines = sample ? sample.lines : [['[Văn bản dòng 1 nhận dạng từ ' + img.name + ']', 0.94], ['[Văn bản dòng 2]', 0.89], ['[Dòng chữ mờ / nghiêng]', 0.38], ['[Văn bản dòng 4]', 0.91]];
    ctx.after(1100 + Math.random() * 700, function () {
      var hl = [];
      lines.forEach(function (l, i) {
        var lab = l[1] === 0 ? 'đã che' : (l[1] < thr ? 'tin cậy thấp' : null);
        hl.push([l[0], lab]);
        if (i < lines.length - 1) hl.push(['\n', null]);
      });
      var out = { model: 'cppd-ocr', version: 'v[x.y]', lang: inp[1], page_count: 1, lines: lines.map(function (l, i) {
        var o = { text: l[0], confidence: l[1] };
        if (boxes) o.bbox = [24, 55 + i * 22, 24 + Math.min(320, l[0].length * 7), 70 + i * 22];
        return o;
      }) };
      ctx.set(13, hl); ctx.set(14, out); ctx.done();
    });
  },
  classify: function (inp, ctx) {
    var text = (inp[0] || '').toLowerCase();
    if (!text.trim()) { ctx.error('Trường "Văn bản" đang trống.'); return; }
    var base = [['Ủy nhiệm chi', 0.05], ['Hợp đồng tín dụng', 0.05], ['Hoá đơn GTGT', 0.05], ['Sao kê tài khoản', 0.04], ['Giấy đề nghị vay vốn', 0.03]];
    var hit = text.indexOf('nhiệm chi') >= 0 ? 0 : text.indexOf('hợp đồng') >= 0 ? 1 : text.indexOf('hoá đơn') >= 0 || text.indexOf('hóa đơn') >= 0 ? 2 : 4;
    base[hit][1] = 0.78 + Math.random() * 0.15;
    var sum = base.reduce(function (a, b) { return a + b[1]; }, 0);
    var conf = base.map(function (b) { return { label: b[0], confidence: b[1] / sum }; }).sort(function (a, b) { return b.confidence - a.confidence; }).slice(0, inp[1]);
    ctx.after(700, function () { ctx.set(9, { label: conf[0].label, confidences: conf }); ctx.done(); });
  },
  flag: function (inp, ctx) { ctx.info('Đã gắn cờ mẫu này để đội sở hữu rà soát.'); ctx.done(); },
  chat: function (inp, ctx) {
    var msg = (inp[0] || '').trim();
    if (!msg) { ctx.done(); return; }
    var hist = (inp[1] || []).concat([[msg, null]]);
    ctx.set(1, hist); ctx.set(3, '');
    var answer = /mật/i.test(msg)
      ? 'Không. Log production mức "Mật" phải được che dữ liệu nhạy cảm (skill che-du-lieu-nhay-cam) trước khi dán vào ticket hoặc gửi cho model. [Trích dẫn: Quy định ATTT, Điều —]'
      : /khẩn cấp|thay đổi/i.test(msg)
        ? 'Thay đổi khẩn cấp cần phê duyệt của quản lý ca trực và chủ hệ thống, sau đó bổ sung hồ sơ thay đổi trong thời hạn quy định. [Chi tiết lấy từ quy trình quản lý thay đổi hiện hành — prototype không có dữ liệu thật.]'
        : /hạn mức/i.test(msg)
          ? 'Hạn mức phê duyệt phụ thuộc phân cấp chi nhánh và loại khách hàng. [Số liệu cụ thể lấy từ văn bản phân cấp hiện hành — prototype không có dữ liệu thật.]'
        : 'Đây là câu trả lời mô phỏng của prototype. Khi nối backend, nội dung sẽ được stream từ model qua gateway MaaS.';
    ctx.stream(1, hist, answer);
  },
  retry: function (inp, ctx) {
    var hist = (inp[0] || []).slice();
    if (!hist.length) { ctx.done(); return; }
    var last = hist[hist.length - 1];
    hist[hist.length - 1] = [last[0], null];
    ctx.set(1, hist);
    ctx.stream(1, hist, 'Câu trả lời mô phỏng (sinh lại). Nội dung thật sẽ đến từ model khi nối backend.');
  },
  undo: function (inp, ctx) {
    var hist = (inp[0] || []).slice();
    var last = hist.pop();
    ctx.set(1, hist); ctx.set(3, last ? last[0] : ''); ctx.done();
  }
};

var LAYOUT_TYPES = { row: 1, column: 1, group: 1, accordion: 1, tabs: 1, tabitem: 1 };
var C = { border: '#E2E8F0', label: '#475569', body: '#0B1342', muted: '#64748B', soft: '#F8FAFC', input: '#ffffff' };

function slugParam(c) {
  if (c.props.api_param) return c.props.api_param;
  return (c.props.label || c.type).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
function pyLiteral(v) {
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (v == null) return 'None';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return '[]';
  return JSON.stringify(v);
}

function miniMarkdown(src, key) {
  return src.split('\n').map(function (line, i) {
    var lvl = (/^(#+)\s/.exec(line) || [])[1];
    var text = lvl ? line.slice(lvl.length + 1) : line;
    var parts = text.split(/\*\*(.+?)\*\*/g).map(function (p, j) { return j % 2 ? h('strong', { key: j }, p) : p; });
    if (lvl) return h('h3', { key: i, style: { margin: '0 0 4px', fontSize: '20px', fontWeight: 600, color: C.body } }, parts);
    return h('p', { key: i, style: { margin: 0, color: C.label, fontSize: '14px' } }, parts);
  });
}

function jsonView(v, depth) {
  depth = depth || 0;
  var pad = function (d) { return new Array(d + 1).join('  '); };
  if (v === null) return h('span', { style: { color: '#9ca3af' } }, 'null');
  if (typeof v === 'number') return h('span', { style: { color: '#0e7490' } }, String(v));
  if (typeof v === 'boolean') return h('span', { style: { color: '#7c3aed' } }, String(v));
  if (typeof v === 'string') return h('span', { style: { color: '#15803d' } }, JSON.stringify(v));
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    if (v.every(function (x) { return typeof x === 'number'; })) return h('span', { style: { color: '#0e7490' } }, '[' + v.join(', ') + ']');
    return h(React.Fragment, null, '[\n', v.map(function (x, i) { return h(React.Fragment, { key: i }, pad(depth + 1), jsonView(x, depth + 1), i < v.length - 1 ? ',' : '', '\n'); }), pad(depth) + ']');
  }
  var ks = Object.keys(v);
  return h(React.Fragment, null, '{\n', ks.map(function (k, i) {
    return h(React.Fragment, { key: k }, pad(depth + 1), h('span', { style: { color: '#b45309' } }, JSON.stringify(k)), ': ', jsonView(v[k], depth + 1), i < ks.length - 1 ? ',' : '', '\n');
  }), pad(depth) + '}');
}

function Icon(d, size, color) {
  return h('svg', { width: size || 14, height: size || 14, viewBox: '0 0 24 24', fill: 'none', stroke: color || 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, style: { flex: 'none' } },
    d.split('|').map(function (p, i) { return h('path', { key: i, d: p }); }));
}
var IC = {
  image: 'M3 5h18v14H3z|m3 16 5-5 4 4 3-3 6 6|M15.5 9.5h.01',
  upload: 'M12 16V4|m6 10 6-6 6 6|M4 20h16',
  clip: 'M9 4h6v3H9z|M8 5H5v16h14V5h-3',
  json: 'M8 3H6a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h2|M16 3h2a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-2',
  text: 'M4 6h16|M4 12h16|M4 18h10',
  tag: 'M3 12V3h9l9 9-9 9z|M7.5 7.5h.01',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  x: 'M18 6 6 18|m6 6 12 12',
  copy: 'M9 9h12v12H9z|M5 15V5a2 2 0 0 1 2-2h10',
  rocket: 'M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z|m12 15-3-3a22 22 0 0 1 2-4A13 13 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2z',
  code: 'm16 18 6-6-6-6|m8 6-6 6 6 6',
  chev: 'm9 6 6 6-6 6',
  list: 'M8 6h13|M8 12h13|M8 18h13|M3 6h.01|M3 12h.01|M3 18h.01'
};
//@@METHODS

  grStop() {
    (this._timers || []).forEach(function (t) { clearTimeout(t); clearInterval(t); });
    this._timers = [];
    this._runId = (this._runId || 0) + 1;
  }
  grCfg() { return GR_CONFIGS[this.state.grKey || 'ocr']; }
  grInit(cfg) {
    var v = {};
    cfg.components.forEach(function (c) {
      if (!LAYOUT_TYPES[c.type] && c.type.indexOf('button') < 0 && 'value' in c.props) v[c.id] = c.props.value;
    });
    return v;
  }
  grVals() { return this.state.grVals || this.grInit(this.grCfg()); }
  grSet(id, val) {
    var v = Object.assign({}, this.grVals());
    v[id] = val;
    this.setState({ grVals: v });
  }
  grSwitch(key) {
    this.grStop();
    this.setState({ grKey: key, grVals: this.grInit(GR_CONFIGS[key]), grPending: {}, grRunning: false, grToast: null, grAcc: {}, grLast: null, grShowApi: false });
  }
  grToast(kind, msg) {
    var self = this;
    this.setState({ grToast: { kind: kind, msg: msg } });
    var t = setTimeout(function () { self.setState({ grToast: null }); }, 4000);
    (this._timers = this._timers || []).push(t);
  }
  grTrigger(cid, ev) {
    var self = this, cfg = this.grCfg();
    var c = cfg.components.filter(function (x) { return x.id === cid; })[0];
    if (c && c.type === 'clearbutton') {
      var v = Object.assign({}, this.grVals()), init = this.grInit(cfg);
      c.props.components.forEach(function (id) { v[id] = init[id]; });
      this.grStop();
      this.setState({ grVals: v, grPending: {}, grRunning: false });
      return;
    }
    cfg.dependencies.forEach(function (d) {
      if (d.targets.some(function (t) { return t[0] === cid && t[1] === ev; })) self.grRun(d);
    });
  }
  grRun(dep) {
    if (this.state.grRunning) return;
    var self = this, vals = this.grVals();
    var runId = (this._runId || 0) + 1;
    this._runId = runId;
    this._timers = this._timers || [];
    var pend = {};
    dep.outputs.forEach(function (id) { pend[id] = dep.show_progress || 'full'; });
    var start = Date.now();
    this.setState({ grPending: pend, grRunning: true, grStart: start, grElapsed: 0, grToast: null });
    var tick = setInterval(function () { if (self._runId === runId) self.setState({ grElapsed: (Date.now() - start) / 1000 }); }, 100);
    this._timers.push(tick);
    var live = function () { return self._runId === runId; };
    var ctx = {
      set: function (id, val) { if (live()) self.grSet(id, val); },
      after: function (ms, fn) { self._timers.push(setTimeout(function () { if (live()) fn(); }, ms)); },
      done: function (failed) {
        if (!live()) return;
        clearInterval(tick);
        self.setState({ grPending: {}, grRunning: false, grLast: dep.outputs.length && !failed ? (Date.now() - start) / 1000 : self.state.grLast });
      },
      error: function (msg) { ctx.done(true); self.grToast('error', msg); },
      info: function (msg) { self.grToast('info', msg); },
      stream: function (id, hist, text) {
        var words = text.split(' '), i = 0;
        ctx.after(500, function step() {
          i += 1;
          var hs = hist.slice();
          hs[hs.length - 1] = [hs[hs.length - 1][0], words.slice(0, i).join(' ')];
          self.grSet(id, hs);
          if (i < words.length) ctx.after(45, step); else ctx.done();
        });
      }
    };
    MOCKS[dep.mock](dep.inputs.map(function (id) { return vals[id]; }), ctx);
  }
  grFile(id, file) {
    if (!file) return;
    var self = this, r = new FileReader();
    r.onload = function () { self.grSet(id, { url: r.result, name: file.name }); };
    r.readAsDataURL(file);
  }

  // ── renderer ──
  grRender() {
    var self = this, st = this.state, cfg = this.grCfg(), th = THEMES[cfg.theme] || THEMES.default;
    var vals = this.grVals(), pending = st.grPending || {}, acc = st.grAcc || {};
    var byId = {};
    cfg.components.forEach(function (c) { byId[c.id] = c; });
    var isOutput = {};
    cfg.dependencies.forEach(function (d) { d.outputs.forEach(function (id) { isOutput[id] = true; }); });

    var chip = function (icon, text) {
      return h('div', { style: { position: 'absolute', top: 0, left: 0, display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', fontSize: '12px', color: C.label, background: '#fff', border: '1px solid ' + C.border, borderTop: 'none', borderLeft: 'none', borderRadius: '8px 0 8px 0', zIndex: 2 } }, Icon(icon, 12), text);
    };
    var block = function (c, inner, opts) {
      opts = opts || {};
      var busy = pending[c.id];
      return h('div', { key: c.id, style: { position: 'relative', flex: (c.props.scale || 1) + ' 1 0', minWidth: opts.minW || '160px', border: '1px solid ' + (busy ? th.p300 : C.border), borderRadius: '8px', background: '#fff', padding: opts.chip ? '34px 12px 12px' : '10px 12px 12px', boxShadow: busy ? '0 0 0 3px ' + th.p50 : 'none', transition: 'border-color .2s, box-shadow .2s' } },
        opts.chip ? chip(opts.chip, c.props.label) : null,
        inner,
        busy === 'full' ? h('div', { style: { position: 'absolute', inset: 0, borderRadius: '8px', background: 'rgba(255,255,255,.72)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', zIndex: 3 } },
          h('div', { style: { width: '22px', height: '22px', borderRadius: '999px', border: '3px solid ' + th.p100, borderTopColor: th.p, animation: 'gr-spin .8s linear infinite' } }),
          h('div', { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: C.label } }, 'processing | ' + (st.grElapsed || 0).toFixed(1) + 's')) : null);
    };
    var labelEl = function (c) {
      if (c.props.show_label === false) return null;
      return h('div', { style: { fontSize: '13px', color: C.label, marginBottom: c.props.info ? '2px' : '8px', fontWeight: 500 } }, c.props.label);
    };
    var infoEl = function (c) { return c.props.info ? h('div', { style: { fontSize: '12px', color: C.muted, marginBottom: '8px' } }, c.props.info) : null; };
    var inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid ' + C.border, borderRadius: '6px', padding: '8px 10px', font: 'inherit', fontSize: '14px', color: C.body, background: C.input, outline: 'none' };

    var R = {
      markdown: function (c) { return h('div', { key: c.id, style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, miniMarkdown(c.props.value, c.id)); },
      textbox: function (c) {
        var multi = (c.props.lines || 1) > 1;
        var p = { value: vals[c.id] || '', placeholder: c.props.placeholder || '', onChange: function (e) { self.grSet(c.id, e.target.value); }, style: Object.assign({}, inputStyle, multi ? { resize: 'vertical', minHeight: (c.props.lines * 22) + 'px' } : {}) };
        if (!multi) p.onKeyDown = function (e) { if (e.key === 'Enter') { e.preventDefault(); self.grTrigger(c.id, 'submit'); } };
        return block(c, h(React.Fragment, null, labelEl(c), infoEl(c), h(multi ? 'textarea' : 'input', p)), { minW: c.props.scale ? '0' : '160px' });
      },
      number: function (c) {
        return block(c, h(React.Fragment, null, labelEl(c), infoEl(c), h('input', { type: 'number', value: vals[c.id], onChange: function (e) { self.grSet(c.id, Number(e.target.value)); }, style: inputStyle })));
      },
      slider: function (c) {
        var v = vals[c.id];
        return block(c, h(React.Fragment, null,
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' } },
            h('div', null, labelEl(c), infoEl(c)),
            h('input', { type: 'number', value: v, min: c.props.minimum, max: c.props.maximum, step: c.props.step, onChange: function (e) { self.grSet(c.id, Number(e.target.value)); }, style: Object.assign({}, inputStyle, { width: '72px', padding: '4px 6px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '13px' }) })),
          h('input', { type: 'range', value: v, min: c.props.minimum, max: c.props.maximum, step: c.props.step, onChange: function (e) { self.grSet(c.id, Number(e.target.value)); }, style: { width: '100%', accentColor: th.p } })));
      },
      dropdown: function (c) {
        return block(c, h(React.Fragment, null, labelEl(c), infoEl(c),
          h('select', { value: vals[c.id], onChange: function (e) { self.grSet(c.id, e.target.value); }, style: inputStyle },
            c.props.choices.map(function (ch) { return h('option', { key: ch[1], value: ch[1] }, ch[0]); }))));
      },
      radio: function (c) {
        return block(c, h(React.Fragment, null, labelEl(c), infoEl(c),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } }, c.props.choices.map(function (ch) {
            var on = vals[c.id] === ch[1];
            return h('label', { key: ch[1], style: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '6px', border: '1px solid ' + (on ? th.p300 : C.border), background: on ? th.p50 : '#fff', fontSize: '14px', cursor: 'pointer' } },
              h('input', { type: 'radio', checked: on, onChange: function () { self.grSet(c.id, ch[1]); }, style: { accentColor: th.p, margin: 0 } }), ch[0]);
          }))));
      },
      checkbox: function (c) {
        return block(c, h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' } },
          h('input', { type: 'checkbox', checked: !!vals[c.id], onChange: function (e) { self.grSet(c.id, e.target.checked); }, style: { accentColor: th.p, width: '16px', height: '16px', margin: 0 } }), c.props.label));
      },
      image: function (c) {
        var v = vals[c.id], ht = (c.props.height || 260) + 'px', inId = 'gr-file-' + c.id;
        var body = v
          ? h('div', { style: { position: 'relative', height: ht, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.soft, borderRadius: '6px', overflow: 'hidden' } },
              h('img', { src: v.url, alt: v.name, style: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' } }),
              h('button', { type: 'button', 'aria-label': 'Xoá ảnh', onClick: function () { self.grSet(c.id, null); }, style: { position: 'absolute', top: '6px', right: '6px', width: '28px', height: '28px', border: '1px solid ' + C.border, borderRadius: '6px', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, Icon(IC.x, 14, C.label)),
              h('div', { style: { position: 'absolute', left: '6px', bottom: '6px', fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace", background: 'rgba(255,255,255,.9)', padding: '2px 6px', borderRadius: '4px', color: C.label } }, v.name))
          : h('label', { htmlFor: inId, onDragOver: function (e) { e.preventDefault(); }, onDrop: function (e) { e.preventDefault(); self.grFile(c.id, e.dataTransfer.files[0]); }, style: { height: ht, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', color: C.muted, fontSize: '14px', cursor: 'pointer', textAlign: 'center' } },
              Icon(IC.upload, 28, '#9ca3af'),
              h('span', { style: { color: C.body } }, 'Thả ảnh vào đây'),
              h('span', null, '– hoặc –'),
              h('span', { style: { color: C.body } }, 'Bấm để tải lên'));
        return block(c, h(React.Fragment, null, body,
          h('input', { id: inId, type: 'file', accept: 'image/*,.pdf', onChange: function (e) { self.grFile(c.id, e.target.files[0]); e.target.value = ''; }, style: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' } }),
          h('div', { style: { display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '8px' } }, (c.props.sources || ['upload']).map(function (s) {
            return h('span', { key: s, title: s, style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '26px', borderRadius: '6px', border: '1px solid ' + C.border, color: s === 'upload' ? th.pt : C.muted, background: s === 'upload' ? th.p50 : '#fff' } }, Icon(s === 'upload' ? IC.upload : IC.clip, 13));
          }))), { chip: IC.image, minW: '240px' });
      },
      json: function (c) {
        var v = vals[c.id];
        return block(c, v == null ? h('div', { style: { height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' } }, Icon(IC.json, 28, '#d1d5db'))
          : h('pre', { style: { margin: 0, maxHeight: '300px', overflow: 'auto', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', lineHeight: 1.55, color: C.body } }, jsonView(v)), { chip: IC.json });
      },
      highlightedtext: function (c) {
        var v = vals[c.id], cm = c.props.color_map || {};
        return block(c, v == null ? h('div', { style: { height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, Icon(IC.text, 28, '#d1d5db'))
          : h(React.Fragment, null,
              c.props.show_legend ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' } }, Object.keys(cm).map(function (k) {
                return h('span', { key: k, style: { fontSize: '12px', padding: '2px 8px', borderRadius: '4px', background: cm[k] + '26', color: C.body, borderLeft: '3px solid ' + cm[k] } }, k);
              })) : null,
              h('div', { style: { whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: 2 } }, v.map(function (seg, i) {
                if (!seg[1]) return h('span', { key: i }, seg[0]);
                var col = cm[seg[1]] || th.p;
                return h('span', { key: i, style: { background: col + '26', borderRadius: '4px', padding: '2px 4px', boxShadow: 'inset 0 -2px 0 ' + col } }, seg[0],
                  h('span', { style: { marginLeft: '6px', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', color: col } }, seg[1]));
              }))), { chip: IC.text });
      },
      label: function (c) {
        var v = vals[c.id];
        return block(c, v == null ? h('div', { style: { height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, Icon(IC.tag, 28, '#d1d5db'))
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
              h('div', { style: { fontSize: '26px', fontWeight: 700, textAlign: 'center', padding: '6px 0 4px', color: C.body } }, v.label),
              v.confidences.map(function (cf, i) {
                return h('div', { key: cf.label, style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                  h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '13px' } }, h('span', null, cf.label), h('span', { style: { fontFamily: "'IBM Plex Mono', monospace", color: C.label } }, Math.round(cf.confidence * 100) + '%')),
                  h('div', { style: { height: '8px', borderRadius: '999px', background: '#f3f4f6', overflow: 'hidden' } }, h('div', { style: { width: (cf.confidence * 100) + '%', height: '100%', borderRadius: '999px', background: i === 0 ? th.p : th.p300 } })));
              })), { chip: IC.tag });
      },
      chatbot: function (c) {
        var v = vals[c.id] || [];
        var bubble = function (txt, mine, key) {
          return h('div', { key: key, style: { alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%', padding: '10px 14px', borderRadius: mine ? '12px 12px 2px 12px' : '12px 12px 12px 2px', background: mine ? th.p50 : '#f3f4f6', border: '1px solid ' + (mine ? th.p100 : C.border), fontSize: '14px', lineHeight: 1.55, whiteSpace: 'pre-wrap' } },
            txt === '' ? h('span', { style: { color: C.muted } }, '…') : txt);
        };
        return block(c, h('div', { style: { height: (c.props.height || 340) + 'px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', padding: '4px' } },
          v.length ? v.reduce(function (acc2, turn, i) {
            acc2.push(bubble(turn[0], true, 'u' + i));
            if (turn[1] != null) acc2.push(bubble(turn[1], false, 'b' + i));
            else if (pending[c.id] && i === v.length - 1) acc2.push(bubble('', false, 'b' + i));
            return acc2;
          }, []) : h('div', { style: { margin: 'auto', color: C.muted, fontSize: '14px', textAlign: 'center' } }, Icon(IC.chat, 28, '#d1d5db'), h('div', { style: { marginTop: '8px' } }, c.props.placeholder))), { chip: IC.chat });
      },
      button: function (c) {
        var pri = c.props.variant === 'primary', sm = c.props.size === 'sm', busy = pri && st.grRunning;
        return h('button', { key: c.id, type: 'button', disabled: busy, onClick: function () { self.grTrigger(c.id, 'click'); },
          style: { flex: (c.props.scale || 1) + ' 1 0', minWidth: sm ? '0' : '120px', minHeight: sm ? '34px' : '42px', padding: '0 16px', borderRadius: '8px', border: '1px solid ' + (pri ? th.p : C.border), background: pri ? (busy ? th.p300 : th.p) : '#f3f4f6', color: pri ? '#fff' : C.body, font: 'inherit', fontSize: sm ? '13px' : '15px', fontWeight: 600, cursor: busy ? 'progress' : 'pointer' } }, c.props.value);
      },
      dataset: function (c) {
        var targets = c.props.components.map(function (id) { return byId[id]; });
        return h('div', { key: c.id, style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: C.label } }, Icon(IC.list, 13), c.props.label),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } }, c.props.samples.map(function (row, i) {
            var cell = row[0], t = targets[0];
            var content = t.type === 'image'
              ? h(React.Fragment, null, h('img', { src: OCR_SAMPLES[cell.key].url, alt: '', style: { width: '56px', height: '56px', objectFit: 'cover', objectPosition: 'top', borderRadius: '4px', border: '1px solid ' + C.border } }), h('span', { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px' } }, OCR_SAMPLES[cell.key].name))
              : h('span', { style: { fontSize: '13px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, cell);
            return h('button', { key: i, type: 'button', onClick: function () {
              var v = Object.assign({}, self.grVals());
              targets.forEach(function (tc, j) {
                var x = row[j];
                v[tc.id] = tc.type === 'image' ? { key: x.key, url: OCR_SAMPLES[x.key].url, name: OCR_SAMPLES[x.key].name } : x;
              });
              self.setState({ grVals: v });
            }, style: { display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '6px 10px', minHeight: '40px', border: '1px solid ' + C.border, borderRadius: '8px', background: '#fff', cursor: 'pointer', font: 'inherit', color: C.body, textAlign: 'left' } }, content);
          })));
      }
    };
    R.clearbutton = R.button;

    var renderNode = function (node) {
      var c = byId[node.id];
      if (node.id === 0 || !c) return h('div', { key: 'root', style: { display: 'flex', flexDirection: 'column', gap: '16px' } }, (node.children || []).map(renderNode));
      var kids = function () { return (node.children || []).map(renderNode); };
      if (c.type === 'row') return h('div', { key: c.id, style: { display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'stretch' } }, kids());
      if (c.type === 'column') return h('div', { key: c.id, style: { flex: (c.props.scale || 1) + ' 1 320px', minWidth: 0, display: 'grid', alignContent: 'start', gap: '12px' } }, kids());
      if (c.type === 'group') return h('div', { key: c.id, style: { display: 'flex', flexDirection: 'column', gap: '1px', background: C.border, borderRadius: '8px', overflow: 'hidden' } }, kids());
      if (c.type === 'accordion') {
        var open = c.id in acc ? acc[c.id] : c.props.open;
        return h('div', { key: c.id, style: { border: '1px solid ' + C.border, borderRadius: '8px', background: '#fff' } },
          h('button', { type: 'button', onClick: function () { var a = Object.assign({}, acc); a[c.id] = !open; self.setState({ grAcc: a }); }, style: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: 'none', background: 'transparent', font: 'inherit', fontSize: '14px', fontWeight: 500, color: C.body, cursor: 'pointer' } },
            c.props.label, h('span', { style: { display: 'inline-flex', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' } }, Icon(IC.chev, 14, C.muted))),
          open ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '0 12px 12px' } }, kids()) : null);
      }
      return (R[c.type] || function () { return h('div', { key: c.id, style: { padding: '12px', border: '1px dashed #fca5a5', borderRadius: '8px', fontSize: '13px', color: '#b91c1c' } }, 'Chưa hỗ trợ component "' + c.type + '"'); })(c);
    };

    // API panel: sinh từ dependency có api_name + component đầu vào
    var apiPanel = function () {
      var deps = cfg.dependencies.filter(function (d) { return d.api_name; });
      return h('div', { style: { borderTop: '1px solid ' + C.border, padding: '16px 20px', background: C.soft, display: 'flex', flexDirection: 'column', gap: '14px' } },
        h('div', { style: { fontSize: '14px', color: C.label } }, 'Gọi app này bằng ', h('code', { style: { fontFamily: "'IBM Plex Mono', monospace" } }, 'gradio_client'), ' qua gateway MaaS. ', deps.length, ' endpoint, sinh từ ', h('code', { style: { fontFamily: "'IBM Plex Mono', monospace" } }, 'dependencies'), ' trong config.'),
        deps.map(function (d) {
          var ins = d.inputs.map(function (id) { return byId[id]; }).filter(function (c) { return c.type !== 'chatbot'; });
          var init = self.grInit(cfg);
          var args = ins.map(function (c) {
            var v = c.type === 'image' ? 'handle_file("chung_tu.png")' : pyLiteral(c.id in init ? init[c.id] : (c.type === 'textbox' ? 'Xin chào' : null));
            return '    ' + slugParam(c) + '=' + v + ',';
          }).join('\n');
          var code = 'from gradio_client import Client' + (ins.some(function (c) { return c.type === 'image'; }) ? ', handle_file' : '') + '\n\n' +
            'client = Client(\n    "https://[gateway-host]/spaces/' + cfg.space + '",\n    headers={"Authorization": "Bearer " + MAAS_API_KEY},\n)\n' +
            'result = client.predict(\n' + args + '\n    api_name="/' + d.api_name + '",\n)\nprint(result)';
          return h('div', { key: d.api_name, style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' } },
              h('span', { style: { fontSize: '11px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: th.p100, color: th.pt } }, 'POST'),
              h('code', { style: { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 } }, '/' + d.api_name),
              h('span', { style: { color: C.muted, fontSize: '13px' } }, '→ trả về ' + d.outputs.map(function (id) { return byId[id].type; }).join(', '))),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start' } },
              h('pre', { style: { flex: '1 1 420px', minWidth: 0, margin: 0, overflowX: 'auto', background: '#0B1342', color: '#E3ECFD', padding: '14px', borderRadius: '8px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12.5px', lineHeight: 1.6 } }, code),
              h('div', { style: { flex: '1 1 260px', minWidth: 0, border: '1px solid ' + C.border, borderRadius: '8px', background: '#fff', fontSize: '13px' } },
                h('div', { style: { padding: '8px 12px', borderBottom: '1px solid ' + C.border, fontWeight: 600 } }, 'Tham số'),
                ins.map(function (c) {
                  return h('div', { key: c.id, style: { display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '7px 12px', borderBottom: '1px solid #f3f4f6' } },
                    h('code', { style: { fontFamily: "'IBM Plex Mono', monospace" } }, slugParam(c)),
                    h('span', { style: { color: C.muted } }, c.type + (c.props.label ? ' · ' + c.props.label : '')));
                }))));
        }));
    };

    var toast = st.grToast;
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      // dải thông tin kiểu HF Space
      h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 14px' } },
        h('span', { style: { width: '22px', height: '22px', borderRadius: '6px', background: 'linear-gradient(135deg,' + th.p300 + ',' + th.p + ')', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 700 } }, 'G'),
        h('span', { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: '14px' } }, h('span', { style: { color: '#64748B' } }, cfg.space.split('/')[0] + ' / '), h('strong', null, cfg.space.split('/')[1])),
        h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, padding: '3px 8px', borderRadius: '999px', background: '#DDEFE9', color: '#141ED2' } }, h('span', { style: { width: '7px', height: '7px', borderRadius: '999px', background: '#16a34a' } }), 'Đang chạy'),
        h('span', { style: { fontSize: '12px', color: '#475569' } }, 'Gọi qua agentgateway'),
        h('span', { style: { fontSize: '12px', color: '#475569' } }, 'Gradio ' + cfg.version + ' · ' + cfg.kind),
        h('div', { style: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
          h('button', { type: 'button', onClick: function () { self.setState({ grShowCfg: !st.grShowCfg }); }, style: { display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '36px', padding: '0 12px', border: '1px solid ' + (st.grShowCfg ? '#0B1342' : '#CBD5E1'), borderRadius: '6px', background: '#fff', font: 'inherit', fontSize: '13px', fontWeight: st.grShowCfg ? 600 : 400, cursor: 'pointer', color: '#0B1342' } }, Icon(IC.json, 14, '#475569'), st.grShowCfg ? 'Ẩn cấu hình' : 'Xem cấu hình Gradio'),
          h('a', { href: '#', style: { display: 'inline-flex', alignItems: 'center', minHeight: '36px', padding: '0 12px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', textDecoration: 'none', color: '#0B1342' } }, 'Mở toàn màn hình ↗'))),

      h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 14px', background: '#FFFBEB', borderRadius: '8px', fontSize: '13px', color: '#78350F' } },
        Icon('M12 9v4|M12 17h.01|M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 16, '#92400E'),
        'Chỉ dùng dữ liệu mẫu đã che thông tin khách hàng. Lượt thử được ghi log và tính vào ngân sách phòng.'),

      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start' } },
        // khung app Gradio
        h('div', { style: { flex: '999 1 640px', minWidth: 0, position: 'relative', border: '1px solid #CBD5E1', borderRadius: '12px', overflow: 'hidden', background: '#fff', color: C.body } },
          toast ? h('div', { role: 'status', style: { position: 'absolute', top: '12px', right: '12px', zIndex: 10, maxWidth: '340px', display: 'flex', gap: '10px', padding: '12px 14px', borderRadius: '8px', background: '#fff', border: '1px solid ' + (toast.kind === 'error' ? '#fecaca' : '#bfdbfe'), borderLeft: '4px solid ' + (toast.kind === 'error' ? '#ef4444' : '#3b82f6'), boxShadow: '0 4px 14px rgba(0,0,0,.08)', fontSize: '13px' } },
            h('div', null, h('div', { style: { fontWeight: 700, color: toast.kind === 'error' ? '#b91c1c' : '#1d4ed8', marginBottom: '2px' } }, toast.kind === 'error' ? 'Error' : 'Info'), toast.msg),
            h('button', { type: 'button', 'aria-label': 'Đóng', onClick: function () { self.setState({ grToast: null }); }, style: { border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, alignSelf: 'flex-start' } }, Icon(IC.x, 14, C.muted))) : null,
          h('div', { style: { padding: '20px' } }, renderNode(cfg.layout)),
          h('div', { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: '6px 14px', padding: '10px 16px', borderTop: '1px solid ' + C.border, fontSize: '12px', color: C.muted } },
            h('button', { type: 'button', onClick: function () { self.setState({ grShowApi: !st.grShowApi }); }, style: { display: 'inline-flex', alignItems: 'center', gap: '4px', border: 'none', background: 'transparent', font: 'inherit', fontSize: '12px', color: st.grShowApi ? th.pt : C.muted, fontWeight: st.grShowApi ? 600 : 400, cursor: 'pointer', padding: '4px' } }, 'Dùng qua API ', Icon(IC.rocket, 12)),
            h('span', null, '·'),
            h('span', null, 'Xây dựng với Gradio ' + cfg.version),
            st.grLast != null ? h(React.Fragment, null, h('span', null, '·'), h('span', { style: { fontFamily: "'IBM Plex Mono', monospace" } }, 'lần chạy gần nhất ' + st.grLast.toFixed(1) + 's')) : null),
          st.grShowApi ? apiPanel() : null),

        // cấu hình nguồn
        st.grShowCfg ? h('div', { style: { flex: '1 1 360px', minWidth: 0, border: '1px solid #CBD5E1', borderRadius: '12px', overflow: 'hidden', alignSelf: 'stretch', display: 'flex', flexDirection: 'column' } },
          h('div', { style: { padding: '10px 14px', background: '#F2F6FE', borderBottom: '1px solid #E2E8F0', fontSize: '13px' } },
            h('div', { style: { fontWeight: 600 } }, 'GET /config'),
            h('div', { style: { color: '#475569', marginTop: '2px' } }, 'UI bên trái được dựng trực tiếp từ JSON này: ', cfg.components.length, ' components, ', cfg.dependencies.length, ' dependencies.')),
          h('pre', { style: { margin: 0, flex: 1, maxHeight: '900px', overflow: 'auto', background: '#0B1342', color: '#E3ECFD', padding: '14px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', lineHeight: 1.55 } },
            JSON.stringify({ version: cfg.version, mode: cfg.mode, title: cfg.title, theme: cfg.theme, components: cfg.components, layout: cfg.layout, dependencies: cfg.dependencies.map(function (d) { return { targets: d.targets, inputs: d.inputs, outputs: d.outputs, api_name: d.api_name }; }) }, null, 2))) : null));
  }
