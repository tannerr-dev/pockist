import { ShareService } from '../services/ShareService.js';
import { DialogService } from '../services/DialogService.js';

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
        // Create dialog
        const dialog = document.createElement('dialog');
        dialog.className = 'share-dialog';
        dialog.innerHTML = `
            <div class="share-dialog-content">
                <h3>Share ${this.type === 'note' ? 'Note' : 'List'}</h3>
                <p class="share-title">"${this.itemTitle}"</p>
                <div class="share-info">
                    <span class="share-expiry">⏰ Link expires in 24 hours</span>
                </div>
                <div class="share-actions">
                    <button class="share-create-btn" type="button">Create Share Link</button>
                    <button class="share-cancel-btn" type="button">Cancel</button>
                </div>
                <div class="share-result" style="display: none;">
                    <input type="text" class="share-url" readonly />
                    <button class="share-copy-btn" type="button">Copy</button>
                    <p class="share-success">✓ Link created! Expires in 24 hours.</p>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);
        dialog.showModal();

        // Event listeners
        const createBtn = dialog.querySelector('.share-create-btn');
        const cancelBtn = dialog.querySelector('.share-cancel-btn');
        const copyBtn = dialog.querySelector('.share-copy-btn');
        const resultDiv = dialog.querySelector('.share-result');
        const actionsDiv = dialog.querySelector('.share-actions');

        createBtn.addEventListener('click', async () => {
            createBtn.disabled = true;
            createBtn.textContent = 'Creating...';

            try {
                const result = await ShareService.createShare(
                    this.type,
                    shareData,
                    this.itemTitle
                );

                // Show result
                const urlInput = dialog.querySelector('.share-url');
                urlInput.value = `${window.location.origin}${result.url}`;
                
                actionsDiv.style.display = 'none';
                resultDiv.style.display = 'block';

            } catch (error) {
                console.error('[ShareButton] Create share failed:', error);
                alert(`Failed to create share: ${error.message}`);
                createBtn.disabled = false;
                createBtn.textContent = 'Create Share Link';
            }
        });

        cancelBtn.addEventListener('click', () => {
            dialog.close();
            document.body.removeChild(dialog);
        });

        copyBtn.addEventListener('click', () => {
            const urlInput = dialog.querySelector('.share-url');
            urlInput.select();
            document.execCommand('copy');
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyBtn.textContent = 'Copy';
            }, 2000);
        });

        // Close on backdrop click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                dialog.close();
                document.body.removeChild(dialog);
            }
        });
    }
}

customElements.define('share-button', ShareButton);
