export type LineItem = {
  description: string;
  unitPrice: number;
  quantity: number;
  total: number;
};

export type InvoiceRecord = {
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
