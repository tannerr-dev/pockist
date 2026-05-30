/**
 * ImportExportService - Handles export and import of Pockist data
 *
 * Supports:
 * - Full backup export (all items in unified v2.0 format)
 * - Individual item export
 * - Import with version checking and merge options
 * - Duplicate detection via exportId tracking
 * - Backwards compatible with v1.0 JSON format
 *
 * File format v2.0:
 * {
 *   version: "2.0",
 *   type: "pockist-backup",
 *   scope: "full|note|list",
 *   exportId: "uuid-timestamp",
 *   exportedAt: "ISO-8601",
 *   appVersion: "1.x.x",
 *   data: { items: [...] }
 * }
 *
 * Legacy format v1.0:
 * {
 *   version: "1.0",
 *   type: "pockist-backup",
 *   scope: "full|note|list",
 *   data: { notes: [...], lists: [...] }
 * }
 */

import { DBManager } from './DBManager.js';
import { DialogService } from './DialogService.js';

const EXPORT_VERSION = '2.0';
const LEGACY_VERSION = '1.0';
const EXPORT_TYPE = 'pockist-backup';
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export class ImportExportService {

    // ============================================================================
    // EXPORT FUNCTIONS
    // ============================================================================

    /**
     * Export all data as a full backup
     */
    static async exportAll() {
        console.log('[ImportExportService] exportAll() starting...');

        try {
            const items = await DBManager.getAllItems();

            const exportData = this.#createExportPayload('full', { items });
            const fileName = this.#generateFileName('backup');

            await this.#downloadJSON(exportData, fileName);
            console.log('[ImportExportService] Full backup exported successfully');
            return { success: true, fileName };

        } catch (error) {
            console.error('[ImportExportService] Export failed:', error);
            throw error;
        }
    }

    /**
     * Export a specific item (note or list)
     * @param {Object} item - The unified item to export
     */
    static async exportItem(item) {
        console.log('[ImportExportService] exportItem() starting...');

        if (!item || !item.id) {
            throw new Error('Invalid item provided for export');
        }

        const scope = item.type === 'note' ? 'note' : (item.type === 'list' ? 'list' : 'item');
        const exportData = this.#createExportPayload(scope, { items: [item] });
        const name = (item.content || '').split('\n')[0].slice(0, 32).trim() || 'untitled';
        const fileName = this.#generateFileName(scope, name);

        await this.#downloadJSON(exportData, fileName);
        console.log('[ImportExportService] Item exported successfully');
        return { success: true, fileName };
    }

    /**
     * Export a specific item as Markdown
     * @param {Object} item - The unified item
     */
    static async exportMarkdown(item) {
        console.log('[ImportExportService] exportMarkdown() starting...');

        if (!item) {
            throw new Error('Invalid item provided for markdown export');
        }

        const markdown = item.type === 'note'
            ? this.#noteToMarkdown(item)
            : await this.#listToMarkdown(item);

        const name = (item.content || '').split('\n')[0].slice(0, 32).trim() || 'untitled';
        const fileName = item.type === 'note'
            ? `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}.md`
            : `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-list.md`;

        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('[ImportExportService] Markdown exported successfully');
        return { success: true, fileName };
    }

    /**
     * Convert a note item to Markdown format
     * @private
     */
    static #noteToMarkdown(item) {
        const lines = (item.content || '').split('\n');
        const title = lines[0] || 'Untitled Note';
        const body = lines.slice(1).join('\n').trim();
        const date = item.meta?.createdAt ? new Date(item.meta.createdAt).toLocaleString() : '';

        let markdown = `# ${title}\n\n`;
        if (date) {
            markdown += `*Created: ${date}*\n\n`;
        }
        markdown += body;
        return markdown;
    }

    /**
     * Convert a list item to Markdown format
     * @private
     */
    static async #listToMarkdown(item) {
        const title = item.content || 'Untitled List';
        const date = item.meta?.createdAt ? new Date(item.meta.createdAt).toLocaleString() : '';
        const linkedItems = await DBManager.getLinkedItems(item.id);

        let markdown = `# ${title}\n\n`;
        if (date) {
            markdown += `*Created: ${date}*\n\n`;
        }

        if (linkedItems.length === 0) {
            markdown += '*No items yet.*';
        } else {
            linkedItems.forEach(todoItem => {
                const checkbox = todoItem.meta?.completed ? '[x]' : '[ ]';
                markdown += `- ${checkbox} ${todoItem.content || ''}\n`;
            });
        }

        return markdown;
    }

    // ============================================================================
    // IMPORT ENTRY POINTS
    // ============================================================================

    /**
     * Import data from a file
     * @param {File} file - The file to import
     */
    static async importFromFile(file) {
        console.log('[ImportExportService] importFromFile() starting...');

        if (file.size > MAX_FILE_SIZE_BYTES) {
            throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`);
        }

        try {
            const content = await this.#readFile(file);

            // Auto-detect markdown files
            if (file.name.toLowerCase().endsWith('.md')) {
                console.log('[ImportExportService] Detected markdown file');
                const parsed = this.#parseMarkdown(content);
                return await this.#importMarkdown(parsed, file.name);
            }

            const data = JSON.parse(content);
            this.#validateImport(data);

            return await this.#importWithOptions(data, file.name);

        } catch (error) {
            console.error('[ImportExportService] Import failed:', error);
            throw error;
        }
    }

    /**
     * Import data from a shared item (from ShareService)
     * @param {Object} sharePayload - The share payload
     */
    static async importFromShare(sharePayload) {
        console.log('[ImportExportService] importFromShare() starting...');

        this.#validateImport(sharePayload);
        return await this.#importWithOptions(sharePayload, `shared-${sharePayload.exportId}`);
    }

    // ============================================================================
    // CORE IMPORT LOGIC
    // ============================================================================

    /**
     * Route import to the appropriate handler with user options
     * @private
     */
    static async #importWithOptions(data, sourceName) {
        const isV2 = data.data && Array.isArray(data.data.items);

        // Check for duplicate import
        const isDuplicate = await this.#checkDuplicate(data.exportId);
        if (isDuplicate) {
            const shouldProceed = await DialogService.confirm(
                `You have already imported this file on ${isDuplicate.importedAt}. Import again?`,
                'Import Again'
            );
            if (!shouldProceed) {
                return { success: false, cancelled: true };
            }
        }

        if (!isV2) {
            // Legacy v1.0 import
            const summary = this.#generateImportSummary(data);
            const shouldImport = await DialogService.confirm(
                `This backup contains:\n${summary}\n\nImport will merge with existing data. Conflicts will be renamed. Continue?`,
                'Import'
            );
            if (!shouldImport) {
                return { success: false, cancelled: true };
            }

            const result = await this.#performImport(data);
            await DBManager.recordImport({
                id: data.exportId,
                importedAt: new Date().toISOString(),
                fileName: sourceName,
                scope: data.scope,
                summary: result.summary
            });

            return { success: true, summary: result.summary, scope: data.scope };
        }

        // v2.0 import with merge options
        const choice = await this.#showImportOptionsDialog(data);
        if (!choice) {
            return { success: false, cancelled: true };
        }

        const result = await this.#performItemsImport(data, choice);

        await DBManager.recordImport({
            id: data.exportId,
            importedAt: new Date().toISOString(),
            fileName: sourceName,
            scope: data.scope,
            summary: result.summary
        });

        console.log('[ImportExportService] Import completed successfully');
        return { success: true, summary: result.summary, scope: data.scope };
    }

    /**
     * Perform v2.0 items import with merge options
     * @private
     */
    static async #performItemsImport(data, options) {
        const items = data.data.items || [];
        const { action, targetId } = options;

        let notesImported = 0;
        let listsImported = 0;
        let itemsImported = 0;
        let itemsMerged = 0;
        let itemsSkipped = 0;

        if (action === 'create') {
            // Rename conflicting IDs first, then save everything
            const idMap = new Map();
            for (const item of items) {
                const existing = await DBManager.getItem(item.id);
                if (existing) {
                    idMap.set(item.id, `${item.id}-imported-${Date.now()}`);
                }
            }

            for (const item of items) {
                let itemToSave = { ...item };
                if (idMap.has(item.id)) {
                    itemToSave.id = idMap.get(item.id);
                }
                if (Array.isArray(itemToSave.links)) {
                    itemToSave.links = itemToSave.links.map(link => ({
                        ...link,
                        id: idMap.has(link.id) ? idMap.get(link.id) : link.id
                    }));
                }
                await DBManager.saveItem(itemToSave);

                if (itemToSave.type === 'note') notesImported++;
                else if (itemToSave.type === 'list') listsImported++;
                else itemsImported++;
            }
        }

        if (action === 'append' && targetId) {
            const target = await DBManager.getItem(targetId);
            if (!target) throw new Error('Target not found');

            if (target.type === 'note') {
                const importedNote = items.find(i => i.type === 'note');
                if (importedNote) {
                    const divider = '\n\n---\n\n';
                    target.content = (target.content || '') + divider + (importedNote.content || '');
                    target.meta = { ...target.meta, updatedAt: new Date().toISOString() };
                    await DBManager.saveItem(target);
                    notesImported++;
                    itemsMerged++;
                }
            } else if (target.type === 'list') {
                const importedLinked = items.filter(i => i.type === 'item');
                const existingLinks = target.links || [];
                const newLinks = [...existingLinks];
                let maxOrder = existingLinks.length > 0
                    ? Math.max(...existingLinks.map(l => l.order || 0))
                    : -1;

                for (const linkedItem of importedLinked) {
                    const existing = await DBManager.getItem(linkedItem.id);
                    let itemToSave = { ...linkedItem };
                    if (existing) {
                        itemToSave.id = `${linkedItem.id}-imported-${Date.now()}`;
                    }
                    await DBManager.saveItem(itemToSave);
                    newLinks.push({ id: itemToSave.id, order: ++maxOrder });
                    itemsImported++;
                }

                target.links = newLinks;
                target.meta = { ...target.meta, updatedAt: new Date().toISOString() };
                await DBManager.saveItem(target);
                listsImported++;
                itemsMerged += importedLinked.length;
            }
        }

        if (action === 'smart-merge' && targetId) {
            const target = await DBManager.getItem(targetId);
            if (!target || target.type !== 'list') throw new Error('Target list not found');

            const importedLinked = items.filter(i => i.type === 'item');
            const existingLinkedItems = await DBManager.getLinkedItems(targetId);
            const existingTexts = new Set(
                existingLinkedItems.map(i => (i.content || '').trim().toLowerCase())
            );

            const existingLinks = target.links || [];
            const newLinks = [...existingLinks];
            let maxOrder = existingLinks.length > 0
                ? Math.max(...existingLinks.map(l => l.order || 0))
                : -1;

            for (const linkedItem of importedLinked) {
                const text = (linkedItem.content || '').trim().toLowerCase();
                if (existingTexts.has(text)) {
                    itemsSkipped++;
                    continue;
                }

                const existing = await DBManager.getItem(linkedItem.id);
                let itemToSave = { ...linkedItem };
                if (existing) {
                    itemToSave.id = `${linkedItem.id}-imported-${Date.now()}`;
                }
                await DBManager.saveItem(itemToSave);
                newLinks.push({ id: itemToSave.id, order: ++maxOrder });
                itemsImported++;
            }

            target.links = newLinks;
            target.meta = { ...target.meta, updatedAt: new Date().toISOString() };
            await DBManager.saveItem(target);
            listsImported++;
            itemsMerged += importedLinked.length - itemsSkipped;
        }

        return {
            summary: {
                notes: notesImported,
                lists: listsImported,
                items: itemsImported,
                merged: itemsMerged,
                skipped: itemsSkipped
            }
        };
    }

    /**
     * Legacy v1.0 import handler
     * @private
     */
    static async #performImport(data) {
        const notes = data.data.notes || [];
        const lists = data.data.lists || [];

        let notesImported = 0;
        let listsImported = 0;
        let todosImported = 0;

        const [existingNotes, existingLists] = await Promise.all([
            DBManager.getAllNotes(),
            DBManager.getLists()
        ]);

        const existingNoteIds = new Set(existingNotes.map(n => n.id));
        const existingListIds = new Set(existingLists.map(l => l.id));

        for (const note of notes) {
            if (!note || !note.id) continue;

            let noteToSave = { ...note };

            if (existingNoteIds.has(note.id)) {
                const newId = `${note.id}-imported-${Date.now()}`;
                noteToSave.id = newId;
                noteToSave.title = `${note.title || 'Note'} (Imported)`;
                console.log(`[ImportExportService] Note ${note.id} renamed to ${newId}`);
            }

            await DBManager.saveNote(noteToSave.id, noteToSave);
            notesImported++;
        }

        if (lists.length > 0) {
            let updatedLists = [...existingLists];

            for (const list of lists) {
                if (!list || !list.id) continue;

                let listToSave = { ...list };

                if (existingListIds.has(list.id)) {
                    listToSave.id = `${list.id}-imported-${Date.now()}`;
                    listToSave.name = `${list.name || 'List'} (Imported)`;
                    console.log(`[ImportExportService] List ${list.id} renamed to ${listToSave.id}`);
                }

                if (listToSave.todos) {
                    todosImported += listToSave.todos.length;
                }

                updatedLists.push(listToSave);
                listsImported++;
            }

            await DBManager.saveLists(updatedLists);
        }

        return {
            summary: {
                notes: notesImported,
                lists: listsImported,
                todos: todosImported
            }
        };
    }

    // ============================================================================
    // IMPORT DIALOGS
    // ============================================================================

    /**
     * Show import options dialog for v2.0 items
     * @private
     */
    static async #showImportOptionsDialog(data) {
        const items = data.data.items || [];
        const importedNotes = items.filter(i => i.type === 'note');
        const importedLists = items.filter(i => i.type === 'list');
        const importedItems = items.filter(i => i.type === 'item');

        const isSingleNote = importedNotes.length === 1 && importedLists.length === 0;
        const isSingleList = importedLists.length === 1 && importedNotes.length === 0;

        let title, subtitle, optionsHtml;

        if (isSingleNote) {
            const note = importedNotes[0];
            title = 'Import Note';
            subtitle = `"${(note.content || '').split('\n')[0].slice(0, 40)}"`;
            optionsHtml = `
                <button class="share-option-btn import-action-btn" data-action="create" type="button">
                    <span class="share-option-icon">&#10133;</span>
                    <span class="share-option-label">Create New Note</span>
                    <span class="share-option-desc">Import as a fresh note</span>
                </button>
                <button class="share-option-btn import-action-btn" data-action="append" type="button">
                    <span class="share-option-icon">&#128220;</span>
                    <span class="share-option-label">Append to Existing</span>
                    <span class="share-option-desc">Add content to an existing note</span>
                </button>
            `;
        } else if (isSingleList) {
            const list = importedLists[0];
            title = 'Import List';
            subtitle = `"${list.content || 'Untitled'}" — ${importedItems.length} item${importedItems.length !== 1 ? 's' : ''}`;
            optionsHtml = `
                <button class="share-option-btn import-action-btn" data-action="create" type="button">
                    <span class="share-option-icon">&#10133;</span>
                    <span class="share-option-label">Create New List</span>
                    <span class="share-option-desc">Import as a fresh list</span>
                </button>
                <button class="share-option-btn import-action-btn" data-action="smart-merge" type="button">
                    <span class="share-option-icon">&#128260;</span>
                    <span class="share-option-label">Smart Merge</span>
                    <span class="share-option-desc">Skip duplicate items, add only new ones</span>
                </button>
                <button class="share-option-btn import-action-btn" data-action="append" type="button">
                    <span class="share-option-icon">&#128220;</span>
                    <span class="share-option-label">Append to Existing</span>
                    <span class="share-option-desc">Add all items to an existing list</span>
                </button>
            `;
        } else {
            const noteCount = importedNotes.length;
            const listCount = importedLists.length;
            const itemCount = importedItems.length;
            title = 'Import Full Backup';
            subtitle = `${noteCount} note${noteCount !== 1 ? 's' : ''}, ${listCount} list${listCount !== 1 ? 's' : ''}, ${itemCount} item${itemCount !== 1 ? 's' : ''}`;
            optionsHtml = `
                <button class="share-option-btn import-action-btn" data-action="create" type="button">
                    <span class="share-option-icon">&#10133;</span>
                    <span class="share-option-label">Create All New</span>
                    <span class="share-option-desc">Import everything as fresh items</span>
                </button>
            `;
        }

        const action = await this.#showActionDialog(title, subtitle, optionsHtml);
        if (!action) return null;

        if (action === 'append' || action === 'smart-merge') {
            const targetType = isSingleNote ? 'note' : 'list';
            const target = await this.#showTargetSelector(targetType);
            if (!target) return null;
            return { action, targetId: target.id };
        }

        return { action };
    }

    /**
     * Generic action dialog for imports
     * @private
     */
    static #showActionDialog(title, subtitle, optionsHtml) {
        return new Promise((resolve) => {
            const dialog = document.createElement('dialog');
            dialog.className = 'dialog';
            dialog.innerHTML = `
                <div class="dialog-content">
                    <h3>${this.#escapeHtml(title)}</h3>
                    <p class="share-title">${this.#escapeHtml(subtitle)}</p>
                    <div class="share-options">
                        ${optionsHtml}
                    </div>
                    <div class="share-actions">
                        <button class="btn btn-ghost" type="button">Cancel</button>
                    </div>
                </div>
            `;

            document.body.appendChild(dialog);
            dialog.showModal();

            const actionBtns = dialog.querySelectorAll('.import-action-btn');
            const cancelBtn = dialog.querySelector('.btn.btn-ghost');

            const cleanup = () => {
                dialog.close();
                document.body.removeChild(dialog);
            };

            actionBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    cleanup();
                    resolve(btn.dataset.action);
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

    /**
     * Show selector for existing notes or lists
     * @private
     */
    static async #showTargetSelector(type) {
        const typeLabel = type === 'list' ? 'List' : 'Note';
        let items;

        if (type === 'list') {
            items = await DBManager.getListMetadata();
        } else {
            const notes = await DBManager.getItems({ type: 'note', archived: false });
            items = notes.map(n => ({
                id: n.id,
                name: (n.content || '').split('\n')[0].slice(0, 40) || 'Untitled'
            }));
        }

        return new Promise((resolve) => {
            const dialog = document.createElement('dialog');
            dialog.className = 'dialog';

            if (items.length === 0) {
                dialog.innerHTML = `
                    <div class="dialog-content">
                        <h3>Choose ${typeLabel}</h3>
                        <p class="share-title">No existing ${typeLabel.toLowerCase()}s found.</p>
                        <div class="share-actions">
                            <button class="btn btn-ghost" type="button">Close</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(dialog);
                dialog.showModal();

                const closeBtn = dialog.querySelector('.btn.btn-ghost');
                const cleanup = () => {
                    dialog.close();
                    document.body.removeChild(dialog);
                    resolve(null);
                };
                closeBtn.addEventListener('click', cleanup);
                dialog.addEventListener('click', (e) => {
                    if (e.target === dialog) cleanup();
                });
                return;
            }

            const itemListHtml = items.map(item => `
                <button class="share-option-btn share-merge-item" type="button" data-id="${this.#escapeHtml(item.id)}">
                    <span class="share-option-label">${this.#escapeHtml(item.name || item.title || 'Untitled')}</span>
                </button>
            `).join('');

            dialog.innerHTML = `
                <div class="dialog-content">
                    <h3>Choose ${typeLabel} to Merge Into</h3>
                    <p class="share-title">Select an existing ${typeLabel.toLowerCase()}:</p>
                    <div class="share-options">
                        ${itemListHtml}
                    </div>
                    <div class="share-actions">
                        <button class="btn btn-ghost" type="button">Cancel</button>
                    </div>
                </div>
            `;

            document.body.appendChild(dialog);
            dialog.showModal();

            const itemBtns = dialog.querySelectorAll('.share-merge-item');
            const cancelBtn = dialog.querySelector('.btn.btn-ghost');

            const cleanup = () => {
                dialog.close();
                document.body.removeChild(dialog);
            };

            itemBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const itemId = btn.dataset.id;
                    const selectedItem = items.find(i => i.id === itemId);
                    cleanup();
                    resolve(selectedItem || null);
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

    // ============================================================================
    // MARKDOWN IMPORT FUNCTIONS
    // ============================================================================

    /**
     * Parse markdown content into a structured object
     * @private
     */
    static #parseMarkdown(content) {
        const lines = content.split('\n');

        let title = 'Untitled';
        let bodyStartIndex = 0;
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed) {
                title = trimmed.replace(/^#+\s*/, '').slice(0, 32).trim();
                bodyStartIndex = i;
                break;
            }
        }

        const checkboxPattern = /^-\s*\[(\s|x)\]\s*(.*)$/i;
        const todos = [];

        for (const line of lines) {
            const match = line.match(checkboxPattern);
            if (match) {
                todos.push({
                    text: match[2].trim(),
                    completed: match[1].toLowerCase() === 'x'
                });
            }
        }

        if (todos.length > 0) {
            return {
                type: 'list',
                title,
                todos,
                rawContent: content
            };
        }

        return {
            type: 'note',
            title,
            content: content.trim(),
            rawContent: content
        };
    }

    /**
     * Import parsed markdown data with create/merge options
     * @private
     */
    static async #importMarkdown(parsed, fileName) {
        console.log('[ImportExportService] #importMarkdown() starting...');

        const choice = await this.#showMarkdownImportDialog(parsed);
        if (!choice) {
            return { success: false, cancelled: true };
        }

        if (choice === 'create') {
            await this.#createFromMarkdown(parsed);
            console.log('[ImportExportService] Markdown import: created new', parsed.type);
            return { success: true, action: 'create', type: parsed.type };
        }

        if (choice === 'merge') {
            const target = await this.#showMergeSelector(parsed.type);
            if (!target) {
                return { success: false, cancelled: true };
            }
            await this.#mergeIntoItem(target, parsed);
            console.log('[ImportExportService] Markdown import: merged into existing', parsed.type);
            return { success: true, action: 'merge', type: parsed.type };
        }

        return { success: false, cancelled: true };
    }

    /**
     * Show import options dialog for markdown
     * @private
     */
    static #showMarkdownImportDialog(parsed) {
        return new Promise((resolve) => {
            const typeLabel = parsed.type === 'list' ? 'List' : 'Note';
            const detailText = parsed.type === 'list'
                ? `${parsed.todos.length} todo${parsed.todos.length === 1 ? '' : 's'}`
                : `${parsed.content.length} characters`;

            const dialog = document.createElement('dialog');
            dialog.className = 'dialog';
            dialog.innerHTML = `
                <div class="dialog-content">
                    <h3>Import Markdown ${typeLabel}</h3>
                    <p class="share-title">"${this.#escapeHtml(parsed.title)}"</p>
                    <div class="share-info">
                        <span class="share-expiry">${this.#escapeHtml(detailText)}</span>
                    </div>
                    <div class="share-options">
                        <button class="share-option-btn share-option-create" type="button">
                            <span class="share-option-icon">&#10133;</span>
                            <span class="share-option-label">Create New ${typeLabel}</span>
                            <span class="share-option-desc">Add as a new ${parsed.type === 'list' ? 'todo list' : 'note'}</span>
                        </button>
                        <button class="share-option-btn share-option-merge" type="button">
                            <span class="share-option-icon">&#128256;</span>
                            <span class="share-option-label">Merge Into Existing</span>
                            <span class="share-option-desc">Append to an existing ${parsed.type === 'list' ? 'list' : 'note'}</span>
                        </button>
                    </div>
                    <div class="share-actions">
                        <button class="btn btn-ghost" type="button">Cancel</button>
                    </div>
                </div>
            `;

            document.body.appendChild(dialog);
            dialog.showModal();

            const createBtn = dialog.querySelector('.share-option-create');
            const mergeBtn = dialog.querySelector('.share-option-merge');
            const cancelBtn = dialog.querySelector('.btn.btn-ghost');

            const cleanup = () => {
                dialog.close();
                document.body.removeChild(dialog);
            };

            createBtn.addEventListener('click', () => {
                cleanup();
                resolve('create');
            });

            mergeBtn.addEventListener('click', () => {
                cleanup();
                resolve('merge');
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

    /**
     * Show selector dialog for existing lists or notes to merge into
     * @private
     */
    static async #showMergeSelector(type) {
        const typeLabel = type === 'list' ? 'List' : 'Note';
        const items = type === 'list'
            ? await DBManager.getListMetadata()
            : await DBManager.getAllNotes();

        return new Promise((resolve) => {
            const dialog = document.createElement('dialog');
            dialog.className = 'dialog';

            if (items.length === 0) {
                dialog.innerHTML = `
                    <div class="dialog-content">
                        <h3>Merge Into Existing ${typeLabel}</h3>
                        <p class="share-title">No existing ${typeLabel.toLowerCase()}s found.</p>
                        <div class="share-actions">
                            <button class="btn btn-ghost" type="button">Close</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(dialog);
                dialog.showModal();

                const closeBtn = dialog.querySelector('.btn.btn-ghost');
                const cleanup = () => {
                    dialog.close();
                    document.body.removeChild(dialog);
                    resolve(null);
                };
                closeBtn.addEventListener('click', cleanup);
                dialog.addEventListener('click', (e) => {
                    if (e.target === dialog) cleanup();
                });
                return;
            }

            const itemListHtml = items.map((item, index) => {
                const name = type === 'list' ? item.name : (item.title || 'Untitled');
                return `
                    <button class="share-option-btn share-merge-item" type="button" data-id="${this.#escapeHtml(item.id)}">
                        <span class="share-option-label">${this.#escapeHtml(name)}</span>
                    </button>
                `;
            }).join('');

            dialog.innerHTML = `
                <div class="dialog-content">
                    <h3>Merge Into Existing ${typeLabel}</h3>
                    <p class="share-title">Choose a ${typeLabel.toLowerCase()} to append to:</p>
                    <div class="share-options">
                        ${itemListHtml}
                    </div>
                    <div class="share-actions">
                        <button class="btn btn-ghost" type="button">Cancel</button>
                    </div>
                </div>
            `;

            document.body.appendChild(dialog);
            dialog.showModal();

            const itemBtns = dialog.querySelectorAll('.share-merge-item');
            const cancelBtn = dialog.querySelector('.btn.btn-ghost');

            const cleanup = () => {
                dialog.close();
                document.body.removeChild(dialog);
            };

            itemBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const itemId = btn.dataset.id;
                    const selectedItem = items.find(i => i.id === itemId);
                    cleanup();
                    resolve(selectedItem || null);
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

    /**
     * Create a new note or list from parsed markdown
     * @private
     */
    static async #createFromMarkdown(parsed) {
        const now = new Date().toISOString();

        if (parsed.type === 'list') {
            const newList = await DBManager.createList({
                name: parsed.title,
                isDefault: false
            });

            const todos = parsed.todos.map((todo, index) => ({
                id: `todo-${Date.now()}-${index}`,
                text: todo.text,
                completed: todo.completed,
                createdAt: Date.now()
            }));

            newList.todos = todos;
            await DBManager.saveList(newList);
        } else {
            const noteId = `note-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            const note = {
                id: noteId,
                title: parsed.title,
                content: parsed.content,
                createdAt: now,
                updatedAt: now
            };
            await DBManager.saveNote(noteId, note);
        }
    }

    /**
     * Merge parsed markdown into an existing note or list
     * @private
     */
    static async #mergeIntoItem(target, parsed) {
        const now = new Date().toISOString();

        if (parsed.type === 'list') {
            const fullList = await DBManager.getList(target.id);
            if (!fullList) {
                throw new Error('Target list not found');
            }

            const existingCount = fullList.todos?.length || 0;
            const newTodos = parsed.todos.map((todo, index) => ({
                id: `todo-${Date.now()}-${index}`,
                text: todo.text,
                completed: todo.completed,
                createdAt: Date.now()
            }));

            fullList.todos = [...(fullList.todos || []), ...newTodos];
            fullList.updatedAt = Date.now();
            await DBManager.saveList(fullList);
        } else {
            const divider = '\n\n---\n\n';
            const newContent = (target.content || '') + divider + parsed.content;

            const updatedNote = {
                ...target,
                content: newContent,
                updatedAt: now
            };
            await DBManager.saveNote(target.id, updatedNote);
        }
    }

    // ============================================================================
    // PRIVATE HELPERS
    // ============================================================================

    /**
     * Create the export payload structure
     * @private
     */
    static #createExportPayload(scope, data) {
        return {
            version: EXPORT_VERSION,
            type: EXPORT_TYPE,
            scope: scope,
            exportId: `${crypto.randomUUID()}-${Date.now()}`,
            exportedAt: new Date().toISOString(),
            appVersion: this.#getAppVersion(),
            data: {
                items: data.items || []
            }
        };
    }

    /**
     * Generate filename for export
     * @private
     */
    static #generateFileName(type, name = '') {
        const date = new Date().toISOString().split('T')[0];
        const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);

        switch (type) {
            case 'backup':
                return `pockist-backup-${date}.json`;
            case 'note':
                return `pockist-note-${safeName || 'untitled'}-${date}.json`;
            case 'list':
                return `pockist-list-${safeName || 'untitled'}-${date}.json`;
            default:
                return `pockist-export-${date}.json`;
        }
    }

    /**
     * Get app version from manifest or default
     * @private
     */
    static #getAppVersion() {
        const manifestLink = document.querySelector('link[rel="manifest"]');
        if (manifestLink) {
            return '1.0.0';
        }
        return '1.0.0';
    }

    /**
     * Download JSON data as file
     * @private
     */
    static #downloadJSON(data, fileName) {
        return new Promise((resolve, reject) => {
            try {
                const json = JSON.stringify(data, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                URL.revokeObjectURL(url);
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Read file content as text
     * @private
     */
    static #readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    /**
     * Validate import data structure
     * @private
     */
    static #validateImport(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid file format');
        }

        if (data.type !== EXPORT_TYPE) {
            throw new Error(`Invalid file type. Expected "${EXPORT_TYPE}"`);
        }

        if (!data.version) {
            throw new Error('Missing version in export file');
        }

        if (!data.exportId) {
            throw new Error('Missing export ID in file');
        }

        if (!data.data || typeof data.data !== 'object') {
            throw new Error('Missing data in export file');
        }

        // Accept v2.0 (items) or v1.0 (notes/lists)
        const hasItems = Array.isArray(data.data.items);
        const hasLegacy = Array.isArray(data.data.notes) || Array.isArray(data.data.lists);

        if (!hasItems && !hasLegacy) {
            throw new Error('No importable data found');
        }

        if (data.version !== EXPORT_VERSION && data.version !== LEGACY_VERSION) {
            console.warn(`[ImportExportService] Importing from version: ${data.version}`);
        }

        const validScopes = ['full', 'note', 'list'];
        if (!validScopes.includes(data.scope)) {
            throw new Error(`Invalid scope: ${data.scope}`);
        }
    }

    /**
     * Check if this export has been imported before
     * @private
     */
    static async #checkDuplicate(exportId) {
        try {
            const existing = await DBManager.hasImportBeenProcessed(exportId);
            return existing;
        } catch (error) {
            console.warn('[ImportExportService] Could not check for duplicate:', error);
            return null;
        }
    }

    /**
     * Generate human-readable import summary for legacy v1.0
     * @private
     */
    static #generateImportSummary(data) {
        const parts = [];
        const notes = data.data.notes || [];
        const lists = data.data.lists || [];

        if (notes.length > 0) {
            parts.push(`• ${notes.length} note${notes.length === 1 ? '' : 's'}`);
        }

        if (lists.length > 0) {
            const totalTodos = lists.reduce((sum, list) => sum + (list.todos?.length || 0), 0);
            parts.push(`• ${lists.length} list${lists.length === 1 ? '' : 's'} (${totalTodos} todo${totalTodos === 1 ? '' : 's'})`);
        }

        return parts.join('\n') || '• No data found';
    }

    /**
     * Escape HTML for safe insertion into dialog content
     * @private
     */
    static #escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
