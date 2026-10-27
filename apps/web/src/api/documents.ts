import type { DocumentLine, DocumentType } from '@kza/shared';
import { req } from './http';

export interface CommercialDocument {
  id: string;
  type: DocumentType;
  number: string;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  items: DocumentLine[];
  discount: number;
  taxRate: number;
  notes: string | null;
  status: string;
  issueDate: string;
  dueDate: string | null;
  sourceQuoteId: string | null;
  saleId: string | null;
  // computed by the API
  subtotal: number;
  tax: number;
  total: number;
}

export interface DocumentInput {
  type: DocumentType;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  items: DocumentLine[];
  discount?: number;
  taxRate?: number;
  notes?: string;
  status?: string;
  issueDate: string;
  dueDate?: string | null;
}

export const documentsApi = {
  list: (type?: DocumentType) => req<CommercialDocument[]>(`/documents${type ? `?type=${type}` : ''}`),
  create: (body: DocumentInput) => req<CommercialDocument>('/documents', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<DocumentInput>) =>
    req<CommercialDocument>(`/documents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) => req<{ id: string }>(`/documents/${id}`, { method: 'DELETE' }),
  toInvoice: (id: string) => req<CommercialDocument>(`/documents/${id}/to-invoice`, { method: 'POST' }),
  createSale: (id: string, status: 'paid' | 'pending' | 'credit') =>
    req<{ id: string }>(`/documents/${id}/sale`, { method: 'POST', body: JSON.stringify({ status }) }),
  send: (id: string, pdfBase64: string, phone?: string) =>
    req<{ success: boolean }>(`/documents/${id}/send`, { method: 'POST', body: JSON.stringify({ pdfBase64, phone }) }),
};
