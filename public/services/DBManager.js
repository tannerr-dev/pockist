/**
 * DBManager - Centralized IndexedDB manager for Pockist applications
 * 
 * This service provides a shared database connection that can be used
 * by multiple mini-apps (notes, todos, etc.) while keeping their data
 * in separate object stores.
 * 
 * Current structure:
 * - Database: pockist-db
 * - Version: 2 (incremented from 1 to fix missing object store issue)
 * - Object Stores:
 *   - notes: Stores note content with id as keyPath
 * 
 * Future expansion:
 * - Additional object stores can be added by incrementing DB_VERSION
 *   and adding creation logic in the #openDB method's onupgradeneeded handler.
 */

/**
 * Database configuration constants.
 * These define the database name, version, and object store names.
 * 
 * IMPORTANT: When adding new object stores in the future:
 * 1. Increment DB_VERSION
 * 2. Add the new store name to the config
 * 3. Add creation logic in #openDB's onupgradeneeded handler
 */
const DB_CONFIG = {
    // The shared database name used by all Pockist mini-apps
    NAME: 'pockist-db',

    // Current database version. Incremented to 4 to add lists object store.
    // Increment this when adding new object stores or changing structures.
    VERSION: 4,

    // Object store names - each mini-app should have its own store
    STORES: {
        NOTES: 'notes',
        LISTS: 'lists',
    }
};

/**
 * OLD_DB_CONFIG - Configuration for the legacy database
 * This is used during the temporary migration period.
 */
const OLD_DB_CONFIG = {
    NAME: 'textAreaDB',
    STORE: 'textAreaStore',
    RECORD_KEY: 'singleRecord'
};

/**
 * DBManager class - Centralized IndexedDB management
 * 
 * Usage:
 *   import { DBManager } from './services/DBManager.js';
 *   await DBManager.init();
 *   const note = await DBManager.getNote(1);
 *   await DBManager.saveNote(1, "My note content");
 */
export class DBManager {
    // Private static property to hold the database connection
    static #db = null;

    /**
     * Initialize the database connection.
     * This must be called before any other DB operations.
     * It's safe to call multiple times - subsequent calls will return
     * the existing connection.
     * 
     * @returns {Promise<IDBDatabase>} The database connection
     */
    static async init() {
        if (this.#db) {
            return this.#db;
        }
        return this.#openDB();
    }

