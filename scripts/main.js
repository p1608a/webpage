// PDF Tools - Main JavaScript

document.addEventListener('DOMContentLoaded', () => {
    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mainNav = document.getElementById('mainNav');

    if (mobileMenuBtn && mainNav) {
        mobileMenuBtn.addEventListener('click', () => {
            mainNav.classList.toggle('active');
            mobileMenuBtn.textContent = mainNav.classList.contains('active') ? '✕' : '☰';
        });
    }

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#') return;

            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Header scroll effect
    const header = document.querySelector('.header');
    if (header) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                header.style.background = 'rgba(15, 15, 26, 0.95)';
            } else {
                header.style.background = 'rgba(15, 15, 26, 0.8)';
            }
        });
    }
});

// API Configuration
// API Configuration
// Use relative path so it works on both localhost and production
const API_BASE_URL = '/api';

// File Upload Handler Class
class FileUploader {
    constructor(dropZoneId, options = {}) {
        this.dropZone = document.getElementById(dropZoneId);
        this.files = [];
        this.maxFiles = options.maxFiles || 20;
        this.acceptedTypes = options.acceptedTypes || ['application/pdf'];
        this.onFilesChange = options.onFilesChange || (() => { });

        if (this.dropZone) {
            this.init();
        }
    }

    init() {
        const input = this.dropZone.querySelector('input[type="file"]');

        // Drag and drop events
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, this.preventDefaults.bind(this), false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, () => {
                this.dropZone.classList.add('dragover');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, () => {
                this.dropZone.classList.remove('dragover');
            });
        });

        this.dropZone.addEventListener('drop', this.handleDrop.bind(this));

        if (input) {
            input.addEventListener('change', (e) => {
                this.addFiles(e.target.files);
            });
        }
    }

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        this.addFiles(files);
    }

    addFiles(fileList) {
        const newFiles = Array.from(fileList).filter(file => {
            // Check file type
            if (this.acceptedTypes.length > 0 && !this.acceptedTypes.some(type => {
                if (type.includes('*')) {
                    return file.type.startsWith(type.replace('*', ''));
                }
                return file.type === type;
            })) {
                console.warn(`File type ${file.type} not accepted`);
                return false;
            }
            return true;
        });

        // Check max files limit
        const remainingSlots = this.maxFiles - this.files.length;
        const filesToAdd = newFiles.slice(0, remainingSlots);

        this.files = [...this.files, ...filesToAdd];

        // Reset file input so the same file can be selected again
        const input = this.dropZone.querySelector('input[type="file"]');
        if (input) {
            input.value = '';
        }

        this.onFilesChange(this.files);
    }

    removeFile(index) {
        this.files.splice(index, 1);
        this.onFilesChange(this.files);
    }

    clearFiles() {
        this.files = [];
        // Reset the file input so the same file can be selected again
        const input = this.dropZone.querySelector('input[type="file"]');
        if (input) {
            input.value = '';
        }
        this.onFilesChange(this.files);
    }

    getFiles() {
        return this.files;
    }
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Render file list
function renderFileList(files, containerId, uploaderInstance) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (files.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = files.map((file, index) => `
    <div class="file-item">
      <div class="file-icon">📄</div>
      <div class="file-info">
        <div class="file-name">${file.name}</div>
        <div class="file-size">${formatFileSize(file.size)}</div>
      </div>
      <button class="file-remove" onclick="removeFile(${index})" aria-label="Remove file">✕</button>
    </div>
  `).join('');
}

// Global uploader instance (will be set per page)
let currentUploader = null;

function removeFile(index) {
    if (currentUploader) {
        currentUploader.removeFile(index);
    }
}

// Process files with API
async function processFiles(endpoint, files, options = {}) {
    const formData = new FormData();

    files.forEach((file, index) => {
        formData.append('files', file);
    });

    // Add options to form data
    Object.keys(options).forEach(key => {
        formData.append(key, options[key]);
    });

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Processing failed');
        }

        return await response.json();
    } catch (error) {
        console.error('Processing error:', error);
        throw error;
    }
}

// Download file - uses fetch to handle filename properly
async function downloadFile(fileId, filename) {
    try {
        const response = await fetch(`${API_BASE_URL}/download/${fileId}`);
        if (!response.ok) {
            throw new Error('Download failed');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'processed.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Download error:', error);
        alert('Failed to download file. Please try again.');
    }
}

// Show processing overlay
function showProcessing(message = 'Processing your files...') {
    let overlay = document.getElementById('processingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'processingOverlay';
        overlay.className = 'processing-overlay';
        overlay.innerHTML = `
      <div class="processing-content">
        <div class="spinner"></div>
        <h3 id="processingMessage">${message}</h3>
        <p class="text-secondary">Please wait while we process your files</p>
      </div>
    `;
        document.body.appendChild(overlay);
    } else {
        document.getElementById('processingMessage').textContent = message;
    }

    setTimeout(() => overlay.classList.add('active'), 10);
}

// Hide processing overlay - completely removes it from DOM
function hideProcessing() {
    const overlay = document.getElementById('processingOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        // Remove from DOM after animation
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 300);
    }
}

// Show success state
function showSuccess(message, downloadId, filename) {
    const overlay = document.getElementById('processingOverlay');
    if (overlay) {
        overlay.innerHTML = `
      <div class="processing-content">
        <div class="success-icon">✓</div>
        <h3>${message}</h3>
        <p class="text-secondary mb-xl">Your file is ready for download</p>
        <button class="btn btn-primary btn-lg" id="downloadBtn">
          Download File
        </button>
        <button class="btn btn-secondary" style="margin-left: 1rem;" id="processMoreBtn">
          Process More
        </button>
      </div>
    `;

        // Attach event listeners properly
        document.getElementById('downloadBtn').addEventListener('click', async () => {
            await downloadFile(downloadId, filename);
            resetToolState();
            hideProcessing();
        });

        document.getElementById('processMoreBtn').addEventListener('click', () => {
            resetToolState();
            hideProcessing();
        });
    }
}

// Reset tool state after processing (clears files, hides panels)
function resetToolState() {
    // Clear the uploader's files
    if (currentUploader) {
        currentUploader.clearFiles();
    }

    // Clear file list display
    const fileList = document.getElementById('fileList');
    if (fileList) {
        fileList.innerHTML = '';
    }

    // Hide options and action panels
    const optionsPanel = document.getElementById('optionsPanel');
    const actionButtons = document.getElementById('actionButtons');
    if (optionsPanel) optionsPanel.classList.add('hidden');
    if (actionButtons) actionButtons.classList.add('hidden');

    // Reset any file inputs
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.value = '';
    }
}

// Show error state
function showError(message) {
    const overlay = document.getElementById('processingOverlay');
    if (overlay) {
        overlay.innerHTML = `
      <div class="processing-content">
        <div class="success-icon" style="background: linear-gradient(135deg, #ef4444, #f87171);">✕</div>
        <h3>Something went wrong</h3>
        <p class="text-secondary mb-xl">${message}</p>
        <button class="btn btn-secondary" onclick="hideProcessing();">
          Try Again
        </button>
      </div>
    `;
    } else {
        alert(message);
    }
}

// Export for use in tool pages
window.FileUploader = FileUploader;
window.formatFileSize = formatFileSize;
window.renderFileList = renderFileList;
window.processFiles = processFiles;
window.downloadFile = downloadFile;
window.showProcessing = showProcessing;
window.hideProcessing = hideProcessing;
window.showSuccess = showSuccess;
window.showError = showError;
window.resetToolState = resetToolState;
