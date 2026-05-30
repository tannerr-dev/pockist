import { Router } from '../services/Router.js';
import { ShareService } from '../services/ShareService.js';
import { DialogService } from '../services/DialogService.js';

/**
 * ShareView - Web component for viewing shared content
 * 
 * Route: /share/:shareId
 * Displays shared note/list content with import/delete options
 */
export class ShareView extends HTMLElement {
    constructor() {
        super();
        this.shareId = null;
        this.shareData = null;
        this.isCreator = false;
        this.loading = true;
        this.error = null;
    }

    async connectedCallback() {
        // Get share ID from URL
        const path = window.location.pathname;
        const match = path.match(/\/share\/([^\/]+)/);
        if (match) {
            this.shareId = match[1];
            await this.loadShare();
        } else {
            this.error = 'Invalid share URL';
            this.loading = false;
        }
        this.render();
    }

    async loadShare() {
        try {
            this.shareData = await ShareService.getShare(this.shareId);
            this.isCreator = await ShareService.isCreator(this.shareId);
            this.loading = false;
        } catch (error) {
            console.error('[ShareView] Load failed:', error);
            this.error = error.message;
            this.loading = false;
        }
    }

    render() {
        if (this.loading) {
            this.innerHTML = `
                <div class="share-view-container">
                    <div class="share-loading">Loading shared content...</div>
                </div>
            `;
            return;
        }

        if (this.error) {
            this.innerHTML = `
                <div class="share-view-container">
                    <div class="share-error">
                        <h2>Share Not Available</h2>
                        <p>${this.error}</p>
                        <button onclick="app.Router.go('/')">Go Home</button>
                    </div>
                </div>
            `;
            return;
        }

        const isNote = this.shareData.type === 'note';
        const isList = this.shareData.type === 'list';
        const itemCount = this.getItemCount();

        this.innerHTML = `
            <div class="share-view-container">
                <div class="share-header">
                    ${this.isCreator ? 
                        '<span class="share-creator-badge">✓ You created this share</span>' : 
                        '<span class="share-anonymous">Shared content</span>'
                    }
                    <span class="share-expiry">⏰ Expires in ${this.shareData.expiresIn}</span>
                </div>

                <div class="share-content">
                    <h1>${this.escapeHtml(this.shareData.title)}</h1>
                    
                    ${isNote ? this.renderNoteContent() : ''}
                    ${isList ? this.renderListContent() : ''}
                    
                    <div class="share-meta">
                        <span>Created: ${this.formatDate(this.shareData.createdAt)}</span>
                        <span>Views: ${this.shareData.viewCount}</span>
                    </div>
                </div>

                <div class="share-actions">
                    ${this.isCreator ? `
                        <button class="share-delete-btn" type="button">
                            🗑️ Delete This Share
                        </button>
                    ` : ''}
                    
                    <button class="share-import-btn" type="button">
                        📥 Import to My Data
                    </button>
                    
                    <button class="share-download-btn" type="button">
                        💾 Download as File
                    </button>
                </div>
            </div>
        `;

        this.setupEventListeners();
    }

    renderNoteContent() {
        const isV2 = Array.isArray(this.shareData.data?.items);
        let note, content;

        if (isV2) {
            note = this.shareData.data.items.find(i => i.type === 'note');
            content = note ? (note.content || '') : '';
        } else {
            const notes = this.shareData.data?.notes || [];
            note = notes[0];
            content = note ? (note.content || '') : '';
        }

        if (!note) return '<p>No note content</p>';

        const formattedContent = this.escapeHtml(content).replace(/\n/g, '<br>');

        return `
            <div class="share-note-content">
                <div class="note-text">${formattedContent}</div>
            </div>
        `;
    }

    renderListContent() {
        const isV2 = Array.isArray(this.shareData.data?.items);
        let listName, todos;

        if (isV2) {
            const list = this.shareData.data.items.find(i => i.type === 'list');
            listName = list ? (list.content || 'Untitled List') : 'Untitled List';
            todos = this.shareData.data.items
                .filter(i => i.type === 'item')
                .sort((a, b) => {
                    const listItem = this.shareData.data.items.find(li => li.type === 'list');
                    const links = listItem?.links || [];
                    const orderA = links.find(l => l.id === a.id)?.order || 0;
                    const orderB = links.find(l => l.id === b.id)?.order || 0;
                    return orderA - orderB;
                })
                .map(item => ({
                    text: item.content || '',
                    completed: item.meta?.completed || false
                }));
        } else {
            const lists = this.shareData.data?.lists || [];
            const list = lists[0];
            listName = list ? (list.name || 'Untitled List') : 'Untitled List';
            todos = list ? (list.todos || []) : [];
        }

        return `
            <div class="share-list-content">
                <h3>${this.escapeHtml(listName)}</h3>
                <ul class="share-todos">
                    ${todos.map(todo => `
                        <li class="share-todo ${todo.completed ? 'completed' : ''}">
                            <span class="todo-checkbox">${todo.completed ? '☑' : '☐'}</span>
                            <span class="todo-text">${this.escapeHtml(todo.text || '')}</span>
                        </li>
                    `).join('')}
                </ul>
                <p class="todo-count">${todos.length} item${todos.length !== 1 ? 's' : ''}</p>
            </div>
        `;
    }