    /**
     * Get a note from the database by its ID.
     * 
     * @param {number} id - The note ID
     * @returns {Promise<Object|null>} The note object {id, content, updatedAt} or null if not found
     */
    static async getNote(id) {
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.NOTES)) {
                reject(new Error('Notes object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.NOTES], 'readonly');
            const store = transaction.objectStore(DB_CONFIG.STORES.NOTES);
            const request = store.get(id);

            request.onsuccess = () => {
                resolve(request.result || null);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Save a note to the database.
     * If a note with the same ID exists, it will be overwritten.
     *
     * @param {number|string} id - The note ID
     * @param {string|Object} content - The note content text OR a full note object
     * @returns {Promise<void>}
     */
    static async saveNote(id, content) {
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.NOTES)) {
                reject(new Error('Notes object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.NOTES], 'readwrite');
            const store = transaction.objectStore(DB_CONFIG.STORES.NOTES);

            let note;
            if (typeof content === 'object' && content !== null && content.id) {
                // Full note object passed - use it directly, just update updatedAt
                note = {
                    ...content,
                    updatedAt: new Date().toISOString()
                };
            } else {
                // Legacy string content - wrap it (or content is null/undefined)
                note = {
                    id: id,
                    content: String(content || ''),
                    updatedAt: new Date().toISOString()
                };
            }

            const request = store.put(note);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Get all notes from the database.
     * 
     * @returns {Promise<Array>} Array of note objects
     */
    static async getAllNotes() {
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.NOTES)) {
                reject(new Error('Notes object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.NOTES], 'readonly');
            const store = transaction.objectStore(DB_CONFIG.STORES.NOTES);
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Delete a note from the database.
     *
     * @param {number} id - The note ID to delete
     * @returns {Promise<void>}
     */
    static async deleteNote(id) {
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.NOTES)) {
                reject(new Error('Notes object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.NOTES], 'readwrite');
            const store = transaction.objectStore(DB_CONFIG.STORES.NOTES);
            const request = store.delete(id);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    // ============================================================================
    // LISTS METHODS
    // Methods for managing todo lists in the lists object store
    // ============================================================================

    /**
     * Get all lists from the database.
     *
     * @returns {Promise<Array>} Array of list objects
     */
    static async getLists() {
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS)) {
                reject(new Error('Lists object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.LISTS], 'readonly');
            const store = transaction.objectStore(DB_CONFIG.STORES.LISTS);
            const request = store.get('todoLists');

            request.onsuccess = () => {
                resolve(request.result || []);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Save lists to the database.
     *
     * @param {Array} lists - Array of list objects to save
     * @returns {Promise<void>}
     */
    static async saveLists(lists) {
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS)) {
                reject(new Error('Lists object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.LISTS], 'readwrite');
            const store = transaction.objectStore(DB_CONFIG.STORES.LISTS);
            const request = store.put(lists, 'todoLists');

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    // ============================================================================
    // TODODB MIGRATION
    // Migrates data from old 'TodoDB' to 'pockist-db' lists store
    // ============================================================================

    /**
     * Configuration for the old TodoDB database
     */
    static #TODO_DB_CONFIG = {
        NAME: 'TodoDB',
        STORE: 'todos',
        KEY: 'todoLists'
    };

    /**
     * Migrate data from old TodoDB to pockist-db.
     * Only runs if TodoDB exists and migration hasn't been completed.
     * Deletes TodoDB after successful migration.
     *
     * @returns {Promise<boolean>} true if migration was performed
     */
    static async migrateFromTodoDB() {
        if (localStorage.getItem('todoDBMigrationComplete') === 'true') {
            return false;
        }

        try {
            const oldData = await this.#readFromTodoDB();

            if (!oldData) {
                localStorage.setItem('todoDBMigrationComplete', 'true');
                return false;
            }

            await this.init();

            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS)) {
                throw new Error('Lists store not found');
            }

            // Save the migrated data to the new location
            await this.saveLists(oldData);
            console.log('TodoDB data migrated to pockist-db/lists');

            // Delete the old database
            await this.#deleteTodoDB();
            console.log('Old TodoDB deleted');

            localStorage.setItem('todoDBMigrationComplete', 'true');
            return true;

        } catch (error) {
            console.error('TodoDB migration failed:', error);
            return false;
        }
    }

    /**
     * Read data from old TodoDB
     * @private
     * @returns {Promise<Array|null>} The lists data or null if not found
     */
    static #readFromTodoDB() {
        return new Promise((resolve) => {
            try {
                const request = indexedDB.open(this.#TODO_DB_CONFIG.NAME);

                request.onsuccess = (event) => {
                    const db = event.target.result;

                    try {
                        if (!db.objectStoreNames.contains(this.#TODO_DB_CONFIG.STORE)) {
                            db.close();
                            resolve(null);
                            return;
                        }

                        const transaction = db.transaction([this.#TODO_DB_CONFIG.STORE], 'readonly');
                        const store = transaction.objectStore(this.#TODO_DB_CONFIG.STORE);
                        const getRequest = store.get(this.#TODO_DB_CONFIG.KEY);

                        getRequest.onsuccess = () => {
                            db.close();
                            resolve(getRequest.result || null);
                        };

                        getRequest.onerror = () => {
                            db.close();
                            resolve(null);
                        };
                    } catch (error) {
                        db.close();
                        resolve(null);
                    }
                };

                request.onerror = () => {
                    resolve(null);
                };

                request.onupgradeneeded = () => {
                    // This means the DB didn't exist before, so no migration needed
                    try {
                        request.transaction.abort();
                    } catch (e) {}
                    resolve(null);
                };
            } catch (error) {
                resolve(null);
            }
        });
    }

    /**
     * Delete the old TodoDB database
     * @private
     * @returns {Promise<void>}
     */
    static #deleteTodoDB() {
        return new Promise((resolve) => {
            const request = indexedDB.deleteDatabase(this.#TODO_DB_CONFIG.NAME);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                resolve();
            };

            request.onblocked = () => {
                resolve();
            };
        });
    }
    // ============================================================================
    // END OF TODODB MIGRATION
    // ============================================================================

    /**
     * Private method to open/create the IndexedDB database.
     * @private
     * @returns {Promise<IDBDatabase>} The database connection
     */
    static #openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_CONFIG.NAME, DB_CONFIG.VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains(DB_CONFIG.STORES.NOTES)) {
                    db.createObjectStore(DB_CONFIG.STORES.NOTES, { 
                        keyPath: 'id' 
                    });
                }

                if (!db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS)) {
                    db.createObjectStore(DB_CONFIG.STORES.LISTS);
                }
            };

            request.onsuccess = (event) => {
                this.#db = event.target.result;
                resolve(this.#db);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };

            request.onblocked = () => {
                reject(new Error('Database upgrade blocked'));
            };
        });
    }

    // ============================================================================
    // TEMPORARY MIGRATION CODE
    // This migrates data from old 'textAreaDB' to new 'pockist-db'.
    // Remove this section after sufficient time has passed.
    // ============================================================================

    /**
     * Migrate data from the old database to the new one.
     * Only marks migration as complete after successful migration.
     * @returns {Promise<boolean>} true if migration was performed
     */
    static async migrateFromOldDB() {
        if (localStorage.getItem('migrationComplete') === 'true') {
            return false;
        }

        try {
            const oldDBExists = await this.#checkOldDBExists();
            
            if (!oldDBExists) {
                localStorage.setItem('migrationComplete', 'true');
                return false;
            }

            const oldData = await this.#readFromOldDB();
            
            await this.init();
            
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.NOTES)) {
                throw new Error('Notes store not found');
            }

            if (oldData !== null && oldData !== undefined && oldData !== '') {
                await this.saveNote(1, oldData);
            }

            await this.#deleteOldDB();
            localStorage.setItem('migrationComplete', 'true');
            
            return true;

        } catch (error) {
            console.error('Migration failed:', error);
            return false;
        }
    }

    static #checkOldDBExists() {
        return new Promise((resolve) => {
            if (indexedDB.databases) {
                indexedDB.databases().then(databases => {
                    const exists = databases.some(db => db.name === OLD_DB_CONFIG.NAME);
                    resolve(exists);
                }).catch(() => {
                    resolve(this.#tryOpenOldDB());
                });
            } else {
                resolve(this.#tryOpenOldDB());
            }
        });
    }

    static #tryOpenOldDB() {
        return new Promise((resolve) => {
            try {
                const request = indexedDB.open(OLD_DB_CONFIG.NAME);
                
                request.onsuccess = () => {
                    request.result.close();
                    resolve(true);
                };
                
                request.onerror = () => {
                    resolve(false);
                };
                
                request.onupgradeneeded = () => {
                    try {
                        request.transaction.abort();
                    } catch (e) {}
                    resolve(false);
                };
            } catch (error) {
                resolve(false);
            }
        });
    }

    static #readFromOldDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(OLD_DB_CONFIG.NAME);

            request.onsuccess = (event) => {
                const db = event.target.result;
                
                try {
                    if (!db.objectStoreNames.contains(OLD_DB_CONFIG.STORE)) {
                        db.close();
                        resolve(null);
                        return;
                    }

                    const transaction = db.transaction([OLD_DB_CONFIG.STORE], 'readonly');
                    const store = transaction.objectStore(OLD_DB_CONFIG.STORE);
                    const getRequest = store.get(OLD_DB_CONFIG.RECORD_KEY);

                    getRequest.onsuccess = () => {
                        db.close();
                        
                        if (getRequest.result && typeof getRequest.result.value !== 'undefined') {
                            resolve(getRequest.result.value);
                        } else {
                            resolve(null);
                        }
                    };

                    getRequest.onerror = () => {
                        db.close();
                        reject(getRequest.error);
                    };
                } catch (error) {
                    db.close();
                    reject(error);
                }
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    static #deleteOldDB() {
        return new Promise((resolve) => {
            const request = indexedDB.deleteDatabase(OLD_DB_CONFIG.NAME);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                resolve();
            };

            request.onblocked = () => {
                resolve();
            };
        });
    }
    // ============================================================================
    // END OF TEMPORARY MIGRATION CODE
    // ============================================================================

    // ============================================================================
    // MULTI-NOTE MIGRATION (v2 to v3)
    // Migrates old-format notes (numeric ID, no title) to new multi-note format
    // ============================================================================

    /**
     * Migrate notes from old single-note format to new multi-note format.
     * Old format: { id: 1, content: "...", updatedAt: "..." }
     * New format: { id: "timestamp-slug", title: "...", content: "...", createdAt: "...", updatedAt: "..." }
     * @returns {Promise<boolean>} true if migration was performed
     */
    static async migrateToMultiNoteFormat() {
        // Check if migration was already completed - but re-run if DB version changed
        const currentVersion = DB_CONFIG.VERSION.toString();
        const lastMigratedVersion = localStorage.getItem('multiNoteMigrationVersion');

        if (localStorage.getItem('multiNoteMigrationComplete') === 'true' && lastMigratedVersion === currentVersion) {
            return false;
        }

        try {
            await this.init();

            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.NOTES)) {
                localStorage.setItem('multiNoteMigrationComplete', 'true');
                localStorage.setItem('multiNoteMigrationVersion', currentVersion);
                return false;
            }

            // Get all notes
            const allNotes = await this.getAllNotes();

            // Find notes with numeric IDs (old format) OR notes with invalid string content
            const oldFormatNotes = allNotes.filter(note => {
                // Numeric ID is old format
                if (typeof note.id === 'number') return true;
                // Also check if content is not a string (corrupted data)
                if (note.content && typeof note.content !== 'string') return true;
                return false;
            });

            if (oldFormatNotes.length === 0) {
                // No old-format notes to migrate
                localStorage.setItem('multiNoteMigrationComplete', 'true');
                localStorage.setItem('multiNoteMigrationVersion', currentVersion);
                return false;
            }

            console.log(`Migrating ${oldFormatNotes.length} old-format note(s) to multi-note format...`);

            // Migrate each old-format note
            for (const oldNote of oldFormatNotes) {
                await this.#migrateSingleNote(oldNote);
            }

            console.log('Multi-note migration completed successfully');
            localStorage.setItem('multiNoteMigrationComplete', 'true');
            localStorage.setItem('multiNoteMigrationVersion', currentVersion);
            return true;

        } catch (error) {
            console.error('Multi-note migration failed:', error);
            return false;
        }
    }

    /**
     * Migrate a single old-format note to new format
     * @private
     * @param {Object} oldNote - The old-format note
     */
    static async #migrateSingleNote(oldNote) {
        // Handle case where content might be stored as an object instead of string
        let content = oldNote.content || '';
        if (typeof content === 'object' && content !== null) {
            // If content is an object, it might be a nested note - extract the actual content
            content = content.content || '';
        }
        content = String(content);

        const timestamp = oldNote.updatedAt || oldNote.createdAt || new Date().toISOString();

        // Generate new ID
        const newId = this.#generateNoteId(content, timestamp);

        // Extract title from first 20 chars of content
        const title = this.#extractTitle(content);

        // Create new-format note
        const newNote = {
            id: newId,
            title: title,
            content: content,
            createdAt: timestamp,
            updatedAt: timestamp
        };

        // Save new note using raw IndexedDB put to avoid saveNote's wrapping
        await this.#rawSaveNote(newNote);

        // Delete old note
        await this.deleteNote(oldNote.id);

        console.log(`Migrated note ${oldNote.id} -> ${newId}`);
    }

    /**
     * Raw save - saves note object directly without wrapping
     * @private
     * @param {Object} note - The complete note object to save
     */
    static async #rawSaveNote(note) {
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.NOTES)) {
                reject(new Error('Notes object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.NOTES], 'readwrite');
            const store = transaction.objectStore(DB_CONFIG.STORES.NOTES);

            const request = store.put(note);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Generate a note ID from timestamp and content
     * @private
     * @param {string} content - Note content
     * @param {string} timestamp - ISO timestamp string
     * @returns {string} The generated ID
     */
    static #generateNoteId(content, timestamp) {
        const date = new Date(timestamp);
        const dateStr = date.getFullYear().toString() +
            String(date.getMonth() + 1).padStart(2, '0') +
            String(date.getDate()).padStart(2, '0') +
            String(date.getHours()).padStart(2, '0') +
            String(date.getMinutes()).padStart(2, '0') +
            String(date.getSeconds()).padStart(2, '0');

        const text = content || 'untitled';
        const slug = text
            .slice(0, 20)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        return `${dateStr}-${slug || 'note'}`;
    }

    /**
     * Extract title from content (first 20 chars)
     * @private
     * @param {string} content - Note content
     * @returns {string} The extracted title
     */
    static #extractTitle(content) {
        if (!content) return 'Untitled';
        const firstLine = content.split('\n')[0].trim();
        return firstLine.slice(0, 20) || 'Untitled';
    }
    // ============================================================================
    // END OF MULTI-NOTE MIGRATION
    // ============================================================================

    // ============================================================================
    // DATA REPAIR MIGRATION
    // Fixes notes corrupted by the saveNote() bug where content was double-wrapped
    // ============================================================================

    /**
     * Repair corrupted notes where content is stored as an object instead of string.
     * This happened when saveNote() was called with a full note object but wrapped it again.
     * @returns {Promise<boolean>} true if any notes were repaired
     */
    static async repairCorruptedNotes() {
        // Only run repair once per session
        if (localStorage.getItem('notesRepairComplete') === 'true') {
            return false;
        }

        try {
            await this.init();

            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.NOTES)) {
                localStorage.setItem('notesRepairComplete', 'true');
                return false;
            }

            const allNotes = await this.getAllNotes();
            let fixedCount = 0;

            for (const note of allNotes) {
                // Check if content is an object (corrupted by double-wrapping)
                if (note.content && typeof note.content === 'object') {
                    const fixedNote = {
                        id: note.id,
                        title: note.content.title || note.title || 'Untitled',
                        content: note.content.content || '',
                        createdAt: note.content.createdAt || note.createdAt || new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };
                    await this.#rawSaveNote(fixedNote);
                    fixedCount++;
                }
            }

            if (fixedCount > 0) {
                console.log(`Repaired ${fixedCount} corrupted note(s)`);
            }

            localStorage.setItem('notesRepairComplete', 'true');
            return fixedCount > 0;

        } catch (error) {
            console.error('Notes repair failed:', error);
            return false;
        }
    }

    /**
     * Force repair of corrupted notes (for debugging/testing)
     * Clears the repair flag and runs repair again
     */
    static async forceRepairCorruptedNotes() {
        localStorage.removeItem('notesRepairComplete');
        return this.repairCorruptedNotes();
    }
    // ============================================================================
    // END OF DATA REPAIR MIGRATION
    // ============================================================================
}
