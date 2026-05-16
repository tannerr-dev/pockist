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
    VERSION: 8,
    // Object store names - each mini-app should have its own store
    STORES: {
        NOTES: 'notes',
        LISTS: 'lists',
        IMPORTS: 'imports',
        DELETION_TOKENS: 'deletionTokens',
        SETTINGS: 'settings',
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
     * Get all lists from the database (legacy method).
     * Uses the new granular methods internally for v7+ compatibility.
     * 
     * @returns {Promise<Array>} Array of list objects with todos
     */
    static async getLists() {
        console.log('[DBManager] getLists() called (legacy wrapper)');
        await this.init();

        try {
            // Use new granular methods: get metadata first, then load each list
            const metadata = await this.getListMetadata();
            console.log(`[DBManager] getLists() loading ${metadata.length} lists via metadata`);
            
            // Load each list individually
            const lists = [];
            for (const meta of metadata) {
                const list = await this.getList(meta.id);
                if (list) {
                    lists.push(list);
                }
            }
            
            // Sort by order to ensure consistency
            lists.sort((a, b) => (a.order || 0) - (b.order || 0));
            
            console.log(`[DBManager] getLists() loaded ${lists.length} lists`);
            return lists;
        } catch (error) {
            console.error('[DBManager] getLists() error:', error);
            throw error;
        }
    }

    /**
     * Save all lists to the database (legacy method).
     * Uses the new granular saveList() method internally for v7+ compatibility.
     * This saves each list individually and updates the metadata index.
     * 
     * @param {Array} lists - Array of list objects to save
     * @returns {Promise<void>}
     */
    static async saveLists(lists) {
        console.log('[DBManager] saveLists() called with', lists.length, 'lists (legacy wrapper)');
        await this.init();

        try {
            // Use new granular method: save each list individually
            for (const list of lists) {
                await this.saveList(list);
            }
            console.log('[DBManager] saveLists() success - saved', lists.length, 'lists individually');
        } catch (error) {
            console.error('[DBManager] saveLists() error:', error);
            throw error;
        }
    }

    // ============================================================================
    // GRANULAR LIST METHODS (v7+)
    // Individual list operations with metadata index support
    // ============================================================================

    /**
     * Get a single list by its ID.
     * Returns the full list object including todos.
     * 
     * @param {string} listId - The list ID
     * @returns {Promise<Object|null>} The list object or null if not found
     */
    static async getList(listId) {
        console.log(`[DBManager] getList(${listId}) called`);
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS)) {
                console.error('[DBManager] Lists object store not found');
                reject(new Error('Lists object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.LISTS], 'readonly');
            const store = transaction.objectStore(DB_CONFIG.STORES.LISTS);
            const request = store.get(listId);

            request.onsuccess = () => {
                console.log(`[DBManager] getList(${listId}) success:`, request.result ? 'found' : 'not found');
                resolve(request.result || null);
            };

            request.onerror = () => {
                console.error(`[DBManager] getList(${listId}) error:`, request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Save a single list to the database.
     * Updates both the list record and the metadata index.
     * Automatically sets updatedAt timestamp.
     * 
     * @param {Object} list - The list object to save
     * @returns {Promise<void>}
     */
    static async saveList(list) {
        console.log(`[DBManager] saveList(${list.id}) called`);
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS)) {
                console.error('[DBManager] Lists object store not found');
                reject(new Error('Lists object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.LISTS], 'readwrite');
            const store = transaction.objectStore(DB_CONFIG.STORES.LISTS);

            // Update timestamps
            const now = Date.now();
            const listToSave = {
                ...list,
                updatedAt: now,
                lastAccessed: now
            };

            // Save the full list
            const listRequest = store.put(listToSave, list.id);

            listRequest.onsuccess = () => {
                console.log(`[DBManager] saveList(${list.id}) - list saved`);
                
                // Update metadata index
                const metaRequest = store.get('list-metadata');
                metaRequest.onsuccess = () => {
                    let metadata = metaRequest.result || [];
                    const existingIndex = metadata.findIndex(m => m.id === list.id);
                    const metaEntry = {
                        id: list.id,
                        name: list.name,
                        isDefault: list.isDefault || false,
                        order: typeof list.order === 'number' ? list.order : 0,
                        createdAt: list.createdAt || now,
                        updatedAt: now,
                        lastAccessed: now,
                        todoCount: list.todos ? list.todos.length : 0
                    };

                    if (existingIndex >= 0) {
                        metadata[existingIndex] = metaEntry;
                    } else {
                        metadata.push(metaEntry);
                    }

                    // Sort by order before saving
                    metadata.sort((a, b) => a.order - b.order);
                    store.put(metadata, 'list-metadata');
                    console.log(`[DBManager] saveList(${list.id}) - metadata updated`);
                };

                metaRequest.onerror = () => {
                    console.error(`[DBManager] saveList(${list.id}) - metadata update failed:`, metaRequest.error);
                };
            };

            listRequest.onerror = () => {
                console.error(`[DBManager] saveList(${list.id}) error:`, listRequest.error);
                reject(listRequest.error);
            };

            transaction.oncomplete = () => {
                console.log(`[DBManager] saveList(${list.id}) transaction complete`);
                resolve();
            };

            transaction.onerror = () => {
                console.error(`[DBManager] saveList(${list.id}) transaction error:`, transaction.error);
                reject(transaction.error);
            };
        });
    }

    /**
     * Delete a single list from the database.
     * Also updates the metadata index to remove the list.
     * 
     * @param {string} listId - The list ID to delete
     * @returns {Promise<void>}
     */
    static async deleteList(listId) {
        console.log(`[DBManager] deleteList(${listId}) called`);
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS)) {
                console.error('[DBManager] Lists object store not found');
                reject(new Error('Lists object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.LISTS], 'readwrite');
            const store = transaction.objectStore(DB_CONFIG.STORES.LISTS);

            // Delete the list
            const deleteRequest = store.delete(listId);

            deleteRequest.onsuccess = () => {
                console.log(`[DBManager] deleteList(${listId}) - list deleted`);
                
                // Update metadata to remove this list
                const metaRequest = store.get('list-metadata');
                metaRequest.onsuccess = () => {
                    let metadata = metaRequest.result || [];
                    metadata = metadata.filter(m => m.id !== listId);
                    store.put(metadata, 'list-metadata');
                    console.log(`[DBManager] deleteList(${listId}) - metadata updated`);
                };
            };

            deleteRequest.onerror = () => {
                console.error(`[DBManager] deleteList(${listId}) error:`, deleteRequest.error);
                reject(deleteRequest.error);
            };

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Get metadata for all lists (lightweight, no todos).
     * Returns sorted array by order. Includes default list info.
     * 
     * @returns {Promise<Array>} Array of metadata objects
     */
    static async getListMetadata() {
        console.log('[DBManager] getListMetadata() called');
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS)) {
                console.error('[DBManager] Lists object store not found');
                reject(new Error('Lists object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.LISTS], 'readonly');
            const store = transaction.objectStore(DB_CONFIG.STORES.LISTS);
            const request = store.get('list-metadata');

            request.onsuccess = () => {
                let metadata = request.result || [];
                // Ensure sorted by order
                metadata.sort((a, b) => a.order - b.order);
                console.log(`[DBManager] getListMetadata() success: ${metadata.length} lists`);
                resolve(metadata);
            };

            request.onerror = () => {
                console.error('[DBManager] getListMetadata() error:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Get the default list ID from metadata.
     * 
     * @returns {Promise<string|null>} The default list ID or null
     */
    static async getDefaultListId() {
        console.log('[DBManager] getDefaultListId() called');
        const metadata = await this.getListMetadata();
        const defaultList = metadata.find(m => m.isDefault);
        return defaultList ? defaultList.id : (metadata[0] ? metadata[0].id : null);
    }

    /**
     * Update the order of a specific list.
     * Updates both the list record and metadata index.
     * 
     * @param {string} listId - The list ID
     * @param {number} newOrder - The new order value
     * @returns {Promise<void>}
     */
    static async updateListOrder(listId, newOrder) {
        console.log(`[DBManager] updateListOrder(${listId}, ${newOrder}) called`);
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS)) {
                reject(new Error('Lists object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.LISTS], 'readwrite');
            const store = transaction.objectStore(DB_CONFIG.STORES.LISTS);

            // Update list order
            const listRequest = store.get(listId);
            listRequest.onsuccess = () => {
                const list = listRequest.result;
                if (list) {
                    list.order = newOrder;
                    list.updatedAt = Date.now();
                    store.put(list, listId);
                    console.log(`[DBManager] updateListOrder - list updated`);
                }
            };

            // Update metadata order
            const metaRequest = store.get('list-metadata');
            metaRequest.onsuccess = () => {
                let metadata = metaRequest.result || [];
                const entry = metadata.find(m => m.id === listId);
                if (entry) {
                    entry.order = newOrder;
                    entry.updatedAt = Date.now();
                    // Re-sort and save
                    metadata.sort((a, b) => a.order - b.order);
                    store.put(metadata, 'list-metadata');
                    console.log(`[DBManager] updateListOrder - metadata updated`);
                }
            };

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Set a list as the default list.
     * Unsets all other lists as default. Updates metadata accordingly.
     * 
     * @param {string} listId - The list ID to set as default
     * @returns {Promise<void>}
     */
    static async setDefaultList(listId) {
        console.log(`[DBManager] setDefaultList(${listId}) called`);
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS)) {
                reject(new Error('Lists object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.LISTS], 'readwrite');
            const store = transaction.objectStore(DB_CONFIG.STORES.LISTS);

            // Get all list IDs from metadata
            const metaRequest = store.get('list-metadata');
            metaRequest.onsuccess = () => {
                const metadata = metaRequest.result || [];
                const now = Date.now();

                // Update each list's isDefault flag
                metadata.forEach(meta => {
                    const listReq = store.get(meta.id);
                    listReq.onsuccess = () => {
                        const list = listReq.result;
                        if (list) {
                            list.isDefault = (list.id === listId);
                            list.updatedAt = now;
                            store.put(list, list.id);
                        }
                    };
                    // Update metadata
                    meta.isDefault = (meta.id === listId);
                    meta.updatedAt = now;
                });

                store.put(metadata, 'list-metadata');
                console.log(`[DBManager] setDefaultList - default set to ${listId}`);
            };

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Update the lastAccessed timestamp for a list.
     * Updates both the list and metadata.
     * 
     * @param {string} listId - The list ID
     * @returns {Promise<void>}
     */
    static async updateLastAccessed(listId) {
        console.log(`[DBManager] updateLastAccessed(${listId}) called`);
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS)) {
                reject(new Error('Lists object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.LISTS], 'readwrite');
            const store = transaction.objectStore(DB_CONFIG.STORES.LISTS);

            const now = Date.now();

            // Update list
            const listRequest = store.get(listId);
            listRequest.onsuccess = () => {
                const list = listRequest.result;
                if (list) {
                    list.lastAccessed = now;
                    store.put(list, listId);
                }
            };

            // Update metadata
            const metaRequest = store.get('list-metadata');
            metaRequest.onsuccess = () => {
                let metadata = metaRequest.result || [];
                const entry = metadata.find(m => m.id === listId);
                if (entry) {
                    entry.lastAccessed = now;
                    store.put(metadata, 'list-metadata');
                }
            };

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Create a new list with proper initialization.
     * Generates ID, sets timestamps, and adds to metadata.
     * 
     * @param {Object} listData - The list data (name, optional isDefault, optional order)
     * @returns {Promise<Object>} The created list object
     */
    static async createList(listData) {
        console.log('[DBManager] createList() called with:', listData);
        await this.init();

        const now = Date.now();
        const metadata = await this.getListMetadata();
        
        // Generate new order (after last list)
        const maxOrder = metadata.length > 0 
            ? Math.max(...metadata.map(m => m.order))
            : -1;

        const newList = {
            id: `list-${now}-${Math.random().toString(36).substr(2, 9)}`,
            name: listData.name || 'New List',
            todos: [],
            isDefault: listData.isDefault || false,
            order: typeof listData.order === 'number' ? listData.order : maxOrder + 1,
            createdAt: now,
            updatedAt: now,
            lastAccessed: now
        };

        // If this is the first list or marked as default, handle default logic
        if (newList.isDefault || metadata.length === 0) {
            // Unset others if this is default
            if (metadata.length > 0 && newList.isDefault) {
                await this.setDefaultList(newList.id);
            }
        }

        await this.saveList(newList);
        console.log(`[DBManager] createList() created: ${newList.id}`);
        return newList;
    }

    /**
     * Rebuild the metadata index from all individual list records.
     * Useful for recovery if metadata gets out of sync with actual lists.
     * Scans all list records and rebuilds the metadata index.
     * 
     * @returns {Promise<Array>} The rebuilt metadata array
     */
    static async rebuildMetadata() {
        console.log('[DBManager] rebuildMetadata() called');
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS)) {
                reject(new Error('Lists object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.LISTS], 'readonly');
            const store = transaction.objectStore(DB_CONFIG.STORES.LISTS);
            
            // Get all keys to find list records (exclude metadata key)
            const keysRequest = store.getAllKeys();
            
            keysRequest.onsuccess = () => {
                const allKeys = keysRequest.result || [];
                const listKeys = allKeys.filter(key => key !== 'list-metadata');
                
                console.log(`[DBManager] rebuildMetadata() found ${listKeys.length} list records`);
                
                // Load each list and build metadata
                const metadata = [];
                let loadedCount = 0;
                
                if (listKeys.length === 0) {
                    // No lists found, save empty metadata
                    const writeTransaction = this.#db.transaction([DB_CONFIG.STORES.LISTS], 'readwrite');
                    const writeStore = writeTransaction.objectStore(DB_CONFIG.STORES.LISTS);
                    writeStore.put([], 'list-metadata');
                    resolve([]);
                    return;
                }
                
                listKeys.forEach(key => {
                    const listRequest = store.get(key);
                    listRequest.onsuccess = () => {
                        const list = listRequest.result;
                        if (list && list.id) {
                            metadata.push({
                                id: list.id,
                                name: list.name || 'Unnamed List',
                                isDefault: list.isDefault || false,
                                order: typeof list.order === 'number' ? list.order : 0,
                                createdAt: list.createdAt || Date.now(),
                                updatedAt: list.updatedAt || list.createdAt || Date.now(),
                                lastAccessed: list.lastAccessed || list.createdAt || Date.now(),
                                todoCount: list.todos ? list.todos.length : 0
                            });
                        }
                        loadedCount++;
                        
                        // When all loaded, sort and save
                        if (loadedCount === listKeys.length) {
                            // Sort by order
                            metadata.sort((a, b) => a.order - b.order);
                            
                            // Save rebuilt metadata
                            const writeTransaction = this.#db.transaction([DB_CONFIG.STORES.LISTS], 'readwrite');
                            const writeStore = writeTransaction.objectStore(DB_CONFIG.STORES.LISTS);
                            writeStore.put(metadata, 'list-metadata');
                            
                            console.log(`[DBManager] rebuildMetadata() rebuilt ${metadata.length} entries`);
                            resolve(metadata);
                        }
                    };
                    
                    listRequest.onerror = () => {
                        loadedCount++;
                        console.error(`[DBManager] rebuildMetadata() error loading list ${key}:`, listRequest.error);
                        if (loadedCount === listKeys.length) {
                            resolve(metadata);
                        }
                    };
                });
            };
            
            keysRequest.onerror = () => {
                console.error('[DBManager] rebuildMetadata() error getting keys:', keysRequest.error);
                reject(keysRequest.error);
            };
        });
    }

    // ============================================================================
    // END OF GRANULAR LIST METHODS
    // ============================================================================

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

                if (!db.objectStoreNames.contains(DB_CONFIG.STORES.SETTINGS)) {
                    console.log('[DBManager] Creating settings store...');
                    db.createObjectStore(DB_CONFIG.STORES.SETTINGS);
                    console.log('[DBManager] Settings store created');
                } else {
                    console.log('[DBManager] Settings store already exists');
                }

                console.log('[DBManager] Stores after upgrade:', Array.from(db.objectStoreNames));

                // Version 7 migration: Split monolithic lists array into individual records
                // Also creates metadata index for efficient list management
                if (event.oldVersion < 7 && db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS)) {
                    console.log('[DBManager] Running v6->v7 migration: Splitting lists into individual records');
                    
                    const transaction = event.target.transaction;
                    const store = transaction.objectStore(DB_CONFIG.STORES.LISTS);
                    
                    // Check for old format data (single 'todoLists' key containing array)
                    const oldDataRequest = store.get('todoLists');
                    oldDataRequest.onsuccess = () => {
                        if (oldDataRequest.result && Array.isArray(oldDataRequest.result)) {
                            const lists = oldDataRequest.result;
                            console.log(`[DBManager] Migrating ${lists.length} lists to individual records`);
                            
                            // Migrate each list to its own record keyed by list ID
                            lists.forEach(list => {
                                if (list.id) {
                                    // Ensure list has all required fields for new format
                                    const now = Date.now();
                                    const migratedList = {
                                        ...list,
                                        order: typeof list.order === 'number' ? list.order : 0,
                                        createdAt: list.createdAt || now,
                                        updatedAt: list.updatedAt || list.createdAt || now,
                                        lastAccessed: list.lastAccessed || list.createdAt || now
                                    };
                                    store.put(migratedList, list.id);
                                    console.log(`[DBManager] Migrated list: ${list.id} - ${list.name}`);
                                }
                            });
                            
                            // Create metadata index with summary info for all lists
                            const metadata = lists.map(l => ({
                                id: l.id,
                                name: l.name,
                                isDefault: l.isDefault || false,
                                order: typeof l.order === 'number' ? l.order : 0,
                                createdAt: l.createdAt || Date.now(),
                                updatedAt: l.updatedAt || l.createdAt || Date.now(),
                                lastAccessed: l.lastAccessed || l.createdAt || Date.now(),
                                todoCount: l.todos ? l.todos.length : 0
                            }));
                            
                            // Sort metadata by order before saving
                            metadata.sort((a, b) => a.order - b.order);
                            store.put(metadata, 'list-metadata');
                            console.log('[DBManager] Created list-metadata index');
                            
                            // Clean up old monolithic key after successful migration
                            store.delete('todoLists');
                            console.log('[DBManager] Cleaned up old todoLists key');
                            
                        } else {
                            // No old data found, create fresh metadata with default list
                            console.log('[DBManager] No old data found, creating fresh metadata with default list');
                            const now = Date.now();
                            const defaultList = {
                                id: 'default',
                                name: 'My Todos',
                                todos: [],
                                isDefault: true,
                                createdAt: now,
                                updatedAt: now,
                                lastAccessed: now,
                                order: 0
                            };
                            
                            store.put(defaultList, 'default');
                            
                            const metadata = [{
                                id: 'default',
                                name: 'My Todos',
                                isDefault: true,
                                order: 0,
                                createdAt: now,
                                updatedAt: now,
                                lastAccessed: now,
                                todoCount: 0
                            }];
                            
                            store.put(metadata, 'list-metadata');
                            console.log('[DBManager] Created default list and metadata');
                        }
                    };
                    
                    oldDataRequest.onerror = () => {
                        console.error('[DBManager] Error during v6->v7 migration:', oldDataRequest.error);
                    };
                }
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

    // ============================================================================
    // SETTINGS METHODS
    // ============================================================================

    /**
     * Get a setting value by key.
     * @param {string} key - The setting key
     * @returns {Promise<any|null>} The value or null if not found
     */
    static async getSetting(key) {
        console.log(`[DBManager] getSetting(${key}) called`);
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.SETTINGS)) {
                console.error('[DBManager] Settings object store not found');
                reject(new Error('Settings object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.SETTINGS], 'readonly');
            const store = transaction.objectStore(DB_CONFIG.STORES.SETTINGS);
            const request = store.get(key);

            request.onsuccess = () => {
                const result = request.result;
                if (result === undefined) {
                    console.log(`[DBManager] getSetting(${key}) - not found`);
                    resolve(null);
                } else {
                    console.log(`[DBManager] getSetting(${key}) success`);
                    resolve(result);
                }
            };

            request.onerror = () => {
                console.error(`[DBManager] getSetting(${key}) error:`, request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Save a setting value by key.
     * @param {string} key - The setting key
     * @param {any} value - The value to save
     * @returns {Promise<void>}
     */
    static async saveSetting(key, value) {
        console.log(`[DBManager] saveSetting(${key}) called`);
        await this.init();

        return new Promise((resolve, reject) => {
            if (!this.#db.objectStoreNames.contains(DB_CONFIG.STORES.SETTINGS)) {
                console.error('[DBManager] Settings object store not found');
                reject(new Error('Settings object store not found'));
                return;
            }

            const transaction = this.#db.transaction([DB_CONFIG.STORES.SETTINGS], 'readwrite');
            const store = transaction.objectStore(DB_CONFIG.STORES.SETTINGS);
            const request = store.put(value, key);

            request.onsuccess = () => {
                console.log(`[DBManager] saveSetting(${key}) success`);
                resolve();
            };

            request.onerror = () => {
                console.error(`[DBManager] saveSetting(${key}) error:`, request.error);
                reject(request.error);
            };
        });
    }

    // ============================================================================
    // END OF SETTINGS METHODS
    // ============================================================================
}