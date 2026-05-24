import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { query, execute } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

export const pocDocumentsController = {
  getAll: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const result = await query(
      `SELECT id, project_id, file_name, category, file_size, mime_type, file_path, uploaded_by, created_at
       FROM poc_documents WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId]
    );
    res.json({ success: true, data: result.rows.map((r: any) => ({
      id: r.id,
      projectId: r.project_id,
      fileName: r.file_name,
      category: r.category,
      fileSize: r.file_size,
      mimeType: r.mime_type,
      filePath: r.file_path,
      uploadedBy: r.uploaded_by,
      createdAt: r.created_at,
    })) });
  }),

  upload: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const { fileName, category, fileData, mimeType, fileSize, uploadedBy } = req.body;

    const uploadsDir = path.join(process.cwd(), 'uploads', 'poc-documents');
    fs.mkdirSync(uploadsDir, { recursive: true });

    const ext = path.extname(fileName) || '';
    const savedName = `${uuidv4()}${ext}`;
    const filePath = path.join(uploadsDir, savedName);
    fs.writeFileSync(filePath, Buffer.from(fileData, 'base64'));

    const fileUrl = `/uploads/poc-documents/${savedName}`;

    await execute(
      `INSERT INTO poc_documents (id, project_id, file_name, category, file_size, mime_type, file_path, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [uuidv4(), projectId, fileName, category || 'MOM', fileSize || null, mimeType || null, fileUrl, uploadedBy || null]
    );

    res.json({ success: true, message: 'Document uploaded' });
  }),

  downloadTemplate: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const xml = buildScopeRegisterXml();
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', 'attachment; filename="CloudFuze_POC_Scope_Register_Template.xls"');
    res.send(xml);
  }),

  delete: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId, documentId } = req.params;
    const result = await query(
      `SELECT file_path FROM poc_documents WHERE id = $1 AND project_id = $2`,
      [documentId, projectId]
    );
    if (result.rows[0]?.file_path) {
      const filePath = path.join(process.cwd(), result.rows[0].file_path.replace(/^\//, ''));
      try { fs.unlinkSync(filePath); } catch {}
    }
    await execute(`DELETE FROM poc_documents WHERE id = $1 AND project_id = $2`, [documentId, projectId]);
    res.json({ success: true, message: 'Document deleted' });
  }),
};

// ── Excel XML template builder ────────────────────────────────────────────────

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cell(value: string, bold = false, bg = '', wrap = false): string {
  const styleId = bold && bg ? 'HeaderBg' : bold ? 'Header' : bg ? 'Bg' : wrap ? 'Wrap' : 'Normal';
  return `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${esc(value)}</Data></Cell>`;
}

function emptyCell(n = 1) { return `<Cell ss:MergeAcross="${n - 1}" ss:StyleID="Normal"><Data ss:Type="String"></Data></Cell>`; }

function sectionHeader(title: string): string {
  return `<Row ss:Height="20">
    <Cell ss:StyleID="SectionHeader" ss:MergeAcross="4"><Data ss:Type="String">${esc(title)}</Data></Cell>
  </Row>`;
}

function colHeader(...cols: string[]): string {
  return `<Row ss:Height="16">${cols.map((c) => cell(c, true, '#E8EAF6')).join('')}</Row>`;
}

function dataRow(cols: string[], shade = false): string {
  const bg = shade ? '#F5F5F5' : '#FFFFFF';
  return `<Row>${cols.map((c) => `<Cell ss:StyleID="${shade ? 'RowShade' : 'Normal'}"><Data ss:Type="String">${esc(c)}</Data></Cell>`).join('')}</Row>`;
}

function blankRow(cols = 5): string {
  return `<Row>${Array(cols).fill('<Cell ss:StyleID="Normal"><Data ss:Type="String"></Data></Cell>').join('')}</Row>`;
}

