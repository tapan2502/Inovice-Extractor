"use client";

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";

// IMPORTANT: we self-host the worker from /public
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

/* ---------- Types ---------- */
type LineItem = { description: string; unitPrice: number; quantity: number; total: number };
type Invoice = {
  fileId: string;
  fileName: string;
  vendor: { name: string; address?: string; taxId?: string };
  invoice: {
    number: string;
    date: string;
    currency?: string;
    subtotal?: number;
    taxPercent?: number;
    total?: number;
    poNumber?: string;
    poDate?: string;
    lineItems: LineItem[];
  };
  createdAt: string;
  updatedAt?: string;
};

const API = process.env.NEXT_PUBLIC_API_URL!;

/* =================================================================== */

export default function Page() {
  // PDF state
  const [file, setFile] = useState<File | null>(null);
  const [fileMeta, setFileMeta] = useState<{ fileId: string; fileName: string } | null>(null);
  const [doc, setDoc] = useState<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageNum, setPageNum] = useState(1);
  const [zoom, setZoom] = useState(1);

  // Invoice + list state
  const [record, setRecord] = useState<Invoice | null>(null);
  const [list, setList] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  /* ---------- Restore last upload so refresh doesn't lose fileId ---------- */
  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("lastUpload") : null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.fileId && parsed?.fileName) setFileMeta(parsed);
      } catch {}
    }
  }, []);

  /* ---------- Render current PDF page ---------- */
