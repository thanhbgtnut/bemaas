// ── MCP & tools ──────────────────────────────────────────────────────
// MaaS là nơi khai báo MCP server và kiểm soát tool; agentgateway là nơi thực thi.
// Mỗi server là một target trong AgentgatewayBackend `maas-mcp`; agent nối một endpoint /mcp duy nhất
// và thấy tool của mọi server mình được dùng, tên dạng <server>_<tool>.
// Tool nào được gọi, phòng nào được gọi: MaaS sinh thành luật CEL trong AgentgatewayPolicy
// (backend.mcp.authorization). Tool không được phép bị gateway lọc khỏi tools/list.
// Mặc định là đóng: tool mới quét được và server mới thêm đều chưa ai gọi được cho đến khi quản trị mở.
var MCP_URL = 'https://[gateway-host]/mcp';
var MCP_NS = 'agentgateway-system';
var MCP_BACKEND = 'maas-mcp', MCP_POLICY = 'maas-mcp-tools';
var MCP_PROTO = { http: ['Streamable HTTP', 'StreamableHTTP'], sse: ['SSE', 'SSE'] };
// depts: null = mọi phòng; [] = chưa phòng nào. tools: n tên, d mô tả (lấy từ server), w = có ghi/thay đổi dữ liệu, calls = lượt gọi 30 ngày (số mẫu)
var MCP_SEED = [
  { id: 'van-ban-noi-bo', name: 'Văn bản nội bộ', team: 'Văn phòng Chuyển đổi số', desc: 'Tìm và đọc quy định, quy trình, công văn nội bộ đang có hiệu lực.', host: 'mcp-van-ban.kho-van-ban.svc.cluster.local', port: 8080, proto: 'http', on: true, health: 'ok', depts: null, scanned: '11/10/2026 06:00',
    tools: [{ n: 'tim_van_ban', d: 'Tìm văn bản theo từ khoá, số hiệu hoặc đơn vị ban hành.', w: false, on: true, calls: 18420 }, { n: 'doc_van_ban', d: 'Lấy toàn văn một văn bản theo mã.', w: false, on: true, calls: 9310 }, { n: 'van_ban_moi', d: 'Liệt kê văn bản mới ban hành trong N ngày.', w: false, on: true, calls: 1240 }] },
  { id: 'ty-gia-lai-suat', name: 'Tỷ giá & lãi suất', team: 'Khối Nguồn vốn', desc: 'Tỷ giá và biểu lãi suất niêm yết của ngân hàng, hiện tại và lịch sử.', host: 'mcp-ty-gia.nguon-von.svc.cluster.local', port: 8080, proto: 'http', on: true, health: 'ok', depts: null, scanned: '11/10/2026 06:00',
    tools: [{ n: 'ty_gia_hien_tai', d: 'Tỷ giá mua, bán niêm yết theo cặp tiền.', w: false, on: true, calls: 6120 }, { n: 'lai_suat_niem_yet', d: 'Biểu lãi suất huy động và cho vay theo kỳ hạn.', w: false, on: true, calls: 4480 }, { n: 'lich_su_ty_gia', d: 'Tỷ giá theo ngày trong một khoảng thời gian.', w: false, on: false, calls: 0 }] },
  { id: 'ho-so-tin-dung', name: 'Hồ sơ tín dụng', team: 'Khối Tín dụng', desc: 'Tra cứu hồ sơ vay trên hệ thống khởi tạo khoản vay và ghi chú thẩm định.', host: 'mcp-los.tin-dung.svc.cluster.local', port: 8443, proto: 'http', on: true, health: 'ok', depts: ['thamdinh'], scanned: '11/10/2026 06:00',
    fresh: [{ n: 'xuat_to_trinh', d: 'Xuất tờ trình thẩm định của một hồ sơ ra PDF.', w: false }],
    tools: [{ n: 'tim_ho_so', d: 'Tìm hồ sơ vay theo mã khách hàng, mã hồ sơ hoặc trạng thái.', w: false, on: true, calls: 5230 }, { n: 'lay_ho_so', d: 'Lấy chi tiết một hồ sơ: phương án, tài chính, lịch sử phê duyệt.', w: false, on: true, calls: 4870 }, { n: 'tai_san_bao_dam', d: 'Danh sách tài sản bảo đảm của hồ sơ kèm giá trị định giá.', w: false, on: true, calls: 1960 },
      { n: 'them_ghi_chu_tham_dinh', d: 'Thêm ghi chú thẩm định vào hồ sơ.', w: true, on: true, calls: 640 }, { n: 'cap_nhat_trang_thai', d: 'Chuyển trạng thái hồ sơ (trình duyệt, trả lại, từ chối).', w: true, on: false, calls: 0 }] },
  { id: 'tra-soat-thanh-toan', name: 'Tra soát thanh toán', team: 'Khối Vận hành', desc: 'Tra cứu giao dịch chuyển tiền, điện SWIFT và yêu cầu tra soát.', host: 'mcp-tra-soat.van-hanh.svc.cluster.local', port: 8080, proto: 'http', on: true, health: 'ok', depts: ['thanhtoan', 'aml'], scanned: '11/10/2026 06:00',
    tools: [{ n: 'tim_giao_dich', d: 'Tìm giao dịch theo số tham chiếu, tài khoản, khoảng ngày.', w: false, on: true, calls: 7740 }, { n: 'lay_dien_swift', d: 'Lấy nội dung điện SWIFT của một giao dịch.', w: false, on: true, calls: 2210 }, { n: 'tao_yeu_cau_tra_soat', d: 'Tạo yêu cầu tra soát cho một giao dịch.', w: true, on: true, calls: 380 }, { n: 'huy_yeu_cau_tra_soat', d: 'Huỷ một yêu cầu tra soát đang mở.', w: true, on: false, calls: 0 }] },
  { id: 'gitlab-noi-bo', name: 'GitLab nội bộ', team: 'Khối CNTT', desc: 'Đọc mã nguồn, merge request và pipeline trên GitLab của ngân hàng.', host: 'gitlab-mcp.cntt.noi-bo.local', port: 443, proto: 'sse', on: true, health: 'ok', depts: ['kenhso', 'cds'], scanned: '11/10/2026 06:00',
    tools: [{ n: 'tim_ma_nguon', d: 'Tìm trong mã nguồn của các dự án được cấp quyền.', w: false, on: true, calls: 12860 }, { n: 'doc_file', d: 'Đọc nội dung một file tại một nhánh hoặc commit.', w: false, on: true, calls: 21400 }, { n: 'danh_sach_merge_request', d: 'Liệt kê merge request theo dự án và trạng thái.', w: false, on: true, calls: 3150 },
      { n: 'binh_luan_merge_request', d: 'Thêm bình luận review vào merge request.', w: true, on: true, calls: 1870 }, { n: 'tao_merge_request', d: 'Tạo merge request từ một nhánh.', w: true, on: true, calls: 420 }, { n: 'xoa_nhanh', d: 'Xoá một nhánh.', w: true, on: false, calls: 0 }] },
  { id: 'service-desk', name: 'Service Desk', team: 'Khối CNTT', desc: 'Tra cứu và tạo yêu cầu hỗ trợ CNTT.', host: 'mcp-itsm.cntt.svc.cluster.local', port: 8080, proto: 'http', on: true, health: 'down', depts: null, scanned: '10/10/2026 06:00',
    tools: [{ n: 'tim_ticket', d: 'Tìm yêu cầu hỗ trợ theo từ khoá, người tạo, trạng thái.', w: false, on: true, calls: 2980 }, { n: 'lay_ticket', d: 'Lấy chi tiết và lịch sử xử lý của một yêu cầu.', w: false, on: true, calls: 2140 }, { n: 'tao_ticket', d: 'Tạo yêu cầu hỗ trợ mới.', w: true, on: true, calls: 710 }, { n: 'dong_ticket', d: 'Đóng một yêu cầu hỗ trợ.', w: true, on: false, calls: 0 }] }
];
function mcpOpen(s) { return s.tools.filter(function (t) { return t.on; }); }
function mcpCalls(s) { return s.tools.reduce(function (a, t) { return a + t.calls; }, 0); }
// server có thực sự được ghi luật cho phép xuống gateway không
function mcpLive(s) { return s.on && mcpOpen(s).length > 0 && (!s.depts || s.depts.length > 0); }
function mcpRule(s, indent) {
  var q = function (x) { return '"' + x + '"'; }, pad = indent || '';
  var lines = ['mcp.tool.target == ' + q(s.id), '&& mcp.tool.name in [' + mcpOpen(s).map(function (t) { return q(t.n); }).join(', ') + ']'];
  if (s.depts) lines.push('&& apiKey.dept_id in [' + s.depts.map(q).join(', ') + ']');
  return lines.map(function (l) { return pad + l; }).join('\n');
}
function mcpTargetYaml(s) { return '    - name: ' + s.id + '\n      static:\n        host: ' + s.host + '\n        port: ' + s.port + '\n        protocol: ' + MCP_PROTO[s.proto][1]; }
function mcpBackendYaml(list) {
  var live = list.filter(function (s) { return s.on; }), off = list.filter(function (s) { return !s.on; });
  return '# MaaS sinh từ CSDL. Không sửa tay trên cụm.\napiVersion: agentgateway.dev/v1alpha1\nkind: AgentgatewayBackend\nmetadata:\n  name: ' + MCP_BACKEND + '\n  namespace: ' + MCP_NS + '\nspec:\n  mcp:\n    failureMode: FailOpen   # một server hỏng không làm rớt các server khác\n    prefixMode: Always      # tên tool luôn là <server>_<tool>\n    targets:\n' +
    (live.length ? live.map(mcpTargetYaml).join('\n') : '    []') + off.map(function (s) { return '\n    # ' + s.id + ': đang tạm dừng, không ghi xuống gateway'; }).join('');
}
function mcpPolicyYaml(list) {
  var live = list.filter(mcpLive);
  return '# MaaS sinh từ CSDL. Không sửa tay trên cụm.\napiVersion: agentgateway.dev/v1alpha1\nkind: AgentgatewayPolicy\nmetadata:\n  name: ' + MCP_POLICY + '\n  namespace: ' + MCP_NS + '\nspec:\n  targetRefs:\n  - group: agentgateway.dev\n    kind: AgentgatewayBackend\n    name: ' + MCP_BACKEND + '\n  backend:\n    mcp:\n      authorization:\n        action: Allow\n        policy:\n          # khớp một dòng bất kỳ là được gọi\n          matchExpressions:\n' +
    (live.length ? live.map(function (s) { return '          - >-\n' + mcpRule(s, '            '); }).join('\n') : "          - 'false'");
}
var MCP_ROUTE_YAML = '# Tạo một lần khi cài đặt. MaaS không sửa tài nguyên này.\napiVersion: gateway.networking.k8s.io/v1\nkind: HTTPRoute\nmetadata:\n  name: ' + MCP_BACKEND + '\n  namespace: ' + MCP_NS + '\nspec:\n  parentRefs:\n  - name: agentgateway-proxy\n    namespace: ' + MCP_NS + '\n  rules:\n  - matches:\n    - path:\n        type: PathPrefix\n        value: /mcp\n    backendRefs:\n    - name: ' + MCP_BACKEND + '\n      group: agentgateway.dev\n      kind: AgentgatewayBackend';
//@@METHODS
  // ── mcp: dữ liệu & đồng bộ ──
  mcps() { return this.state.mcp || MCP_SEED; }
  mcpById(id) { return this.mcps().filter(function (s) { return s.id === id; })[0]; }
  mcpCanUse(s) { return s.on && (!s.depts || s.depts.indexOf(this.me().dept) >= 0); }
  mcpSave(list, msg, extra) {
    var self = this;
    this.setState(Object.assign({ mcp: list, mcpSync: 'pending' }, extra || {}));
    clearTimeout(this._mcpT);
    this._mcpT = setTimeout(function () { self.setState({ mcpSync: 'done' }); }, 1800);
    if (msg) this.toast(msg);
  }
  mcpPatch(id, fn, msg) { this.mcpSave(this.mcps().map(function (s) { return s.id === id ? fn(s) : s; }), msg); }
  mcpSetTools(id, pick, on, msg) {
    this.mcpPatch(id, function (s) { return Object.assign({}, s, { tools: s.tools.map(function (t) { return pick(t) ? Object.assign({}, t, { on: on, isNew: false }) : t; }) }); }, msg);
  }
  mcpScan(s) {
    var have = s.tools.map(function (t) { return t.n; }), add = (s.fresh || []).filter(function (t) { return have.indexOf(t.n) < 0; });
    if (!add.length) { this.mcpPatch(s.id, function (x) { return Object.assign({}, x, { scanned: '11/10/2026 09:48' }); }, 'Đã quét ' + s.id + ': không có tool mới.'); return; }
    this.mcpPatch(s.id, function (x) { return Object.assign({}, x, { scanned: '11/10/2026 09:48', tools: x.tools.concat(add.map(function (t) { return Object.assign({ on: false, calls: 0, isNew: true }, t); })) }); },
      'Tìm thấy ' + add.length + ' tool mới trên ' + s.id + '. Tool mới đang đóng cho đến khi bạn mở.');
  }
  mcpScope(s) {
    var self = this;
    if (!s.depts) return 'Mọi phòng';
    if (!s.depts.length) return 'Chưa phòng nào';
    if (s.depts.length > 2) return s.depts.length + ' phòng';
    return s.depts.map(function (id) { var d = self.depts().filter(function (x) { return x.id === id; })[0]; return d ? d.name.replace(/^Phòng /, '') : id; }).join(', ');
  }
  mcpHealth(s) {
    if (!s.on) return this.badge('#F1F5F9', '#475569', 'Tạm dừng');
    return s.health === 'down' ? this.badge('#FEE2E2', '#991B1B', 'Không kết nối được', I.alert) : this.badge('#DCFCE7', '#166534', 'Kết nối tốt', I.check);
  }
  mcpSyncBadge() { return this.state.mcpSync === 'pending' ? this.badge('#FEF3C7', '#92400E', 'Đang ghi xuống gateway…', I.clock) : this.badge('#DCFCE7', '#166534', 'Gateway đã đồng bộ', I.check); }
  mcpSyncTime() { var s = this.state.mcpSync; return s === 'pending' ? 'đang áp dụng thay đổi' : s === 'done' ? 'vừa xong' : '11/10/2026 09:40'; }

  // ── mcp: danh sách server ──
  renderMcp() {
    var self = this, st = this.state, admin = this.role() === 'admin', q = (st.mcpQ || '').trim().toLowerCase(), ltab = admin ? (st.mcpLtab || 'servers') : 'servers';
    var all = this.mcps(), mine = all.filter(function (s) { return admin || self.mcpCanUse(s); });
    var rows = mine.filter(function (s) { return !q || (s.id + ' ' + s.name + ' ' + s.desc + ' ' + s.tools.map(function (t) { return t.n; }).join(' ')).toLowerCase().indexOf(q) >= 0; });
    var nTools = all.reduce(function (a, s) { return a + s.tools.length; }, 0), nOpen = all.reduce(function (a, s) { return a + (s.on ? mcpOpen(s).length : 0); }, 0);
    var nNew = all.reduce(function (a, s) { return a + s.tools.filter(function (t) { return t.isNew; }).length; }, 0);
    var grid = rows.length ? h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: '12px' } }, rows.map(function (s) {
      var open = mcpOpen(s), write = open.filter(function (t) { return t.w; }).length;
      return h('article', { key: s.id, className: 'mx-card', onClick: function () { self.go({ page: 'mcpd', mcpId: s.id, mcpTab: 'tools' }); }, style: { display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px', border: '1px solid ' + T.border, borderRadius: '12px', background: '#fff', cursor: 'pointer', opacity: s.on ? 1 : 0.7 } },
        self.avatarBox(s.id.slice(0, 2).toUpperCase(), '#1E40AF'),
        h('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
            h('button', { type: 'button', onClick: function (e) { e.stopPropagation(); self.go({ page: 'mcpd', mcpId: s.id, mcpTab: 'tools' }); }, style: { border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontSize: '15px', fontWeight: 600, lineHeight: 1.3, cursor: 'pointer', textAlign: 'left', color: T.text, minWidth: 0, overflowWrap: 'anywhere', fontFamily: MONO } }, s.id),
            admin ? h('span', { style: { marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '8px', flex: 'none' } }, h('span', { style: { fontSize: '12px', color: s.on ? '#166534' : T.subtle, fontWeight: s.on ? 600 : 400 } }, s.on ? 'Đang bật' : 'Tạm dừng'),
              self.switchEl(s.on, function () { self.mcpPatch(s.id, function (x) { return Object.assign({}, x, { on: !x.on }); }, s.on ? 'Đã tạm dừng ' + s.id + '. Gateway ngừng phục vụ tool của server này.' : 'Đã bật lại ' + s.id + '.'); }, (s.on ? 'Tạm dừng ' : 'Bật ') + s.name)) : null),
          h('div', { style: { fontSize: '13px', color: T.muted, lineHeight: 1.5 } }, h('strong', { style: { color: T.text, fontWeight: 600 } }, s.name + '. '), s.desc),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px', fontSize: '12px', color: T.muted } },
            h('span', { style: { fontWeight: 600, color: T.text } }, admin ? open.length + '/' + s.tools.length + ' tool đang mở' : open.length + ' tool'),
            write ? h('span', null, write + ' tool ghi dữ liệu') : null,
            self.metaItem(I.pulse, fmtTok(mcpCalls(s)), 'Lượt gọi tool 30 ngày'),
            h('span', null, s.team)),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } }, self.mcpHealth(s), self.badge(s.depts && !s.depts.length ? '#FEF3C7' : '#F1F5F9', s.depts && !s.depts.length ? '#92400E' : '#334155', 'Phạm vi: ' + self.mcpScope(s)),
            s.tools.some(function (t) { return t.isNew; }) && admin ? self.badge(T.sky100, T.primaryDark, 'Có tool mới chờ xem xét') : null)));
    })) : h('div', { style: { padding: '40px', textAlign: 'center', border: '1px dashed ' + T.borderStrong, borderRadius: '10px', color: T.muted, fontSize: '14px' } }, q ? 'Không có MCP server nào khớp "' + st.mcpQ + '".' : 'Phòng của bạn chưa được mở MCP server nào. Liên hệ quản trị nền tảng để được cấp.');
    var gw = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 14px', padding: '12px 14px', background: T.sky50, border: '1px solid ' + T.sky200, borderRadius: '10px', fontSize: '14px', lineHeight: 1.55 } },
        this.mcpSyncBadge(), h('span', { style: { flex: '1 1 420px' } }, 'Đây là đúng nội dung MaaS ghi xuống agentgateway, sinh lại từ CSDL sau mỗi thay đổi. MaaS chỉ ghi hai tài nguyên đã nêu tên: Backend (danh sách server) và Policy (tool và phòng được phép). Không sửa tay trên cụm; tiến trình đối soát sẽ ghi đè.')),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start' } },
        h('div', { style: { flex: '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' } }, h('h2', { style: { margin: 0, fontSize: '15px', fontWeight: 600 } }, '1. Server nào có trên gateway'), this.codeBlock(mcpBackendYaml(all), 'mcpy1', 'AgentgatewayBackend · ' + MCP_BACKEND)),
        h('div', { style: { flex: '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' } }, h('h2', { style: { margin: 0, fontSize: '15px', fontWeight: 600 } }, '2. Tool nào, phòng nào được gọi'), this.codeBlock(mcpPolicyYaml(all), 'mcpy2', 'AgentgatewayPolicy · ' + MCP_POLICY),
          h('div', { style: { fontSize: '13px', color: T.subtle, lineHeight: 1.6 } }, 'Xác thực key cho /mcp dùng chung policy API key của gateway, nên ', h('code', { style: { fontFamily: MONO } }, 'apiKey.dept_id'), ' là mã phòng MaaS đã ghi vào metadata của key. Tool không khớp dòng nào thì bị ẩn khỏi danh sách và bị từ chối khi gọi. Key bị thu hồi hoặc hết hạn mức cũng không gọi được tool.'),
          h('h2', { style: { margin: '8px 0 0', fontSize: '15px', fontWeight: 600 } }, '3. Đường vào /mcp'), this.codeBlock(MCP_ROUTE_YAML, 'mcpy3', 'HTTPRoute · ' + MCP_BACKEND))));
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px' } },
      this.areaHead('MCP & tools', admin ? 'Khai báo MCP server và quyết định tool nào được mở, cho phòng nào. MaaS ghi cấu hình này xuống agentgateway; agent nối một endpoint duy nhất và chỉ thấy những tool được phép.'
        : 'Các MCP server và tool mà phòng của bạn được dùng. Agent nối một endpoint duy nhất trên agentgateway bằng API key của bạn và thấy đúng các tool dưới đây.',
        admin ? this.btn('Thêm MCP server', function () { self.setState({ mcpDlg: { id: '', name: '', desc: '', team: '', host: '', port: '8080', proto: 'http' } }); }, { primary: true, icon: I.plus }) : null),
      admin ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px' } },
        this.statTile('MCP server', all.length, all.filter(function (s) { return s.on; }).length + ' đang bật'),
        this.statTile('Tool đang mở', nOpen + ' / ' + nTools, nNew ? nNew + ' tool mới chờ xem xét' : 'tool chưa mở thì không ai gọi được'),
        this.statTile('Lượt gọi tool', fmtN(all.reduce(function (a, s) { return a + mcpCalls(s); }, 0)), '30 ngày gần nhất'),
        h('div', { style: { flex: '1 1 180px', padding: '14px 16px', border: '1px solid ' + T.border, borderRadius: '10px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '8px' } }, h('div', { style: { fontSize: '13px', color: T.muted } }, 'Đồng bộ agentgateway'), h('div', null, this.mcpSyncBadge()), h('div', { style: { fontSize: '12px', color: T.subtle } }, 'Lần ghi gần nhất: ' + this.mcpSyncTime()))) : null,
      h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px' } },
        admin ? this.tabs([['servers', 'Server', all.length], ['gw', 'Cấu hình gateway']], ltab, function (k) { self.setState({ mcpLtab: k }); }) : h('span'),
        ltab === 'servers' ? h('div', { style: { flex: '0 1 320px', paddingBottom: admin ? '6px' : 0 } }, this.searchBox(st.mcpQ, function (v) { self.setState({ mcpQ: v }); }, 'Lọc theo server hoặc tên tool', 'Lọc MCP server')) : null),
      ltab === 'gw' ? gw : grid,
      ltab === 'servers' && !admin ? h('div', { style: { fontSize: '13px', color: T.subtle } }, 'Cần thêm server hoặc tool? Gửi đề nghị tới quản trị nền tảng.') : null);
  }

  // ── mcp: chi tiết server ──
  renderMcpServer() {
    var self = this, st = this.state, admin = this.role() === 'admin', s = this.mcpById(st.mcpId);
    if (!s || (!admin && !this.mcpCanUse(s))) return this.renderMcp();
    var tab = st.mcpTab || 'tools';
    if (!admin && (tab === 'access' || tab === 'gw')) tab = 'tools';
    var open = mcpOpen(s), shown = admin ? s.tools : open, gwName = function (t) { return s.id + '_' + t.n; };
    var thS = { textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: T.muted, borderBottom: '1px solid ' + T.border, background: T.surface, whiteSpace: 'nowrap' };
    var tdS = { padding: '12px', borderBottom: '1px solid ' + T.border, verticalAlign: 'middle', fontSize: '14px' };
    var note = function (bg, bd, fg, icon, ic, text) { return h('div', { role: 'status', style: { display: 'flex', gap: '10px', padding: '12px 14px', background: bg, border: '1px solid ' + bd, borderRadius: '10px', fontSize: '14px', lineHeight: 1.55, color: fg } }, Ico(icon, 16, ic), h('span', null, text)); };
    var body;
    if (tab === 'tools') body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      s.on && s.health === 'down' ? note('#FEF2F2', '#FECACA', '#7F1D1D', I.alert, '#B91C1C', 'Lần kiểm tra gần nhất không kết nối được tới server này, nên agent tạm thời không thấy các tool bên dưới. Các server khác không bị ảnh hưởng.') : null,
      admin && !open.length ? note('#FFFBEB', '#FDE68A', '#78350F', I.alert, '#B45309', 'Chưa mở tool nào: chưa ai gọi được server này. Xem từng tool rồi bật những tool cần dùng.') : null,
      admin ? h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', fontSize: '13px', color: T.muted } },
        h('span', { style: { flex: '1 1 320px', lineHeight: 1.55 } }, 'Danh sách lấy từ chính server (tools/list), quét lần cuối ' + s.scanned + '. Tool đang đóng bị gateway ẩn khỏi danh sách của agent và bị từ chối nếu gọi.'),
        this.btn('Mở mọi tool chỉ đọc', function () { self.mcpSetTools(s.id, function (t) { return !t.w; }, true, 'Đã mở mọi tool chỉ đọc của ' + s.id + '.'); }, { disabled: !s.tools.some(function (t) { return !t.w && !t.on; }) }),
        this.btn('Quét lại tool', function () { self.mcpScan(s); }, { icon: I.sort })) : null,
      h('div', { style: { overflowX: 'auto', border: '1px solid ' + T.border, borderRadius: '10px' } },
        h('table', { style: { width: '100%', minWidth: '760px', borderCollapse: 'collapse' } },
          h('thead', null, h('tr', null, (admin ? ['Mở'] : []).concat(['Tool', 'Mô tả', 'Loại', 'Lượt gọi 30 ngày']).map(function (x, i, a) { return h('th', { key: x, style: Object.assign({}, thS, i === a.length - 1 ? { textAlign: 'right' } : {}) }, x); }))),
          h('tbody', null, shown.length ? shown.map(function (t) {
            return h('tr', { key: t.n, style: { background: t.isNew ? '#F8FAFF' : '#fff' } },
              admin ? h('td', { style: Object.assign({}, tdS, { width: '60px' }) }, self.switchEl(t.on, function () {
                if (!t.on && t.w) { self.setState({ mcpAsk: { kind: 'write', sid: s.id, tool: t.n } }); return; }
                self.mcpSetTools(s.id, function (x) { return x.n === t.n; }, !t.on, (t.on ? 'Đã đóng ' : 'Đã mở ') + gwName(t) + '.');
              }, (t.on ? 'Đóng ' : 'Mở ') + t.n)) : null,
              h('td', { style: Object.assign({}, tdS, { whiteSpace: 'nowrap' }) }, h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, h('span', { style: { fontFamily: MONO, fontSize: '13px', fontWeight: 600 } }, t.n), t.isNew ? self.badge(T.sky100, T.primaryDark, 'Mới') : null),
                h('div', { style: { fontFamily: MONO, fontSize: '12px', color: T.subtle, marginTop: '2px' } }, 'trên gateway: ' + gwName(t))),
              h('td', { style: Object.assign({}, tdS, { color: T.muted, lineHeight: 1.5 }) }, t.d),
              h('td', { style: tdS }, t.w ? self.badge('#FEF3C7', '#92400E', 'Ghi dữ liệu', I.pencil) : self.badge('#F1F5F9', '#334155', 'Chỉ đọc')),
              h('td', { style: Object.assign({}, tdS, { fontFamily: MONO, textAlign: 'right', color: t.calls ? T.text : T.subtle }) }, t.calls ? fmtN(t.calls) : '—'));
          }) : h('tr', null, h('td', { colSpan: 5, style: Object.assign({}, tdS, { textAlign: 'center', color: T.muted, borderBottom: 'none' }) }, 'Server này chưa có tool nào được mở.'))))),
      h('div', { style: { fontSize: '13px', color: T.subtle, lineHeight: 1.6 } }, '"Ghi dữ liệu" là tool có thể tạo hoặc thay đổi dữ liệu ở hệ thống phía sau; nhãn lấy từ khai báo của server (readOnlyHint). Lượt gọi đếm từ log của gateway.'));
    else if (tab === 'access') {
      var depts = this.depts(), lim = !!s.depts, sel = s.depts || [];
      var nKeys = this.keys().filter(function (k) { return self.keyState(k) === 'active' && (!lim || sel.indexOf(k.dept) >= 0); }).length;
      var setDepts = function (v, msg) { self.mcpPatch(s.id, function (x) { return Object.assign({}, x, { depts: v }); }, msg); };
      body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '760px' } },
        h('div', { role: 'radiogroup', 'aria-label': 'Phạm vi sử dụng', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' } }, [[false, 'Mọi phòng', 'Key của bất kỳ phòng nào cũng gọi được các tool đang mở.'], [true, 'Chỉ các phòng được chọn', 'Chỉ key thuộc những phòng được đánh dấu bên dưới.']].map(function (o) {
          var on = lim === o[0];
          return h('button', { key: String(o[0]), type: 'button', role: 'radio', 'aria-checked': on, onClick: function () { if (!on) setDepts(o[0] ? [] : null, o[0] ? 'Đã giới hạn ' + s.id + ' theo phòng. Chọn các phòng được dùng.' : 'Đã mở ' + s.id + ' cho mọi phòng.'); },
            style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', padding: '12px 14px', borderRadius: '10px', border: on ? '2px solid ' + T.primary : '1px solid ' + T.borderStrong, background: on ? T.sky50 : '#fff', font: 'inherit', color: T.text, cursor: 'pointer', textAlign: 'left' } },
            h('span', { style: { fontSize: '14px', fontWeight: 600 } }, o[1]), h('span', { style: { fontSize: '13px', color: T.muted, lineHeight: 1.5 } }, o[2]));
        })),
        lim ? h('fieldset', { style: { border: '1px solid ' + T.border, borderRadius: '10px', margin: 0, padding: 0, overflow: 'hidden' } },
          h('legend', { style: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' } }, 'Phòng được dùng'),
          depts.map(function (d, i) {
            var on = sel.indexOf(d.id) >= 0;
            return h('label', { key: d.id, className: 'mx-row', style: { display: 'flex', alignItems: 'center', gap: '12px', minHeight: '48px', padding: '6px 14px', borderTop: i ? '1px solid ' + T.border : 'none', cursor: 'pointer' } },
              h('input', { type: 'checkbox', checked: on, onChange: function () { setDepts(on ? sel.filter(function (x) { return x !== d.id; }) : sel.concat([d.id]), (on ? 'Đã bỏ ' : 'Đã thêm ') + d.name + '.'); }, style: { width: '16px', height: '16px', margin: 0, accentColor: T.primary } }),
              h('span', { style: { flex: 1 } }, h('span', { style: { fontSize: '14px', fontWeight: 600 } }, d.name), h('span', { style: { fontSize: '12px', color: T.subtle, marginLeft: '8px' } }, d.block)),
              h('span', { style: { fontFamily: MONO, fontSize: '12px', color: T.subtle } }, d.id));
          })) : null,
        lim && !sel.length ? note('#FFFBEB', '#FDE68A', '#78350F', I.alert, '#B45309', 'Chưa chọn phòng nào: hiện không key nào gọi được server này.')
          : note(T.sky50, T.sky200, T.text, I.shield, T.primary, nKeys + ' key đang hoạt động gọi được ' + open.length + ' tool đang mở của server này.'),
        h('div', { style: { fontSize: '13px', color: T.subtle, lineHeight: 1.6 } }, 'Gateway nhận ra phòng qua mã phòng gắn trong key, nên phạm vi này áp dụng cho cả key thành viên và key ứng dụng của phòng. Thay đổi có hiệu lực trên gateway trong vòng 60 giây.'));
    } else if (tab === 'connect') {
      var ex = open[0] || s.tools[0];
      body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' } },
          [['Endpoint MCP · agentgateway', MCP_URL], ['Giao thức phía client', 'Streamable HTTP'], ['Xác thực', 'Authorization: Bearer <API key>'], ['Tên tool', s.id + '_<tên tool>']].map(function (x) {
            return h('div', { key: x[0], style: { padding: '12px 14px', border: '1px solid ' + T.border, borderRadius: '10px' } }, h('div', { style: { fontSize: '12px', color: T.muted } }, x[0]), h('div', { style: { fontFamily: MONO, fontSize: '13px', marginTop: '4px', overflowWrap: 'anywhere' } }, x[1]));
          })),
        note(T.sky50, T.sky200, T.text, I.box, T.primary, 'Một endpoint cho mọi MCP server. Agent không nối thẳng tới ' + s.id + ' mà nối tới agentgateway; gateway gom tool của các server bạn được dùng và thêm tên server vào trước tên tool.'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, h('h2', { style: { margin: 0, fontSize: '15px', fontWeight: 600 } }, 'Khai báo trong agent hoặc IDE'),
          this.codeBlock('{\n  "mcpServers": {\n    "maas": {\n      "type": "http",\n      "url": "' + MCP_URL + '",\n      "headers": { "Authorization": "Bearer ${MAAS_API_KEY}" }\n    }\n  }\n}', 'mcpc1', 'JSON')),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, h('h2', { style: { margin: 0, fontSize: '15px', fontWeight: 600 } }, 'Gọi từ mã Python'),
          this.codeBlock('from mcp import ClientSession\nfrom mcp.client.streamable_http import streamablehttp_client\n\nheaders = {"Authorization": "Bearer " + API_KEY}\nasync with streamablehttp_client("' + MCP_URL + '", headers=headers) as (read, write, _):\n    async with ClientSession(read, write) as session:\n        await session.initialize()\n        tools = await session.list_tools()          # chỉ gồm tool bạn được phép\n        result = await session.call_tool("' + gwName(ex) + '", {...})', 'mcpc2', 'Python')),
        h('div', { style: { fontSize: '13px', color: T.subtle, lineHeight: 1.6 } }, 'Tool không được phép sẽ không xuất hiện trong danh sách; gọi thẳng tên tool đó trả lỗi "unauthorized tool call". Lời gọi tool không tính phí model nhưng vẫn cần một API key đang hoạt động.'),
        this.hasKey() ? null : h('div', { style: { fontSize: '14px', color: T.muted } }, 'Chưa có API key? ', this.linkBtn('Xem Ngân sách & key', function () { self.go({ page: 'keys' }); })));
    } else body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      h('div', { style: { fontSize: '14px', color: T.muted, lineHeight: 1.6 } }, 'Phần của ', h('strong', { style: { color: T.text } }, s.id), ' trong cấu hình MaaS ghi xuống agentgateway. Đổi công tắc tool hoặc phạm vi phòng là nội dung này đổi theo.'),
      this.codeBlock(s.on ? '# trong AgentgatewayBackend ' + MCP_BACKEND + ' → spec.mcp.targets\n' + mcpTargetYaml(s) : '# ' + s.id + ' đang tạm dừng: không có target nào trên gateway', 'mcps1', 'Target'),
      this.codeBlock(mcpLive(s) ? '# trong AgentgatewayPolicy ' + MCP_POLICY + ' → backend.mcp.authorization.policy.matchExpressions\n- >-\n' + mcpRule(s, '  ') : '# không có luật cho phép nào: mọi tool của ' + s.id + ' đều bị từ chối', 'mcps2', 'Luật cho phép'),
      h('div', null, this.linkBtn('Xem toàn bộ cấu hình gateway →', function () { self.go({ page: 'mcp', mcpLtab: 'gw' }); })));

    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '20px' } },
      h('div', { style: this.heroStyle() },
        h('nav', { 'aria-label': 'Breadcrumb', style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: T.muted } },
          h('button', { type: 'button', onClick: function () { self.go({ page: 'mcp' }); }, style: { display: 'inline-flex', alignItems: 'center', gap: '4px', border: 'none', background: 'transparent', padding: '4px 0', font: 'inherit', color: T.primary, cursor: 'pointer', fontWeight: 600 } }, Ico(I.left, 14), 'MCP & tools'),
          h('span', null, '/'), h('span', null, s.team)),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' } },
          this.avatarBox(s.id.slice(0, 2).toUpperCase(), '#1E40AF', 36),
          h('h1', { style: { margin: 0, fontSize: '22px', fontWeight: 700, fontFamily: MONO, color: T.text } }, s.id),
          this.mcpHealth(s)),
        h('div', { style: { fontSize: '14px', color: T.muted, maxWidth: '86ch', lineHeight: 1.55 } }, h('strong', { style: { color: T.text, fontWeight: 600 } }, s.name + '. '), s.desc),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px' } },
          this.tabs([['tools', 'Tools', admin ? open.length + '/' + s.tools.length : open.length]].concat(admin ? [['access', 'Phạm vi sử dụng']] : []).concat([['connect', 'Kết nối']]).concat(admin ? [['gw', 'Cấu hình gateway']] : []), tab, function (k) { self.setState({ mcpTab: k }); }),
          admin ? h('div', { style: { display: 'flex', gap: '8px', paddingBottom: '6px' } },
            this.btn(s.on ? 'Tạm dừng server' : 'Bật lại server', function () { self.mcpPatch(s.id, function (x) { return Object.assign({}, x, { on: !x.on }); }, s.on ? 'Đã tạm dừng ' + s.id + '. Gateway ngừng phục vụ tool của server này.' : 'Đã bật lại ' + s.id + '.'); })) : null)),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-start' } },
        h('main', { style: { flex: '999 1 640px', minWidth: 0 } }, body),
        h('aside', { style: { flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' } },
          this.cardBox('Trên agentgateway', h(React.Fragment, null,
            this.kvRow('Endpoint', h('span', { style: { fontFamily: MONO, overflowWrap: 'anywhere' } }, MCP_URL)),
            this.kvRow('Tên server', h('span', { style: { fontFamily: MONO } }, s.id)),
            this.kvRow('Tool đang mở', h('span', { style: { fontFamily: MONO } }, open.length + (admin ? ' / ' + s.tools.length : ''))),
            this.kvRow('Lượt gọi 30 ngày', h('span', { style: { fontFamily: MONO } }, fmtN(mcpCalls(s)))),
            admin ? this.kvRow('Đồng bộ', this.mcpSyncBadge()) : null,
            admin ? h('div', { style: { fontSize: '12px', color: T.subtle } }, 'Lần ghi gần nhất: ' + this.mcpSyncTime()) : null)),
          admin ? this.cardBox('Server phía sau', h(React.Fragment, null,
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '13px' } }, h('span', { style: { color: T.muted } }, 'Địa chỉ'), h('span', { style: { fontFamily: MONO, fontSize: '12px', overflowWrap: 'anywhere' } }, s.host + ':' + s.port)),
            this.kvRow('Giao thức', MCP_PROTO[s.proto][0]),
            this.kvRow('Quét tool lần cuối', h('span', { style: { fontFamily: MONO } }, s.scanned)),
            h('div', { style: { fontSize: '12px', color: T.subtle, lineHeight: 1.5 } }, 'Chỉ gateway nối tới địa chỉ này. Agent và người dùng không thấy và không gọi thẳng được.'))) : null,
          this.cardBox('Phạm vi sử dụng', h(React.Fragment, null,
            s.depts && s.depts.length ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } }, s.depts.map(function (id) { var d = self.depts().filter(function (x) { return x.id === id; })[0]; return h(React.Fragment, { key: id }, self.badge('#F1F5F9', '#334155', d ? d.name : id)); }))
              : h('div', { style: { fontSize: '14px' } }, this.mcpScope(s)),
            admin ? this.linkBtn('Sửa phạm vi', function () { self.setState({ mcpTab: 'access' }); }) : h('div', { style: { fontSize: '12px', color: T.subtle } }, 'Do quản trị nền tảng quyết định.'))),
          this.cardBox('Quản trị', h(React.Fragment, null, this.kvRow('Đội sở hữu', s.team), this.kvRow('Người phụ trách', '[Họ tên]'), this.kvRow('Rà soát tiếp theo', '[dd/mm/yyyy]'),
            admin ? h('div', null, h('button', { type: 'button', className: 'mx-btn', onClick: function () { self.setState({ mcpAsk: { kind: 'remove', sid: s.id } }); }, style: { minHeight: '34px', padding: '0 12px', border: '1px solid #FCA5A5', borderRadius: '8px', background: '#fff', font: 'inherit', fontSize: '13px', fontWeight: 600, color: '#B91C1C', cursor: 'pointer' } }, 'Gỡ server khỏi MaaS')) : null)))));
  }

  // ── mcp: hộp thoại ──
  renderMcpDialogs() {
    var self = this, st = this.state;
    if (st.mcpAsk) {
      var a = st.mcpAsk, s = this.mcpById(a.sid), c1 = function () { self.setState({ mcpAsk: null }); };
      if (!s) return null;
      if (a.kind === 'write') {
        var t = s.tools.filter(function (x) { return x.n === a.tool; })[0];
        return this.dialog('Mở tool ghi dữ liệu?', h('div', { style: { fontSize: '14px', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '10px' } },
          h('div', null, h('code', { style: { fontFamily: MONO, fontWeight: 600 } }, s.id + '_' + t.n), ': ' + t.d),
          h('div', null, 'Tool này có thể tạo hoặc thay đổi dữ liệu ở hệ thống phía sau. Sau khi mở, mọi agent dùng key thuộc phạm vi "' + this.mcpScope(s) + '" đều gọi được.')),
          [h(React.Fragment, { key: 'a' }, this.btn('Huỷ', c1), this.btn('Mở tool', function () { self.setState({ mcpAsk: null }); self.mcpSetTools(s.id, function (x) { return x.n === t.n; }, true, 'Đã mở ' + s.id + '_' + t.n + '.'); }, { primary: true }))], c1);
      }
      return this.dialog('Gỡ "' + s.id + '"?', h('div', { style: { fontSize: '14px', lineHeight: 1.6 } }, 'Server và ' + s.tools.length + ' tool của nó bị xoá khỏi cấu hình agentgateway; agent đang dùng sẽ mất các tool này. Muốn ngừng tạm thời thì dùng "Tạm dừng server". Thao tác không hoàn tác được.'),
        [h(React.Fragment, { key: 'a' }, this.btn('Huỷ', c1), h('button', { type: 'button', onClick: function () { self.mcpSave(self.mcps().filter(function (x) { return x.id !== s.id; }), 'Đã gỡ ' + s.id + '.', { mcpAsk: null, page: 'mcp' }); }, style: { minHeight: '40px', padding: '0 16px', borderRadius: '8px', border: '1px solid #B91C1C', background: '#B91C1C', color: '#fff', font: 'inherit', fontSize: '14px', fontWeight: 600, cursor: 'pointer' } }, 'Gỡ server'))], c1);
    }
    var d = st.mcpDlg;
    if (!d) return null;
    var close = function () { self.setState({ mcpDlg: null }); };
    var set = function (k, v) { var n = Object.assign({}, d, { err: null, ef: null }); n[k] = v; self.setState({ mcpDlg: n }); };
    var inS = function (err, mono) { return { width: '100%', boxSizing: 'border-box', minHeight: '44px', padding: '10px 12px', border: '1px solid ' + (err ? '#DC2626' : T.borderStrong), borderRadius: '8px', font: 'inherit', fontFamily: mono ? MONO : 'inherit', fontSize: '14px', color: T.text, background: '#fff' }; };
    var input = function (k, mono, ph) { return h('input', { id: 'mc-' + k, value: d[k], placeholder: ph, onChange: function (e) { set(k, e.target.value); }, style: inS(d.ef === k, mono) }); };
    var err = function (k) { return d.ef === k ? d.err : null; };
    var add = function () {
      var fail = function (ef, msg) { self.setState({ mcpDlg: Object.assign({}, d, { ef: ef, err: msg }) }); }, port = Number(d.port);
      if (!/^[a-z0-9][a-z0-9-]{2,}$/.test(d.id)) return fail('id', 'Chữ thường không dấu, số, gạch ngang; tối thiểu 3 ký tự. Không dùng gạch dưới vì gateway dùng nó để nối tên server với tên tool.');
      if (self.mcpById(d.id)) return fail('id', 'Đã có server tên "' + d.id + '". Chọn tên khác.');
      if (!d.name.trim()) return fail('name', 'Nhập tên hiển thị.');
      if (!/^[a-z0-9.-]+$/i.test(d.host.trim())) return fail('host', 'Nhập tên máy chủ, không kèm http:// hay đường dẫn. Ví dụ: mcp-abc.ten-namespace.svc.cluster.local');
      if (!(port > 0 && port < 65536 && port === Math.floor(port))) return fail('port', 'Cổng là số nguyên từ 1 đến 65535.');
      var srv = { id: d.id, name: d.name.trim(), team: d.team.trim() || '[Chưa ghi]', desc: d.desc.trim() || '[Chưa có mô tả]', host: d.host.trim(), port: port, proto: d.proto, on: true, health: 'ok', depts: [], scanned: '11/10/2026 09:48',
        tools: [{ n: 'tim_kiem', d: '[Mô tả do server cung cấp]', w: false, on: false, calls: 0, isNew: true }, { n: 'lay_chi_tiet', d: '[Mô tả do server cung cấp]', w: false, on: false, calls: 0, isNew: true }, { n: 'cap_nhat', d: '[Mô tả do server cung cấp]', w: true, on: false, calls: 0, isNew: true }] };
      self.mcpSave(self.mcps().concat([srv]), 'Đã thêm ' + d.id + ' và tìm thấy 3 tool. Tất cả đang đóng và chưa phòng nào dùng được cho đến khi bạn mở.', { mcpDlg: null, page: 'mcpd', mcpId: d.id, mcpTab: 'tools' });
      try { window.scrollTo(0, 0); } catch (e) {}
    };
    return this.dialog('Thêm MCP server', h(React.Fragment, null,
      this.fieldRow('mc-id', 'Tên server trên gateway', input('id', true, 'vd: ho-so-tin-dung'), 'Đứng trước tên mọi tool của server: ' + (d.id || '<tên server>') + '_<tên tool>. Không đổi được sau khi tạo.', err('id'), true),
      this.fieldRow('mc-name', 'Tên hiển thị', input('name', false, 'vd: Hồ sơ tín dụng'), null, err('name'), true),
      this.fieldRow('mc-desc', 'Mô tả', h('textarea', { id: 'mc-desc', rows: 2, value: d.desc, onChange: function (e) { set('desc', e.target.value); }, style: Object.assign(inS(), { resize: 'vertical' }) }), 'Server này cho agent làm được việc gì.'),
      this.fieldRow('mc-team', 'Đội sở hữu', input('team', false, 'vd: Khối Tín dụng'), 'Đơn vị vận hành server và chịu trách nhiệm về các tool.'),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 120px', gap: '12px' } },
        this.fieldRow('mc-host', 'Địa chỉ server', input('host', true, 'mcp-abc.namespace.svc.cluster.local'), null, err('host'), true),
        this.fieldRow('mc-port', 'Cổng', input('port', true), null, err('port'), true)),
      this.fieldRow('mc-proto', 'Giao thức của server', this.selectEl(d.proto, function (v) { set('proto', v); }, [['http', 'Streamable HTTP'], ['sse', 'SSE (server đời cũ)']], 'Giao thức', { width: '100%', minHeight: '44px' }), 'Chỉ là giao thức giữa gateway và server. Agent luôn nối gateway bằng Streamable HTTP.'),
      h('div', { style: { display: 'flex', gap: '10px', padding: '12px 14px', background: T.sky50, border: '1px solid ' + T.sky200, borderRadius: '8px', fontSize: '13px', lineHeight: 1.55 } }, Ico(I.shield, 16, T.primary),
        'Khi thêm, MaaS kết nối tới server để lấy danh sách tool. Mọi tool bắt đầu ở trạng thái đóng và chưa phòng nào dùng được; bạn mở từng tool và chọn phòng ở bước sau.')),
      [h(React.Fragment, { key: 'a' }, this.btn('Huỷ', close), this.btn('Kết nối và thêm', add, { primary: true }))], close);
  }
