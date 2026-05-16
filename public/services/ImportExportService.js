/**
 * ImportExportService - Handles export and import of Pockist data
 * 
 * Supports:
 * - Full backup export (notes + lists)
 * - Individual note export
 * - Individual list export  
 * - Import with version checking and migration
 * - Duplicate detection via exportId tracking
 * 
 * File format:
 * {
 *   version: "1.0",
 *   type: "pockist-backup",
 *   scope: "full|note|list",
 *   exportId: "uuid-timestamp",
 *   exportedAt: "ISO-8601",
 *   appVersion: "1.x.x",
 *   data: { notes: [...], lists: [...] }
 * }
 */

import { DBManager } from './DBManager.js';
import { DialogService } from './DialogService.js';

const EXPORT_VERSION = '1.0';
const EXPORT_TYPE = 'pockist-backup';
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export class ImportExportService {
    
    // ============================================================================
    // EXPORT FUNCTIONS
    // ============================================================================
    
    /**
     * Export all data (notes and lists) as a full backup
     */
    static async exportAll() {
        console.log('[ImportExportService] exportAll() starting...');
        
        try {
            const [notes, lists] = await Promise.all([
                DBManager.getAllNotes(),
                DBManager.getLists()
            ]);
            
            const exportData = this.#createExportPayload('full', { notes, lists });
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
     * Export a specific note
     * @param {Object} note - The note object to export
     */
    static async exportNote(note) {
        console.log('[ImportExportService] exportNote() starting...');
        
        if (!note || !note.id) {
            throw new Error('Invalid note provided for export');
        }
        
        const exportData = this.#createExportPayload('note', { notes: [note] });
        const fileName = this.#generateFileName('note', note.title || 'untitled');
        
        await this.#downloadJSON(exportData, fileName);
        console.log('[ImportExportService] Note exported successfully');
        return { success: true, fileName };
    }
    
    /**
     * Export a specific todo list
     * @param {Object} list - The list object to export
     */
    static async exportList(list) {
        console.log('[ImportExportService] exportList() starting...');
        
        if (!list || !list.id) {
            throw new Error('Invalid list provided for export');
        }
        
        const exportData = this.#createExportPayload('list', { lists: [list] });
        const fileName = this.#generateFileName('list', list.name || 'untitled');
        
        await this.#downloadJSON(exportData, fileName);
        console.log('[ImportExportService] List exported successfully');
        return { success: true, fileName };
    }
    
    /**
     * Export a specific item as Markdown and trigger download
     * @param {Object} item - The note or list object
     * @param {string} type - 'note' or 'list'
     */
    static async exportMarkdown(item, type) {
        console.log('[ImportExportService] exportMarkdown() starting...');
        
        if (!item) {
            throw new Error(`Invalid ${type} provided for markdown export`);
        }
        
        const markdown = type === 'note'
            ? this.#noteToMarkdown(item)
            : this.#listToMarkdown(item);
        
        const fileName = type === 'note'
            ? this.#generateMarkdownFileName('note', item.title)
            : this.#generateMarkdownFileName('list', item.name);
        
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
     * Convert a note to Markdown format
     * @private
     */
    static #noteToMarkdown(note) {
        const title = note.title || 'Untitled Note';
        const body = note.content || note.text || '';
        const date = note.createdAt ? new Date(note.createdAt).toLocaleString() : '';
        
        let markdown = `# ${title}\n\n`;
        if (date) {
            markdown += `*Created: ${date}*\n\n`;
        }
        markdown += body;
        return markdown;
    }
    
    /**
     * Convert a todo list to Markdown format
     * @private
     */
    static #listToMarkdown(list) {
        const title = list.name || 'Untitled List';
        const todos = list.todos || [];
        const date = list.createdAt ? new Date(list.createdAt).toLocaleString() : '';
        
        let markdown = `# ${title}\n\n`;
        if (date) {
            markdown += `*Created: ${date}*\n\n`;
        }
        
        if (todos.length === 0) {
            markdown += '*No todos yet.*';
        } else {
            todos.forEach(todo => {
                const checkbox = todo.completed ? '[x]' : '[ ]';
                markdown += `- ${checkbox} ${todo.text}\n`;
            });
        }
        
        return markdown;
    }
    
    /**
     * Generate markdown filename for export
     * @private
     */
    static #generateMarkdownFileName(type, name = '') {
        const date = new Date().toISOString().split('T')[0];
        const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
        
        switch (type) {
            case 'note':
                return `${safeName || 'untitled'}-${date}.md`;
            case 'list':
                return `${safeName || 'untitled'}-list-${date}.md`;
            default:
                return `pockist-export-${date}.md`;
        }
    }
    
    // ============================================================================
    // IMPORT FUNCTIONS
    // ============================================================================
    
    /**
     * Import data from a file
     * @param {File} file - The file to import
     */
    static async importFromFile(file) {
        console.log('[ImportExportService] importFromFile() starting...');
        
        // Validate file size
        if (file.size > MAX_FILE_SIZE_BYTES) {
            throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`);
        }
        
        try {
            // Read file content
            const content = await this.#readFile(file);
            
            // Auto-detect markdown files
            if (file.name.toLowerCase().endsWith('.md')) {
                console.log('[ImportExportService] Detected markdown file');
                const parsed = this.#parseMarkdown(content);
                return await this.#importMarkdown(parsed, file.name);
            }
            
            // JSON import flow
            const data = JSON.parse(content);
            
            // Validate structure
            this.#validateImport(data);
            
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
            
            // Show confirmation dialog with summary
            const summary = this.#generateImportSummary(data);
            const shouldImport = await DialogService.confirm(
                `This backup contains:\n${summary}\n\nImport will merge with existing data. Conflicts will be renamed. Continue?`,
                'Import'
            );
            if (!shouldImport) {
                return { success: false, cancelled: true };
            }
            
            // Perform import
            const result = await this.#performImport(data);
            
            // Record import
            await DBManager.recordImport({
                id: data.exportId,
                importedAt: new Date().toISOString(),
                fileName: file.name,
                scope: data.scope,
                summary: result.summary
            });
            
            console.log('[ImportExportService] Import completed successfully');
            return { 
                success: true, 
                summary: result.summary,
                scope: data.scope 
            };
            
        } catch (error) {
            console.error('[ImportExportService] Import failed:', error);
            throw error;
        }
    }
    
    /**
     * Import data from a shared item (from ShareService)
     * @param {Object} sharePayload - The share payload matching pockist-backup format
     */
    static async importFromShare(sharePayload) {
        console.log('[ImportExportService] importFromShare() starting...');
        
        try {
            // Validate structure (similar to file import)
            this.#validateImport(sharePayload);
            
            // Perform import
            const result = await this.#performImport(sharePayload);
            
            // Record import (optional - could skip for shares)
            await DBManager.recordImport({
                id: sharePayload.exportId,
                importedAt: new Date().toISOString(),
                fileName: `shared-${sharePayload.exportId}`,
                scope: sharePayload.scope,
                summary: result.summary
            });
            
            console.log('[ImportExportService] Share import completed successfully');
            return { 
                success: true, 
                summary: result.summary,
                scope: sharePayload.scope 
            };
            
        } catch (error) {
            console.error('[ImportExportService] Share import failed:', error);
            throw error;
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
                notes: data.notes || [],
                lists: data.lists || []
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
        // Try to get from manifest
        const manifestLink = document.querySelector('link[rel="manifest"]');
        if (manifestLink) {
            // Could fetch manifest, but for now use simple version
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
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            reader.readAsText(file);
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
        
        // Extract title: first non-empty line, capped at 32 chars
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
        
        // Check for checkbox patterns to determine type
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
     * Show import options dialog for markdown (create new / merge / cancel)
     * @private
     */
    static #showMarkdownImportDialog(parsed) {
        return new Promise((resolve) => {
            const typeLabel = parsed.type === 'list' ? 'List' : 'Note';
            const detailText = parsed.type === 'list'
                ? `${parsed.todos.length} todo${parsed.todos.length === 1 ? '' : 's'}`
                : `${parsed.content.length} characters`;
            
            const dialog = document.createElement('dialog');
            dialog.className = 'share-dialog';
            dialog.innerHTML = `
                <div class="share-dialog-content">
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
                        <button class="share-cancel-btn" type="button">Cancel</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(dialog);
            dialog.showModal();
            
            const createBtn = dialog.querySelector('.share-option-create');
            const mergeBtn = dialog.querySelector('.share-option-merge');
            const cancelBtn = dialog.querySelector('.share-cancel-btn');
            
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
            dialog.className = 'share-dialog';
            
            if (items.length === 0) {
                dialog.innerHTML = `
                    <div class="share-dialog-content">
                        <h3>Merge Into Existing ${typeLabel}</h3>
                        <p class="share-title">No existing ${typeLabel.toLowerCase()}s found.</p>
                        <div class="share-actions">
                            <button class="share-cancel-btn" type="button">Close</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(dialog);
                dialog.showModal();
                
                const closeBtn = dialog.querySelector('.share-cancel-btn');
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
                const isFirst = index === 0;
                return `
                    <button class="share-option-btn share-merge-item" type="button" data-id="${this.#escapeHtml(item.id)}">
                        <span class="share-option-label">${this.#escapeHtml(name)}</span>
                    </button>
                `;
            }).join('');
            
            dialog.innerHTML = `
                <div class="share-dialog-content">
                    <h3>Merge Into Existing ${typeLabel}</h3>
                    <p class="share-title">Choose a ${typeLabel.toLowerCase()} to append to:</p>
                    <div class="share-options">
                        ${itemListHtml}
                    </div>
                    <div class="share-actions">
                        <button class="share-cancel-btn" type="button">Cancel</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(dialog);
            dialog.showModal();
            
            const itemBtns = dialog.querySelectorAll('.share-merge-item');
            const cancelBtn = dialog.querySelector('.share-cancel-btn');
            
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
            
            // Add parsed todos
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
            // Load full list to get todos array
            const fullList = await DBManager.getList(target.id);
            if (!fullList) {
                throw new Error('Target list not found');
            }
            
            // Append new todos at the bottom
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
            // For notes, append content with a divider
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
    
    /**
     * Escape HTML for safe insertion into dialog content
     * @private
     */
    static #escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // ============================================================================
    // END MARKDOWN IMPORT FUNCTIONS
    // ============================================================================
    
    /**
     * Validate import data structure
     * @private
     */
    static #validateImport(data) {
        // Check required fields
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
        
        // Version check - warn but allow older versions
        if (data.version !== EXPORT_VERSION) {
            console.warn(`[ImportExportService] Importing from older version: ${data.version}`);
            // Could add migration logic here for future versions
        }
        
        // Validate scope
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
            return null; // Allow import if check fails
        }
    }
    
    /**
     * Generate human-readable import summary
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
     * Perform the actual import
     * @private
     */
    static async #performImport(data) {
        const notes = data.data.notes || [];
        const lists = data.data.lists || [];
        
        let notesImported = 0;
        let listsImported = 0;
        let todosImported = 0;
        
        // Get existing data for conflict checking
        const [existingNotes, existingLists] = await Promise.all([
            DBManager.getAllNotes(),
            DBManager.getLists()
        ]);
        
        const existingNoteIds = new Set(existingNotes.map(n => n.id));
        const existingListIds = new Set(existingLists.map(l => l.id));
        
        // Import notes
        for (const note of notes) {
            if (!note || !note.id) continue;
            
            let noteToSave = { ...note };
            
            // Handle conflict: rename imported note
            if (existingNoteIds.has(note.id)) {
                const newId = `${note.id}-imported-${Date.now()}`;
                noteToSave.id = newId;
                noteToSave.title = `${note.title || 'Note'} (Imported)`;
                console.log(`[ImportExportService] Note ${note.id} renamed to ${newId}`);
            }
            
            await DBManager.saveNote(noteToSave.id, noteToSave);
            notesImported++;
        }
        
        // Import lists
        if (lists.length > 0) {
            let updatedLists = [...existingLists];
            
            for (const list of lists) {
                if (!list || !list.id) continue;
                
                let listToSave = { ...list };
                
                // Handle conflict: rename imported list
                if (existingListIds.has(list.id)) {
                    listToSave.id = `${list.id}-imported-${Date.now()}`;
                    listToSave.name = `${list.name || 'List'} (Imported)`;
                    console.log(`[ImportExportService] List ${list.id} renamed to ${listToSave.id}`);
                }
                
                // Ensure todos have proper structure
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
}
