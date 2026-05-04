/**
 * DBManager - Centralized IndexedDB manager for Pockist applications
 * 
 * This service provides a shared database connection that can be used
 * by multiple mini-apps (notes, todos, etc.) while keeping their data
 * in separate object stores.
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
    NAME: 'pockist-db',
    VERSION: 6,
    // Object store names - each mini-app should have its own store
    STORES: {
        NOTES: 'notes',
        LISTS: 'lists',
        IMPORTS: 'imports',
        DELETION_TOKENS: 'deletionTokens',
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
        console.log('[DBManager] init() called');
        if (this.#db) {
            console.log('[DBManager] Using existing database connection');
            return this.#db;
        }
        console.log('[DBManager] Opening database...');
        return this.#openDB();
    }

    /**
     * Get a note from the database by its ID.
     * 
     * @param {number} id - The note ID
     * @returns {Promise<Object|null>} The note object {id, content, updatedAt} or null if not found
     */
    static async getNote(id) {
        console.log(`[DBManager] getNote(${id}) called`);
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.NOTES)) {
                console.error('[DBManager] Notes object store not found');
                reject(new Error('Notes object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.NOTES], 'readonly');
            const store = transaction.objectStore(DB_CONFIG.STORES.NOTES);
            const request = store.get(id);

            request.onsuccess = () => {
                console.log(`[DBManager] getNote(${id}) success:`, request.result);
                resolve(request.result || null);
            };

            request.onerror = () => {
                console.error(`[DBManager] getNote(${id}) error:`, request.error);
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
        console.log(`[DBManager] saveNote(${id}) called`);
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.NOTES)) {
                console.error('[DBManager] Notes object store not found');
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
                console.log(`[DBManager] saveNote(${id}) success`);
                resolve();
            };

            request.onerror = () => {
                console.error(`[DBManager] saveNote(${id}) error:`, request.error);
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
        console.log('[DBManager] getAllNotes() called');
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.NOTES)) {
                console.error('[DBManager] Notes object store not found');
                reject(new Error('Notes object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.NOTES], 'readonly');
            const store = transaction.objectStore(DB_CONFIG.STORES.NOTES);
            const request = store.getAll();

            request.onsuccess = () => {
                console.log(`[DBManager] getAllNotes() success, found ${request.result.length} notes`);
                resolve(request.result);
            };

            request.onerror = () => {
                console.error('[DBManager] getAllNotes() error:', request.error);
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
        console.log(`[DBManager] deleteNote(${id}) called`);
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.NOTES)) {
                console.error('[DBManager] Notes object store not found');
                reject(new Error('Notes object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.NOTES], 'readwrite');
            const store = transaction.objectStore(DB_CONFIG.STORES.NOTES);
            const request = store.delete(id);

            request.onsuccess = () => {
                console.log(`[DBManager] deleteNote(${id}) success`);
                resolve();
            };

            request.onerror = () => {
                console.error(`[DBManager] deleteNote(${id}) error:`, request.error);
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
        console.log('[DBManager] getLists() called');
        await this.init();

        return new Promise((resolve, reject) => {
            console.log('[DBManager] Checking if lists store exists:', this.#db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS));
            console.log('[DBManager] Available stores:', Array.from(this.#db.objectStoreNames));
            
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS)) {
                console.error('[DBManager] Lists object store not found');
                reject(new Error('Lists object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.LISTS], 'readonly');
            const store = transaction.objectStore(DB_CONFIG.STORES.LISTS);
            const request = store.get('todoLists');

            request.onsuccess = () => {
                console.log('[DBManager] getLists() success:', request.result);
                resolve(request.result || []);
            };

            request.onerror = () => {
                console.error('[DBManager] getLists() error:', request.error);
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
        console.log('[DBManager] saveLists() called with', lists.length, 'lists');
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS)) {
                console.error('[DBManager] Lists object store not found');
                reject(new Error('Lists object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.LISTS], 'readwrite');
            const store = transaction.objectStore(DB_CONFIG.STORES.LISTS);
            const request = store.put(lists, 'todoLists');

            request.onsuccess = () => {
                console.log('[DBManager] saveLists() success');
                resolve();
            };

            request.onerror = () => {
                console.error('[DBManager] saveLists() error:', request.error);
                reject(request.error);
            };
        });
    }

    // ============================================================================
    // IMPORT TRACKING METHODS
    // Tracks imports to prevent accidental duplicate imports
    // ============================================================================

    /**
     * Check if an import with the given exportId has already been processed
     * @param {string} exportId - The exportId from the import file
     * @returns {Promise<Object|null>} The import record if found, null otherwise
     */
    static async hasImportBeenProcessed(exportId) {
        console.log(`[DBManager] hasImportBeenProcessed(${exportId}) called`);
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.IMPORTS)) {
                console.error('[DBManager] Imports object store not found');
                reject(new Error('Imports object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.IMPORTS], 'readonly');
            const store = transaction.objectStore(DB_CONFIG.STORES.IMPORTS);
            const request = store.get(exportId);

            request.onsuccess = () => {
                console.log(`[DBManager] hasImportBeenProcessed(${exportId}) success:`, request.result ? 'found' : 'not found');
                resolve(request.result || null);
            };

            request.onerror = () => {
                console.error(`[DBManager] hasImportBeenProcessed(${exportId}) error:`, request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Record an import in the database
     * @param {Object} importRecord - The import record to save
     * @param {string} importRecord.id - The exportId from the imported file
     * @param {string} importRecord.importedAt - ISO timestamp of when imported
     * @param {string} importRecord.fileName - Original filename
     * @param {string} importRecord.scope - 'full', 'note', or 'list'
     * @param {Object} importRecord.summary - Summary of what was imported
     */
    static async recordImport(importRecord) {
        console.log(`[DBManager] recordImport(${importRecord.id}) called`);
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.IMPORTS)) {
                console.error('[DBManager] Imports object store not found');
                reject(new Error('Imports object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.IMPORTS], 'readwrite');
            const store = transaction.objectStore(DB_CONFIG.STORES.IMPORTS);
            const request = store.put(importRecord);

            request.onsuccess = () => {
                console.log(`[DBManager] recordImport(${importRecord.id}) success`);
                resolve();
            };

            request.onerror = () => {
                console.error(`[DBManager] recordImport(${importRecord.id}) error:`, request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Get all import history (for future use)
     * @returns {Promise<Array>} Array of import records
     */
    static async getImportHistory() {
        console.log('[DBManager] getImportHistory() called');
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.IMPORTS)) {
                console.error('[DBManager] Imports object store not found');
                reject(new Error('Imports object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.IMPORTS], 'readonly');
            const store = transaction.objectStore(DB_CONFIG.STORES.IMPORTS);
            const request = store.getAll();

            request.onsuccess = () => {
                console.log(`[DBManager] getImportHistory() success, found ${request.result.length} records`);
                resolve(request.result);
            };

            request.onerror = () => {
                console.error('[DBManager] getImportHistory() error:', request.error);
                reject(request.error);
            };
        });
    }

    // ============================================================================
    // END OF IMPORT TRACKING METHODS
    // ============================================================================

    // ============================================================================
    // DELETION TOKEN METHODS (for share functionality)
    // ============================================================================

    /**
     * Save a deletion token for a share
     * @param {string} shareId - The share ID
     * @param {string} token - The deletion token
     * @param {string} expiresAt - ISO timestamp when share expires
     * @returns {Promise<void>}
     */
    static async saveDeletionToken(shareId, token, expiresAt) {
        console.log(`[DBManager] saveDeletionToken(${shareId}) called`);
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.DELETION_TOKENS)) {
                console.error('[DBManager] DeletionTokens object store not found');
                reject(new Error('DeletionTokens object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.DELETION_TOKENS], 'readwrite');
            const store = transaction.objectStore(DB_CONFIG.STORES.DELETION_TOKENS);

            const record = {
                id: shareId,
                token: token,
                expiresAt: expiresAt,
                createdAt: new Date().toISOString()
            };

            const request = store.put(record);

            request.onsuccess = () => {
                console.log(`[DBManager] saveDeletionToken(${shareId}) success`);
                resolve();
            };

            request.onerror = () => {
                console.error(`[DBManager] saveDeletionToken(${shareId}) error:`, request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Get a deletion token for a share
     * @param {string} shareId - The share ID
     * @returns {Promise<string|null>} The deletion token or null if not found
     */
    static async getDeletionToken(shareId) {
        console.log(`[DBManager] getDeletionToken(${shareId}) called`);
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.DELETION_TOKENS)) {
                console.error('[DBManager] DeletionTokens object store not found');
                reject(new Error('DeletionTokens object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.DELETION_TOKENS], 'readonly');
            const store = transaction.objectStore(DB_CONFIG.STORES.DELETION_TOKENS);
            const request = store.get(shareId);

            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    // Check if expired
                    const expiresAt = new Date(result.expiresAt);
                    if (expiresAt < new Date()) {
                        console.log(`[DBManager] getDeletionToken(${shareId}) found but expired`);
                        // Clean up expired token
                        this.deleteDeletionToken(shareId);
                        resolve(null);
                    } else {
                        console.log(`[DBManager] getDeletionToken(${shareId}) success`);
                        resolve(result.token);
                    }
                } else {
                    console.log(`[DBManager] getDeletionToken(${shareId}) not found`);
                    resolve(null);
                }
            };

            request.onerror = () => {
                console.error(`[DBManager] getDeletionToken(${shareId}) error:`, request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Delete a deletion token
     * @param {string} shareId - The share ID
     * @returns {Promise<void>}
     */
    static async deleteDeletionToken(shareId) {
        console.log(`[DBManager] deleteDeletionToken(${shareId}) called`);
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.DELETION_TOKENS)) {
                console.error('[DBManager] DeletionTokens object store not found');
                reject(new Error('DeletionTokens object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.DELETION_TOKENS], 'readwrite');
            const store = transaction.objectStore(DB_CONFIG.STORES.DELETION_TOKENS);
            const request = store.delete(shareId);

            request.onsuccess = () => {
                console.log(`[DBManager] deleteDeletionToken(${shareId}) success`);
                resolve();
            };

            request.onerror = () => {
                console.error(`[DBManager] deleteDeletionToken(${shareId}) error:`, request.error);
                reject(request.error);
            };
        });
    }

    // ============================================================================
    // END OF DELETION TOKEN METHODS
    // ============================================================================

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
        console.log('[DBManager] migrateFromTodoDB() starting...');
        
        if (localStorage.getItem('todoDBMigrationComplete') === 'true') {
            console.log('[DBManager] TodoDB migration already complete, skipping');
            return false;
        }

        try {
            console.log('[DBManager] Checking for old TodoDB...');
            const oldData = await this.#readFromTodoDB();

            if (!oldData) {
                console.log('[DBManager] No old TodoDB data found, marking migration complete');
                localStorage.setItem('todoDBMigrationComplete', 'true');
                return false;
            }

            console.log('[DBManager] Found old TodoDB data:', oldData);
            console.log('[DBManager] Initializing pockist-db...');
            await this.init();
            
            console.log('[DBManager] Checking if lists store exists...');
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS)) {
                console.error('[DBManager] Lists store not found in pockist-db!');
                throw new Error('Lists store not found');
            }

            // Save the migrated data to the new location
            console.log('[DBManager] Saving migrated data to pockist-db/lists...');
            await this.saveLists(oldData);
            console.log('[DBManager] TodoDB data migrated to pockist-db/lists successfully');

            // Delete the old database
            console.log('[DBManager] Deleting old TodoDB...');
            await this.#deleteTodoDB();
            console.log('[DBManager] Old TodoDB deleted successfully');

            localStorage.setItem('todoDBMigrationComplete', 'true');
            console.log('[DBManager] TodoDB migration completed and marked');
            return true;

        } catch (error) {
            console.error('[DBManager] TodoDB migration failed:', error);
            console.error('[DBManager] Error stack:', error.stack);
            throw error; // Re-throw so caller knows migration failed
        }
    }

    /**
     * Read data from old TodoDB
     * @private
     * @returns {Promise<Array|null>} The lists data or null if not found
     */
    static #readFromTodoDB() {
        return new Promise((resolve) => {
            console.log('[DBManager] #readFromTodoDB() opening TodoDB...');
            try {
                const request = indexedDB.open(this.#TODO_DB_CONFIG.NAME);

                request.onsuccess = (event) => {
                    const db = event.target.result;
                    console.log('[DBManager] TodoDB opened successfully, version:', db.version);

                    try {
                        if (!db.objectStoreNames.contains(this.#TODO_DB_CONFIG.STORE)) {
                            console.log('[DBManager] TodoDB store not found, closing');
                            db.close();
                            resolve(null);
                            return;
                        }

                        const transaction = db.transaction([this.#TODO_DB_CONFIG.STORE], 'readonly');
                        const store = transaction.objectStore(this.#TODO_DB_CONFIG.STORE);
                        const getRequest = store.get(this.#TODO_DB_CONFIG.KEY);

                        getRequest.onsuccess = () => {
                            console.log('[DBManager] TodoDB data read:', getRequest.result);
                            db.close();
                            resolve(getRequest.result || null);
                        };

                        getRequest.onerror = () => {
                            console.error('[DBManager] Error reading TodoDB:', getRequest.error);
                            db.close();
                            resolve(null);
                        };
                    } catch (error) {
                        console.error('[DBManager] Exception reading TodoDB:', error);
                        db.close();
                        resolve(null);
                    }
                };

                request.onerror = () => {
                    console.log('[DBManager] TodoDB open failed (probably does not exist)');
                    resolve(null);
                };

                request.onupgradeneeded = () => {
                    // This means the DB didn't exist before, so no migration needed
                    console.log('[DBManager] TodoDB onupgradeneeded - DB does not exist');
                    try {
                        request.transaction.abort();
                    } catch (e) {}
                    resolve(null);
                };
            } catch (error) {
                console.error('[DBManager] Exception opening TodoDB:', error);
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
            console.log('[DBManager] #deleteTodoDB() deleting TodoDB...');
            const request = indexedDB.deleteDatabase(this.#TODO_DB_CONFIG.NAME);

            request.onsuccess = () => {
                console.log('[DBManager] TodoDB deleted successfully');
                resolve();
            };

            request.onerror = () => {
                console.error('[DBManager] Error deleting TodoDB');
                resolve();
            };

            request.onblocked = () => {
                console.warn('[DBManager] TodoDB delete blocked');
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
        console.log('[DBManager] #openDB() opening database:', DB_CONFIG.NAME, 'version:', DB_CONFIG.VERSION);
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_CONFIG.NAME, DB_CONFIG.VERSION);

            request.onupgradeneeded = (event) => {
                console.log('[DBManager] onupgradeneeded triggered, old version:', event.oldVersion, 'new version:', event.newVersion);
                const db = event.target.result;

                if (!db.objectStoreNames.contains(DB_CONFIG.STORES.NOTES)) {
                    console.log('[DBManager] Creating notes store...');
                    db.createObjectStore(DB_CONFIG.STORES.NOTES, { 
                        keyPath: 'id' 
                    });
                    console.log('[DBManager] Notes store created');
                } else {
                    console.log('[DBManager] Notes store already exists');
                }

                if (!db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS)) {
                    console.log('[DBManager] Creating lists store...');
                    db.createObjectStore(DB_CONFIG.STORES.LISTS);
                    console.log('[DBManager] Lists store created');
                } else {
                    console.log('[DBManager] Lists store already exists');
                }

                if (!db.objectStoreNames.contains(DB_CONFIG.STORES.IMPORTS)) {
                    console.log('[DBManager] Creating imports store...');
                    db.createObjectStore(DB_CONFIG.STORES.IMPORTS, {
                        keyPath: 'id'
                    });
                    console.log('[DBManager] Imports store created');
                } else {
                    console.log('[DBManager] Imports store already exists');
                }

                if (!db.objectStoreNames.contains(DB_CONFIG.STORES.DELETION_TOKENS)) {
                    console.log('[DBManager] Creating deletionTokens store...');
                    db.createObjectStore(DB_CONFIG.STORES.DELETION_TOKENS, {
                        keyPath: 'id'
                    });
                    console.log('[DBManager] DeletionTokens store created');
                } else {
                    console.log('[DBManager] DeletionTokens store already exists');
                }

                console.log('[DBManager] Stores after upgrade:', Array.from(db.objectStoreNames));
            };

            request.onsuccess = (event) => {
                this.#db = event.target.result;
                console.log('[DBManager] Database opened successfully');
                console.log('[DBManager] Database version:', this.#db.version);
                console.log('[DBManager] Available stores:', Array.from(this.#db.objectStoreNames));
                
                // Verify stores exist
                const hasNotes = this.#db.objectStoreNames.contains(DB_CONFIG.STORES.NOTES);
                const hasLists = this.#db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS);
                const hasImports = this.#db.objectStoreNames.contains(DB_CONFIG.STORES.IMPORTS);

                if (!hasNotes) {
                    console.error('[DBManager] CRITICAL: Notes store missing after open!');
                }
                if (!hasLists) {
                    console.error('[DBManager] CRITICAL: Lists store missing after open!');
                }
                if (!hasImports) {
                    console.error('[DBManager] CRITICAL: Imports store missing after open!');
                }

                resolve(this.#db);
            };

            request.onerror = (event) => {
                console.error('[DBManager] Database open error:', event.target.error);
                reject(event.target.error);
            };

            request.onblocked = () => {
                console.error('[DBManager] Database upgrade blocked');
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
        console.log('[DBManager] migrateFromOldDB() starting...');
        
        if (localStorage.getItem('migrationComplete') === 'true') {
            console.log('[DBManager] OldDB migration already complete, skipping');
            return false;
        }

        try {
            console.log('[DBManager] Checking if old textAreaDB exists...');
            const oldDBExists = await this.#checkOldDBExists();
            console.log('[DBManager] Old DB exists:', oldDBExists);
            
            if (!oldDBExists) {
                console.log('[DBManager] No old DB found, marking migration complete');
                localStorage.setItem('migrationComplete', 'true');
                return false;
            }

            console.log('[DBManager] Reading data from old DB...');
            const oldData = await this.#readFromOldDB();
            console.log('[DBManager] Old DB data:', oldData);
            
            console.log('[DBManager] Initializing pockist-db...');
            await this.init();
            
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.NOTES)) {
                console.error('[DBManager] Notes store not found!');
                throw new Error('Notes store not found');
            }

            if (oldData !== null && oldData !== undefined && oldData !== '') {
                console.log('[DBManager] Saving old data to notes store...');
                await this.saveNote(1, oldData);
                console.log('[DBManager] Data saved successfully');
            } else {
                console.log('[DBManager] No data to migrate');
            }

            console.log('[DBManager] Deleting old textAreaDB...');
            await this.#deleteOldDB();
            console.log('[DBManager] Old DB deleted');
            
            localStorage.setItem('migrationComplete', 'true');
            console.log('[DBManager] OldDB migration completed');
            return true;

        } catch (error) {
            console.error('[DBManager] OldDB migration failed:', error);
            console.error('[DBManager] Error stack:', error.stack);
            throw error;
        }
    }

    static #checkOldDBExists() {
        return new Promise((resolve) => {
            if (indexedDB.databases) {
                indexedDB.databases().then(databases => {
                    const exists = databases.some(db => db.name === OLD_DB_CONFIG.NAME);
                    console.log('[DBManager] indexedDB.databases() found old DB:', exists);
                    resolve(exists);
                }).catch(() => {
                    console.log('[DBManager] indexedDB.databases() failed, trying open method');
                    resolve(this.#tryOpenOldDB());
                });
            } else {
                console.log('[DBManager] indexedDB.databases not supported, trying open method');
                resolve(this.#tryOpenOldDB());
            }
        });
    }

    static #tryOpenOldDB() {
        return new Promise((resolve) => {
            try {
                const request = indexedDB.open(OLD_DB_CONFIG.NAME);
                
                request.onsuccess = () => {
                    console.log('[DBManager] Old DB opened successfully');
                    request.result.close();
                    resolve(true);
                };
                
                request.onerror = () => {
                    console.log('[DBManager] Old DB open failed');
                    resolve(false);
                };
                
                request.onupgradeneeded = () => {
                    console.log('[DBManager] Old DB onupgradeneeded - does not exist');
                    try {
                        request.transaction.abort();
                    } catch (e) {}
                    resolve(false);
                };
            } catch (error) {
                console.error('[DBManager] Exception opening old DB:', error);
                resolve(false);
            }
        });
    }

    static #readFromOldDB() {
        return new Promise((resolve, reject) => {
            console.log('[DBManager] #readFromOldDB() starting...');
            const request = indexedDB.open(OLD_DB_CONFIG.NAME);

            request.onsuccess = (event) => {
                const db = event.target.result;
                console.log('[DBManager] Old DB opened for reading');
                
                try {
                    if (!db.objectStoreNames.contains(OLD_DB_CONFIG.STORE)) {
                        console.log('[DBManager] Old DB store not found');
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
                            console.log('[DBManager] Old DB data read successfully');
                            resolve(getRequest.result.value);
                        } else {
                            console.log('[DBManager] Old DB record not found');
                            resolve(null);
                        }
                    };

                    getRequest.onerror = () => {
                        console.error('[DBManager] Error reading old DB record:', getRequest.error);
                        db.close();
                        reject(getRequest.error);
                    };
                } catch (error) {
                    console.error('[DBManager] Exception reading old DB:', error);
                    db.close();
                    reject(error);
                }
            };

            request.onerror = () => {
                console.error('[DBManager] Error opening old DB for reading:', request.error);
                reject(request.error);
            };
        });
    }

    static #deleteOldDB() {
        return new Promise((resolve) => {
            console.log('[DBManager] #deleteOldDB() starting...');
            const request = indexedDB.deleteDatabase(OLD_DB_CONFIG.NAME);

            request.onsuccess = () => {
                console.log('[DBManager] Old DB deleted successfully');
                resolve();
            };

            request.onerror = () => {
                console.error('[DBManager] Error deleting old DB');
                resolve();
            };

            request.onblocked = () => {
                console.warn('[DBManager] Old DB delete blocked');
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
        console.log('[DBManager] migrateToMultiNoteFormat() starting...');
        
        // Check if migration was already completed - but re-run if DB version changed
        const currentVersion = DB_CONFIG.VERSION.toString();
        const lastMigratedVersion = localStorage.getItem('multiNoteMigrationVersion');

        console.log('[DBManager] Current DB version:', currentVersion);
        console.log('[DBManager] Last migrated version:', lastMigratedVersion);
        console.log('[DBManager] multiNoteMigrationComplete:', localStorage.getItem('multiNoteMigrationComplete'));

        if (localStorage.getItem('multiNoteMigrationComplete') === 'true' && lastMigratedVersion === currentVersion) {
            console.log('[DBManager] Multi-note migration already complete for this version, skipping');
            return false;
        }

        try {
            console.log('[DBManager] Initializing database...');
            await this.init();

            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.NOTES)) {
                console.error('[DBManager] Notes store not found!');
                localStorage.setItem('multiNoteMigrationComplete', 'true');
                localStorage.setItem('multiNoteMigrationVersion', currentVersion);
                return false;
            }

            // Get all notes
            console.log('[DBManager] Getting all notes for migration...');
            const allNotes = await this.getAllNotes();
            console.log('[DBManager] Found', allNotes.length, 'notes');

            // Find notes with numeric IDs (old format) OR notes with invalid string content
            const oldFormatNotes = allNotes.filter(note => {
                // Numeric ID is old format
                if (typeof note.id === 'number') return true;
                // Also check if content is not a string (corrupted data)
                if (note.content && typeof note.content !== 'string') return true;
                return false;
            });

            console.log('[DBManager] Found', oldFormatNotes.length, 'old-format notes to migrate');

            if (oldFormatNotes.length === 0) {
                // No old-format notes to migrate
                console.log('[DBManager] No old-format notes found, marking migration complete');
                localStorage.setItem('multiNoteMigrationComplete', 'true');
                localStorage.setItem('multiNoteMigrationVersion', currentVersion);
                return false;
            }

            console.log(`[DBManager] Migrating ${oldFormatNotes.length} old-format note(s) to multi-note format...`);

            // Migrate each old-format note
            for (const oldNote of oldFormatNotes) {
                console.log('[DBManager] Migrating note:', oldNote.id);
                await this.#migrateSingleNote(oldNote);
            }

            console.log('[DBManager] Multi-note migration completed successfully');
            localStorage.setItem('multiNoteMigrationComplete', 'true');
            localStorage.setItem('multiNoteMigrationVersion', currentVersion);
            return true;

        } catch (error) {
            console.error('[DBManager] Multi-note migration failed:', error);
            console.error('[DBManager] Error stack:', error.stack);
            throw error;
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

        console.log(`[DBManager] Migrated note ${oldNote.id} -> ${newId}`);
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
}