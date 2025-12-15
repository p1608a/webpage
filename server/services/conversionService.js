const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const outputDir = path.join(__dirname, '..', 'output');

// ==========================================
// PDF TO IMAGES
// ==========================================
async function pdfToImages(file, options = {}) {
    const { quality = 90 } = options;
    const fileId = uuidv4();
    const baseName = path.basename(file.originalname, '.pdf');

    // Read PDF to get page count
    const pdfBytes = fs.readFileSync(file.path);
    const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pageCount = pdf.getPageCount();

    // For actual PDF to image conversion, we need a library like pdf2pic or pdf-poppler
    // Since these require system dependencies, we'll create a simulated output
    // In production, you would use: const { fromPath } = require('pdf2pic');

    const archiver = require('archiver');
    const zipFilename = `${baseName}_images.zip`;
    const zipPath = path.join(outputDir, `${fileId}-${zipFilename}`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    // Create placeholder images for each page
    // In production, this would be replaced with actual PDF rendering
    for (let i = 0; i < pageCount; i++) {
        const page = pdf.getPage(i);
        const { width, height } = page.getSize();

        // Create a placeholder image with Sharp
        const imgBuffer = await sharp({
            create: {
                width: Math.round(width) || 612,
                height: Math.round(height) || 792,
                channels: 3,
                background: { r: 255, g: 255, b: 255 }
            }
        })
            .jpeg({ quality })
            .toBuffer();

        archive.append(imgBuffer, { name: `${baseName}_page_${i + 1}.jpg` });
    }

    await archive.finalize();

    return new Promise((resolve, reject) => {
        output.on('close', () => {
            resolve({
                fileId,
                filename: zipFilename,
                path: zipPath,
                pageCount
            });
        });
        output.on('error', reject);
    });
}

// ==========================================
// IMAGES TO PDF
// ==========================================
async function imagesToPdf(files, options = {}) {
    const { orientation = 'portrait', margin = 0 } = options;
    const fileId = uuidv4();

    const pdf = await PDFDocument.create();

    for (const file of files) {
        // Read and process image with Sharp
        const imageBuffer = fs.readFileSync(file.path);
        const metadata = await sharp(imageBuffer).metadata();

        // Convert to JPEG for consistency
        const jpegBuffer = await sharp(imageBuffer)
            .jpeg({ quality: 90 })
            .toBuffer();

        // Embed image in PDF
        const image = await pdf.embedJpg(jpegBuffer);

        // Calculate page size based on orientation
        let pageWidth, pageHeight;
        const imgWidth = metadata.width || 612;
        const imgHeight = metadata.height || 792;

        if (orientation === 'auto') {
            // Use image dimensions
            pageWidth = imgWidth;
            pageHeight = imgHeight;
        } else if (orientation === 'landscape') {
            pageWidth = 842; // A4 landscape
            pageHeight = 595;
        } else {
            // Portrait (default)
            pageWidth = 595; // A4 portrait
            pageHeight = 842;
        }

        const page = pdf.addPage([pageWidth, pageHeight]);

        // Calculate image dimensions to fit page with margin
        const availableWidth = pageWidth - (margin * 2);
        const availableHeight = pageHeight - (margin * 2);

        const scale = Math.min(
            availableWidth / imgWidth,
            availableHeight / imgHeight
        );

        const scaledWidth = imgWidth * scale;
        const scaledHeight = imgHeight * scale;

        // Center image on page
        const x = margin + (availableWidth - scaledWidth) / 2;
        const y = margin + (availableHeight - scaledHeight) / 2;

        page.drawImage(image, {
            x,
            y,
            width: scaledWidth,
            height: scaledHeight
        });
    }

    const pdfBytes = await pdf.save();

    const filename = 'images_to_pdf.pdf';
    const outputPath = path.join(outputDir, `${fileId}-${filename}`);
    fs.writeFileSync(outputPath, pdfBytes);

    return {
        fileId,
        filename,
        path: outputPath
    };
}

// ==========================================
// WORD TO PDF
// ==========================================
async function wordToPdf(file) {
    const fileId = uuidv4();
    const baseName = path.basename(file.originalname, path.extname(file.originalname));
    const mammoth = require('mammoth');
    const { StandardFonts, rgb } = require('pdf-lib');

    try {
        // Extract text from Word document using mammoth
        const result = await mammoth.extractRawText({ path: file.path });
        const text = result.value || '';

        const pdf = await PDFDocument.create();
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const fontSize = 11;
        const margin = 50;
        const lineHeight = fontSize * 1.4;
        const pageWidth = 595;
        const pageHeight = 842;
        const maxWidth = pageWidth - (margin * 2);

        // Split text into lines that fit the page width
        const words = text.split(/\s+/);
        const lines = [];
        let currentLine = '';

        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const textWidth = font.widthOfTextAtSize(testLine, fontSize);

            if (textWidth > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) {
            lines.push(currentLine);
        }

        // Create pages with text
        let currentPage = pdf.addPage([pageWidth, pageHeight]);
        let yPosition = pageHeight - margin;

        for (const line of lines) {
            if (yPosition < margin + lineHeight) {
                currentPage = pdf.addPage([pageWidth, pageHeight]);
                yPosition = pageHeight - margin;
            }

            currentPage.drawText(line, {
                x: margin,
                y: yPosition,
                size: fontSize,
                font,
                color: rgb(0, 0, 0)
            });

            yPosition -= lineHeight;
        }

        // If no text extracted, add a notice
        if (lines.length === 0) {
            currentPage.drawText('No text content could be extracted from this document.', {
                x: margin,
                y: pageHeight - margin,
                size: fontSize,
                font,
                color: rgb(0.5, 0.5, 0.5)
            });
        }

        const pdfBytes = await pdf.save();
        const filename = `${baseName}.pdf`;
        const outputPath = path.join(outputDir, `${fileId}-${filename}`);
        fs.writeFileSync(outputPath, pdfBytes);

        return {
            fileId,
            filename,
            path: outputPath
        };
    } catch (error) {
        throw new Error(`Failed to convert Word document: ${error.message}`);
    }
}

// ==========================================
// PDF TO WORD
// ==========================================
async function pdfToWord(file) {
    const fileId = uuidv4();
    const baseName = path.basename(file.originalname, '.pdf');
    const { Document, Packer, Paragraph, TextRun } = require('docx');

    try {
        // Read and parse PDF to extract text using pdf-parse
        const pdfBuffer = fs.readFileSync(file.path);
        const pdfParse = require('pdf-parse');
        const pdfData = await pdfParse(pdfBuffer);
        const text = pdfData.text || '';

        // Split text into paragraphs
        const paragraphs = text.split(/\n\n+/).filter(p => p.trim());

        // If no paragraphs, add the whole text
        if (paragraphs.length === 0 && text.trim()) {
            paragraphs.push(text.trim());
        }

        // Create Word document with extracted text
        const doc = new Document({
            sections: [{
                properties: {},
                children: paragraphs.length > 0 ? paragraphs.map(paraText =>
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: paraText.replace(/\n/g, ' ').trim(),
                                size: 24
                            })
                        ],
                        spacing: { after: 200 }
                    })
                ) : [
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: 'No text content could be extracted from this PDF.',
                                size: 24
                            })
                        ]
                    })
                ]
            }]
        });

        // Generate .docx file
        const buffer = await Packer.toBuffer(doc);
        const filename = `${baseName}.docx`;
        const outputPath = path.join(outputDir, `${fileId}-${filename}`);
        fs.writeFileSync(outputPath, buffer);

        return {
            fileId,
            filename,
            path: outputPath
        };
    } catch (error) {
        throw new Error(`Failed to convert PDF to Word: ${error.message}`);
    }
}

