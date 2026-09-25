import { describe, it, expect } from '@jest/globals';
import * as XLSX from 'xlsx';
import { parseSpreadsheet, buildSnapshot, cellText, parseAttachmentExport } from '../../services/sharepointSyncService';

describe('sharepointSyncService.parseAttachmentExport', () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><id>https://cloudfuzecom.sharepoint.com/sites/MigrationPractice/_api/Web/Lists(guid'x')/Items(47)</id>
      <link rel="http://schemas.microsoft.com/ado/2007/08/dataservices/related/AttachmentFiles"><m:inline><feed>
        <entry><id>https://cloudfuzecom.sharepoint.com/sites/MigrationPractice/_api/Web/Lists(guid'x')/Items(47)/AttachmentFiles('CloudFuze-RahrBSG.pdf')</id>
          <content><m:properties><d:FileName>CloudFuze-RahrBSG.pdf</d:FileName>
          <d:ServerRelativeUrl>/sites/MigrationPractice/Lists/Migration Projects Tracker/Attachments/47/CloudFuze-RahrBSG.pdf</d:ServerRelativeUrl></m:properties></content></entry>
        <entry><content><m:properties><d:FileName>SOW &amp; Amendment 1.docx</d:FileName>
          <d:ServerRelativeUrl>/sites/MigrationPractice/Lists/Migration Projects Tracker/Attachments/47/SOW &amp; Amendment 1.docx</d:ServerRelativeUrl></m:properties></content></entry>
      </feed></m:inline></link>
      <content><m:properties><d:Id m:type="Edm.Int32">47</d:Id></m:properties></content></entry>
    <entry><content><m:properties><d:Id m:type="Edm.Int32">48</d:Id></m:properties></content></entry>
  </feed>`;

  it('extracts each attachment of each item from the SharePoint REST XML', () => {
    const byItem = parseAttachmentExport(xml);
    expect([...byItem.keys()]).toEqual(['47']);
    expect(byItem.get('47')).toEqual([
      { name: 'CloudFuze-RahrBSG.pdf', url: 'https://cloudfuzecom.sharepoint.com/sites/MigrationPractice/Lists/Migration%20Projects%20Tracker/Attachments/47/CloudFuze-RahrBSG.pdf' },
      { name: 'SOW & Amendment 1.docx', url: 'https://cloudfuzecom.sharepoint.com/sites/MigrationPractice/Lists/Migration%20Projects%20Tracker/Attachments/47/SOW%20&%20Amendment%201.docx' },
    ]);
  });

  it('ignores attachment links from a different list', () => {
    const other = '<d:ServerRelativeUrl>/sites/MigrationPractice/Lists/Some Other List/Attachments/47/x.pdf</d:ServerRelativeUrl>';
    expect(parseAttachmentExport(other).size).toBe(0);
  });

  it('reads the JSON form too', () => {
    const json = JSON.stringify({ value: [{ Id: 12, AttachmentFiles: [{ FileName: 'a.pdf', ServerRelativeUrl: '/sites/MigrationPractice/Lists/Migration Projects Tracker/Attachments/12/a.pdf' }] }] });
    expect(parseAttachmentExport(json).get('12')?.[0].name).toBe('a.pdf');
  });
});

describe('sharepointSyncService.cellText', () => {
  it('returns the URL of a SharePoint hyperlink column value', () => {
    expect(cellText({ Description: 'Repo folder', Url: 'https://cloudfuzecom.sharepoint.com/:f:/s/MigrationPractice/abc' }))
      .toBe('https://cloudfuzecom.sharepoint.com/:f:/s/MigrationPractice/abc');
  });

  it('returns the display name of a person value', () => {
    expect(cellText({ LookupId: 12, LookupValue: 'Abhishikth Y', Email: 'a@cloudfuze.com' })).toBe('Abhishikth Y');
  });
});

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
    expect(snap.columns).toEqual(['Project / Customer Name']);
    expect(snap.rows[0].values).toEqual({ 'Project / Customer Name': 'NFL' });
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
