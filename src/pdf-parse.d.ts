declare module 'pdf-parse' {
  import { Buffer } from 'buffer';

  interface PDFInfo {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    version: string;
    text: string;
  }

  interface PDFParseOptions {
    max?: number;
    version?: string;
    pagerender?: (pageData: any) => Promise<string>;
  }

  function pdfParse(
    dataBuffer: Buffer | Uint8Array,
    options?: PDFParseOptions
  ): Promise<PDFInfo>;

  export = pdfParse;
} 