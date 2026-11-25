// Mô hình dữ liệu Firestore. Xem thêm firestore.rules và CLAUDE.md.

export type Role = "sales" | "lead" | "admin";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  role: Role;
  teamId: string;
  active: boolean;
}

/** Nhãn nguồn bắt buộc cho mọi thông tin hiển thị. */
export type SourceLabel = "Thu thập" | "AI nhận định" | "Sales nhập";

export const SECTION_KEYS = [
  "company_info",
  "online_presence",
  "competitors",
  "industry_notes",
  "meeting_notes",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  company_info: "Thông tin doanh nghiệp",
  online_presence: "Hiện diện trực tuyến",
  competitors: "Đối thủ",
  industry_notes: "Ghi chú ngành",
  meeting_notes: "Ghi chú gặp",
};

export type ClientStatus = "research" | "assessed" | "meeting" | "quoted" | "won" | "lost";
export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  research: "Đang research",
  assessed: "Đã nhận định",
  meeting: "Đã gặp",
  quoted: "Đã báo giá",
  won: "Chốt",
  lost: "Không chốt",
};

export interface ClientInputs {
  website?: string;
  mapsUrl?: string;
  fanpage?: string;
  taxCode?: string;
  tiktok?: string;
  instagram?: string;
}

export interface PlaceInfo {
  placeId: string;
  name: string;
  category?: string;
  address?: string;
  hours?: string[];
  description?: string;
  phone?: string;
  website?: string;
  photoCount?: number;
  reviewCount?: number;
  rating?: number;
  recentReviews?: { author?: string; rating?: number; text: string; time?: string }[];
  actionButtons?: string[];
  location?: { lat: number; lng: number };
  primaryType?: string;
}

/** Kết quả khám website của khách (nhãn "Thu thập"). */
export interface WebsiteAudit {
  url: string;
  finalUrl?: string;
  reachable: boolean;
  https: boolean;
  status?: number;
  title?: string;
  description?: string;
  hasViewport: boolean;
  hasPhone: boolean;
  hasBooking: boolean;
  hasMenu: boolean;
  hasPrices: boolean;
  hasSchema: boolean;
  social: Partial<Record<"facebook" | "instagram" | "tiktok" | "tripadvisor" | "youtube" | "zalo", string>>;
  wordCount: number;
  /** Điểm hiệu năng mobile của Google PageSpeed (0–100); null khi không đo được. */
  mobileScore: number | null;
  checkedAt: number;
  error?: string;
}

