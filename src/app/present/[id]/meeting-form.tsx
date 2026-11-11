"use client";
// Form ghi chú buổi gặp ngay trong chế độ trình bày. Thu gọn mặc định để không lộ trên màn hình
// chiếu. Chỉ GHI dữ liệu (không đọc ghi chú cũ) nên không làm lộ nội dung nội bộ.
import { useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { firebase } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth-provider";

const EMPTY = { feedback: "", realObjections: "", customerTier4T: "", decisionMaker: "", nextStep: "", nextDate: "" };

export function PresentMeetingForm({ clientId }: { clientId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return setMsg("Phiên đăng nhập trình duyệt đã hết, mở lại ứng dụng để lưu.");
    try {
      await addDoc(collection(firebase().db, "clients", clientId, "meetings"), {
        ...form,
        date: new Date().toISOString().slice(0, 10),
        authorId: user.uid,
        authorName: user.displayName,
        createdAt: Date.now(),
      });
      setForm(EMPTY);
      setMsg("Đã lưu ghi chú.");
      setOpen(false);
    } catch (err) {
      setMsg((err as Error).message);
    }
  };

  const input = "w-full rounded-md border px-2 py-1.5 text-sm";
  return (
    <section className="border-t pt-6 print:hidden">
      <button className="text-sm text-neutral-500 underline" onClick={() => setOpen(!open)}>
        {open ? "Ẩn ghi chú buổi gặp" : "Ghi chú buổi gặp"}
      </button>
      {msg && <p className="mt-2 text-sm text-neutral-600">{msg}</p>}
      {open && (
        <form onSubmit={save} className="mt-3 grid gap-2 sm:grid-cols-2">
          <textarea className={`${input} sm:col-span-2`} placeholder="Phản hồi của khách" value={form.feedback} onChange={(e) => setForm({ ...form, feedback: e.target.value })} />
          <textarea className={`${input} sm:col-span-2`} placeholder="Phản đối thực tế" value={form.realObjections} onChange={(e) => setForm({ ...form, realObjections: e.target.value })} />
          <select className={input} value={form.customerTier4T} onChange={(e) => setForm({ ...form, customerTier4T: e.target.value })} aria-label="Tầng 4T">
            <option value="">Tầng 4T: Không rõ</option>
            {["Tác dụng", "Tương xứng", "Tin tưởng", "Tăng trưởng"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <input className={input} placeholder="Người quyết định (chức danh)" value={form.decisionMaker} onChange={(e) => setForm({ ...form, decisionMaker: e.target.value })} />
          <input className={input} placeholder="Bước tiếp theo" value={form.nextStep} onChange={(e) => setForm({ ...form, nextStep: e.target.value })} />
          <input className={input} type="date" aria-label="Ngày hẹn" value={form.nextDate} onChange={(e) => setForm({ ...form, nextDate: e.target.value })} />
          <button type="submit" className="rounded-md bg-neutral-900 px-3 py-2 text-sm text-white sm:col-span-2">
            Lưu ghi chú
          </button>
        </form>
      )}
    </section>
  );
}
