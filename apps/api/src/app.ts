// apps/api/src/app.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { Readable } from "stream";
import { ObjectId } from "mongodb";
import { filesBucketPromise, invoicesCollPromise } from "./db.js";
import { invoiceRecordSchema } from "./schemas.js";
import axios from "axios";

function stripCodeFences(s: string) {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return m ? m[1] : s;
}
function extractJsonLenient(s: string) {
  try { return JSON.parse(s); } catch {}
  const a = stripCodeFences(s);
  try { return JSON.parse(a); } catch {}
  const i = a.indexOf("{"), j = a.lastIndexOf("}");
  if (i !== -1 && j > i) { try { return JSON.parse(a.slice(i, j + 1)); } catch {} }
  return null;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
    const bucket = await filesBucketPromise;
    const stream = Readable.from(req.file.buffer);
    const up = bucket.openUploadStream(req.file.originalname, { contentType: req.file.mimetype });
    stream.pipe(up).on("error", () => res.status(500).json({ error: "upload failed" }))
      .on("finish", () => res.json({ fileId: up.id.toString(), fileName: req.file!.originalname }));
  } catch { res.status(500).json({ error: "server error" }); }
});

app.post("/extract", async (req, res) => {
  try {
    const { fileId, model } = req.body || {};
    if (!fileId) return res.status(400).json({ error: "fileId required" });
    if (!ObjectId.isValid(fileId)) return res.status(400).json({ error: "invalid fileId" });

    const bucket = await filesBucketPromise;
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      bucket.openDownloadStream(new ObjectId(fileId))
        .on("data", (d: Buffer) => chunks.push(d))
        .on("end", () => resolve())
        .on("error", reject);
    });
    const pdfB64 = Buffer.concat(chunks).toString("base64");

    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(400).json({ error: "Missing GEMINI_API_KEY" });

    const payload = {
      contents: [{ parts: [
        { text: "Return ONLY valid JSON. Keys: vendor{name,address,taxId}, invoice{number,date,currency,subtotal,taxPercent,total,poNumber,poDate,lineItems[description,unitPrice,quantity,total]}." },
        { inline_data: { mime_type: "application/pdf", data: pdfB64 } }
      ]}]
    };

    const { data } = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=" + key,
      payload, { headers: { "Content-Type": "application/json" }, timeout: 90_000 }
    );
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p: any) => p?.text || "").join("").trim();
    const parsed = extractJsonLenient(text);
    if (!parsed) return res.status(502).json({ error: "Gemini returned non-JSON", preview: text.slice(0,800) });
    res.json(parsed);
  } catch (err: any) {
    const status = err?.response?.status || 500;
    res.status(status).json({ error: "server error", detail: err?.response?.data || String(err) });
  }
});

app.get("/invoices", async (req, res) => {
  const q = (req.query.q as string)?.trim();
  const coll = await invoicesCollPromise;
  const filter = q ? { $or: [
    { "vendor.name": { $regex: q, $options: "i" } },
    { "invoice.number": { $regex: q, $options: "i" } }
  ] } : {};
  const list = await coll.find(filter).sort({ _id: -1 }).limit(200).toArray();
  res.json(list);
});

app.get("/invoices/:id", async (req, res) => {
  const coll = await invoicesCollPromise;
  const doc = await coll.findOne({ _id: new ObjectId(req.params.id) });
  if (!doc) return res.status(404).json({ error: "not found" });
  res.json(doc);
});

app.put("/invoices/:id", async (req, res) => {
  const parsed = invoiceRecordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const coll = await invoicesCollPromise;
  await coll.updateOne({ _id: new ObjectId(req.params.id) }, { $set: parsed.data });
  const doc = await coll.findOne({ _id: new ObjectId(req.params.id) });
  res.json(doc);
});

app.delete("/invoices/:id", async (req, res) => {
  const coll = await invoicesCollPromise;
  await coll.deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ ok: true });
});

app.post("/invoices", async (req, res) => {
  const parsed = invoiceRecordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const coll = await invoicesCollPromise;
  const result = await coll.insertOne(parsed.data);
  const doc = await coll.findOne({ _id: result.insertedId });
  res.json(doc);
});

export default app;