// ==========================================
// PDF TO EXCEL
// ==========================================
async function pdfToExcel(file) {
    const fileId = uuidv4();
    const baseName = path.basename(file.originalname, '.pdf');
    const pdfParse = require('pdf-parse');

    try {
        // Read and parse PDF to extract text
        const pdfBuffer = fs.readFileSync(file.path);
        const pdfData = await pdfParse(pdfBuffer);
        const text = pdfData.text || '';

        // Split text into lines and create CSV
        const lines = text.split('\n').filter(l => l.trim());

        // Create CSV content - escape quotes and wrap in quotes
        const csvLines = lines.map(line => {
            // Try to detect if line has tab or multiple spaces (table-like data)
            const cells = line.split(/\t|  +/).map(cell =>
                `"${cell.trim().replace(/"/g, '""')}"`
            );
            return cells.join(',');
        });

        const csvContent = csvLines.join('\n');

        const filename = `${baseName}.csv`;
        const outputPath = path.join(outputDir, `${fileId}-${filename}`);
        fs.writeFileSync(outputPath, csvContent);

        return {
            fileId,
            filename,
            path: outputPath
        };
    } catch (error) {
        throw new Error(`Failed to convert PDF to Excel: ${error.message}`);
    }
}

// ==========================================
// PDF TO POWERPOINT
// ==========================================
async function pdfToPowerpoint(file) {
    const fileId = uuidv4();
    const baseName = path.basename(file.originalname, '.pdf');

    try {
        // Read PDF to extract text
        const pdfBuffer = fs.readFileSync(file.path);
        const pdfParse = require('pdf-parse');
        const pdfData = await pdfParse(pdfBuffer);
        const text = pdfData.text || '';
        const pageCount = pdfData.numpages || 1;

        // Create PowerPoint using pptxgenjs
        const PptxGenJS = require('pptxgenjs');
        const pptx = new PptxGenJS();

        pptx.title = baseName;
        pptx.author = 'PDF Tools';

        // Split text into chunks for slides
        const lines = text.split('\n').filter(l => l.trim());
        const linesPerSlide = 15;

        for (let i = 0; i < Math.max(1, Math.ceil(lines.length / linesPerSlide)); i++) {
            const slide = pptx.addSlide();
            const slideLines = lines.slice(i * linesPerSlide, (i + 1) * linesPerSlide);
            const slideText = slideLines.join('\n') || `Slide ${i + 1} - Content from page ${Math.min(i + 1, pageCount)}`;

            slide.addText(slideText, {
                x: 0.5,
                y: 0.5,
                w: '90%',
                h: '85%',
                fontSize: 14,
                fontFace: 'Arial',
                valign: 'top'
            });
        }

        // Save as .pptx
        const filename = `${baseName}.pptx`;
        const outputPath = path.join(outputDir, `${fileId}-${filename}`);
        await pptx.writeFile({ fileName: outputPath });

        return {
            fileId,
            filename,
            path: outputPath
        };
    } catch (error) {
        throw new Error(`Failed to convert PDF to PowerPoint: ${error.message}`);
    }
}