function buildScopeRegisterXml(): string {
  const section1Rows = [
    ['1',  'File / folder structure migration',    'Not tested', 'Workload: Content — enter observations after test run',          'Pre-sales owner'],
    ['2',  'Permissions and ACL migration',         'Not tested', 'Workload: Content — enter observations after test run',          'Pre-sales owner'],
    ['3',  'Metadata and timestamps preservation',  'Not tested', 'Workload: Content / Email — enter observations after test run',  'Pre-sales owner'],
    ['4',  'Delta / incremental migration',         'Not tested', 'Workload: Content / Email — enter observations after test run',  'Pre-sales owner'],
    ['5',  'Shared drive / team drive migration',   'Not tested', 'Workload: Content — enter observations after test run',          'Pre-sales owner'],
    ['6',  'External sharing links',                'Not tested', 'Workload: Content — enter observations after test run',          'Pre-sales owner'],
    ['7',  'Email mailbox migration',               'Not tested', 'Workload: Email — enter observations after test run',            'Pre-sales owner'],
    ['8',  'Calendar and contacts migration',       'Not tested', 'Workload: Email — enter observations after test run',            'Pre-sales owner'],
    ['9',  'Email folder hierarchy',                'Not tested', 'Workload: Email — enter observations after test run',            'Pre-sales owner'],
    ['10', 'Public folder migration',               'Not tested', 'Workload: Email — enter observations after test run',            'Pre-sales owner'],
    ['11', 'Chat / channel history migration',      'Not tested', 'Workload: Messaging — enter observations after test run',        'Pre-sales owner'],
    ['12', 'Channel membership mapping',            'Not tested', 'Workload: Messaging — enter observations after test run',        'Pre-sales owner'],
    ['13', 'Attachments in messages',               'Not tested', 'Workload: Messaging — enter observations after test run',        'Pre-sales owner'],
    ['14', 'Direct messages (DMs)',                 'Not tested', 'Workload: Messaging — enter observations after test run',        'Pre-sales owner'],
    ['15', 'Migration speed benchmark (GB/hr)',     'Not tested', 'Workload: All — enter observations after test run',              'Pre-sales owner'],
    ['16', 'Error rate and failed items',           'Not tested', 'Workload: All — enter observations after test run',              'Pre-sales owner'],
    ['17', '', 'Not tested', '', ''],
    ['18', '', 'Not tested', '', ''],
    ['19', '', 'Not tested', '', ''],
  ];

  const section2Rows = [
    ['1', 'All files and folders from source root',          'Content',   'Specify total GB and folder count',         'Pre-sales / customer'],
    ['2', 'Active user mailboxes',                           'Email',     'Specify mailbox count and avg size',        'Pre-sales / customer'],
    ['3', 'Shared mailboxes',                                'Email',     'Specify count',                             'Pre-sales / customer'],
    ['4', 'Calendar events and contacts',                    'Email',     'Specify date range if applicable',          'Pre-sales / customer'],
    ['5', 'Channel history and attachments',                 'Messaging', 'Specify channel count',                     'Pre-sales / customer'],
    ['6', 'Direct message history',                          'Messaging', 'Specify user count',                        'Pre-sales / customer'],
    ['7', 'Permissions and ACL at file/folder level',        'Content',   'Specify permission model',                  'Pre-sales / customer'],
    ['8', 'Metadata — author, created date, modified date',  'Content',   'Confirm metadata fields required',          'Pre-sales / customer'],
    ['9', '', '', '', ''],
    ['10', '', '', '', ''],
    ['11', '', '', '', ''],
  ];

  const section3Rows = [
    ['1', 'Archived / inactive mailboxes',                 'Email',     'To be migrated in separate phase if required',        'Pre-sales / customer'],
    ['2', 'Legacy file formats unsupported by target',     'Content',   'List specific formats excluded',                     'Pre-sales / customer'],
    ['3', 'Corrupted or inaccessible source files',        'Content',   'Error log to be shared post-trial run',              'Pre-sales / customer'],
    ['4', 'Personal OneDrive / My Drive of leavers',       'Content',   'Out of scope unless explicitly agreed',              'Pre-sales / customer'],
    ['5', 'Third-party app integrations and connectors',   'All',       'Integrations to be re-established by customer IT',   'Pre-sales / customer'],
    ['6', 'Public-facing SharePoint pages and sites',      'Content',   'Confirm if required — separate scoping needed',      'Pre-sales / customer'],
    ['7', 'SMS / voice records',                           'Messaging', 'Not supported by CF Migrate',                        'Pre-sales / customer'],
    ['8', 'Email encryption keys and S/MIME certs',        'Email',     'Customer IT responsibility',                         'Pre-sales / customer'],
    ['9', '', '', '', ''],
    ['10', '', '', '', ''],
    ['11', '', '', '', ''],
  ];

  const section4Rows = [
    ['1', 'Custom metadata field mapping to target',         'Must have',    'Medium — requires field mapping config',             'Under review'],
    ['2', 'Selective migration by date range or label',      'Should have',  'Low — supported via filter rules',                  'Under review'],
    ['3', 'Domain remapping for email addresses',            'Must have',    'High — requires tenant-level config',               'Under review'],
    ['4', 'Custom folder structure re-mapping on migration', 'Should have',  'Medium — mapping sheet required',                   'Under review'],
    ['5', 'Preservation of version history',                 'Nice to have', 'High — significantly increases migration time',     'Under review'],
    ['6', 'Custom notification / cutover communication',     'Nice to have', 'Low — email template provided by pre-sales',        'Under review'],
    ['7', 'Throttling / bandwidth limits for migration',     'Should have',  'Low — configurable in CF Migrate settings',         'Under review'],
    ['8', 'Re-migration of failed items with custom rules',  'Must have',    'Medium — rule set to be defined',                   'Under review'],
    ['9', '', '', '', ''],
    ['10', '', '', '', ''],
    ['11', '', '', '', ''],
    ['12', '', '', '', ''],
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:x="urn:schemas-microsoft-com:office:excel">
  <Styles>
    <Style ss:ID="Normal">
      <Alignment ss:Vertical="Center" ss:WrapText="1"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CCCCCC"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CCCCCC"/>
      </Borders>
      <Font ss:FontName="Calibri" ss:Size="10"/>
    </Style>
    <Style ss:ID="Wrap">
      <Alignment ss:Vertical="Top" ss:WrapText="1"/>
      <Font ss:FontName="Calibri" ss:Size="10"/>
    </Style>
    <Style ss:ID="Title">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1" ss:Color="#1A237E"/>
      <Interior ss:Color="#E8EAF6" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Subtitle">
      <Alignment ss:Vertical="Center" ss:WrapText="1"/>
      <Font ss:FontName="Calibri" ss:Size="10" ss:Italic="1" ss:Color="#555555"/>
    </Style>
    <Style ss:ID="MetaLabel">
      <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
      <Interior ss:Color="#F3F3F3" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="MetaValue">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="10"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#3949AB"/>
      </Borders>
    </Style>
    <Style ss:ID="SectionHeader">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#3949AB" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Header">
      <Alignment ss:Vertical="Center" ss:WrapText="1"/>
      <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
      <Interior ss:Color="#E8EAF6" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#3949AB"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CCCCCC"/>
      </Borders>
    </Style>
    <Style ss:ID="HeaderBg">
      <Alignment ss:Vertical="Center" ss:WrapText="1"/>
      <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
      <Interior ss:Color="#E8EAF6" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Bg">
      <Alignment ss:Vertical="Center" ss:WrapText="1"/>
      <Font ss:FontName="Calibri" ss:Size="10"/>
      <Interior ss:Color="#F9F9F9" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="RowShade">
      <Alignment ss:Vertical="Top" ss:WrapText="1"/>
      <Font ss:FontName="Calibri" ss:Size="10"/>
      <Interior ss:Color="#F5F5F5" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CCCCCC"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CCCCCC"/>
      </Borders>
    </Style>
    <Style ss:ID="LegendGreen">
      <Font ss:FontName="Calibri" ss:Size="10"/>
      <Interior ss:Color="#C8E6C9" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="LegendRed">
      <Font ss:FontName="Calibri" ss:Size="10"/>
      <Interior ss:Color="#FFCDD2" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="LegendAmber">
      <Font ss:FontName="Calibri" ss:Size="10"/>
      <Interior ss:Color="#FFE0B2" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="LegendBlue">
      <Font ss:FontName="Calibri" ss:Size="10"/>
      <Interior ss:Color="#BBDEFB" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="LegendGray">
      <Font ss:FontName="Calibri" ss:Size="10"/>
      <Interior ss:Color="#E0E0E0" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Spacer">
      <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="POC Scope Register">
    <Table ss:DefaultColumnWidth="120">
      <Column ss:Width="30"/>
      <Column ss:Width="220"/>
      <Column ss:Width="100"/>
      <Column ss:Width="260"/>
      <Column ss:Width="130"/>

      <!-- Title -->
      <Row ss:Height="28">
        <Cell ss:StyleID="Title" ss:MergeAcross="4"><Data ss:Type="String">CloudFuze  |  POC Scope, Testing &amp; Customisation Register</Data></Cell>
      </Row>
      <Row ss:Height="16">
        <Cell ss:StyleID="Subtitle" ss:MergeAcross="4"><Data ss:Type="String">Complete this sheet for every POC. Fill all sections and upload to the POC project in the PMO system.</Data></Cell>
      </Row>

      <!-- Spacer -->
      <Row ss:Height="8"><Cell ss:StyleID="Spacer" ss:MergeAcross="4"><Data ss:Type="String"></Data></Cell></Row>

      <!-- Meta -->
      <Row ss:Height="18">
        <Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Account Name</Data></Cell>
        <Cell ss:StyleID="MetaValue" ss:MergeAcross="1"><Data ss:Type="String"></Data></Cell>
        <Cell ss:StyleID="MetaLabel"><Data ss:Type="String">POC Reference ID</Data></Cell>
        <Cell ss:StyleID="MetaValue"><Data ss:Type="String">Auto-assigned on upload</Data></Cell>
      </Row>

      <Row ss:Height="8"><Cell ss:StyleID="Spacer" ss:MergeAcross="4"><Data ss:Type="String"></Data></Cell></Row>

      <!-- Section 1 -->
      ${sectionHeader('  1  |  Functionalities Tested During POC')}
      ${colHeader('#', 'Functionality / Feature Tested', 'Test Status', 'Test Result / Observation', 'Tested By')}
      ${section1Rows.map((r, i) => dataRow(r, i % 2 === 1)).join('\n      ')}

      <Row ss:Height="8"><Cell ss:StyleID="Spacer" ss:MergeAcross="4"><Data ss:Type="String"></Data></Cell></Row>

      <!-- Section 2 -->
      ${sectionHeader('  2  |  In Scope — Confirmed Migration Items')}
      ${colHeader('#', 'In-Scope Item', 'Workload', 'Volume / Detail', 'Confirmed By')}
      ${section2Rows.map((r, i) => dataRow(r, i % 2 === 1)).join('\n      ')}

      <Row ss:Height="8"><Cell ss:StyleID="Spacer" ss:MergeAcross="4"><Data ss:Type="String"></Data></Cell></Row>

      <!-- Section 3 -->
      ${sectionHeader('  3  |  Out of Scope — Explicitly Excluded Items')}
      ${colHeader('#', 'Out-of-Scope Item', 'Workload', 'Reason / Agreement', 'Confirmed By')}
      ${section3Rows.map((r, i) => dataRow(r, i % 2 === 1)).join('\n      ')}

      <Row ss:Height="8"><Cell ss:StyleID="Spacer" ss:MergeAcross="4"><Data ss:Type="String"></Data></Cell></Row>

      <!-- Section 4 -->
      ${sectionHeader('  4  |  Client Customisation Requests')}
      ${colHeader('#', 'Customisation Requested', 'Priority', 'Feasibility / Effort', 'Status')}
      ${section4Rows.map((r, i) => dataRow(r, i % 2 === 1)).join('\n      ')}

      <Row ss:Height="8"><Cell ss:StyleID="Spacer" ss:MergeAcross="4"><Data ss:Type="String"></Data></Cell></Row>

      <!-- Legend -->
      ${sectionHeader('  Legend')}
      <Row ss:Height="16">
        <Cell ss:StyleID="LegendGreen" ss:MergeAcross="4"><Data ss:Type="String">  In scope / Passed / Approved</Data></Cell>
      </Row>
      <Row ss:Height="16">
        <Cell ss:StyleID="LegendRed" ss:MergeAcross="4"><Data ss:Type="String">  Out of scope / Failed / Declined</Data></Cell>
      </Row>
      <Row ss:Height="16">
        <Cell ss:StyleID="LegendAmber" ss:MergeAcross="4"><Data ss:Type="String">  Partial / Should have / Under review</Data></Cell>
      </Row>
      <Row ss:Height="16">
        <Cell ss:StyleID="LegendBlue" ss:MergeAcross="4"><Data ss:Type="String">  Customisation / Not tested / Needs scoping</Data></Cell>
      </Row>
      <Row ss:Height="16">
        <Cell ss:StyleID="LegendGray" ss:MergeAcross="4"><Data ss:Type="String">  Not started / Deferred / Low priority</Data></Cell>
      </Row>
    </Table>
  </Worksheet>
</Workbook>`;
}
