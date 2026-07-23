import axios from 'axios';
import { logger } from '../utils/logger';

const BASE_URL = (process.env.DOCS_API_URL || 'https://zenop.ai').replace(/\/$/, '');
const API_KEY  = process.env.DOCS_API_KEY || '';

function client() {
  return axios.create({
    baseURL: BASE_URL,
    headers: { Authorization: `Bearer ${API_KEY}` },
    timeout: 15_000,
  });
}

export interface DocsDocument {
  id: string;
  fileName: string;
  fileSize: number;
  clientName: string | null;
  clientEmail: string | null;
  company: string | null;
  templateName: string | null;
  generatedDate: string | null;
  quoteId: string | null;
  metadata: {
    totalCost?: number;
    duration?: number;
    migrationType?: string;
    numberOfUsers?: number;
  };
  status: string;
  dates: {
    projectStartDate?: string;
    effectiveDate?: string;
    quoteExpiryDate?: string;
  };
  createdAt: string;
}

export interface DocsQuote {
  id: string | null;
  client_name: string | null;
  client_email: string | null;
  company: string | null;
  configuration: Record<string, any>;
  calculation: {
    totalCost?: number;
    userCost?: number;
    dataCost?: number;
    migrationCost?: number;
    instanceCost?: number;
    [key: string]: any;
  };
  selected_tier: any;
  status: string | null;
  created_at: string;
  updated_at: string;
}

export async function listDocuments(): Promise<DocsDocument[]> {
  try {
    const res = await client().get<{ success: boolean; documents: DocsDocument[] }>('/api/documents');
    return res.data.documents ?? [];
  } catch (err: any) {
    logger.error(`[Docs] listDocuments failed: ${err.message}`);
    throw err;
  }
}

export async function getDocument(id: string): Promise<DocsDocument & { fileData?: string }> {
  try {
    const res = await client().get<{ success: boolean; document: DocsDocument & { fileData?: string } }>(`/api/documents/${id}`);
    return res.data.document;
  } catch (err: any) {
    logger.error(`[Docs] getDocument(${id}) failed: ${err.message}`);
    throw err;
  }
}

export async function downloadDocument(id: string): Promise<{ data: Buffer; fileName: string }> {
  const doc = await getDocument(id);
  if (!doc.fileData) throw new Error('No file data for document ' + id);
  const buf = Buffer.from(doc.fileData, 'base64');
  return { data: buf, fileName: doc.fileName || `${id}.pdf` };
}

export async function listQuotes(): Promise<DocsQuote[]> {
  try {
    const res = await client().get<{ success: boolean; quotes: DocsQuote[] }>('/api/quotes');
    return res.data.quotes ?? [];
  } catch (err: any) {
    logger.error(`[Docs] listQuotes failed: ${err.message}`);
    throw err;
  }
}
