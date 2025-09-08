import { z } from "zod";

// helper: treat null/"" as undefined for optional strings
const optStr = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v == null || v === "" ? undefined : v as string));

export const lineItemSchema = z.object({
  description: optStr.default(""),
  unitPrice: z.coerce.number().default(0),
  quantity: z.coerce.number().default(0),
  total: z.coerce.number().default(0),
});

export const invoiceRecordSchema = z.object({
  fileId: z.string().min(1),
  fileName: z.string().min(1),
  vendor: z.object({
    name: z.string().default(""),
    address: optStr.optional(),
    taxId: optStr.optional(),
  }),
  invoice: z.object({
    number: optStr.default(""),
    date: optStr.default(""),
    currency: optStr.optional(),
    subtotal: z.coerce.number().optional(),
    taxPercent: z.coerce.number().optional(),
    total: z.coerce.number().optional(),
    poNumber: optStr.optional(),
    poDate: optStr.optional(),
    lineItems: z.array(lineItemSchema).default([]),
  }),
  createdAt: z.string(),
  updatedAt: optStr.optional(),
});