export interface Client {
  id: string;
  name: string;
  industry: string;
  inputs: ClientInputs;
  ownerId: string;
  ownerName: string;
  collaboratorIds: string[];
  teamId: string;
  status: ClientStatus;
  /** Các section cộng tác — mỗi field lưu riêng bằng update dotted-path. */
  sections: {
    company_info: Record<string, string>;
    online_presence: Record<string, string>;
    competitors: Record<string, string>;
    industry_notes: Record<string, string>;
    meeting_notes: Record<string, string>;
  };
  /** Thông tin sales nhập ở bước Research. */
  business: {
    goals?: string;
    budget?: number | null;
    investment?: number | null;
    decisionMaker?: string;
    timeline?: string;
    /** Giá trị sales nhập cho các tiêu chí Bộ chuẩn, theo mã (vd. "MAP-POST": "Yếu", "TRIP-REV": "42"). */
    criteria?: Record<string, string>;
  };
  /** Dữ liệu thu thập từ Places API (nhãn "Thu thập"). */
  place?: PlaceInfo | null;
  competitors?: PlaceInfo[];
  website?: WebsiteAudit | null;
  /** Lý do không thu thập được Google Maps (vd. chưa có khoá Places). */
  mapsError?: string | null;
  researchedAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

// ---------- Catalog (cache từ Google Sheets) ----------
export interface PriceItem {
  code: string;
  name: string;
  group: string;
  description: string;
  unit: string;
  price: number;
  effective_from: string;
}

/** Một tiêu chí trong tab "Tiêu chí" của Bộ chuẩn. Ngưỡng giữ nguyên chữ trong sheet (vd. "< 100"). */
export interface Criterion {
  code: string;
  channel: string;
  label: string;
  how: string;
  weak: string;
  mid: string;
  strong: string;
  note: string;
}

export type CriterionLevel = "Yếu" | "Trung bình" | "Mạnh" | "Không rõ";

export interface CriterionResult {
  code: string;
  channel: string;
  label: string;
  level: CriterionLevel;
  /** Giá trị đo được hoặc sales nhập, dạng chữ để hiển thị. */
  value?: string;
  evidence: string;
  source: "Thu thập" | "Sales nhập" | "Chưa có dữ liệu";
}

export interface CaseMatch {
  code: string;
  name: string;
  matched: string[];
  failed: string[];
  unchecked: string[];
  /** Tỷ lệ điều kiện khớp trên số điều kiện kiểm được (0–1). */
  ratio: number;
}

export interface CaseSuggestion {
  /** Case được chọn tự động; null khi chưa đủ dữ liệu hoặc hoà → sales/trưởng nhóm chọn. */
  pick: string | null;
  needsReview: boolean;
  reason: string;
  candidates: CaseMatch[];
}

/** Một "case" khách hàng trong Bộ chuẩn (tab Case): A1…A6. */
export interface CaseDef {
  code: string;
  name: string; // ngành tham chiếu
  signals: string; // điều kiện nhận diện (theo tab Tiêu chí)
  group: string; // nhóm dịch vụ: Nhận biết / Chuyển đổi…
  goal: string; // mục tiêu tư vấn
}

/** Gói chuẩn theo case × mức (tab Gói của Bộ chuẩn), vd. A1-T = case A1, mức Tiết kiệm. */
export interface StandardPackage {
  code: string;
  caseCode: string;
  tier: string; // Tiết kiệm / Cơ bản / Premium / VIP / VIPP
  items: { code: string; quantity: number; note?: string }[];
  /** Tổng phần giá cố định (chưa VAT), tính từ bảng giá đã đồng bộ. */
  fixedTotal: number;
  /** Số hạng mục giá linh hoạt (đơn giá 0 trong bảng giá = báo giá riêng). */
  flexibleCount: number;
  /** Cột "Gửi báo giá" của sheet: true = "Tự gửi được", false = "Chờ anh duyệt". */
  autoSend: boolean;
}

export interface RuleRow {
  industry: string; // "*" = mọi ngành
  problem_code: string;
  service_codes: string[];
}

export interface ChecklistItem {
  item_code: string;
  label: string;
  how_to_check: string;
  weight: number;
}

export interface Industry {
  id: string;
  name: string;
  checklist: ChecklistItem[];
}

export interface StatItem {
  id: string;
  industry: string;
  stat_text: string;
  value: string;
  source_name: string;
  source_url: string;
  year: number | string;
}

// ---------- Nhận định ----------
export type CheckResult = "Đạt" | "Chưa đạt" | "Không rõ";
export type FunnelStage = "BIẾT" | "HIỂU" | "TIN" | "MUA";

export interface StatRef {
  statId: string;
  text: string;
  source_name: string;
  source_url: string;
  year: number | string;
}

export interface Assessment {
  scorecard: { item_code: string; label: string; result: CheckResult; evidence: string; weight: number }[];
  score: number; // 0..100, tính từ trọng số
  competitorComparison: string;
  funnelGap: FunnelStage | "Không rõ";
  funnelReason: string;
  problems: { problem_code: string; title: string; detail: string; statIds: string[] }[];
  opportunities: string[];
  pitch4T: { tacDung: string; tuongXung: string; tinTuong: string; tangTruong: string };
  objections: { objection: string; response: string }[];
  stats: StatRef[];
  removedSentences?: number;
}

export interface AssessmentDoc {
  ai: Assessment; // bản AI gốc
  edited: Assessment | null; // bản sales đã sửa
  model: string;
  generatedAt: number;
  generatedBy: string;
  editedAt?: number | null;
  editedBy?: string | null;
}

// ---------- Ghi chú gặp ----------
export interface MeetingNote {
  id: string;
  date: string;
  feedback: string;
  realObjections: string;
  customerTier4T: "Tác dụng" | "Tương xứng" | "Tin tưởng" | "Tăng trưởng" | "";
  decisionMaker: string;
  nextStep: string;
  nextDate: string;
  authorId: string;
  authorName: string;
  createdAt: number;
}

// ---------- Báo giá ----------
export type QuoteStatus = "draft" | "pending_approval" | "sent" | "accepted" | "rejected";
export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Nháp",
  pending_approval: "Chờ duyệt",
  sent: "Đã gửi",
  accepted: "Đồng ý",
  rejected: "Từ chối",
};

export interface QuoteLine {
  code: string;
  name: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number; // snapshot tại thời điểm tạo
  amount: number;
  priceEffectiveFrom: string;
}

export interface QuoteTotals {
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  afterDiscount: number;
  vatPercent: number;
  vatAmount: number;
  total: number;
}

export interface Quote {
  id: string;
  clientId: string;
  version: number;
  status: QuoteStatus;
  packageName: string;
  lines: QuoteLine[];
  totals: QuoteTotals;
  showBenefits: boolean;
  benefits: { text: string; stat?: StatRef }[];
  paymentTerms: string;
  timeline: string;
  validityDays: number;
  issueDate: string;
  validUntil: string;
  clientSnapshot: { name: string; industry: string; address?: string; phone?: string };
  ownerName: string;
  ownerEmail: string;
  createdBy: string;
  createdAt: number;
  pdfUrl?: string | null;
  docUrl?: string | null;
  driveFolderUrl?: string | null;
  approvedBy?: string | null;
  approvedAt?: number | null;
}

export interface PackageOption {
  tier: "Cơ bản" | "Khuyến nghị" | "Toàn diện";
  items: { code: string; quantity: number }[];
  solves: string[]; // problem titles
  estimatedTotal: number;
}
