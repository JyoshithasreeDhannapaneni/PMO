import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType } from 'docx';
import { saveAs } from 'file-saver';

interface TemplateSection {
  id: string;
  title: string;
  description: string;
}

interface CaseStudyData {
  title: string;
  projectName: string;
  customerName: string;
  projectManager: string;
  accountManager?: string;
  sourcePlatform?: string;
  targetPlatform?: string;
  plannedStart?: string;
  plannedEnd?: string;
  actualStart?: string;
  actualEnd?: string;
  sections: TemplateSection[];
  sectionContent: { [sectionId: string]: string };
}

// Color scheme matching the template
const colors = {
  darkBlue: [0, 51, 102] as [number, number, number],      // #003366 - Main header
  mediumBlue: [0, 102, 153] as [number, number, number],   // #006699 - Section headers
  lightBlue: [204, 229, 255] as [number, number, number],  // #CCE5FF - Light backgrounds
  navyBlue: [0, 32, 96] as [number, number, number],       // #002060 - Dark text
  white: [255, 255, 255] as [number, number, number],
  lightGray: [242, 242, 242] as [number, number, number],  // #F2F2F2 - Alternating rows
  black: [0, 0, 0] as [number, number, number],
  green: [0, 176, 80] as [number, number, number],         // #00B050 - Success/Good
  red: [255, 0, 0] as [number, number, number],            // #FF0000 - Issues
  yellow: [255, 192, 0] as [number, number, number],       // #FFC000 - Warning
};

