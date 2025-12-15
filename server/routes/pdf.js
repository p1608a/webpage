const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const pdfService = require('../services/pdfService');
const conversionService = require('../services/conversionService');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'uploads');
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max file size
        files: 20 // Max 20 files
    },
    fileFilter: (req, file, cb) => {
        // Accept PDFs, images, and Office documents
        const allowedTypes = [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${file.mimetype} not supported`), false);
        }
    }
});

// Helper to clean up uploaded files
function cleanupFiles(files) {
    if (!files) return;
    const fileArray = Array.isArray(files) ? files : [files];
    fileArray.forEach(file => {
        if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
    });
}

// ==========================================
// MERGE PDF
// ==========================================
router.post('/merge', upload.array('files', 20), async (req, res) => {
    try {
        if (!req.files || req.files.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Please upload at least 2 PDF files to merge'
            });
        }

        const result = await pdfService.mergePDFs(req.files);

        // Clean up uploaded files
        cleanupFiles(req.files);

        res.json({
            success: true,
            message: 'PDFs merged successfully',
            fileId: result.fileId,
            filename: result.filename
        });
    } catch (error) {
        cleanupFiles(req.files);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==========================================
// SPLIT PDF
// ==========================================
router.post('/split', upload.single('files'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a PDF file to split'
            });
        }

        const { pages, mode } = req.body;
        const result = await pdfService.splitPDF(req.file, { pages, mode });

        // Clean up uploaded file
        cleanupFiles(req.file);

        res.json({
            success: true,
            message: 'PDF split successfully',
            fileId: result.fileId,
            filename: result.filename
        });
    } catch (error) {
        cleanupFiles(req.file);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==========================================
// COMPRESS PDF
// ==========================================
router.post('/compress', upload.single('files'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a PDF file to compress'
            });
        }

        const { quality } = req.body;
        const result = await pdfService.compressPDF(req.file, { quality: quality || 'medium' });

        cleanupFiles(req.file);

        res.json({
            success: true,
            message: 'PDF compressed successfully',
            fileId: result.fileId,
            filename: result.filename,
            originalSize: result.originalSize,
            compressedSize: result.compressedSize,
            reduction: result.reduction
        });
    } catch (error) {
        cleanupFiles(req.file);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==========================================
// ROTATE PDF
// ==========================================
router.post('/rotate', upload.single('files'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a PDF file to rotate'
            });
        }

        const { degrees, pages } = req.body;
        const result = await pdfService.rotatePDF(req.file, {
            degrees: parseInt(degrees) || 90,
            pages: pages || 'all'
        });

        cleanupFiles(req.file);

        res.json({
            success: true,
            message: 'PDF rotated successfully',
            fileId: result.fileId,
            filename: result.filename
        });
    } catch (error) {
        cleanupFiles(req.file);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==========================================
// WATERMARK PDF
// ==========================================
router.post('/watermark', upload.single('files'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a PDF file to watermark'
            });
        }

        const { text, opacity, position, fontSize, color } = req.body;
        const result = await pdfService.addWatermark(req.file, {
            text: text || 'WATERMARK',
            opacity: parseFloat(opacity) || 0.3,
            position: position || 'center',
            fontSize: parseInt(fontSize) || 50,
            color: color || '#888888'
        });

        cleanupFiles(req.file);

        res.json({
            success: true,
            message: 'Watermark added successfully',
            fileId: result.fileId,
            filename: result.filename
        });
    } catch (error) {
        cleanupFiles(req.file);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==========================================
// PROTECT PDF
// ==========================================
router.post('/protect', upload.single('files'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a PDF file to protect'
            });
        }

        const { password } = req.body;
        if (!password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a password'
            });
        }

        const result = await pdfService.protectPDF(req.file, { password });

        cleanupFiles(req.file);

        res.json({
            success: true,
            message: 'PDF protected successfully',
            fileId: result.fileId,
            filename: result.filename
        });
    } catch (error) {
        cleanupFiles(req.file);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==========================================
// UNLOCK PDF
// ==========================================
router.post('/unlock', upload.single('files'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a PDF file to unlock'
            });
        }

        const { password } = req.body;
        const result = await pdfService.unlockPDF(req.file, { password });

        cleanupFiles(req.file);

        res.json({
            success: true,
            message: 'PDF unlocked successfully',
            fileId: result.fileId,
            filename: result.filename
        });
    } catch (error) {
        cleanupFiles(req.file);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==========================================
// PDF TO JPG
// ==========================================
router.post('/pdf-to-jpg', upload.single('files'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a PDF file to convert'
            });
        }

        const { quality } = req.body;
        const result = await conversionService.pdfToImages(req.file, {
            quality: parseInt(quality) || 90
        });

        cleanupFiles(req.file);

        res.json({
            success: true,
            message: 'PDF converted to images successfully',
            fileId: result.fileId,
            filename: result.filename,
            pageCount: result.pageCount
        });
    } catch (error) {
        cleanupFiles(req.file);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==========================================
// JPG TO PDF
// ==========================================
router.post('/jpg-to-pdf', upload.array('files', 20), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please upload at least one image file'
            });
        }

        const { orientation, margin } = req.body;
        const result = await conversionService.imagesToPdf(req.files, {
            orientation: orientation || 'portrait',
            margin: parseInt(margin) || 0
        });

        cleanupFiles(req.files);

        res.json({
            success: true,
            message: 'Images converted to PDF successfully',
            fileId: result.fileId,
            filename: result.filename
        });
    } catch (error) {
        cleanupFiles(req.files);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==========================================
// WORD TO PDF
// ==========================================
router.post('/word-to-pdf', upload.single('files'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a Word document to convert'
            });
        }

        const result = await conversionService.wordToPdf(req.file);

        cleanupFiles(req.file);

        res.json({
            success: true,
            message: 'Word document converted to PDF successfully',
            fileId: result.fileId,
            filename: result.filename
        });
    } catch (error) {
        cleanupFiles(req.file);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==========================================
// PDF TO WORD
// ==========================================
router.post('/pdf-to-word', upload.single('files'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a PDF file to convert'
            });
        }

        const result = await conversionService.pdfToWord(req.file);

        cleanupFiles(req.file);

        res.json({
            success: true,
            message: 'PDF converted to Word successfully',
            fileId: result.fileId,
            filename: result.filename
        });
    } catch (error) {
        cleanupFiles(req.file);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==========================================
// PDF TO EXCEL
// ==========================================
router.post('/pdf-to-excel', upload.single('files'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a PDF file to convert'
            });
        }

        const result = await conversionService.pdfToExcel(req.file);

        cleanupFiles(req.file);

        res.json({
            success: true,
            message: 'PDF converted to Excel successfully',
            fileId: result.fileId,
            filename: result.filename
        });
    } catch (error) {
        cleanupFiles(req.file);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==========================================
// PDF TO POWERPOINT
// ==========================================
router.post('/pdf-to-powerpoint', upload.single('files'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a PDF file to convert'
            });
        }

        const result = await conversionService.pdfToPowerpoint(req.file);

        cleanupFiles(req.file);

        res.json({
            success: true,
            message: 'PDF converted to PowerPoint successfully',
            fileId: result.fileId,
            filename: result.filename
        });
    } catch (error) {
        cleanupFiles(req.file);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==========================================
// POWERPOINT TO PDF
// ==========================================
router.post('/powerpoint-to-pdf', upload.single('files'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a PowerPoint file to convert'
            });
        }

        const result = await conversionService.powerpointToPdf(req.file);

        cleanupFiles(req.file);

        res.json({
            success: true,
            message: 'PowerPoint converted to PDF successfully',
            fileId: result.fileId,
            filename: result.filename
        });
    } catch (error) {
        cleanupFiles(req.file);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==========================================
// DOWNLOAD FILE
// ==========================================
router.get('/download/:fileId', (req, res) => {
    const { fileId } = req.params;
    const outputDir = path.join(__dirname, '..', 'output');

    // Find file with matching ID
    let files;
    try {
        files = fs.readdirSync(outputDir);
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: 'Output directory not accessible'
        });
    }

    const matchingFile = files.find(f => f.startsWith(fileId));

    if (!matchingFile) {
        return res.status(404).json({
            success: false,
            message: 'File not found or expired'
        });
    }

    const filePath = path.join(outputDir, matchingFile);

    // Get original filename from the stored file (format: uuid-filename.ext)
    const originalName = matchingFile.substring(fileId.length + 1) || 'download.pdf';

    // Set proper headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    res.download(filePath, originalName, (err) => {
        if (err) {
            console.error('Download error:', err);
        }
    });
});

module.exports = router;

