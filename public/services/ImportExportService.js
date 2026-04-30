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
            // Read and parse file
            const content = await this.#readFile(file);
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
