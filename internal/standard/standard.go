// Package standard là danh mục chuẩn API mà model card được chuẩn hoá theo (M14–M18).
// Mỗi model khai báo đúng một chuẩn; Playground, tab API và mã mẫu đều dựng từ danh mục này.
//
// Thêm chuẩn mới: thêm một phần tử vào All. Nếu chuẩn mới dùng lại một Kind đã có (ví dụ một OCR khác
// nhận multipart), giao diện tự hiển thị mà không cần sửa frontend; Kind mới thì cần thêm bộ hiển thị
// tương ứng ở web/src/standards.ts và Playground.
package standard

import (
	"encoding/json"
	"slices"
	"strings"
)

// Kind quyết định cách Playground dựng ô nhập, gửi yêu cầu và đọc kết quả.
const (
	KindOpenAIChat       = "openai-chat"
	KindOpenAICompletion = "openai-completion"
	KindOpenAIEmbedding  = "openai-embedding"
	KindOpenAIRerank     = "openai-rerank"
	KindAnthropicMessage = "anthropic-messages"
	KindSystemOne        = "systemone-decision" // decision API: state + câu hỏi → quyết định kèm xác suất
	KindJSON             = "json"               // gửi nguyên một body JSON, hiện nguyên JSON trả về
	KindBinary           = "binary"             // gửi nguyên byte của tệp (Content-Type theo tệp)
	KindMultipart        = "multipart"          // gửi tệp trong form multipart
)

// Đơn vị tính giá (M4).
const (
	UnitToken = "token"
	UnitPage  = "page"
)

type Example struct {
	Title  string          `json:"title"`
	Input  string          `json:"input,omitempty"`  // câu lệnh, prompt, văn bản hoặc câu truy vấn
	System string          `json:"system,omitempty"` // system prompt (chat)
	Docs   []string        `json:"docs,omitempty"`   // các đoạn văn bản (rerank)
	Body   json.RawMessage `json:"body,omitempty"`   // body JSON (KindJSON)
	State  json.RawMessage `json:"state,omitempty"`  // state của SystemOne: chuỗi, object hoặc mảng
	// Questions của SystemOne: object theo tên câu hỏi; mỗi câu có type (choice|noul|score), instructions, criteria.
	Questions json.RawMessage `json:"questions,omitempty"`
	// Images: ảnh mẫu gửi kèm (SystemOne với model vision); giao diện đọc tệp rồi gửi base64 thuần.
	Images []string `json:"images,omitempty"`
	// Model: model nên chọn khi bấm ví dụ (ví dụ có ảnh cần model vision); không có thì giữ model đang chọn.
	Model string `json:"model,omitempty"`
	File  string `json:"file,omitempty"`  // tệp mẫu phục vụ cùng giao diện, ví dụ /examples/uy-nhiem-chi.png
	Query string `json:"query,omitempty"` // query string thêm vào endpoint, ví dụ layout=1
}

type Op struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Kind      string `json:"kind"`
	Path      string `json:"path"`                 // nối sau endpoint của model
	FileField string `json:"file_field,omitempty"` // tên trường tệp (KindMultipart)
	Accept    string `json:"accept,omitempty"`     // loại tệp nhận (thuộc tính accept của ô chọn tệp)
	// ImageAccept: thao tác nhận thêm ảnh kèm JSON (SystemOne `images`, cần model vision); rỗng là không nhận.
	ImageAccept string    `json:"image_accept,omitempty"`
	Stream      bool      `json:"stream"`
	Examples    []Example `json:"examples"`
}

type Standard struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	DocsURL     string `json:"docs_url,omitempty"`
	// Endpoint mặc định của model trên agentgateway; {model} được thay bằng id model.
	DefaultEndpoint string `json:"default_endpoint"`
	// Model nằm trong body (OpenAI, Anthropic) hay trong đường dẫn (OCR): quyết định cách gateway phân quyền.
	ModelInPath bool   `json:"model_in_path"`
	Unit        string `json:"unit"`
	// Unverified: chưa có tài liệu chuẩn để đối chiếu; định dạng là tạm, cần đội sở hữu xác nhận.
	Unverified bool `json:"unverified"`
	Ops        []Op `json:"ops"`
}

func raw(s string) json.RawMessage { return json.RawMessage(s) }