    getItemCount() {
        if (!this.shareData.data) return 0;
        if (Array.isArray(this.shareData.data.items)) {
            return this.shareData.data.items.length;
        }
        const notes = this.shareData.data.notes?.length || 0;
        const lists = this.shareData.data.lists?.length || 0;
        return notes + lists;
    }

    setupEventListeners() {
        // Delete button
        const deleteBtn = this.querySelector('.share-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.handleDelete());
        }

        // Import button
        const importBtn = this.querySelector('.share-import-btn');
        if (importBtn) {
            importBtn.addEventListener('click', () => this.handleImport());
        }

        // Download button
        const downloadBtn = this.querySelector('.share-download-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.handleDownload());
        }
    }

    async handleDelete() {
        const confirmed = await DialogService.confirm(
            'Are you sure you want to delete this share? This cannot be undone.',
            'Delete Share'
        );

        if (!confirmed) return;

        try {
            await ShareService.deleteShare(this.shareId);
            alert('Share deleted successfully');
            Router.go('/');
        } catch (error) {
            console.error('[ShareView] Delete failed:', error);
            alert(`Failed to delete: ${error.message}`);
        }
    }

    async handleImport() {
        try {
            const result = await ShareService.importToLocal(this.shareData);

            if (result.cancelled) return;

            const success = await DialogService.confirm(
                'Import successful! Would you like to go to your notes/lists?',
                'Go to My Data',
                'Stay Here'
            );

            if (success) {
                if (this.shareData.type === 'note') {
                    Router.go('/note');
                } else if (this.shareData.type === 'list') {
                    Router.go('/list');
                } else {
                    Router.go('/');
                }
            }
        } catch (error) {
            console.error('[ShareView] Import failed:', error);
            alert(`Import failed: ${error.message}`);
        }
    }

    async handleDownload() {
        try {
            const { ImportExportService } = await import('../services/ImportExportService.js');

            const isV2 = Array.isArray(this.shareData.data?.items);

            // Create export payload from share data
            const exportPayload = {
                version: isV2 ? '2.0' : '1.0',
                type: 'pockist-backup',
                scope: this.shareData.type,
                exportId: `shared-${this.shareId}`,
                exportedAt: this.shareData.createdAt,
                appVersion: '1.0.0',
                data: this.shareData.data
            };

            // Download as file
            const json = JSON.stringify(exportPayload, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `pockist-shared-${this.shareData.title.slice(0, 30).replace(/[^a-z0-9]/gi, '-')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error('[ShareView] Download failed:', error);
            alert(`Download failed: ${error.message}`);
        }
    }

    getImportSummary() {
        const parts = [];

        if (Array.isArray(this.shareData.data?.items)) {
            const items = this.shareData.data.items;
            const notes = items.filter(i => i.type === 'note');
            const lists = items.filter(i => i.type === 'list');
            const linked = items.filter(i => i.type === 'item');

            if (notes.length > 0) {
                parts.push(`• ${notes.length} note${notes.length === 1 ? '' : 's'}`);
            }
            if (lists.length > 0) {
                parts.push(`• ${lists.length} list${lists.length === 1 ? '' : 's'} (${linked.length} item${linked.length !== 1 ? 's' : ''})`);
            }
        } else {
            const notes = this.shareData.data?.notes || [];
            const lists = this.shareData.data?.lists || [];

            if (notes.length > 0) {
                parts.push(`• ${notes.length} note${notes.length === 1 ? '' : 's'}`);
            }
            if (lists.length > 0) {
                const todoCount = lists.reduce((sum, list) => sum + (list.todos?.length || 0), 0);
                parts.push(`• ${lists.length} list${lists.length === 1 ? '' : 's'} (${todoCount} todo${todoCount === 1 ? '' : 's'})`);
            }
        }

        return parts.join('\n') || '• No data';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(isoString) {
        const date = new Date(isoString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
}

customElements.define('share-view', ShareView);
