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
async function compressPDF(file, options = {}) {
    const pdfBytes = fs.readFileSync(file.path);
    const originalSize = pdfBytes.length;

    // Load and re-save with compression options
    const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    // Remove metadata to reduce size
    pdf.setTitle('');
    pdf.setAuthor('');
    pdf.setSubject('');
    pdf.setKeywords([]);
    pdf.setProducer('PDF Tools');
    pdf.setCreator('PDF Tools');

    // Save with object streams enabled for better compression
    const compressedBytes = await pdf.save({
        useObjectStreams: true,
        addDefaultPage: false
    });

    const compressedSize = compressedBytes.length;
    const reduction = Math.round((1 - compressedSize / originalSize) * 100);

    const result = saveOutput(compressedBytes, file.originalname, '_compressed');

    return {
        ...result,
        originalSize,
        compressedSize,
        reduction: `${reduction}%`
    };
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
async function protectPDF(file, options = {}) {
    const { password } = options;

    if (!password) {
        throw new Error('Password is required to protect PDF');
    }

    const fileId = uuidv4();
    const baseName = path.basename(file.originalname, '.pdf');
    const filename = `${baseName}_protected.pdf`;
    const outputPath = path.join(outputDir, `${fileId}-${filename}`);

    try {
        const muhammara = require('muhammara');

        // Create protected PDF with password
        const writer = muhammara.createWriterToModify(
            file.path,
            {
                modifiedFilePath: outputPath,
                userPassword: password,
                ownerPassword: password,
                userProtectionFlag: 4 // Allow printing only
            }
        );

        writer.end();

        return {
            fileId,
            filename,
            path: outputPath
        };
    } catch (error) {
        // Fallback: If muhammara fails, inform the user
        throw new Error(`Failed to protect PDF: ${error.message}. Make sure the PDF is not corrupted.`);
    }
}

// ==========================================
// UNLOCK PDF (Remove Password)
// ==========================================
async function unlockPDF(file, options = {}) {
    const pdfBytes = fs.readFileSync(file.path);

    // Try to load with password if provided
    const loadOptions = {
        ignoreEncryption: true
    };

    if (options.password) {
        loadOptions.password = options.password;
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
