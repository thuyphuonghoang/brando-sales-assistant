import { describe, expect, it, vi } from "vitest";
import { analyzeHtml } from "@/lib/website";

vi.mock("server-only", () => ({}));
const { isPrivateIp, normalizeUrl } = await import("@/server/website");

const html = `<!doctype html><html><head>
<title>Nhà hàng Biển Xanh – Hải sản Đà Nẵng</title>
<meta name="viewport" content="width=device-width">
<meta name="description" content="Hải sản tươi sống ven biển">
<script type="application/ld+json">{"@type":"Restaurant","name":"Biển Xanh"}</script>
<style>.x{}</style></head><body>
<a href="tel:0905123456">Gọi ngay</a>
<h2>Thực đơn</h2><p>Mực nướng 120.000đ</p>
<a href="https://www.facebook.com/bienxanh">FB</a>
<a href="https://www.tripadvisor.com.vn/Restaurant_Review-g298085-d1">Trip</a>
</body></html>`;

describe("khám website", () => {
  it("đọc tiêu đề, mô tả, menu có giá, điện thoại, schema, link mạng xã hội", () => {
    const a = analyzeHtml(html);
    expect(a).toMatchObject({
      title: "Nhà hàng Biển Xanh – Hải sản Đà Nẵng",
      description: "Hải sản tươi sống ven biển",
      hasViewport: true,
      hasPhone: true,
      hasMenu: true,
      hasPrices: true,
      hasSchema: true,
      hasBooking: false,
    });
    expect(a.social.facebook).toBe("https://www.facebook.com/bienxanh");
    expect(a.social.tripadvisor).toContain("tripadvisor.com.vn");
    expect(a.social.instagram).toBeUndefined();
  });

  it("nhận nút đặt bàn qua chữ hoặc link đối tác", () => {
    expect(analyzeHtml("<a href='https://pasgo.vn/x'>Xem</a>").hasBooking).toBe(true);
    expect(analyzeHtml("<button>Đặt bàn</button>").hasBooking).toBe(true);
  });

  it("chuẩn hoá link, chỉ nhận http/https", () => {
    expect(normalizeUrl("bienxanh.vn")?.toString()).toBe("https://bienxanh.vn/");
    expect(normalizeUrl("ftp://x.vn")).toBeNull();
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
  });

  it("chặn địa chỉ nội bộ", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.20.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "142.250.4.100", "2001:4860:4860::8888"]) expect(isPrivateIp(ip), ip).toBe(false);
  });
});
