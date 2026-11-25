import "server-only";
// Tạo báo giá: copy mẫu Google Docs → điền dữ liệu → xuất PDF → lưu vào
// Drive: ROOT_FOLDER_ID/<tên khách>/.
//
// Mẫu Docs (TEMPLATE_DOC_ID) dùng các placeholder:
//   {{client_name}} {{client_industry}} {{client_address}} {{client_phone}}
//   {{quote_number}} {{issue_date}} {{valid_until}} {{validity_days}} {{owner_name}} {{owner_email}}
//   {{subtotal}} {{discount_percent}} {{discount_amount}} {{vat_percent}} {{vat_amount}} {{total}}
//   {{benefits}} {{payment_terms}} {{timeline}}
// Bảng hạng mục: một bảng có MỘT hàng chứa {{item_name}} {{item_desc}} {{item_qty}}
//   {{item_unit_price}} {{item_amount}} — hàng này được nhân bản theo số hạng mục.
import { Readable } from "node:stream";
import { docs as docsApi, type docs_v1 } from "@googleapis/docs";
import { drive as driveApi } from "@googleapis/drive";
import { formatVnd } from "@/lib/pricing";
import type { Quote } from "@/lib/types";
import { adminDb } from "../firebase-admin";
import { googleAuth, googleMode, requireEnv } from "./index";

export interface QuoteFiles {
  pdfUrl: string;
  docUrl: string;
  folderUrl: string;
  folderId: string;
  path: string;
}

const ITEM_KEYS = ["item_name", "item_desc", "item_qty", "item_unit_price", "item_amount"] as const;

export function lineValues(q: Quote) {
  return q.lines.map((l) => ({
    item_name: l.name,
    item_desc: l.description,
    item_qty: `${l.quantity} ${l.unit}`,
    item_unit_price: formatVnd(l.unitPrice),
    item_amount: formatVnd(l.amount),
  }));
}

export function scalarValues(q: Quote): Record<string, string> {
  const t = q.totals;
  return {
    client_name: q.clientSnapshot.name,
    client_industry: q.clientSnapshot.industry,
    client_address: q.clientSnapshot.address || "",
    client_phone: q.clientSnapshot.phone || "",
    quote_number: `v${q.version}`,
    issue_date: q.issueDate,
    valid_until: q.validUntil,
    validity_days: String(q.validityDays),
    owner_name: q.ownerName,
    owner_email: q.ownerEmail,
    subtotal: formatVnd(t.subtotal),
    discount_percent: `${t.discountPercent}%`,
    discount_amount: formatVnd(t.discountAmount),
    vat_percent: `${t.vatPercent}%`,
    vat_amount: formatVnd(t.vatAmount),
    total: formatVnd(t.total),
    benefits: q.showBenefits
      ? q.benefits
          .map((b) => `• ${b.text}${b.stat ? ` (Nguồn: ${b.stat.source_name}, ${b.stat.year})` : ""}`)
          .join("\n")
      : "",
    payment_terms: q.paymentTerms,
    timeline: q.timeline,
  };
}

/** Tên thư mục an toàn cho Drive. */
export function folderName(clientName: string): string {
  return clientName.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim() || "Khách hàng";
}

