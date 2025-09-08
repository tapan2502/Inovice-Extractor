# PDF Viewer + Data Extraction Dashboard

Monorepo with:
- `apps/web` — Next.js (App Router, TS, shadcn/ui-ready) PDF viewer + editable invoice form
- `apps/api` — Node.js (Express + TS) — upload, extract (Gemini/Groq-ready), CRUD
- `packages/types` — shared TypeScript types

## Quick Start

```bash
# 1) install deps at root
npm i

# 2) copy envs
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Fill them (see below)

# 3) dev
npm run dev
```

### Env Vars
- API (`apps/api/.env`):
  - `PORT=4000`
  - `MONGODB_URI=...`
  - `GEMINI_API_KEY=...` (or `GROQ_API_KEY=...`)
- Web (`apps/web/.env.local`):
  - `NEXT_PUBLIC_API_URL=http://localhost:4000`

### Deploy (Vercel)
- Create 2 projects: one for `/apps/web`, one for `/apps/api`
- Set Framework: Next.js for web; Node/Other for api
- Set Build Command (`apps/api`): `npm run build`
- Output: `dist`
- Set env vars for each project as above

### Minimal API
- `POST /upload` — multipart form-data `file` (PDF) → `{ fileId, fileName }`
- `POST /extract` — JSON `{ fileId, model: "gemini" | "groq" }` → parsed JSON
- `GET /invoices?q=...` — list with optional search
- `GET /invoices/:id` — read
- `PUT /invoices/:id` — update
- `DELETE /invoices/:id` — delete
```json
{
  "fileId": "string",
  "fileName": "string",
  "vendor": { "name": "string", "address": "string", "taxId": "string" },
  "invoice": {
    "number": "string",
    "date": "string",
    "currency": "string",
    "subtotal": 0,
    "taxPercent": 0,
    "total": 0,
    "poNumber": "string",
    "poDate": "string",
    "lineItems": [
      {"description":"", "unitPrice":0, "quantity":0, "total":0}
    ]
  },
  "createdAt": "string",
  "updatedAt": "string"
}
```
