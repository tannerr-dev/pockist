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
            <button class="share-btn" title="Share this ${this.type}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="18" cy="5" r="3"/>
                    <circle cx="6" cy="12" r="3"/>
                    <circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
                <span>Share</span>
            </button>
        `;
    }

    setupEventListeners() {
        const btn = this.querySelector('.share-btn');
        btn.addEventListener('click', () => this.handleShare());
    }

    async handleShare() {
        try {
            // Get the data to share based on type
            const { DBManager } = await import('../services/DBManager.js');
            let shareData;

            if (this.type === 'note') {
                const note = await DBManager.getNote(this.itemId);
                if (!note) {
                    throw new Error('Note not found');
                }
                shareData = {
                    notes: [note],
                    lists: []
                };
            } else if (this.type === 'list') {
                const lists = await DBManager.getLists();
                const list = lists.find(l => l.id === this.itemId);
                if (!list) {
                    throw new Error('List not found');
                }
                shareData = {
                    notes: [],
                    lists: [list]
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
        const item = this.type === 'note' ? shareData.notes[0] : shareData.lists[0];
        const typeLabel = this.type === 'note' ? 'Note' : 'List';

        // Create options dialog
        const dialog = document.createElement('dialog');
        dialog.className = 'share-dialog';
        dialog.innerHTML = `
            <div class="share-dialog-content">
                <h3>Share ${typeLabel}</h3>
                <p class="share-title">"${this.itemTitle}"</p>
                <div class="share-options">
                    <button class="share-option-btn share-option-link" type="button">
                        <span class="share-option-icon">&#128279;</span>
                        <span class="share-option-label">Temporary Public Link</span>
                        <span class="share-option-desc">Create a shareable link that expires in 24 hours</span>
                    </button>
                    <button class="share-option-btn share-option-json" type="button">
                        <span class="share-option-icon">&#128190;</span>
                        <span class="share-option-label">Download Pockist Format</span>
                        <span class="share-option-desc">Export as JSON for backup or re-import</span>
                    </button>
                    <button class="share-option-btn share-option-md" type="button">
                        <span class="share-option-icon">&#128196;</span>
                        <span class="share-option-label">Download Markdown</span>
                        <span class="share-option-desc">Export as a Markdown file</span>
                    </button>
                </div>
                <div class="share-actions">
                    <button class="share-cancel-btn" type="button">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);
        dialog.showModal();

        const linkBtn = dialog.querySelector('.share-option-link');
        const jsonBtn = dialog.querySelector('.share-option-json');
        const mdBtn = dialog.querySelector('.share-option-md');
        const cancelBtn = dialog.querySelector('.share-cancel-btn');

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
                    <div class="share-dialog-content">
                        <h3>${typeLabel} Shared!</h3>
                        <p>"${this.itemTitle}"</p>
                        <div class="share-info">
                            <span class="share-expiry">Link expires in ${result.expiresIn}</span>
                        </div>
                        <div class="share-result">
                            <input type="text" class="share-url" value="${window.location.origin}${result.url}" readonly />
                            <button class="share-copy-btn" type="button">Copy</button>
                            <p class="share-success">Share link created!</p>
                        </div>
                        <div class="share-actions">
                            <button class="share-close-btn" type="button">Close</button>
                        </div>
                    </div>
                `;

                const copyBtn = dialog.querySelector('.share-copy-btn');
                const urlInput = dialog.querySelector('.share-url');
                copyBtn.addEventListener('click', () => {
                    urlInput.select();
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(urlInput.value).then(() => {
                            copyBtn.textContent = 'Copied!';
                            setTimeout(() => copyBtn.textContent = 'Copy', 2000);
                        }).catch(() => {
                            document.execCommand('copy');
                            copyBtn.textContent = 'Copied!';
                            setTimeout(() => copyBtn.textContent = 'Copy', 2000);
                        });
                    } else {
                        document.execCommand('copy');
                        copyBtn.textContent = 'Copied!';
                        setTimeout(() => copyBtn.textContent = 'Copy', 2000);
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
                if (this.type === 'note') {
                    await ImportExportService.exportNote(item);
                } else {
                    await ImportExportService.exportList(item);
                }
            } catch (error) {
                console.error('[ShareButton] Export failed:', error);
                alert(`Failed to export: ${error.message}`);
            }
        });

        mdBtn.addEventListener('click', async () => {
            cleanup();
            try {
                await ImportExportService.exportMarkdown(item, this.type);
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
