const { PDFDocument, degrees, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const outputDir = path.join(__dirname, '..', 'output');

// Helper to save output file
function saveOutput(pdfBytes, originalName, suffix = '') {
    const fileId = uuidv4();
    const baseName = path.basename(originalName, path.extname(originalName));
    const filename = `${baseName}${suffix}.pdf`;
    const outputPath = path.join(outputDir, `${fileId}-${filename}`);

    fs.writeFileSync(outputPath, pdfBytes);

    return {
        fileId,
        filename,
        path: outputPath
    };
}

// ==========================================
// MERGE PDFs
// ==========================================
async function mergePDFs(files) {
    const mergedPdf = await PDFDocument.create();

    for (const file of files) {
        const pdfBytes = fs.readFileSync(file.path);
        const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        pages.forEach(page => mergedPdf.addPage(page));
    }

    const mergedBytes = await mergedPdf.save();
    return saveOutput(mergedBytes, 'merged', '_merged');
}

// ==========================================
// SPLIT PDF
// ==========================================
async function splitPDF(file, options = {}) {
    const pdfBytes = fs.readFileSync(file.path);
    const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const totalPages = pdf.getPageCount();

    const { pages, mode } = options;
    const fileId = uuidv4();
    const baseName = path.basename(file.originalname, '.pdf');

    // If mode is 'all', extract each page as separate PDF
    if (mode === 'all') {
        const archiver = require('archiver');
        const zipFilename = `${baseName}_split.zip`;
        const zipPath = path.join(outputDir, `${fileId}-${zipFilename}`);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        archive.pipe(output);

        for (let i = 0; i < totalPages; i++) {
            const newPdf = await PDFDocument.create();
            const [copiedPage] = await newPdf.copyPages(pdf, [i]);
            newPdf.addPage(copiedPage);
            const pageBytes = await newPdf.save();
            archive.append(Buffer.from(pageBytes), { name: `${baseName}_page_${i + 1}.pdf` });
        }

        await archive.finalize();

        return new Promise((resolve, reject) => {
            output.on('close', () => {
                resolve({
                    fileId,
                    filename: zipFilename,
                    path: zipPath
                });
            });
            output.on('error', reject);
        });
    }

    // Extract specific pages
    let pageIndices = [];
    if (pages) {
        // Parse page ranges like "1,3,5-7"
        const parts = pages.split(',');
        for (const part of parts) {
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(n => parseInt(n.trim()) - 1);
                for (let i = start; i <= end && i < totalPages; i++) {
                    if (i >= 0) pageIndices.push(i);
                }
            } else {
                const pageNum = parseInt(part.trim()) - 1;
                if (pageNum >= 0 && pageNum < totalPages) {
                    pageIndices.push(pageNum);
                }
            }
        }
    } else {
        // Default: first page only
        pageIndices = [0];
    }

    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(pdf, pageIndices);
    copiedPages.forEach(page => newPdf.addPage(page));

    const splitBytes = await newPdf.save();
    return saveOutput(splitBytes, file.originalname, '_split');
}

// ==========================================
// COMPRESS PDF
// ==========================================
// ==========================================
// COMPRESS PDF
// ==========================================
async function compressPDF(file, options = {}) {
    const pdfBytes = fs.readFileSync(file.path);
    const originalSize = pdfBytes.length;
    const fileId = uuidv4();
    const baseName = path.basename(file.originalname, '.pdf');
    const filename = `${baseName}_compressed.pdf`;
    const outputPath = path.join(outputDir, `${fileId}-${filename}`);

    try {
        // Try using muhammara for better compression (repacking)
        const muhammara = require('muhammara');

        // Create a new PDF and copy pages (repacking often reduces size)
        const pdfWriter = muhammara.createWriter(outputPath, {
            version: muhammara.ePDFVersion17
        });

        const copyingContext = pdfWriter.createPDFCopyingContext(file.path);
        const pageCount = copyingContext.getSourceDocumentParser().getPagesCount();

        for (let i = 0; i < pageCount; i++) {
            copyingContext.appendPDFPageFromPDF(i);
        }

        pdfWriter.end();

        const compressedBytes = fs.readFileSync(outputPath);
        const compressedSize = compressedBytes.length;
        const reduction = Math.round((1 - compressedSize / originalSize) * 100);

        return {
            fileId,
            filename,
            path: outputPath,
            originalSize,
            compressedSize,
            reduction: `${reduction}%`
        };
    } catch (error) {
        // Fallback to pdf-lib if muhammara fails
        console.error('Muhammara compression failed, falling back to pdf-lib:', error);

        const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

        // Remove metadata
        pdf.setTitle('');
        pdf.setAuthor('');
        pdf.setSubject('');
        pdf.setKeywords([]);
        pdf.setProducer('PDF Tools');
        pdf.setCreator('PDF Tools');

        const compressedBytes = await pdf.save({
            useObjectStreams: true,
            addDefaultPage: false
        });

        const compressedSize = compressedBytes.length;
        const reduction = Math.round((1 - compressedSize / originalSize) * 100);

        return saveOutput(compressedBytes, file.originalname, '_compressed');
    }
}

