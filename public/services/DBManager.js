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
    
    // Current database version. Incremented to 2 to ensure onupgradeneeded fires
    // for users who have a database without the notes store (migration bug fix).
    // Increment this when adding new object stores or changing structures.
    VERSION: 2,
    
    // Object store names - each mini-app should have its own store
    STORES: {
        NOTES: 'notes',
        // TODOS: 'todos', // Future: uncomment when todo app is ready
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
     * @param {number} id - The note ID
     * @param {string} content - The note content text
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
            
            const note = {
                id: id,
                content: content,
                updatedAt: new Date().toISOString()
            };
            
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
}
