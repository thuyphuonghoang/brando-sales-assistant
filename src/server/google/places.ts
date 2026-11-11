import "server-only";
// Google Places API (New). Chỉ dùng API chính thức — KHÔNG scrape bất kỳ nền tảng nào.
import type { PlaceInfo } from "@/lib/types";
import { googleMode, requireEnv } from "./index";

const BASE = "https://places.googleapis.com/v1";

const DETAIL_FIELDS = [
  "id",
  "displayName",
  "primaryType",
  "primaryTypeDisplayName",
  "formattedAddress",
  "regularOpeningHours.weekdayDescriptions",
  "editorialSummary",
  "nationalPhoneNumber",
  "websiteUri",
  "photos",
  "userRatingCount",
  "rating",
  "reviews",
  "location",
  "reservable",
  "delivery",
  "takeout",
  "dineIn",
];

interface RawPlace {
  id: string;
  displayName?: { text: string };
  primaryType?: string;
  primaryTypeDisplayName?: { text: string };
  formattedAddress?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  editorialSummary?: { text: string };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  photos?: unknown[];
  userRatingCount?: number;
  rating?: number;
  reviews?: { rating?: number; text?: { text: string }; authorAttribution?: { displayName?: string }; relativePublishTimeDescription?: string }[];
  location?: { latitude: number; longitude: number };
  reservable?: boolean;
  delivery?: boolean;
  takeout?: boolean;
  dineIn?: boolean;
}

function toPlaceInfo(p: RawPlace): PlaceInfo {
  const actions: string[] = [];
  if (p.nationalPhoneNumber) actions.push("Gọi");
  if (p.websiteUri) actions.push("Website");
  if (p.reservable) actions.push("Đặt chỗ");
  if (p.delivery) actions.push("Giao hàng");
  if (p.takeout) actions.push("Mang đi");
  return {
    placeId: p.id,
    name: p.displayName?.text ?? "",
    category: p.primaryTypeDisplayName?.text,
    primaryType: p.primaryType,
    address: p.formattedAddress,
    hours: p.regularOpeningHours?.weekdayDescriptions,
    description: p.editorialSummary?.text,
    phone: p.nationalPhoneNumber,
    website: p.websiteUri,
    // Places API trả tối đa 10 ảnh → photoCount = 10 nghĩa là "từ 10 ảnh trở lên".
    photoCount: p.photos?.length ?? 0,
    reviewCount: p.userRatingCount ?? 0,
    rating: p.rating,
    recentReviews: (p.reviews ?? []).slice(0, 5).map((r) => ({
      author: r.authorAttribution?.displayName,
      rating: r.rating,
      text: r.text?.text ?? "",
      time: r.relativePublishTimeDescription,
    })),
    actionButtons: actions,
    location: p.location ? { lat: p.location.latitude, lng: p.location.longitude } : undefined,
  };
}

async function call<T>(path: string, init: RequestInit & { fieldMask: string }): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": requireEnv("PLACES_API_KEY"),
      "X-Goog-FieldMask": init.fieldMask,
    },
  });
  if (!res.ok) throw new Error(`Places API lỗi ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

/** Lấy tên địa điểm từ link Google Maps dạng .../maps/place/<tên>/... nếu có. */
export function nameFromMapsUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const m = url.match(/\/maps\/place\/([^/@?]+)/);
  return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : undefined;
}

export async function findBusiness(query: { name: string; mapsUrl?: string; area?: string }): Promise<PlaceInfo | null> {
  if (googleMode() === "mock") return mockPlace(query.name);
  const textQuery = [nameFromMapsUrl(query.mapsUrl) ?? query.name, query.area].filter(Boolean).join(" ");
  const found = await call<{ places?: { id: string }[] }>("/places:searchText", {
    method: "POST",
    fieldMask: "places.id",
    body: JSON.stringify({ textQuery, languageCode: "vi", regionCode: "VN", pageSize: 1 }),
  });
  const id = found.places?.[0]?.id;
  if (!id) return null;
  const detail = await call<RawPlace>(`/places/${id}?languageCode=vi&regionCode=VN`, {
    method: "GET",
    fieldMask: DETAIL_FIELDS.join(","),
  });
  return toPlaceInfo(detail);
}

export async function findCompetitors(place: PlaceInfo, max = 5): Promise<PlaceInfo[]> {
  if (googleMode() === "mock") return mockCompetitors(place.name, max);
  if (!place.location || !place.primaryType) return [];
  const res = await call<{ places?: RawPlace[] }>("/places:searchNearby", {
    method: "POST",
    fieldMask: DETAIL_FIELDS.map((f) => `places.${f}`).join(","),
    body: JSON.stringify({
      includedPrimaryTypes: [place.primaryType],
      maxResultCount: Math.min(max + 1, 20),
      rankPreference: "POPULARITY",
      languageCode: "vi",
      regionCode: "VN",
      locationRestriction: {
        circle: { center: { latitude: place.location.lat, longitude: place.location.lng }, radius: 2000 },
      },
    }),
  });
  return (res.places ?? [])
    .filter((p) => p.id !== place.placeId)
    .slice(0, max)
    .map(toPlaceInfo);
}

// ---------- Mock ----------
function mockPlace(name: string): PlaceInfo {
  return {
    placeId: "mock-" + name.length,
    name,
    category: "Doanh nghiệp địa phương",
    primaryType: "restaurant",
    address: "123 Đường Mẫu, Quận 1, TP. Hồ Chí Minh",
    hours: ["Thứ Hai: 08:00–22:00", "Chủ Nhật: 08:00–22:00"],
    description: undefined,
    phone: "028 0000 0000",
    website: undefined,
    photoCount: 4,
    reviewCount: 12,
    rating: 4.1,
    recentReviews: [{ author: "Khách mẫu", rating: 4, text: "Dịch vụ ổn, sẽ quay lại.", time: "1 tuần trước" }],
    actionButtons: ["Gọi"],
    location: { lat: 10.7769, lng: 106.7009 },
  };
}

function mockCompetitors(name: string, max: number): PlaceInfo[] {
  const base = [
    { n: "Đối thủ A", rating: 4.6, reviews: 320, photos: 10, web: true },
    { n: "Đối thủ B", rating: 4.4, reviews: 150, photos: 10, web: true },
    { n: "Đối thủ C", rating: 4.2, reviews: 85, photos: 7, web: false },
    { n: "Đối thủ D", rating: 3.9, reviews: 40, photos: 5, web: false },
  ];
  return base.slice(0, Math.min(max, base.length)).map((c, i) => ({
    placeId: `mock-comp-${i}`,
    name: `${c.n} (gần ${name})`,
    category: "Doanh nghiệp địa phương",
    primaryType: "restaurant",
    rating: c.rating,
    reviewCount: c.reviews,
    photoCount: c.photos,
    website: c.web ? "https://example.com" : undefined,
    actionButtons: c.web ? ["Gọi", "Website"] : ["Gọi"],
  }));
}