// ==========================================
// ROTATE PDF
// ==========================================
async function rotatePDF(file, options = {}) {
    const pdfBytes = fs.readFileSync(file.path);
    const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    const rotationDegrees = options.degrees || 90;
    const pages = pdf.getPages();

    // Rotate all pages or specific ones
    if (options.pages === 'all' || !options.pages) {
        pages.forEach(page => {
            const currentRotation = page.getRotation().angle;
            page.setRotation(degrees(currentRotation + rotationDegrees));
        });
    } else {
        // Parse specific pages
        const pageIndices = options.pages.split(',').map(n => parseInt(n.trim()) - 1);
        pageIndices.forEach(index => {
            if (index >= 0 && index < pages.length) {
                const page = pages[index];
                const currentRotation = page.getRotation().angle;
                page.setRotation(degrees(currentRotation + rotationDegrees));
            }
        });
    }

    const rotatedBytes = await pdf.save();
    return saveOutput(rotatedBytes, file.originalname, '_rotated');
}

// ==========================================
// ADD WATERMARK
// ==========================================
async function addWatermark(file, options = {}) {
    const pdfBytes = fs.readFileSync(file.path);
    const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    const {
        text = 'WATERMARK',
        opacity = 0.3,
        fontSize = 50,
        color = '#888888'
    } = options;

    // Parse hex color to RGB
    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255
        } : { r: 0.5, g: 0.5, b: 0.5 };
    };

    const rgbColor = hexToRgb(color);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const pages = pdf.getPages();

    pages.forEach(page => {
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, fontSize);

        // Calculate position
        let x, y;
        switch (options.position) {
            case 'top-left':
                x = 50;
                y = height - 50 - fontSize;
                break;
            case 'top-right':
                x = width - textWidth - 50;
                y = height - 50 - fontSize;
                break;
            case 'bottom-left':
                x = 50;
                y = 50;
                break;
            case 'bottom-right':
                x = width - textWidth - 50;
                y = 50;
                break;
            case 'center':
            default:
                x = (width - textWidth) / 2;
                y = (height - fontSize) / 2;
                break;
        }

        page.drawText(text, {
            x,
            y,
            size: fontSize,
            font,
            color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
            opacity
        });
    });

    const watermarkedBytes = await pdf.save();
    return saveOutput(watermarkedBytes, file.originalname, '_watermarked');
}

// ==========================================
// PROTECT PDF (Add Password)
// ==========================================
// ==========================================
// PROTECT PDF (Add Password)
// ==========================================
async function protectPDF(file, options = {}) {
    const { password } = options;

    if (!password) {
        throw new Error('Password is required to protect PDF');
    }

    try {
        const pdfBytes = fs.readFileSync(file.path);
        const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

        // Use pdf-lib's built-in encryption
        const protectedBytes = await pdf.save({
            userPassword: password,
            ownerPassword: password,
            permissions: {
                printing: 'highResolution',
                modifying: false,
                copying: false,
                annotating: false,
                fillingForms: false,
                contentAccessibility: false,
                documentAssembly: false
            }
        });

        return saveOutput(protectedBytes, file.originalname, '_protected');
    } catch (error) {
        throw new Error(`Failed to protect PDF: ${error.message}`);
    }
}

// ==========================================
// UNLOCK PDF (Remove Password)
// ==========================================
async function unlockPDF(file, options = {}) {
    const pdfBytes = fs.readFileSync(file.path);

    // Try to load with password if provided
    const loadOptions = {};

    if (options.password) {
        loadOptions.password = options.password;
    } else {
        loadOptions.ignoreEncryption = true;
    }

    const pdf = await PDFDocument.load(pdfBytes, loadOptions);

    // Re-save without encryption
    const unlockedBytes = await pdf.save();
    return saveOutput(unlockedBytes, file.originalname, '_unlocked');
}

module.exports = {
    mergePDFs,
    splitPDF,
    compressPDF,
    rotatePDF,
    addWatermark,
    protectPDF,
    unlockPDF
};