useEffect(() => {
  if (!doc) return;

  const canvas = canvasRef.current;
  if (!canvas) return; // 👈 guard for SSR/first render

  (async () => {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: zoom });

    // size the canvas
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const ctx = canvas.getContext("2d");
    if (!ctx) return; // extra safety

    await page.render({ canvasContext: ctx as any, viewport }).promise;
  })();
}, [doc, pageNum, zoom]);


  /* ---------- Handlers ---------- */
  const onChooseFile = async (f: File | null) => {
    setFile(f);
    if (!f) return;
    const buf = await f.arrayBuffer();
    const pdf = await (pdfjsLib as any).getDocument({ data: buf }).promise;
    setDoc(pdf);
    setPageNum(1);
    setZoom(1);
  };

  const uploadFile = async () => {
    if (!file) {
      alert("Pick a PDF first.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    console.log("[web] POST /upload");
    const res = await fetch(`${API}/upload`, { method: "POST", body: fd });
    const json = await res.json();
    console.log("[web] /upload response", json);

    if (!res.ok || !json?.fileId) {
      alert(`Upload failed: ${json?.error || res.status}`);
      return;
    }
    setFileMeta(json);
    localStorage.setItem("lastUpload", JSON.stringify(json)); // persist for refresh
  };

  const extract = async () => {
    if (!fileMeta) {
      alert("Please Upload first. (No fileId yet)");
      return;
    }
    console.log("[web] POST /extract with", fileMeta);
    try {
      const res = await fetch(`${API}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: fileMeta.fileId, model: "gemini" })
      });
      const data = await res.json();
      console.log("[web] /extract response", data);

      if (!res.ok) {
        alert(`Extract failed: ${data?.error || res.status}\n${data?.preview || ""}`);
        return;
      }

      const newRec: Invoice = {
        fileId: fileMeta.fileId,
        fileName: fileMeta.fileName,
        vendor: {
          name: data?.vendor?.name ?? "",
          address: data?.vendor?.address,
          taxId: data?.vendor?.taxId
        },
        invoice: {
          number: data?.invoice?.number ?? "",
          date: data?.invoice?.date ?? "",
          currency: data?.invoice?.currency,
          subtotal: Number(data?.invoice?.subtotal ?? 0),
          taxPercent: Number(data?.invoice?.taxPercent ?? 0),
          total: Number(data?.invoice?.total ?? 0),
          poNumber: data?.invoice?.poNumber,
          poDate: data?.invoice?.poDate,
          lineItems: Array.isArray(data?.invoice?.lineItems) ? data.invoice.lineItems : []
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setRecord(newRec);
    } catch (e) {
      console.error("[web] /extract error", e);
      alert("Extract call errored. Check console/network and API logs.");
    }
  };

const save = async () => {
  if (!record) return;

  // normalize to avoid nulls/strings for numbers
  const norm = {
    ...record,
    vendor: {
      ...record.vendor,
      name: record.vendor.name || "",
      address: record.vendor.address ?? undefined,
      taxId: record.vendor.taxId ?? undefined,
    },
    invoice: {
      ...record.invoice,
      number: record.invoice.number || "",
      date: record.invoice.date || "",
      currency: record.invoice.currency ?? undefined,
      subtotal: Number(record.invoice.subtotal ?? 0),
      taxPercent: Number(record.invoice.taxPercent ?? 0),
      total: Number(record.invoice.total ?? 0),
      poNumber: record.invoice.poNumber ?? undefined,
      poDate: record.invoice.poDate ?? undefined,
      lineItems: (record.invoice.lineItems || []).map((li) => ({
        description: li.description || "",
        unitPrice: Number(li.unitPrice ?? 0),
        quantity: Number(li.quantity ?? 0),
        total: Number(li.total ?? 0),
      })),
    },
  };

  const res = await fetch(`${API}/invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(norm),
  });
  const json = await res.json();

  if (!res.ok) {
    console.error("Save failed payload:", norm, "server:", json);
    alert(`Save failed: ${json?.error ? JSON.stringify(json.error) : res.status}`);
    return;
  }

  await refresh();
  alert("Saved!");
};


  const refresh = async () => {
    const res = await fetch(`${API}/invoices?q=${encodeURIComponent(search)}`);
    const data = await res.json();
    setList(data);
  };

  useEffect(() => {
    refresh();
  }, []);

  /* ---------- UI ---------- */
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {/* Left: PDF */}
      <div style={{ border: "1px solid #2b2f36", borderRadius: 12, padding: 12 }}>
        <h2>1) PDF Viewer</h2>
        <input type="file" accept="application/pdf" onChange={(e) => onChooseFile(e.target.files?.[0] || null)} />
        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={uploadFile}>Upload</button>
          <button onClick={() => setPageNum((n) => Math.max(1, n - 1))}>Prev</button>
          <button onClick={() => setPageNum((n) => Math.min(doc?.numPages || 1, n + 1))}>Next</button>
          <button onClick={() => setZoom((z) => z * 0.9)}>-</button>
          <button onClick={() => setZoom((z) => z * 1.1)}>+</button>
          <span>Page {pageNum} / {doc?.numPages || 0}</span>
          {fileMeta && (
            <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>
              fileId: {fileMeta.fileId.slice(0, 8)}…
            </span>
          )}
        </div>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", marginTop: 8, background: "#fff", borderRadius: 8, display: "block" }}
        />
      </div>

      {/* Right: Form + List */}
      <div style={{ border: "1px solid #2b2f36", borderRadius: 12, padding: 12 }}>
        <h2>2) Extract & Edit</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button onClick={extract} disabled={!fileMeta}>Extract with Gemini</button>
          <button onClick={save} disabled={!record}>Save</button>
        </div>

        {record && (
          <div style={{ display: "grid", gap: 8 }}>
            <h3>Vendor</h3>
            <input
              placeholder="Name"
              value={record.vendor.name}
              onChange={(e) => setRecord({ ...record, vendor: { ...record.vendor, name: e.target.value } })}
            />
            <input
              placeholder="Address"
              value={record.vendor.address || ""}
              onChange={(e) => setRecord({ ...record, vendor: { ...record.vendor, address: e.target.value } })}
            />
            <input
              placeholder="Tax ID"
              value={record.vendor.taxId || ""}
              onChange={(e) => setRecord({ ...record, vendor: { ...record.vendor, taxId: e.target.value } })}
            />

            <h3>Invoice</h3>
            <input
              placeholder="Number"
              value={record.invoice.number}
              onChange={(e) => setRecord({ ...record, invoice: { ...record.invoice, number: e.target.value } })}
            />
            <input
              placeholder="Date"
              value={record.invoice.date}
              onChange={(e) => setRecord({ ...record, invoice: { ...record.invoice, date: e.target.value } })}
            />
            <input
              placeholder="Currency"
              value={record.invoice.currency || ""}
              onChange={(e) => setRecord({ ...record, invoice: { ...record.invoice, currency: e.target.value } })}
            />
            <input
              type="number"
              placeholder="Subtotal"
              value={record.invoice.subtotal ?? 0}
              onChange={(e) =>
                setRecord({ ...record, invoice: { ...record.invoice, subtotal: Number(e.target.value) } })
              }
            />
            <input
              type="number"
              placeholder="Tax %"
              value={record.invoice.taxPercent ?? 0}
              onChange={(e) =>
                setRecord({ ...record, invoice: { ...record.invoice, taxPercent: Number(e.target.value) } })
              }
            />
            <input
              type="number"
              placeholder="Total"
              value={record.invoice.total ?? 0}
              onChange={(e) =>
                setRecord({ ...record, invoice: { ...record.invoice, total: Number(e.target.value) } })
              }
            />

            <h4>Line Items</h4>
            {(record.invoice.lineItems || []).map((li, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8 }}>
                <input
                  placeholder="Description"
                  value={li.description}
                  onChange={(e) => {
                    const copy = [...record.invoice.lineItems];
                    copy[i] = { ...li, description: e.target.value };
                    setRecord({ ...record, invoice: { ...record.invoice, lineItems: copy } });
                  }}
                />
                <input
                  type="number"
                  placeholder="Unit Price"
                  value={li.unitPrice}
                  onChange={(e) => {
                    const copy = [...record.invoice.lineItems];
                    copy[i] = { ...li, unitPrice: Number(e.target.value) };
                    setRecord({ ...record, invoice: { ...record.invoice, lineItems: copy } });
                  }}
                />
                <input
                  type="number"
                  placeholder="Qty"
                  value={li.quantity}
                  onChange={(e) => {
                    const copy = [...record.invoice.lineItems];
                    copy[i] = { ...li, quantity: Number(e.target.value) };
                    setRecord({ ...record, invoice: { ...record.invoice, lineItems: copy } });
                  }}
                />
                <input
                  type="number"
                  placeholder="Total"
                  value={li.total}
                  onChange={(e) => {
                    const copy = [...record.invoice.lineItems];
                    copy[i] = { ...li, total: Number(e.target.value) };
                    setRecord({ ...record, invoice: { ...record.invoice, lineItems: copy } });
                  }}
                />
              </div>
            ))}
            <button
              onClick={() =>
                setRecord({
                  ...record,
                  invoice: {
                    ...record.invoice,
                    lineItems: [...record.invoice.lineItems, { description: "", unitPrice: 0, quantity: 1, total: 0 }]
                  }
                })
              }
            >
              + Add line
            </button>
          </div>
        )}

        <hr style={{ margin: "16px 0" }} />

        <h2>3) List</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            placeholder="Search vendor/invoice #"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button onClick={refresh}>Search</button>
        </div>
        <div style={{ maxHeight: 300, overflow: "auto", border: "1px solid #2b2f36", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #2b2f36" }}>Vendor</th>
                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #2b2f36" }}>Invoice #</th>
                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #2b2f36" }}>Total</th>
                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #2b2f36" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row._id}>
                  <td style={{ padding: 8, borderBottom: "1px solid #2b2f36" }}>{row.vendor?.name}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #2b2f36" }}>{row.invoice?.number}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #2b2f36" }}>{row.invoice?.total}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #2b2f36" }}>
                    <button
                      onClick={async () => {
                        if (!confirm("Delete?")) return;
                        await fetch(`${API}/invoices/${row._id}`, { method: "DELETE" });
                        await refresh();
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 12, opacity: 0.7 }}>
                    No invoices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