export async function generateQuoteFiles(q: Quote, existingFolderId?: string | null): Promise<QuoteFiles> {
  const name = folderName(q.clientSnapshot.name);
  const fileName = `Bao gia ${name} v${q.version}`;
  if (googleMode() === "mock") {
    const root = process.env.ROOT_FOLDER_ID || "MOCK_ROOT";
    const path = `${root}/${name}/${fileName}.pdf`;
    await adminDb().collection("_mock").doc("drive").collection("files").add({
      path,
      folder: `${root}/${name}`,
      quoteId: q.id,
      clientId: q.clientId,
      placeholders: scalarValues(q),
      lines: lineValues(q),
      createdAt: Date.now(),
    });
    const url = (p: string) => "/mock-drive/" + p.split("/").map(encodeURIComponent).join("/");
    return {
      pdfUrl: url(path),
      docUrl: url(path.replace(/\.pdf$/, "")),
      folderUrl: url(`${root}/${name}`),
      folderId: `mock-folder-${name}`,
      path,
    };
  }

  const auth = googleAuth();
  const drive = driveApi({ version: "v3", auth });
  const docs = docsApi({ version: "v1", auth });
  const root = requireEnv("ROOT_FOLDER_ID");
  const common = { supportsAllDrives: true } as const;

  // 1. Thư mục khách hàng (tìm hoặc tạo).
  let folderId = existingFolderId ?? null;
  if (!folderId) {
    const esc = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const found = await drive.files.list({
      q: `'${root}' in parents and name = '${esc}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id)",
      includeItemsFromAllDrives: true,
      ...common,
    });
    folderId = found.data.files?.[0]?.id ?? null;
    if (!folderId) {
      const created = await drive.files.create({
        requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [root] },
        fields: "id",
        ...common,
      });
      folderId = created.data.id!;
    }
  }

  // 2. Copy mẫu.
  const copy = await drive.files.copy({
    fileId: requireEnv("TEMPLATE_DOC_ID"),
    requestBody: { name: fileName, parents: [folderId] },
    fields: "id",
    ...common,
  });
  const docId = copy.data.id!;

  // 3. Nhân bản hàng hạng mục và điền dữ liệu.
  await fillItemRows(docs, docId, lineValues(q));
  const scalars = scalarValues(q);
  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: Object.entries(scalars).map(([k, v]) => ({
        replaceAllText: { containsText: { text: `{{${k}}}`, matchCase: true }, replaceText: v },
      })),
    },
  });

  // 4. Xuất PDF và lưu cùng thư mục.
  const pdf = await drive.files.export({ fileId: docId, mimeType: "application/pdf" }, { responseType: "arraybuffer" });
  const uploaded = await drive.files.create({
    requestBody: { name: `${fileName}.pdf`, parents: [folderId], mimeType: "application/pdf" },
    media: { mimeType: "application/pdf", body: Readable.from(Buffer.from(pdf.data as ArrayBuffer)) },
    fields: "id, webViewLink",
    ...common,
  });

  return {
    pdfUrl: uploaded.data.webViewLink!,
    docUrl: `https://docs.google.com/document/d/${docId}/edit`,
    folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
    folderId,
    path: `${root}/${name}/${fileName}.pdf`,
  };
}

function textOf(cell: docs_v1.Schema$TableCell): string {
  return (cell.content ?? [])
    .flatMap((c) => c.paragraph?.elements ?? [])
    .map((e) => e.textRun?.content ?? "")
    .join("");
}

async function fillItemRows(docs: docs_v1.Docs, documentId: string, rows: ReturnType<typeof lineValues>) {
  const locate = async () => {
    const doc = await docs.documents.get({ documentId });
    for (const el of doc.data.body?.content ?? []) {
      const table = el.table;
      if (!table) continue;
      const idx = (table.tableRows ?? []).findIndex((r) => (r.tableCells ?? []).some((c) => textOf(c).includes("{{item_name}}")));
      if (idx >= 0) return { tableStart: el.startIndex!, rowIndex: idx, table };
    }
    return null;
  };

  const loc = await locate();
  if (!loc) return; // mẫu không có bảng hạng mục
  const n = rows.length;

  // Thêm n-1 hàng trống ngay dưới hàng mẫu.
  if (n > 1) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: Array.from({ length: n - 1 }, () => ({
          insertTableRow: {
            tableCellLocation: { tableStartLocation: { index: loc.tableStart }, rowIndex: loc.rowIndex, columnIndex: 0 },
            insertBelow: true,
          },
        })),
      },
    });
  }

  // Hàng mẫu giữ placeholder; các hàng mới (trống) được điền text theo thứ tự cột của hàng mẫu.
  const after = await locate();
  if (!after) return;
  const tableRows = after.table.tableRows ?? [];
  const templateCells = tableRows[after.rowIndex].tableCells ?? [];
  const colKeys = templateCells.map((c) => ITEM_KEYS.find((k) => textOf(c).includes(`{{${k}}}`)));

  const inserts: docs_v1.Schema$Request[] = [];
  for (let i = 1; i < n; i++) {
    const cells = tableRows[after.rowIndex + i]?.tableCells ?? [];
    cells.forEach((cell, col) => {
      const key = colKeys[col];
      const start = cell.content?.[0]?.startIndex;
      if (key && start != null) inserts.push({ insertText: { location: { index: start }, text: rows[i][key] } });
    });
  }
  // Chèn từ cuối lên để chỉ số phía trước không bị lệch.
  inserts.sort((a, b) => b.insertText!.location!.index! - a.insertText!.location!.index!);

  const first = rows[0] ?? { item_name: "", item_desc: "", item_qty: "", item_unit_price: "", item_amount: "" };
  const replaces = ITEM_KEYS.map((k) => ({
    replaceAllText: { containsText: { text: `{{${k}}}`, matchCase: true }, replaceText: first[k] },
  }));
  await docs.documents.batchUpdate({ documentId, requestBody: { requests: [...inserts, ...replaces] } });
}
