'use strict';

const { format: csvFormat } = require('fast-csv');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const SYSTEM_NAME = 'PGI Financial Document Tracking System';
const HEADER_BG   = 'FF1E3A5F'; // dark navy — ARGB for ExcelJS
const HEADER_FG   = 'FFFFFFFF';

// ─── CSV ─────────────────────────────────────────────────────────────────────

/**
 * Stream a CSV to `res` without writing any temp file.
 *
 * @param {object[]} rows    - Array of plain objects
 * @param {string[]} columns - Ordered list of keys to include
 * @param {import('http').ServerResponse} res
 * @param {string} filename
 */
function toCSV(rows, columns, res, filename = 'report.csv') {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const stream = csvFormat({ headers: columns, writeBOM: true });
  stream.pipe(res);

  for (const row of rows) {
    const record = {};
    for (const col of columns) record[col] = row[col] ?? '';
    stream.write(record);
  }
  stream.end();
}

// ─── Excel ───────────────────────────────────────────────────────────────────

/**
 * Build an exceljs workbook in memory and pipe it to `res`.
 *
 * @param {object[]} rows
 * @param {{ key: string; header: string; width?: number }[]} columns
 * @param {string} sheetName
 * @param {import('http').ServerResponse} res
 * @param {string} filename
 */
async function toExcel(rows, columns, sheetName, res, filename = 'report.xlsx') {
  const workbook  = new ExcelJS.Workbook();
  workbook.creator = SYSTEM_NAME;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((c) => ({
    header: c.header,
    key:    c.key,
    width:  c.width ?? 20,
  }));

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FG } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } },
    };
  });
  headerRow.height = 20;

  // Data rows
  for (const row of rows) {
    const record = {};
    for (const col of columns) record[col.key] = row[col.key] ?? '';
    sheet.addRow(record);
  }

  // Auto-filter on header row
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to:   { row: 1, column: columns.length },
  };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  await workbook.xlsx.write(res);
  res.end();
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

/**
 * Build a PDFKit document in memory, pipe it to `res`.
 * Includes: report title, generation timestamp, tabular data, page numbers.
 *
 * @param {object[]} rows
 * @param {{ key: string; header: string; width?: number }[]} columns
 * @param {string} title
 * @param {import('http').ServerResponse} res
 * @param {string} filename
 */
function toPDF(rows, columns, title, res, filename = 'report.pdf') {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  doc.pipe(res);

  const pageW = doc.page.width  - 80; // usable width (margins: 40 each side)
  const generated = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Colombo' });

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.fontSize(14).font('Helvetica-Bold').text(SYSTEM_NAME, 40, 40, { align: 'center', width: pageW });
  doc.fontSize(11).font('Helvetica-Bold').text(title, { align: 'center', width: pageW });
  doc.fontSize(8).font('Helvetica').fillColor('#666666')
    .text(`Generated: ${generated}`, { align: 'center', width: pageW });
  doc.fillColor('#000000').moveDown(0.8);

  const dividerY = doc.y;
  doc.moveTo(40, dividerY).lineTo(40 + pageW, dividerY).stroke();
  doc.moveDown(0.5);

  // ── Table ───────────────────────────────────────────────────────────────────
  const totalWidth   = columns.reduce((s, c) => s + (c.width ?? 80), 0);
  const scaleFactor  = pageW / totalWidth;
  const colWidths    = columns.map((c) => (c.width ?? 80) * scaleFactor);
  const rowHeight    = 18;
  const headerHeight = 20;

  function drawRow(y, cells, isHeader = false) {
    let x = 40;
    for (let i = 0; i < columns.length; i++) {
      const w = colWidths[i];
      if (isHeader) {
        doc.rect(x, y, w, headerHeight).fill('#1E3A5F');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7)
          .text(cells[i], x + 3, y + 5, { width: w - 6, lineBreak: false });
        doc.fillColor('#000000');
      } else {
        doc.rect(x, y, w, rowHeight).stroke('#DDDDDD');
        doc.font('Helvetica').fontSize(7).fillColor('#000000')
          .text(String(cells[i] ?? ''), x + 3, y + 5, { width: w - 6, lineBreak: false });
      }
      x += w;
    }
  }

  // Header row
  drawRow(doc.y, columns.map((c) => c.header), true);
  doc.y += headerHeight;

  // Data rows — start new page when needed
  for (let i = 0; i < rows.length; i++) {
    if (doc.y + rowHeight > doc.page.height - 60) {
      doc.addPage();
      drawRow(doc.y, columns.map((c) => c.header), true);
      doc.y += headerHeight;
    }
    const cells = columns.map((c) => rows[i][c.key] ?? '');
    const rowY  = doc.y;
    // Alternating row background
    if (i % 2 === 0) {
      doc.rect(40, rowY, pageW, rowHeight).fill('#F7F9FC');
      doc.fillColor('#000000');
    }
    drawRow(rowY, cells, false);
    doc.y += rowHeight;
  }

  // ── Page numbers ─────────────────────────────────────────────────────────────
  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).font('Helvetica').fillColor('#888888')
      .text(
        `Page ${i + 1} of ${totalPages}`,
        40,
        doc.page.height - 30,
        { align: 'center', width: pageW },
      );
  }

  doc.end();
}

module.exports = { toCSV, toExcel, toPDF };