var All = []Standard{
	{
		ID: "openai", Name: "OpenAI compatible",
		Description:     "Chat Completions, Completions, Embeddings và Rerank theo định dạng OpenAI. Dùng được thư viện openai chính thức.",
		DocsURL:         "https://platform.openai.com/docs/api-reference",
		DefaultEndpoint: "/v1", Unit: UnitToken,
		Ops: []Op{
			{ID: "chat", Label: "Chat", Kind: KindOpenAIChat, Path: "/chat/completions", Stream: true, Examples: []Example{
				{Title: "Tóm tắt quy trình", System: "Bạn là trợ lý nội bộ của ngân hàng. Trả lời ngắn gọn, bằng tiếng Việt.",
					Input: "Tóm tắt trong 3 ý quy trình phê duyệt thay đổi khẩn cấp trên hệ thống core banking."},
				{Title: "Soạn email", Input: "Soạn email ngắn thông báo cho khách hàng doanh nghiệp về việc bảo trì Internet Banking từ 22h đến 23h thứ Bảy."},
			}},
			{ID: "completion", Label: "Completion", Kind: KindOpenAICompletion, Path: "/completions", Examples: []Example{
				{Title: "Viết tiếp thông báo", Input: "Kính gửi Quý khách,\nNgân hàng trân trọng thông báo"},
				{Title: "Viết tiếp hàm Python", Input: "def tinh_lai_kep(goc, lai_suat_nam, so_nam):\n    \"\"\"Tính tổng tiền sau so_nam năm.\"\"\"\n"},
			}},
			{ID: "embedding", Label: "Embedding", Kind: KindOpenAIEmbedding, Path: "/embeddings", Examples: []Example{
				{Title: "Câu hỏi khách hàng", Input: "Làm sao để tăng hạn mức chuyển khoản trên ứng dụng?"},
				{Title: "Điều khoản", Input: "Khách hàng chịu trách nhiệm bảo mật mã OTP và không cung cấp cho bất kỳ ai."},
			}},
			{ID: "rerank", Label: "Rerank", Kind: KindOpenAIRerank, Path: "/rerank", Examples: []Example{
				{Title: "Phê duyệt thay đổi", Input: "thay đổi khẩn cấp cần ai phê duyệt", Docs: []string{
					"Thay đổi khẩn cấp cần quản lý ca trực phê duyệt.",
					"Nhân viên được nghỉ phép 12 ngày mỗi năm.",
					"Hồ sơ thay đổi phải bổ sung trong 24 giờ sau khi thực hiện."}},
				{Title: "Hạn mức thẻ", Input: "hạn mức rút tiền thẻ ghi nợ", Docs: []string{
					"Thẻ ghi nợ nội địa rút tối đa 50 triệu đồng mỗi ngày tại ATM.",
					"Lãi suất tiết kiệm kỳ hạn 12 tháng là 4,8% một năm.",
					"Khách hàng có thể đổi hạn mức rút tiền trên ứng dụng."}},
			}},
		},
	},
	{
		ID: "anthropic", Name: "Anthropic compatible",
		Description:     "Messages API theo định dạng Anthropic (/v1/messages), có streaming. Dùng được thư viện anthropic chính thức.",
		DocsURL:         "https://docs.anthropic.com/en/api/messages",
		DefaultEndpoint: "/v1", Unit: UnitToken,
		Ops: []Op{
			{ID: "messages", Label: "Messages", Kind: KindAnthropicMessage, Path: "/messages", Stream: true, Examples: []Example{
				{Title: "Rà soát điều khoản", System: "Bạn là chuyên viên pháp chế. Chỉ ra rủi ro, không đưa kết luận pháp lý cuối cùng.",
					Input: "Điều khoản: \"Bên B được đơn phương chấm dứt hợp đồng mà không cần báo trước.\" Điều khoản này có rủi ro gì cho ngân hàng (bên A)?"},
				{Title: "Giải thích cho khách", Input: "Giải thích cho khách hàng lớn tuổi, bằng lời đơn giản, vì sao không được chia sẻ mã OTP."},
			}},
		},
	},
	{
		ID: "systemone", Name: "SystemOne compatible",
		Description: "Decision API: gửi một state và các câu hỏi, model trả quyết định kèm xác suất và độ tin cậy, không sinh văn bản. " +
			"Ba loại câu hỏi: choice (chọn một phương án), noul (xác suất đúng/sai), score (thang điểm từ thấp đến cao).",
		DocsURL:         "https://docs.ollama.com/api/systemone",
		DefaultEndpoint: "/v1", Unit: UnitToken,
		Ops: []Op{
			{ID: "decide", Label: "Ra quyết định", Kind: KindSystemOne, Path: "/systemone", ImageAccept: "image/png,image/jpeg,image/webp", Examples: []Example{
				{Title: "Phân loại yêu cầu",
					State: raw(`"Khách hàng báo từ 9 giờ sáng không thanh toán được trên ứng dụng, màn hình báo lỗi 500."`),
					Questions: raw(`{"label": {"type": "choice", "instructions": "Yêu cầu này thuộc nhóm nào?",
						"criteria": {"thanh_toan": "Thanh toán và hoàn tiền", "loi_he_thong": "Lỗi phần mềm, hệ thống", "tai_khoan": "Đăng nhập và tài khoản"}}}`)},
				{Title: "Kiểm tra chứng từ (ảnh)", Model: "s1-chung-tu", Images: []string{"/examples/uy-nhiem-chi.png"},
					State: raw(`"Khách hàng nộp ảnh chứng từ kèm yêu cầu chuyển 125.000.000 VND cho Công ty CP Mẫu B."`),
					Questions: raw(`{"loai_chung_tu": {"type": "choice", "instructions": "Ảnh là loại chứng từ nào?",
						"criteria": {"uy_nhiem_chi": "Ủy nhiệm chi", "hoa_don": "Hoá đơn GTGT", "hop_dong": "Hợp đồng"}},
						"khop_so_tien": {"type": "noul", "instructions": "Số tiền trên chứng từ có khớp 125.000.000 VND không?",
						"criteria": {"false": "Không khớp", "true": "Khớp"}},
						"do_ro": {"type": "score", "instructions": "Ảnh rõ đến mức nào?",
						"criteria": ["Không đọc được", "Đọc được một phần", "Rõ, đọc được hết"]}}`)},
			}},
		},
	},
	{
		ID: "turboocr", Name: "TurboOCR",
		Description:     "OCR ảnh qua API của TurboOCR: gửi nguyên byte ảnh tới /ocr/raw, nhận các dòng chữ kèm độ tin cậy và toạ độ. Tham số layout, tables, formulas bật nhận dạng bố cục, bảng, công thức.",
		DocsURL:         "https://github.com/aiptimizer/TurboOCR",
		DefaultEndpoint: "/turboocr/{model}", ModelInPath: true, Unit: UnitPage,
		Ops: []Op{
			{ID: "ocr", Label: "OCR ảnh", Kind: KindBinary, Path: "/ocr/raw", Accept: "image/png,image/jpeg,image/webp,image/tiff", Examples: []Example{
				{Title: "Ủy nhiệm chi", File: "/examples/uy-nhiem-chi.png"},
				{Title: "Hoá đơn có bảng", File: "/examples/hoa-don.png", Query: "layout=1&tables=1"},
			}},
		},
	},
	{
		ID: "mineru", Name: "MinerU OCR",
		Description:     "Phân tích tài liệu (PDF, ảnh) sang Markdown qua API V1 của MinerU: gửi tệp multipart tới /v1/file_parse.",
		DocsURL:         "https://opendatalab.github.io/MinerU/usage/http_api/",
		DefaultEndpoint: "/mineru/{model}", ModelInPath: true, Unit: UnitPage,
		Ops: []Op{
			{ID: "parse", Label: "Phân tích tài liệu", Kind: KindMultipart, Path: "/v1/file_parse", FileField: "files", Accept: "application/pdf,image/png,image/jpeg", Examples: []Example{
				{Title: "Hợp đồng PDF 2 trang", File: "/examples/hop-dong.pdf", Query: "tier=flash"},
				{Title: "Ảnh ủy nhiệm chi", File: "/examples/uy-nhiem-chi.png", Query: "tier=flash&ocr_mode=txt"},
			}},
		},
	},
}

func Get(id string) (Standard, bool) {
	i := slices.IndexFunc(All, func(s Standard) bool { return s.ID == id })
	if i < 0 {
		return Standard{}, false
	}
	return All[i], true
}

func IDs() []string {
	out := make([]string, len(All))
	for i, s := range All {
		out[i] = s.ID
	}
	return out
}

func (s Standard) OpIDs() []string {
	out := make([]string, len(s.Ops))
	for i, o := range s.Ops {
		out[i] = o.ID
	}
	return out
}

// Endpoint trả endpoint mặc định của model theo chuẩn.
func (s Standard) Endpoint(modelID string) string {
	return strings.ReplaceAll(s.DefaultEndpoint, "{model}", modelID)
}

// LegacyType suy ra cột type cũ (dùng cho bộ lọc và tương thích dữ liệu) từ chuẩn và thao tác.
func (s Standard) LegacyType(ops []string) string {
	if s.Unit == UnitPage {
		return "document"
	}
	if s.ID == "openai" && len(ops) > 0 && !slices.Contains(ops, "chat") && !slices.Contains(ops, "completion") {
		if slices.Contains(ops, "embedding") {
			return "embedding"
		}
		return "rerank"
	}
	return "chat"
}
