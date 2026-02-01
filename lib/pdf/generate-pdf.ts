// =============================================================================
// PDF GENERATION UTILITY — Government-Grade Document Export
// =============================================================================
// Generates professional, non-editable PDF documents dynamically using jsPDF.
// Population and Agency Name data from the Setup form are injected directly
// into PDF templates so the user doesn't have to re-type them.
//
// Usage:
//   import { textToPdf, downloadPdf, generateAndDownloadPdf } from '@/lib/pdf/generate-pdf';
//
//   // Simple text PDF
//   generateAndDownloadPdf('My Document', 'Content...', 'doc.pdf');
//
//   // With agency data injection
//   generateAndDownloadPdf('Proposal', content, 'proposal.pdf', {
//     agencyName: 'City of Springfield',
//     population: 75000,
//   });
//
// All government documents MUST be exported as PDF only.
// .pages, .docx, and .txt formats are NOT acceptable for procurement.
// =============================================================================

import { jsPDF } from 'jspdf';

// ── Types ──────────────────────────────────────────────────────────────────

export interface PdfOptions {
  fontSize?: number;
  margin?: number;
}

export interface AgencyData {
  agencyName?: string;
  population?: number;
  stateName?: string;
  tierName?: string;
  contractValue?: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const PAGE_WIDTH = 215.9; // US Letter width in mm
const PAGE_HEIGHT = 279.4; // US Letter height in mm
const DEFAULT_MARGIN = 25.4; // 1 inch margin in mm
const DEFAULT_FONT_SIZE = 10;
const HEADER_FONT_SIZE = 16;
const FOOTER_FONT_SIZE = 8;
const LINE_HEIGHT_FACTOR = 1.5;

// ── Core PDF Generation ────────────────────────────────────────────────────

/**
 * Convert plain text content to a valid PDF file (binary).
 *
 * Generates a professional PDF document with:
 * - Title and date header
 * - Optional agency data injection (name, population, state, tier)
 * - Word-wrapped body text
 * - US Letter page size (8.5" x 11")
 * - Automatic pagination with page numbers
 * - Document metadata (title, creator, producer)
 */
export function textToPdf(
  title: string,
  content: string,
  options?: PdfOptions,
  agencyData?: AgencyData
): Uint8Array {
  const fontSize = options?.fontSize ?? DEFAULT_FONT_SIZE;
  const margin = options?.margin ?? DEFAULT_MARGIN;
  const usableWidth = PAGE_WIDTH - margin * 2;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  // ── Document metadata ──
  doc.setProperties({
    title,
    creator: 'Kiri Nexus Government Portal',
    author: agencyData?.agencyName || 'Government Agency',
    subject: title,
    keywords: 'government, procurement, AI receptionist',
  });

  let y = margin;

  // ── Title ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(HEADER_FONT_SIZE);
  doc.setTextColor(15, 23, 42); // #0F172A
  doc.text(title, margin, y);
  y += HEADER_FONT_SIZE * 0.5;

  // ── Separator line ──
  doc.setDrawColor(30, 64, 175); // #1E40AF
  doc.setLineWidth(0.5);
  doc.line(margin, y, PAGE_WIDTH - margin, y);
  y += 4;

  // ── Date line ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FOOTER_FONT_SIZE);
  doc.setTextColor(100, 116, 139); // #64748B
  doc.text(`Generated: ${new Date().toISOString().split('T')[0]}`, margin, y);
  y += 5;

  // ── Agency data injection ──
  if (agencyData) {
    const fields: string[] = [];
    if (agencyData.agencyName) fields.push(`Agency: ${agencyData.agencyName}`);
    if (agencyData.population) fields.push(`Population Served: ${agencyData.population.toLocaleString()}`);
    if (agencyData.stateName) fields.push(`State: ${agencyData.stateName}`);
    if (agencyData.tierName) fields.push(`Service Tier: ${agencyData.tierName}`);
    if (agencyData.contractValue) fields.push(`Contract Value: $${agencyData.contractValue.toLocaleString()}/year`);

    if (fields.length > 0) {
      // Agency info box
      const boxHeight = fields.length * 4.5 + 6;
      doc.setFillColor(241, 245, 249); // #F1F5F9
      doc.setDrawColor(203, 213, 225); // #CBD5E1
      doc.roundedRect(margin, y, usableWidth, boxHeight, 2, 2, 'FD');

      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(30, 64, 175); // #1E40AF

      for (const field of fields) {
        doc.text(field, margin + 3, y);
        y += 4.5;
      }
      y += 4;
    }
  }

  // ── Body content ──
  doc.setFont('courier', 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(30, 41, 59); // #1E293B
  const lineHeight = fontSize * LINE_HEIGHT_FACTOR * 0.352778; // pt to mm

  const lines = doc.splitTextToSize(content, usableWidth);
  const maxY = PAGE_HEIGHT - margin - 10; // Leave room for footer

  for (let i = 0; i < lines.length; i++) {
    if (y + lineHeight > maxY) {
      // ── Footer on current page ──
      addPageFooter(doc, doc.getNumberOfPages(), margin);
      // ── New page ──
      doc.addPage('letter', 'portrait');
      y = margin;
    }
    doc.text(lines[i], margin, y);
    y += lineHeight;
  }

  // ── Footer on final page ──
  addPageFooter(doc, doc.getNumberOfPages(), margin);

  // ── Output ──
  const arrayBuffer = doc.output('arraybuffer');
  return new Uint8Array(arrayBuffer);
}

/**
 * Add page number footer to the current page.
 */
function addPageFooter(doc: jsPDF, pageNum: number, margin: number): void {
  const totalPages = doc.getNumberOfPages();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FOOTER_FONT_SIZE);
  doc.setTextColor(148, 163, 184); // #94A3B8
  const footerText = `Page ${pageNum} of ${totalPages}`;
  const textWidth = doc.getTextWidth(footerText);
  doc.text(footerText, (PAGE_WIDTH - textWidth) / 2, PAGE_HEIGHT - margin / 2);

  // Confidentiality mark
  doc.setFontSize(6);
  doc.setTextColor(203, 213, 225); // #CBD5E1
  doc.text('GOVERNMENT USE ONLY — Generated by Kiri Nexus', margin, PAGE_HEIGHT - margin / 2 + 3);
}

/**
 * Download a PDF file in the browser.
 */
export function downloadPdf(pdfBytes: Uint8Array, filename: string): void {
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Generate a PDF and trigger download in one call.
 * Optionally injects agency data (name, population, state, tier) into the header.
 */
export function generateAndDownloadPdf(
  title: string,
  content: string,
  filename: string,
  agencyData?: AgencyData
): void {
  const pdfBytes = textToPdf(title, content, undefined, agencyData);
  downloadPdf(pdfBytes, filename);
}