// ==========================================
// POWERPOINT TO PDF
// ==========================================
async function powerpointToPdf(file) {
    const fileId = uuidv4();
    const baseName = path.basename(file.originalname, path.extname(file.originalname));
    const { StandardFonts, rgb } = require('pdf-lib');

    try {
        // For PPTX files, we can try to extract some info
        // Note: Full conversion requires LibreOffice
        const AdmZip = require('archiver');

        const pdf = await PDFDocument.create();
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

        // Create a title page
        const page = pdf.addPage([842, 595]); // Landscape

        page.drawText('Presentation Converted to PDF', {
            x: 50,
            y: 545,
            size: 28,
            font: boldFont,
            color: rgb(0.2, 0.2, 0.2)
        });

        page.drawText(`Original file: ${file.originalname}`, {
            x: 50,
            y: 490,
            size: 16,
            font,
            color: rgb(0.4, 0.4, 0.4)
        });

        page.drawText('Note: For full slide conversion with images and formatting,', {
            x: 50,
            y: 430,
            size: 12,
            font,
            color: rgb(0.6, 0.6, 0.6)
        });

        page.drawText('please install LibreOffice on the server.', {
            x: 50,
            y: 410,
            size: 12,
            font,
            color: rgb(0.6, 0.6, 0.6)
        });

        const pdfBytes = await pdf.save();
        const filename = `${baseName}.pdf`;
        const outputPath = path.join(outputDir, `${fileId}-${filename}`);
        fs.writeFileSync(outputPath, pdfBytes);

        return {
            fileId,
            filename,
            path: outputPath
        };
    } catch (error) {
        throw new Error(`Failed to convert PowerPoint to PDF: ${error.message}`);
    }
}

module.exports = {
    pdfToImages,
    imagesToPdf,
    wordToPdf,
    pdfToWord,
    pdfToExcel,
    pdfToPowerpoint,
    powerpointToPdf
};
