import { describe, it, expect } from '@jest/globals';
import * as XLSX from 'xlsx';
import { parseSpreadsheet, buildSnapshot } from '../../services/sharepointSyncService';

const HEADER = ['Project / Customer Name', 'Project Manager', 'Account Manager', 'Plan', 'Delay Status',
  'Delay Days', 'Current Phase', 'SOW Start Date', 'Active/On-Hold', 'Source Platform'];

function csv(lines: string[][]): Buffer {
  return Buffer.from(lines.map((l) => l.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\r\n'), 'utf8');
}

describe('sharepointSyncService.parseSpreadsheet (CSV export)', () => {
  it('keeps every column, in the list order, with the exact text SharePoint shows', () => {
    const snap = parseSpreadsheet(csv([
      HEADER,
      ['vendasta', 'Abhishikth Y', 'Vivin Joseph', 'Silver', 'Delayed', '38.0208333333', 'OneTime Migration', 'February 04', 'Active', 'Google MyDrive/SharedDrive'],
      ['Mercado Libre', 'Abhishikth Y', 'Vivin Joseph', 'Platinum', 'Not Delayed', '-50', 'OneTime Migration', 'January 01', 'Active', 'Meta'],
    ]));
    expect(snap.columns).toEqual(HEADER);
    expect(snap.rows).toHaveLength(2);
    expect(snap.rows[0].values['Delay Days']).toBe('38.0208333333');
    expect(snap.rows[0].values['SOW Start Date']).toBe('February 04');
    expect(snap.rows[1].values['Delay Days']).toBe('-50');
    expect(snap.rows[1].values['Source Platform']).toBe('Meta');
  });

  it('strips a UTF-8 BOM from the first header', () => {
    const snap = parseSpreadsheet(Buffer.concat([Buffer.from('﻿', 'utf8'), csv([['Project / Customer Name', 'Plan'], ['NFL', 'Gold']])]));
    expect(snap.columns[0]).toBe('Project / Customer Name');
  });

  it('keeps repeated names as separate rows with distinct, re-upload-stable keys', () => {
    const file = csv([
      HEADER,
      ['LegitScript', 'Abhishikth Y', 'Vivin Joseph', 'Silver', 'Delayed', '25', 'Closed', 'December 19, 2025', 'Closed', 'Slack'],
      ['LegitScript', 'Abhishikth Y', 'Vivin Joseph', 'Silver', 'Delayed', '25', 'Closed', 'December 19, 2025', 'Closed', 'Gmail'],
      ['Legitscript', 'Abhishikth Y', 'Vivin Joseph', 'Silver', 'Delayed', '25', 'Closed', 'December 19, 2025', 'Closed', 'Google MyDrive/Sh'],
    ]);
    const a = parseSpreadsheet(file);
    const b = parseSpreadsheet(file);
    expect(a.rows).toHaveLength(3);
    expect(new Set(a.rows.map((r) => r.key)).size).toBe(3);
    expect(b.rows.map((r) => r.key)).toEqual(a.rows.map((r) => r.key));
    expect(a.keyMode).toBe('NAME');
  });

  it('keys rows by SharePoint item ID when the export has an ID column', () => {
    const snap = parseSpreadsheet(csv([['ID', 'Project / Customer Name'], ['101', 'NFL'], ['102', 'NFL']]));
    expect(snap.keyMode).toBe('ID');
    expect(snap.rows.map((r) => r.key)).toEqual(['sp:101', 'sp:102']);
  });

  it('reads the displayed text from an .xlsx export too', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Project / Customer Name', 'Delay Days'], ['Walts Lab', 2]]), 'Sheet1');
    const snap = parseSpreadsheet(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
    expect(snap.rows[0].values).toEqual({ 'Project / Customer Name': 'Walts Lab', 'Delay Days': '2' });
  });
});

describe('sharepointSyncService.buildSnapshot', () => {
  it('ignores fully blank rows and unnamed columns', () => {
    const snap = buildSnapshot(['Project / Customer Name', '', 'Plan'], [['NFL', 'x', 'Gold'], ['', '', '  ']]);
    expect(snap.columns).toEqual(['Project / Customer Name', 'Plan']);
    expect(snap.rows).toHaveLength(1);
  });
});
