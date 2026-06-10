import { Router } from '../services/Router.js';
import { ShareService } from '../services/ShareService.js';
import { DialogService } from '../services/DialogService.js';
import * as Utils from '../services/Utils.js';

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
                        '<span class="share-creator-badge"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> You created this share</span>' : 
                        '<span class="share-anonymous">Shared content</span>'
                    }
                    <span class="share-expiry"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Expires in ${this.shareData.expiresIn}</span>
                </div>

                <div class="share-content">
                    <h1>${Utils.escapeHtml(this.shareData.title)}</h1>
                    
                    ${isNote ? this.renderNoteContent() : ''}
                    ${isList ? this.renderListContent() : ''}
                    
                    <div class="share-meta">
                        <span>Created: ${this.formatDate(this.shareData.createdAt)}</span>
                        <span>Views: ${this.shareData.viewCount}</span>
                    </div>
                </div>

                <div class="share-view-actions">
                    ${this.isCreator ? `
                        <button class="btn btn-outline-danger" type="button">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg> Remove This Share
                        </button>
                    ` : ''}

                    <button class="btn btn-outline-secondary" type="button">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Import to My Data
                    </button>

                    <button class="btn btn-ghost" type="button">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><polyline points="8 13 12 17 16 13"/><line x1="12" y1="17" x2="12" y2="9"/></svg> Download as File
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

        const formattedContent = Utils.escapeHtml(content).replace(/\n/g, '<br>');

        return `
            <div class="share-note-content">
                <div class="share-note-text">${formattedContent}</div>
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
                    const items = listItem?.items || [];
                    const orderA = items.find(l => l.id === a.id)?.order || 0;
                    const orderB = items.find(l => l.id === b.id)?.order || 0;
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
                <h3>${Utils.escapeHtml(listName)}</h3>
                <ul class="share-todos">
                    ${todos.map(todo => `
                        <li class="item-row ${todo.completed ? 'completed' : ''}">
                            <span class="share-todo-checkbox">${todo.completed ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>'}</span>
                            <span class="item-text">${Utils.escapeHtml(todo.text || '')}</span>
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
        const deleteBtn = this.querySelector('.btn-outline-danger');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.handleDelete());
        }

        // Import button
        const importBtn = this.querySelector('.btn-outline-secondary');
        if (importBtn) {
            importBtn.addEventListener('click', () => this.handleImport());
        }

        // Download button
        const downloadBtn = this.querySelector('.btn-ghost');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.handleDownload());
        }
    }

    async handleDelete() {
        const confirmed = await DialogService.confirm(
            'Are you sure you want to delete this share? This cannot be undone.',
            'Remove Share'
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
        const choice = await this.#showDownloadFormatDialog();
        if (!choice) return;

        try {
            const { ImportExportService } = await import('../services/ImportExportService.js');

            if (choice === 'json') {
                await this.#downloadJSON(ImportExportService);
            } else if (choice === 'markdown') {
                await this.#downloadMarkdown(ImportExportService);
            }
        } catch (error) {
            console.error('[ShareView] Download failed:', error);
            alert(`Download failed: ${error.message}`);
        }
    }

    async #downloadJSON(ImportExportService) {
        const isV2 = Array.isArray(this.shareData.data?.items);

        const exportPayload = {
            version: isV2 ? '2.0' : '1.0',
            type: 'pockist-backup',
            scope: this.shareData.type,
            exportId: `shared-${this.shareId}`,
            exportedAt: this.shareData.createdAt,
            appVersion: '1.0.0',
            data: this.shareData.data
        };

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
    }

    async #downloadMarkdown(ImportExportService) {
        const { item, linkedItems } = this.#getUnifiedItemFromShare();
        if (!item) {
            throw new Error('Could not extract item for markdown export');
        }
        await ImportExportService.exportMarkdownFromData(item, linkedItems);
    }

    #getUnifiedItemFromShare() {
        const isV2 = Array.isArray(this.shareData.data?.items);

        if (this.shareData.type === 'note') {
            if (isV2) {
                const note = this.shareData.data.items.find(i => i.type === 'note');
                return { item: note, linkedItems: null };
            } else {
                const note = this.shareData.data?.notes?.[0];
                if (!note) return { item: null };
                const item = {
                    id: String(note.id),
                    type: 'note',
                    content: ((note.title ? note.title + '\n' : '') + (note.content || '')).trim(),
                    links: [],
                    items: [],
                    meta: {
                        createdAt: note.createdAt || new Date().toISOString(),
                        updatedAt: note.updatedAt || new Date().toISOString()
                    }
                };
                return { item, linkedItems: null };
            }
        }

        if (this.shareData.type === 'list') {
            if (isV2) {
                const list = this.shareData.data.items.find(i => i.type === 'list');
                const linked = this.shareData.data.items.filter(i => i.type === 'item');
                return { item: list, linkedItems: linked };
            } else {
                const list = this.shareData.data?.lists?.[0];
                if (!list) return { item: null };

                const linkedItems = (list.todos || []).map((todo, index) => ({
                    id: String(todo.id || `todo-${index}`),
                    type: 'item',
                    content: String(todo.text || ''),
                    links: [],
                    items: [],
                    meta: {
                        createdAt: new Date(todo.createdAt || Date.now()).toISOString(),
                        updatedAt: new Date().toISOString(),
                        completed: todo.completed || false
                    }
                }));

                const item = {
                    id: String(list.id),
                    type: 'list',
                    content: String(list.name || ''),
                    links: [],
                    items: linkedItems.map((li, i) => ({ id: li.id, order: i })),
                    meta: {
                        createdAt: new Date(list.createdAt || Date.now()).toISOString(),
                        updatedAt: new Date(list.updatedAt || Date.now()).toISOString(),
                        isDefault: list.isDefault || false,
                        order: typeof list.order === 'number' ? list.order : 0
                    }
                };

                return { item, linkedItems };
            }
        }

        return { item: null };
    }

    #showDownloadFormatDialog() {
        return new Promise((resolve) => {
            const typeLabel = this.shareData.type === 'note' ? 'Note' : 'List';

            const dialog = document.createElement('dialog');
            dialog.className = 'dialog';
            dialog.innerHTML = `
                <div class="dialog-content">
                    <h3>Download ${Utils.escapeHtml(typeLabel)}</h3>
                    <p class="share-title">"${Utils.escapeHtml(this.shareData.title)}"</p>
                    <div class="share-options">
                        <button class="share-option-btn download-format-btn" data-format="json" type="button">
                            <span class="share-option-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg></span>
                            <span class="share-option-label">Pockist Format (JSON)</span>
                            <span class="share-option-desc">Full data with IDs, links, and metadata</span>
                        </button>
                        <button class="share-option-btn download-format-btn" data-format="markdown" type="button">
                            <span class="share-option-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg></span>
                            <span class="share-option-label">Markdown</span>
                            <span class="share-option-desc">Human-readable text file</span>
                        </button>
                    </div>
                    <div class="share-actions">
                        <button class="btn btn-ghost" type="button">Cancel</button>
                    </div>
                </div>
            `;

            document.body.appendChild(dialog);
            dialog.showModal();

            const formatBtns = dialog.querySelectorAll('.download-format-btn');
            const cancelBtn = dialog.querySelector('.btn-ghost');

            const cleanup = () => {
                dialog.close();
                document.body.removeChild(dialog);
            };

            formatBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    cleanup();
                    resolve(btn.dataset.format);
                });
            });

            cancelBtn.addEventListener('click', () => {
                cleanup();
                resolve(null);
            });

            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) {
                    cleanup();
                    resolve(null);
                }
            });
        });
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

    formatDate(isoString) {
        const date = new Date(isoString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
}

customElements.define('share-view', ShareView);
