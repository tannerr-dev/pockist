import { ShareService } from '../services/ShareService.js';
import { DialogService } from '../services/DialogService.js';
import { ImportExportService } from '../services/ImportExportService.js';

/**
 * ShareButton - Web component for sharing notes and lists
 * 
 * Usage:
 * <share-button type="note" data-id="note-id" title="Note Title"></share-button>
 * <share-button type="list" data-id="list-id" title="List Name"></share-button>
 */
export class ShareButton extends HTMLElement {
    constructor() {
        super();
        // Attributes are not available in constructor, read them in connectedCallback
    }

    connectedCallback() {
        // Read attributes here after element is connected to DOM
        this.type = this.getAttribute('type') || 'note';
        this.itemId = this.getAttribute('data-id');
        this.itemTitle = this.getAttribute('title') || 'Untitled';
        
        this.render();
        this.setupEventListeners();
    }

    render() {
        this.innerHTML = `
            <button class="btn btn-icon share-btn" title="Share this ${this.type}">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                    <polyline points="16 6 12 2 8 6"/>
                    <line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
            </button>
        `;
    }

    setupEventListeners() {
        const btn = this.querySelector('.share-btn');
        btn.addEventListener('click', () => this.handleShare());
    }

    async handleShare() {
        // Re-read attributes in case they were set dynamically after connection
        this.type = this.getAttribute('type') || 'note';
        this.itemId = this.getAttribute('data-id');
        this.itemTitle = this.getAttribute('title') || 'Untitled';

        try {
            // Get the data to share based on type
            const { DBManager } = await import('../services/DBManager.js');
            let shareData;

            if (this.type === 'note') {
                const item = await DBManager.getItem(this.itemId);
                if (!item) {
                    throw new Error('Note not found');
                }
                shareData = {
                    items: [item]
                };
            } else if (this.type === 'list') {
                const item = await DBManager.getItem(this.itemId);
                if (!item) {
                    throw new Error('List not found');
                }
                const linked = await DBManager.getListItems(this.itemId);
                shareData = {
                    items: [item, ...linked]
                };
            } else {
                throw new Error('Invalid share type');
            }

            // Show creating dialog
            this.showShareDialog(shareData);

        } catch (error) {
            console.error('[ShareButton] Error:', error);
            alert(`Failed to share: ${error.message}`);
        }
    }

    async showShareDialog(shareData) {
        const item = shareData.items[0];
        const typeLabel = this.type === 'note' ? 'Note' : 'List';

        // Create options dialog
        const dialog = document.createElement('dialog');
        dialog.className = 'dialog';
        dialog.innerHTML = `
            <div class="dialog-content">
                <h3>Share ${typeLabel}</h3>
                <p class="share-title">"${this.itemTitle}"</p>
                <div class="share-options">
                    <button class="share-option-btn share-option-link" type="button">
                        <span class="share-option-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span>
                        <span class="share-option-label">Temporary Public Link</span>
                        <span class="share-option-desc">Create a shareable link that expires in 24 hours</span>
                    </button>
                    <button class="share-option-btn share-option-json" type="button">
                        <span class="share-option-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg></span>
                        <span class="share-option-label">Download Pockist Format</span>
                        <span class="share-option-desc">Export as JSON for backup or re-import</span>
                    </button>
                    <button class="share-option-btn share-option-md" type="button">
                        <span class="share-option-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg></span>
                        <span class="share-option-label">Download Markdown</span>
                        <span class="share-option-desc">Export as a Markdown file</span>
                    </button>
                </div>
                <div class="share-actions">
                    <button class="btn btn-ghost" type="button">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);
        dialog.showModal();

        const linkBtn = dialog.querySelector('.share-option-link');
        const jsonBtn = dialog.querySelector('.share-option-json');
        const mdBtn = dialog.querySelector('.share-option-md');
        const cancelBtn = dialog.querySelector('.btn.btn-ghost');

        const cleanup = () => {
            dialog.close();
            document.body.removeChild(dialog);
        };

        linkBtn.addEventListener('click', async () => {
            linkBtn.disabled = true;
            linkBtn.classList.add('loading');

            try {
                const result = await ShareService.createShare(
                    this.type,
                    shareData,
                    this.itemTitle
                );

                // Replace dialog content with result
                dialog.innerHTML = `
                    <div class="dialog-content">
                        <h3>${typeLabel} Shared!</h3>
                        <p class="share-title">"${this.itemTitle}"</p>
                        <div class="share-result-url">${window.location.origin}${result.url}</div>
                        <div class="share-result-meta">Link expires in ${result.expiresIn}</div>
                        <div class="dialog-footer dialog-footer--vertical">
                            <button class="btn btn-outline-secondary share-copy-btn" type="button">Copy Link</button>
                            <button class="btn btn-outline-danger share-delete-btn" type="button"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg> Delete</button>
                            <button class="btn btn-ghost share-close-btn" type="button">Close</button>
                        </div>
                    </div>
                `;

                const copyBtn = dialog.querySelector('.share-copy-btn');
                const urlSpan = dialog.querySelector('.share-result-url');
                copyBtn.addEventListener('click', () => {
                    const url = urlSpan.textContent;
                    navigator.clipboard.writeText(url).then(() => {
                        copyBtn.textContent = 'Copied!';
                        setTimeout(() => copyBtn.textContent = 'Copy Link', 2000);
                    }).catch((err) => {
                        console.error('Failed to copy:', err);
                    });
                });

                const deleteBtn = dialog.querySelector('.share-delete-btn');
                deleteBtn.addEventListener('click', async () => {
                    const confirmed = await DialogService.confirm(
                        'Are you sure you want to delete this share? This cannot be undone.',
                        'Remove Share'
                    );
                    if (!confirmed) return;

                    try {
                        await ShareService.deleteShare(result.shareId);
                        cleanup();
                    } catch (error) {
                        console.error('[ShareButton] Delete share failed:', error);
                        alert(`Failed to delete share: ${error.message}`);
                    }
                });

                const closeBtn = dialog.querySelector('.share-close-btn');
                closeBtn.addEventListener('click', cleanup);

            } catch (error) {
                console.error('[ShareButton] Create share failed:', error);
                alert(`Failed to create share: ${error.message}`);
                linkBtn.disabled = false;
                linkBtn.classList.remove('loading');
            }
        });

        jsonBtn.addEventListener('click', async () => {
            cleanup();
            try {
                await ImportExportService.exportItem(item);
            } catch (error) {
                console.error('[ShareButton] Export failed:', error);
                alert(`Failed to export: ${error.message}`);
            }
        });

        mdBtn.addEventListener('click', async () => {
            cleanup();
            try {
                await ImportExportService.exportMarkdown(item);
            } catch (error) {
                console.error('[ShareButton] Markdown export failed:', error);
                alert(`Failed to export markdown: ${error.message}`);
            }
        });

        cancelBtn.addEventListener('click', cleanup);
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) cleanup();
        });
    }
}

customElements.define('share-button', ShareButton);