export const exportToPDF = (data: CaseStudyData) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  let yPosition = 0;

  const addNewPageIfNeeded = (requiredSpace: number) => {
    if (yPosition + requiredSpace > pageHeight - 20) {
      doc.addPage();
      yPosition = 15;
      return true;
    }
    return false;
  };

  // Helper to draw a colored rectangle
  const drawRect = (x: number, y: number, w: number, h: number, color: [number, number, number], fill: boolean = true) => {
    doc.setFillColor(color[0], color[1], color[2]);
    doc.setDrawColor(color[0], color[1], color[2]);
    if (fill) {
      doc.rect(x, y, w, h, 'F');
    } else {
      doc.rect(x, y, w, h, 'S');
    }
  };

  // ===== MAIN HEADER =====
  // Dark blue header bar
  drawRect(0, 0, pageWidth, 25, colors.darkBlue);
  
  // Title text
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('CLOSED PROJECT — MIGRATION CASE STUDY', pageWidth / 2, 10, { align: 'center' });
  
  // Subtitle
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Prepared By: Project Delivery Team  |  Review Date: ${new Date().toLocaleDateString()}`, pageWidth / 2, 18, { align: 'center' });
  
  yPosition = 30;

  // ===== SECTION 1: PROJECT IDENTIFICATION =====
  const drawSectionHeader = (title: string, bgColor: [number, number, number] = colors.mediumBlue) => {
    addNewPageIfNeeded(20);
    drawRect(margin, yPosition, contentWidth, 8, bgColor);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin + 3, yPosition + 5.5);
    yPosition += 10;
  };

  const drawLabelValue = (label: string, value: string, x: number, y: number, labelWidth: number = 40) => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value || 'N/A', x + labelWidth, y);
  };

  const drawTableRow = (cells: string[], y: number, isHeader: boolean = false, cellWidths: number[] = []) => {
    const defaultWidth = contentWidth / cells.length;
    let x = margin;
    
    cells.forEach((cell, index) => {
      const width = cellWidths[index] || defaultWidth;
      
      if (isHeader) {
        drawRect(x, y - 4, width, 7, colors.mediumBlue);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
      } else {
        drawRect(x, y - 4, width, 7, index % 2 === 0 ? colors.lightGray : colors.white);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
      }
      
      doc.setFontSize(8);
      const truncatedText = cell.length > 25 ? cell.substring(0, 22) + '...' : cell;
      doc.text(truncatedText, x + 2, y);
      x += width;
    });
  };

  // Section 1: Project Identification
  drawSectionHeader('1. PROJECT IDENTIFICATION');
  
  // Project details in two columns
  const col1X = margin + 5;
  const col2X = margin + contentWidth / 2;
  
  drawLabelValue('Project Name:', data.projectName || '', col1X, yPosition, 35);
  drawLabelValue('Start Date:', data.plannedStart || '', col2X, yPosition, 30);
  yPosition += 6;
  
  drawLabelValue('Customer Name:', data.customerName || '', col1X, yPosition, 35);
  drawLabelValue('End Date:', data.plannedEnd || '', col2X, yPosition, 30);
  yPosition += 6;
  
  drawLabelValue('Project Manager:', data.projectManager || '', col1X, yPosition, 35);
  drawLabelValue('Project Status:', 'Closed', col2X, yPosition, 30);
  yPosition += 6;
  
  drawLabelValue('Account Manager:', data.accountManager || '', col1X, yPosition, 35);
  drawLabelValue('Migration Type:', 'Content/Email', col2X, yPosition, 30);
  yPosition += 10;

  // Process each section with content
  data.sections.forEach((section, index) => {
    const content = data.sectionContent[section.id];
    if (content && content.trim()) {
      // Determine section color based on section number
      let sectionColor = colors.mediumBlue;
      if (section.title.includes('Risks') || section.title.includes('Issues')) {
        sectionColor = [192, 0, 0]; // Dark red for risk sections
      } else if (section.title.includes('Success') || section.title.includes('Validation')) {
        sectionColor = [0, 112, 192]; // Lighter blue
      } else if (section.title.includes('Sign-off') || section.title.includes('Final')) {
        sectionColor = [0, 176, 80]; // Green for completion
      }
      
      drawSectionHeader(section.title.toUpperCase(), sectionColor as [number, number, number]);
      
      // Parse content and render
      const lines = content.split('\n');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      
      lines.forEach((line) => {
        if (line.trim()) {
          addNewPageIfNeeded(8);
          
          // Check if it's a table row (contains |)
          if (line.includes('|') && !line.startsWith('|--')) {
            const cells = line.split('|').filter(c => c.trim());
            if (cells.length > 1) {
              const isHeader = line.includes('Metric') || line.includes('Risk ID') || line.includes('Issue ID');
              drawTableRow(cells.map(c => c.trim()), yPosition, isHeader);
              yPosition += 7;
              return;
            }
          }
          
          // Check if it's a label:value pair
          if (line.includes(':') && !line.startsWith('-') && !line.startsWith('•')) {
            const [label, ...valueParts] = line.split(':');
            const value = valueParts.join(':').trim();
            if (label.length < 40) {
              doc.setFont('helvetica', 'bold');
              doc.text(label + ':', margin + 5, yPosition);
              doc.setFont('helvetica', 'normal');
              const labelWidth = doc.getTextWidth(label + ': ');
              doc.text(value, margin + 5 + labelWidth, yPosition);
              yPosition += 5;
              return;
            }
          }
          
          // Check if it's a bullet point
          if (line.startsWith('-') || line.startsWith('•') || line.startsWith('  -')) {
            doc.setFont('helvetica', 'normal');
            const bulletText = line.replace(/^[\s-•]+/, '').trim();
            doc.text('• ' + bulletText, margin + 8, yPosition);
            yPosition += 5;
            return;
          }
          
          // Check if it's a checkbox
          if (line.includes('[ ]') || line.includes('[x]') || line.includes('[X]')) {
            const isChecked = line.includes('[x]') || line.includes('[X]');
            const text = line.replace(/\[[ xX]\]/, '').trim();
            doc.setFont('helvetica', 'normal');
            doc.text((isChecked ? '☑ ' : '☐ ') + text, margin + 8, yPosition);
            yPosition += 5;
            return;
          }
          
          // Regular text
          doc.setFont('helvetica', 'normal');
          const wrappedLines = doc.splitTextToSize(line, contentWidth - 10);
          wrappedLines.forEach((wLine: string) => {
            addNewPageIfNeeded(6);
            doc.text(wLine, margin + 5, yPosition);
            yPosition += 5;
          });
        }
      });
      
      yPosition += 5;
    }
  });

  // ===== FOOTER =====
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Footer line
    doc.setDrawColor(0, 51, 102);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
    
    // Footer text
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('CloudFuze Migration Case Study', margin, pageHeight - 10);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }

  const fileName = `Migration_Case_Study_${data.customerName || 'Project'}`.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`${fileName}.pdf`);
};

export const exportToWord = async (data: CaseStudyData) => {
  const children: (Paragraph | Table)[] = [];

  // Color hex codes (without #)
  const wordColors = {
    darkBlue: '003366',
    mediumBlue: '006699',
    lightBlue: 'CCE5FF',
    navyBlue: '002060',
    white: 'FFFFFF',
    lightGray: 'F2F2F2',
    green: '00B050',
    red: 'C00000',
  };

  // ===== MAIN HEADER =====
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'CLOSED PROJECT — MIGRATION CASE STUDY',
          bold: true,
          size: 32,
          color: wordColors.white,
        }),
      ],
      alignment: AlignmentType.CENTER,
      shading: {
        type: ShadingType.SOLID,
        color: wordColors.darkBlue,
        fill: wordColors.darkBlue,
      },
      spacing: { after: 0 },
    })
  );

  // Subtitle
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Prepared By: Project Delivery Team  |  Review Date: ${new Date().toLocaleDateString()}`,
          size: 20,
          color: wordColors.white,
        }),
      ],
      alignment: AlignmentType.CENTER,
      shading: {
        type: ShadingType.SOLID,
        color: wordColors.darkBlue,
        fill: wordColors.darkBlue,
      },
      spacing: { after: 300 },
    })
  );

  // Helper function to create section header
  const createSectionHeader = (title: string, color: string = wordColors.mediumBlue) => {
    return new Paragraph({
      children: [
        new TextRun({
          text: title.toUpperCase(),
          bold: true,
          size: 22,
          color: wordColors.white,
        }),
      ],
      shading: {
        type: ShadingType.SOLID,
        color: color,
        fill: color,
      },
      spacing: { before: 300, after: 100 },
    });
  };

  // Helper function to create label-value row
  const createLabelValue = (label: string, value: string) => {
    return new Paragraph({
      children: [
        new TextRun({ text: `${label}: `, bold: true, size: 20 }),
        new TextRun({ text: value || 'N/A', size: 20 }),
      ],
      spacing: { after: 50 },
    });
  };

  // ===== SECTION 1: PROJECT IDENTIFICATION =====
  children.push(createSectionHeader('1. PROJECT IDENTIFICATION'));
  
  // Create a table for project details
  const projectDetailsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'Project Name:', bold: true, size: 20 })] })],
            width: { size: 25, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.SOLID, color: wordColors.lightBlue, fill: wordColors.lightBlue },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: data.projectName || '', size: 20 })] })],
            width: { size: 25, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'Start Date:', bold: true, size: 20 })] })],
            width: { size: 25, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.SOLID, color: wordColors.lightBlue, fill: wordColors.lightBlue },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: data.plannedStart || '', size: 20 })] })],
            width: { size: 25, type: WidthType.PERCENTAGE },
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'Customer Name:', bold: true, size: 20 })] })],
            shading: { type: ShadingType.SOLID, color: wordColors.lightBlue, fill: wordColors.lightBlue },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: data.customerName || '', size: 20 })] })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'End Date:', bold: true, size: 20 })] })],
            shading: { type: ShadingType.SOLID, color: wordColors.lightBlue, fill: wordColors.lightBlue },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: data.plannedEnd || '', size: 20 })] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'Project Manager:', bold: true, size: 20 })] })],
            shading: { type: ShadingType.SOLID, color: wordColors.lightBlue, fill: wordColors.lightBlue },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: data.projectManager || '', size: 20 })] })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'Project Status:', bold: true, size: 20 })] })],
            shading: { type: ShadingType.SOLID, color: wordColors.lightBlue, fill: wordColors.lightBlue },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'Closed', size: 20, color: wordColors.green, bold: true })] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'Account Manager:', bold: true, size: 20 })] })],
            shading: { type: ShadingType.SOLID, color: wordColors.lightBlue, fill: wordColors.lightBlue },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: data.accountManager || '', size: 20 })] })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'Migration Type:', bold: true, size: 20 })] })],
            shading: { type: ShadingType.SOLID, color: wordColors.lightBlue, fill: wordColors.lightBlue },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'Content/Email Migration', size: 20 })] })],
          }),
        ],
      }),
    ],
  });
  children.push(projectDetailsTable);

  // Process each section with content
  data.sections.forEach((section) => {
    const content = data.sectionContent[section.id];
    if (content && content.trim()) {
      // Determine section color
      let sectionColor = wordColors.mediumBlue;
      if (section.title.includes('Risks') || section.title.includes('Issues')) {
        sectionColor = wordColors.red;
      } else if (section.title.includes('Sign-off') || section.title.includes('Final')) {
        sectionColor = wordColors.green;
      }

      children.push(createSectionHeader(section.title, sectionColor));

      // Parse content and render
      const lines = content.split('\n');
      
      lines.forEach((line) => {
        if (line.trim()) {
          // Check if it's a label:value pair
          if (line.includes(':') && !line.startsWith('-') && !line.startsWith('•')) {
            const colonIndex = line.indexOf(':');
            const label = line.substring(0, colonIndex);
            const value = line.substring(colonIndex + 1).trim();
            
            if (label.length < 50) {
              children.push(
                new Paragraph({
                  children: [
                    new TextRun({ text: `${label}: `, bold: true, size: 20 }),
                    new TextRun({ text: value, size: 20 }),
                  ],
                  spacing: { after: 50 },
                })
              );
              return;
            }
          }

          // Check if it's a bullet point
          if (line.startsWith('-') || line.startsWith('•') || line.trimStart().startsWith('-')) {
            const bulletText = line.replace(/^[\s\-•]+/, '').trim();
            children.push(
              new Paragraph({
                children: [new TextRun({ text: bulletText, size: 20 })],
                bullet: { level: 0 },
                spacing: { after: 50 },
              })
            );
            return;
          }

          // Check if it's a checkbox
          if (line.includes('[ ]') || line.includes('[x]') || line.includes('[X]')) {
            const isChecked = line.includes('[x]') || line.includes('[X]');
            const text = line.replace(/\[[ xX]\]/, '').trim();
            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: isChecked ? '☑ ' : '☐ ', size: 20 }),
                  new TextRun({ text: text, size: 20 }),
                ],
                spacing: { after: 50 },
              })
            );
            return;
          }

          // Regular text
          children.push(
            new Paragraph({
              children: [new TextRun({ text: line, size: 20 })],
              spacing: { after: 50 },
            })
          );
        }
      });
    }
  });

  // ===== FOOTER =====
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: '─'.repeat(80),
          size: 16,
          color: wordColors.darkBlue,
        }),
      ],
      spacing: { before: 400 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `CloudFuze Migration Case Study  |  Generated: ${new Date().toLocaleDateString()}`,
          size: 18,
          color: '666666',
          italics: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 100 },
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = `Migration_Case_Study_${data.customerName || 'Project'}`.replace(/[^a-zA-Z0-9]/g, '_');
  saveAs(blob, `${fileName}.docx`);
};
