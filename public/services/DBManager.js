/**
 * DBManager - Centralized IndexedDB manager for Pockist applications
 *
 * Unified v9 schema: everything is an 'item' in a single object store.
 * Views (notes, lists, archive) are just queries on the items store.
 */

const DB_CONFIG = {
    NAME: 'pockist-db',
    VERSION: 9,
    STORES: {
        ITEMS: 'items',
        NOTES: 'notes',
        LISTS: 'lists',
        IMPORTS: 'imports',
        DELETION_TOKENS: 'deletionTokens',
        SETTINGS: 'settings',
    }
};

const OLD_DB_CONFIG = {
    NAME: 'textAreaDB',
    STORE: 'textAreaStore',
    RECORD_KEY: 'singleRecord'
};

export class DBManager {
    static #db = null;

    // -------------------------------------------------------------------------
    // Init
    // -------------------------------------------------------------------------

    static async init() {
        if (this.#db) return this.#db;
        return this.#openDB();
    }

    // -------------------------------------------------------------------------
    // ITEMS (v9 unified store)
    // -------------------------------------------------------------------------

    static async getItem(id) {
        await this.init();
        return new Promise((resolve, reject) => {
            const store = this.#db.transaction([DB_CONFIG.STORES.ITEMS], 'readonly').objectStore(DB_CONFIG.STORES.ITEMS);
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    static async saveItem(item) {
        await this.init();
        return new Promise((resolve, reject) => {
            const store = this.#db.transaction([DB_CONFIG.STORES.ITEMS], 'readwrite').objectStore(DB_CONFIG.STORES.ITEMS);
            const toSave = {
                ...item,
                meta: {
                    ...item.meta,
                    updatedAt: new Date().toISOString()
                }
            };
            const req = store.put(toSave);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    static async deleteItem(id) {
        const item = await this.getItem(id);
        if (!item) return;
        item.meta = { ...item.meta, archived: true, updatedAt: new Date().toISOString() };
        await this.saveItem(item);
    }

    static async hardDeleteItem(id) {
        await this.init();
        return new Promise((resolve, reject) => {
            const store = this.#db.transaction([DB_CONFIG.STORES.ITEMS], 'readwrite').objectStore(DB_CONFIG.STORES.ITEMS);
            const req = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    static async getItems({ type, archived = false } = {}) {
        await this.init();
        return new Promise((resolve, reject) => {
            const store = this.#db.transaction([DB_CONFIG.STORES.ITEMS], 'readonly').objectStore(DB_CONFIG.STORES.ITEMS);

            let request;
            if (type && store.indexNames.contains('idx_type')) {
                const index = store.index('idx_type');
                const range = IDBKeyRange.only(type);
                request = index.openCursor(range);
            } else {
                request = store.openCursor();
            }

            const results = [];
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const item = cursor.value;
                    const meta = item.meta || {};
                    const matchesType = !type || item.type === type;
                    const matchesArchived = !!meta.archived === archived;
                    if (matchesType && matchesArchived) {
                        results.push(item);
                    }
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    static async getAllItems() {
        await this.init();
        return new Promise((resolve, reject) => {
            const store = this.#db.transaction([DB_CONFIG.STORES.ITEMS], 'readonly').objectStore(DB_CONFIG.STORES.ITEMS);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    static async getLinkedItems(listId) {
        const list = await this.getItem(listId);
        if (!list || !Array.isArray(list.links)) return [];

        const links = [...list.links].sort((a, b) => (a.order || 0) - (b.order || 0));
        const items = [];
        for (const link of links) {
            const item = await this.getItem(link.id);
            if (item) items.push(item);
        }
        return items;
    }

    static async updateLinkOrder(listId, newLinks) {
        const list = await this.getItem(listId);
        if (!list) throw new Error('List not found');
        list.links = newLinks;
        await this.saveItem(list);
    }

    static async createItem(data) {
        const now = new Date().toISOString();
        const id = data.id || this.#generateItemId(data.content || '');
        const item = {
            id,
            type: data.type || 'item',
            content: data.content || '',
            links: data.links || [],
            meta: {
                createdAt: data.createdAt || now,
                updatedAt: now,
                archived: false,
                completed: data.completed || false,
                ...data.meta
            }
        };
        await this.saveItem(item);
        return item;
    }

    // -------------------------------------------------------------------------
    // LEGACY NOTE METHODS (delegated to items store)
    // -------------------------------------------------------------------------

    static async getNote(id) {
        await this.init();
        const item = await this.getItem(String(id));
        if (!item) return null;
        return this.#itemToLegacyNote(item);
    }

    static async saveNote(id, content) {
        await this.init();
        let item;
        if (typeof content === 'object' && content !== null && content.id) {
            item = await this.getItem(String(content.id));
            if (item) {
                item.content = content.content || item.content;
            } else {
                item = this.#legacyNoteToItem(content);
            }
        } else {
            item = await this.getItem(String(id));
            if (item) {
                item.content = String(content || '');
            } else {
                item = {
                    id: String(id),
                    type: 'note',
                    content: String(content || ''),
                    links: [],
                    meta: {
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        archived: false,
                        completed: false
                    }
                };
            }
        }
        await this.saveItem(item);
    }

    static async getAllNotes() {
        return this.getItems({ type: 'note', archived: false });
    }

    static async deleteNote(id) {
        return this.deleteItem(String(id));
    }

    // -------------------------------------------------------------------------
    // LEGACY LIST METHODS (delegated to items store)
    // -------------------------------------------------------------------------

    static async getLists() {
        await this.init();
        const lists = await this.getItems({ type: 'list', archived: false });
        return Promise.all(lists.map(async (list) => this.#itemToLegacyList(list)));
    }

    static async saveLists(lists) {
        for (const list of lists) {
            await this.saveList(list);
        }
    }

    static async getList(listId) {
        await this.init();
        const item = await this.getItem(listId);
        if (!item) return null;
        return this.#itemToLegacyList(item);
    }

    static async saveList(list) {
        await this.init();
        const now = Date.now();
        let item = await this.getItem(list.id);

        if (!item) {
            item = {
                id: list.id,
                type: 'list',
                content: list.name || '',
                links: [],
                meta: {
                    createdAt: list.createdAt || now,
                    updatedAt: now,
                    archived: false,
                    completed: false,
                    isDefault: list.isDefault || false,
                    order: typeof list.order === 'number' ? list.order : 0
                }
            };
        }

        // Sync embedded todos into linked items
        if (Array.isArray(list.todos)) {
            const existingLinks = item.links || [];
            const newLinks = [];

            for (let i = 0; i < list.todos.length; i++) {
                const todo = list.todos[i];
                const existingLink = existingLinks.find(l => l.id === todo.id);
                let todoItem;

                if (existingLink) {
                    todoItem = await this.getItem(todo.id);
                }

                if (!todoItem) {
                    todoItem = {
                        id: todo.id || `todo-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
                        type: 'item',
                        content: todo.text || '',
                        links: [],
                        meta: {
                            createdAt: new Date(todo.createdAt || Date.now()).toISOString(),
                            updatedAt: new Date().toISOString(),
                            archived: false,
                            completed: todo.completed || false
                        }
                    };
                } else {
                    todoItem.content = todo.text || todoItem.content;
                    todoItem.meta = { ...todoItem.meta, completed: todo.completed || false, updatedAt: new Date().toISOString() };
                }

                await this.saveItem(todoItem);
                newLinks.push({ id: todoItem.id, order: i });
            }

            // Remove orphaned linked items
            const newLinkIds = new Set(newLinks.map(l => l.id));
            for (const oldLink of existingLinks) {
                if (!newLinkIds.has(oldLink.id)) {
                    await this.hardDeleteItem(oldLink.id);
                }
            }

            item.links = newLinks;
        }

        item.content = list.name || item.content;
        item.meta = {
            ...item.meta,
            updatedAt: new Date().toISOString(),
            isDefault: list.isDefault || item.meta.isDefault,
            order: typeof list.order === 'number' ? list.order : item.meta.order
        };

        await this.saveItem(item);
    }

    static async deleteList(listId) {
        const item = await this.getItem(listId);
        if (!item) return;

        if (item.links) {
            for (const link of item.links) {
                await this.deleteItem(link.id);
            }
        }
        await this.deleteItem(listId);
    }

    static async getListMetadata() {
        await this.init();
        const lists = await this.getItems({ type: 'list', archived: false });
        return lists.map(item => ({
            id: item.id,
            name: item.content || 'Unnamed List',
            isDefault: item.meta.isDefault || false,
            order: typeof item.meta.order === 'number' ? item.meta.order : 0,
            createdAt: item.meta.createdAt || Date.now(),
            updatedAt: item.meta.updatedAt || item.meta.createdAt || Date.now(),
            lastAccessed: item.meta.updatedAt || item.meta.createdAt || Date.now(),
            todoCount: item.links ? item.links.length : 0
        })).sort((a, b) => a.order - b.order);
    }

    static async getDefaultListId() {
        const metadata = await this.getListMetadata();
        const def = metadata.find(m => m.isDefault);
        return def ? def.id : (metadata[0] ? metadata[0].id : null);
    }

    static async updateListOrder(listId, newOrder) {
        const item = await this.getItem(listId);
        if (!item) return;
        item.meta = { ...item.meta, order: newOrder, updatedAt: new Date().toISOString() };
        await this.saveItem(item);
    }

    static async setDefaultList(listId) {
        const lists = await this.getItems({ type: 'list', archived: false });
        for (const list of lists) {
            list.meta = { ...list.meta, isDefault: list.id === listId, updatedAt: new Date().toISOString() };
            await this.saveItem(list);
        }
    }

    static async updateLastAccessed(listId) {
        const item = await this.getItem(listId);
        if (!item) return;
        item.meta = { ...item.meta, updatedAt: new Date().toISOString() };
        await this.saveItem(item);
    }

    static async createList(listData) {
        const metadata = await this.getListMetadata();
        const maxOrder = metadata.length > 0 ? Math.max(...metadata.map(m => m.order)) : -1;
        const now = Date.now();

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

        if (newList.isDefault || metadata.length === 0) {
            if (metadata.length > 0 && newList.isDefault) {
                await this.setDefaultList(newList.id);
            }
        }

        await this.saveList(newList);
        return newList;
    }

    static async rebuildMetadata() {
        return this.getListMetadata();
    }

    // -------------------------------------------------------------------------
    // IMPORT TRACKING
    // -------------------------------------------------------------------------

    static async hasImportBeenProcessed(exportId) {
        await this.init();
        return new Promise((resolve, reject) => {
            const store = this.#db.transaction([DB_CONFIG.STORES.IMPORTS], 'readonly').objectStore(DB_CONFIG.STORES.IMPORTS);
            const req = store.get(exportId);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    static async recordImport(importRecord) {
        await this.init();
        return new Promise((resolve, reject) => {
            const store = this.#db.transaction([DB_CONFIG.STORES.IMPORTS], 'readwrite').objectStore(DB_CONFIG.STORES.IMPORTS);
            const req = store.put(importRecord);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    static async getImportHistory() {
        await this.init();
        return new Promise((resolve, reject) => {
            const store = this.#db.transaction([DB_CONFIG.STORES.IMPORTS], 'readonly').objectStore(DB_CONFIG.STORES.IMPORTS);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    // -------------------------------------------------------------------------
    // DELETION TOKENS
    // -------------------------------------------------------------------------

    static async saveDeletionToken(shareId, token, expiresAt) {
        await this.init();
        return new Promise((resolve, reject) => {
            const store = this.#db.transaction([DB_CONFIG.STORES.DELETION_TOKENS], 'readwrite').objectStore(DB_CONFIG.STORES.DELETION_TOKENS);
            const req = store.put({ id: shareId, token, expiresAt, createdAt: new Date().toISOString() });
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    static async getDeletionToken(shareId) {
        await this.init();
        return new Promise((resolve, reject) => {
            const store = this.#db.transaction([DB_CONFIG.STORES.DELETION_TOKENS], 'readonly').objectStore(DB_CONFIG.STORES.DELETION_TOKENS);
            const req = store.get(shareId);
            req.onsuccess = () => {
                const result = req.result;
                if (result) {
                    if (new Date(result.expiresAt) < new Date()) {
                        this.deleteDeletionToken(shareId);
                        resolve(null);
                    } else {
                        resolve(result.token);
                    }
                } else {
                    resolve(null);
                }
            };
            req.onerror = () => reject(req.error);
        });
    }

    static async deleteDeletionToken(shareId) {
        await this.init();
        return new Promise((resolve, reject) => {
            const store = this.#db.transaction([DB_CONFIG.STORES.DELETION_TOKENS], 'readwrite').objectStore(DB_CONFIG.STORES.DELETION_TOKENS);
            const req = store.delete(shareId);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    // -------------------------------------------------------------------------
    // TODODB MIGRATION (legacy)
    // -------------------------------------------------------------------------

    static #TODO_DB_CONFIG = {
        NAME: 'TodoDB',
        STORE: 'todos',
        KEY: 'todoLists'
    };

    static async migrateFromTodoDB() {
        if (localStorage.getItem('todoDBMigrationComplete') === 'true') return false;

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

            await this.saveLists(oldData);
            await this.#deleteTodoDB();
            localStorage.setItem('todoDBMigrationComplete', 'true');
            return true;
        } catch (error) {
            console.error('[DBManager] TodoDB migration failed:', error);
            throw error;
        }
    }

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
                        getRequest.onsuccess = () => { db.close(); resolve(getRequest.result || null); };
                        getRequest.onerror = () => { db.close(); resolve(null); };
                    } catch (error) { db.close(); resolve(null); }
                };
                request.onerror = () => resolve(null);
                request.onupgradeneeded = () => {
                    try { request.transaction.abort(); } catch (e) {}
                    resolve(null);
                };
            } catch (error) { resolve(null); }
        });
    }

    static #deleteTodoDB() {
        return new Promise((resolve) => {
            const request = indexedDB.deleteDatabase(this.#TODO_DB_CONFIG.NAME);
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
            request.onblocked = () => resolve();
        });
    }

    // -------------------------------------------------------------------------
    // OLD DB MIGRATION (textAreaDB -> notes store)
    // -------------------------------------------------------------------------

    static async migrateFromOldDB() {
        if (localStorage.getItem('migrationComplete') === 'true') return false;

        try {
            const oldDBExists = await this.#checkOldDBExists();
            if (!oldDBExists) {
                localStorage.setItem('migrationComplete', 'true');
                return false;
            }

            const oldData = await this.#readFromOldDB();
            await this.init();

            if (oldData !== null && oldData !== undefined && oldData !== '') {
                await this.saveNote(1, oldData);
            }

            await this.#deleteOldDB();
            localStorage.setItem('migrationComplete', 'true');
            return true;
        } catch (error) {
            console.error('[DBManager] OldDB migration failed:', error);
            throw error;
        }
    }

    static #checkOldDBExists() {
        return new Promise((resolve) => {
            if (indexedDB.databases) {
                indexedDB.databases().then(databases => {
                    resolve(databases.some(db => db.name === OLD_DB_CONFIG.NAME));
                }).catch(() => resolve(this.#tryOpenOldDB()));
            } else {
                resolve(this.#tryOpenOldDB());
            }
        });
    }

    static #tryOpenOldDB() {
        return new Promise((resolve) => {
            try {
                const request = indexedDB.open(OLD_DB_CONFIG.NAME);
                request.onsuccess = () => { request.result.close(); resolve(true); };
                request.onerror = () => resolve(false);
                request.onupgradeneeded = () => {
                    try { request.transaction.abort(); } catch (e) {}
                    resolve(false);
                };
            } catch (error) { resolve(false); }
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
                        resolve(getRequest.result && typeof getRequest.result.value !== 'undefined' ? getRequest.result.value : null);
                    };
                    getRequest.onerror = () => { db.close(); reject(getRequest.error); };
                } catch (error) { db.close(); reject(error); }
            };
            request.onerror = () => reject(request.error);
        });
    }

    static #deleteOldDB() {
        return new Promise((resolve) => {
            const request = indexedDB.deleteDatabase(OLD_DB_CONFIG.NAME);
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
            request.onblocked = () => resolve();
        });
    }

    // -------------------------------------------------------------------------
    // MULTI-NOTE MIGRATION
    // -------------------------------------------------------------------------

    static async migrateToMultiNoteFormat() {
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

            const allNotes = await this.getAllNotes();
            const oldFormatNotes = allNotes.filter(note => {
                if (typeof note.id === 'number') return true;
                if (note.content && typeof note.content !== 'string') return true;
                return false;
            });

            if (oldFormatNotes.length === 0) {
                localStorage.setItem('multiNoteMigrationComplete', 'true');
                localStorage.setItem('multiNoteMigrationVersion', currentVersion);
                return false;
            }

            for (const oldNote of oldFormatNotes) {
                await this.#migrateSingleNote(oldNote);
            }

            localStorage.setItem('multiNoteMigrationComplete', 'true');
            localStorage.setItem('multiNoteMigrationVersion', currentVersion);
            return true;
        } catch (error) {
            console.error('[DBManager] Multi-note migration failed:', error);
            throw error;
        }
    }

    static async #migrateSingleNote(oldNote) {
        let content = oldNote.content || '';
        if (typeof content === 'object' && content !== null) {
            content = content.content || '';
        }
        content = String(content);

        const timestamp = oldNote.updatedAt || oldNote.createdAt || new Date().toISOString();
        const newId = this.#generateItemId(content, timestamp);
        const title = this.#extractTitle(content);

        const newNote = {
            id: newId,
            title: title,
            content: content,
            createdAt: timestamp,
            updatedAt: timestamp
        };

        await this.#rawSaveNote(newNote);
        await this.deleteNote(oldNote.id);
    }

    static async #rawSaveNote(note) {
        await this.init();
        return new Promise((resolve, reject) => {
            const store = this.#db.transaction([DB_CONFIG.STORES.NOTES], 'readwrite').objectStore(DB_CONFIG.STORES.NOTES);
            const req = store.put(note);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    // -------------------------------------------------------------------------
    // V9 MIGRATION (notes + lists -> items)
    // -------------------------------------------------------------------------

    static async migrateToItems() {
        if (localStorage.getItem('itemsMigrationComplete') === 'true') return false;

        try {
            await this.init();

            const hasNotes = this.#db.objectStoreNames.contains(DB_CONFIG.STORES.NOTES);
            const hasLists = this.#db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS);
            const hasItems = this.#db.objectStoreNames.contains(DB_CONFIG.STORES.ITEMS);

            if (!hasItems) {
                console.error('[DBManager] Items store not found, cannot migrate');
                return false;
            }

            // Migrate notes
            if (hasNotes) {
                const notes = await new Promise((resolve, reject) => {
                    const store = this.#db.transaction([DB_CONFIG.STORES.NOTES], 'readonly').objectStore(DB_CONFIG.STORES.NOTES);
                    const req = store.getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => reject(req.error);
                });

                for (const note of notes) {
                    const existing = await this.getItem(String(note.id));
                    if (existing) continue;

                    let content = note.content || '';
                    if (note.title) {
                        content = note.title + '\n' + content;
                    }

                    await this.saveItem({
                        id: String(note.id),
                        type: 'note',
                        content: String(content),
                        links: [],
                        meta: {
                            createdAt: note.createdAt || new Date().toISOString(),
                            updatedAt: note.updatedAt || new Date().toISOString(),
                            archived: false,
                            completed: false
                        }
                    });
                }
            }

            // Migrate lists
            if (hasLists) {
                const listKeys = await new Promise((resolve, reject) => {
                    const store = this.#db.transaction([DB_CONFIG.STORES.LISTS], 'readonly').objectStore(DB_CONFIG.STORES.LISTS);
                    const req = store.getAllKeys();
                    req.onsuccess = () => {
                        const keys = req.result || [];
                        resolve(keys.filter(k => k !== 'list-metadata'));
                    };
                    req.onerror = () => reject(req.error);
                });

                for (const key of listKeys) {
                    const list = await new Promise((resolve, reject) => {
                        const store = this.#db.transaction([DB_CONFIG.STORES.LISTS], 'readonly').objectStore(DB_CONFIG.STORES.LISTS);
                        const req = store.get(key);
                        req.onsuccess = () => resolve(req.result);
                        req.onerror = () => reject(req.error);
                    });

                    if (!list || !list.id) continue;

                    const existing = await this.getItem(list.id);
                    if (existing) continue;

                    const links = [];
                    if (Array.isArray(list.todos)) {
                        for (let i = 0; i < list.todos.length; i++) {
                            const todo = list.todos[i];
                            const todoId = String(todo.id || `todo-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`);
                            await this.saveItem({
                                id: todoId,
                                type: 'item',
                                content: String(todo.text || ''),
                                links: [],
                                meta: {
                                    createdAt: new Date(todo.createdAt || Date.now()).toISOString(),
                                    updatedAt: new Date(todo.createdAt || Date.now()).toISOString(),
                                    archived: false,
                                    completed: todo.completed || false
                                }
                            });
                            links.push({ id: todoId, order: i });
                        }
                    }

                    await this.saveItem({
                        id: String(list.id),
                        type: 'list',
                        content: String(list.name || ''),
                        links,
                        meta: {
                            createdAt: new Date(list.createdAt || Date.now()).toISOString(),
                            updatedAt: new Date(list.updatedAt || Date.now()).toISOString(),
                            archived: false,
                            completed: false,
                            isDefault: list.isDefault || false,
                            order: typeof list.order === 'number' ? list.order : 0
                        }
                    });
                }
            }

            localStorage.setItem('itemsMigrationComplete', 'true');
            return true;
        } catch (error) {
            console.error('[DBManager] Items migration failed:', error);
            throw error;
        }
    }

    // -------------------------------------------------------------------------
    // SETTINGS
    // -------------------------------------------------------------------------

    static async getSetting(key) {
        await this.init();
        return new Promise((resolve, reject) => {
            const store = this.#db.transaction([DB_CONFIG.STORES.SETTINGS], 'readonly').objectStore(DB_CONFIG.STORES.SETTINGS);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
            req.onerror = () => reject(req.error);
        });
    }

    static async saveSetting(key, value) {
        await this.init();
        return new Promise((resolve, reject) => {
            const store = this.#db.transaction([DB_CONFIG.STORES.SETTINGS], 'readwrite').objectStore(DB_CONFIG.STORES.SETTINGS);
            const req = store.put(value, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    // -------------------------------------------------------------------------
    // PRIVATE HELPERS
    // -------------------------------------------------------------------------

    static #openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_CONFIG.NAME, DB_CONFIG.VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Legacy stores (kept for migration chain)
                if (!db.objectStoreNames.contains(DB_CONFIG.STORES.NOTES)) {
                    db.createObjectStore(DB_CONFIG.STORES.NOTES, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS)) {
                    db.createObjectStore(DB_CONFIG.STORES.LISTS);
                }
                if (!db.objectStoreNames.contains(DB_CONFIG.STORES.IMPORTS)) {
                    db.createObjectStore(DB_CONFIG.STORES.IMPORTS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(DB_CONFIG.STORES.DELETION_TOKENS)) {
                    db.createObjectStore(DB_CONFIG.STORES.DELETION_TOKENS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(DB_CONFIG.STORES.SETTINGS)) {
                    db.createObjectStore(DB_CONFIG.STORES.SETTINGS);
                }

                // v9: unified items store
                if (!db.objectStoreNames.contains(DB_CONFIG.STORES.ITEMS)) {
                    const itemsStore = db.createObjectStore(DB_CONFIG.STORES.ITEMS, { keyPath: 'id' });
                    itemsStore.createIndex('idx_type', 'type', { unique: false });
                    itemsStore.createIndex('idx_archived', 'meta.archived', { unique: false });
                    itemsStore.createIndex('idx_updated', 'meta.updatedAt', { unique: false });
                }

                // v7: split monolithic lists array
                if (event.oldVersion < 7 && db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS)) {
                    const transaction = event.target.transaction;
                    const store = transaction.objectStore(DB_CONFIG.STORES.LISTS);
                    const oldDataRequest = store.get('todoLists');
                    oldDataRequest.onsuccess = () => {
                        if (oldDataRequest.result && Array.isArray(oldDataRequest.result)) {
                            const lists = oldDataRequest.result;
                            lists.forEach(list => {
                                if (list.id) {
                                    const now = Date.now();
                                    store.put({
                                        ...list,
                                        order: typeof list.order === 'number' ? list.order : 0,
                                        createdAt: list.createdAt || now,
                                        updatedAt: list.updatedAt || list.createdAt || now,
                                        lastAccessed: list.lastAccessed || list.createdAt || now
                                    }, list.id);
                                }
                            });
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
                            metadata.sort((a, b) => a.order - b.order);
                            store.put(metadata, 'list-metadata');
                            store.delete('todoLists');
                        } else {
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
                            store.put([{
                                id: 'default',
                                name: 'My Todos',
                                isDefault: true,
                                order: 0,
                                createdAt: now,
                                updatedAt: now,
                                lastAccessed: now,
                                todoCount: 0
                            }], 'list-metadata');
                        }
                    };
                }
            };

            request.onsuccess = (event) => {
                this.#db = event.target.result;
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

    // -------------------------------------------------------------------------
    // MERGE / MOVE / CONVERT HELPERS
    // -------------------------------------------------------------------------

    static async archiveItem(id) {
        const item = await this.getItem(id);
        if (!item) throw new Error('Item not found');
        item.meta = { ...item.meta, archived: true, updatedAt: new Date().toISOString() };
        await this.saveItem(item);
    }

    static async convertNoteToList(noteId) {
        const note = await this.getItem(noteId);
        if (!note || note.type !== 'note') throw new Error('Note not found');

        const title = this.#extractTitle(note.content);
        const lines = (note.content || '').split('\n').map(l => l.trim()).filter(l => l);

        const newList = await this.createItem({
            type: 'list',
            content: title,
            meta: { isDefault: false }
        });

        const links = [];
        for (let i = 0; i < lines.length; i++) {
            const item = await this.createItem({
                type: 'item',
                content: lines[i],
                meta: { completed: false }
            });
            links.push({ id: item.id, order: i });
        }
        newList.links = links;
        await this.saveItem(newList);

        note.meta = { ...note.meta, archived: true, updatedAt: new Date().toISOString() };
        await this.saveItem(note);

        return newList.id;
    }

    static async moveNoteToList(noteId, listId) {
        const note = await this.getItem(noteId);
        const list = await this.getItem(listId);
        if (!note || note.type !== 'note') throw new Error('Note not found');
        if (!list || list.type !== 'list') throw new Error('List not found');

        const item = await this.createItem({
            type: 'item',
            content: note.content || '',
            meta: { completed: false }
        });

        const links = list.links ? [...list.links] : [];
        links.unshift({ id: item.id, order: 0 });
        links.forEach((link, i) => { link.order = i; });

        list.links = links;
        list.meta = { ...list.meta, updatedAt: new Date().toISOString() };
        await this.saveItem(list);

        note.meta = { ...note.meta, archived: true, updatedAt: new Date().toISOString() };
        await this.saveItem(note);
    }

    static async mergeLists(targetId, sourceId, mode = 'smart') {
        const target = await this.getItem(targetId);
        const source = await this.getItem(sourceId);
        if (!target || target.type !== 'list') throw new Error('Target list not found');
        if (!source || source.type !== 'list') throw new Error('Source list not found');

        const sourceLinked = await this.getLinkedItems(sourceId);
        const targetLinked = await this.getLinkedItems(targetId);

        const existingTexts = new Set(
            targetLinked.map(i => (i.content || '').trim().toLowerCase())
        );

        const existingLinks = target.links ? [...target.links] : [];
        const newLinks = [];
        let added = 0;
        let skipped = 0;

        for (const item of sourceLinked) {
            const text = (item.content || '').trim().toLowerCase();
            if (mode === 'smart' && existingTexts.has(text)) {
                skipped++;
                continue;
            }
            newLinks.push({ id: item.id, order: 0 });
            existingTexts.add(text);
            added++;
        }

        const links = [...newLinks, ...existingLinks];
        links.forEach((link, i) => { link.order = i; });
        target.links = links;
        target.meta = { ...target.meta, updatedAt: new Date().toISOString() };
        await this.saveItem(target);

        // Archive the source list after merge
        source.meta = { ...source.meta, archived: true, updatedAt: new Date().toISOString() };
        await this.saveItem(source);

        return { added, skipped };
    }

    static async mergeNotes(targetId, sourceId) {
        const target = await this.getItem(targetId);
        const source = await this.getItem(sourceId);
        if (!target || target.type !== 'note') throw new Error('Target note not found');
        if (!source || source.type !== 'note') throw new Error('Source note not found');

        const divider = '\n\n---\n\n';
        target.content = (target.content || '') + divider + (source.content || '');
        target.meta = { ...target.meta, updatedAt: new Date().toISOString() };
        await this.saveItem(target);

        source.meta = { ...source.meta, archived: true, updatedAt: new Date().toISOString() };
        await this.saveItem(source);
    }

    static async moveItemToList(itemId, fromListId, toListId) {
        const fromList = await this.getItem(fromListId);
        const toList = await this.getItem(toListId);
        if (!fromList || fromList.type !== 'list') throw new Error('Source list not found');
        if (!toList || toList.type !== 'list') throw new Error('Target list not found');

        // Remove from source
        fromList.links = (fromList.links || []).filter(l => l.id !== itemId);
        fromList.links.forEach((l, i) => { l.order = i; });
        fromList.meta = { ...fromList.meta, updatedAt: new Date().toISOString() };
        await this.saveItem(fromList);

        // Add to target (prepend)
        const toLinks = toList.links ? [...toList.links] : [];
        toLinks.unshift({ id: itemId, order: 0 });
        toLinks.forEach((link, i) => { link.order = i; });
        toList.links = toLinks;
        toList.meta = { ...toList.meta, updatedAt: new Date().toISOString() };
        await this.saveItem(toList);
    }

    static async convertItemToNote(itemId, fromListId) {
        const item = await this.getItem(itemId);
        const fromList = await this.getItem(fromListId);
        if (!item) throw new Error('Item not found');
        if (!fromList || fromList.type !== 'list') throw new Error('List not found');

        const note = await this.createItem({
            type: 'note',
            content: item.content || '',
            meta: { completed: false }
        });

        // Remove from source list and delete the item itself
        fromList.links = (fromList.links || []).filter(l => l.id !== itemId);
        fromList.links.forEach((l, i) => { l.order = i; });
        fromList.meta = { ...fromList.meta, updatedAt: new Date().toISOString() };
        await this.saveItem(fromList);
        await this.hardDeleteItem(itemId);

        return note.id;
    }

    static async duplicateItem(itemId) {
        const item = await this.getItem(itemId);
        if (!item) throw new Error('Item not found');

        const copy = await this.createItem({
            type: 'item',
            content: item.content || '',
            meta: { completed: item.meta?.completed || false }
        });

        return copy.id;
    }

    static async copyItemToList(itemId, toListId) {
        const item = await this.getItem(itemId);
        const toList = await this.getItem(toListId);
        if (!item) throw new Error('Item not found');
        if (!toList || toList.type !== 'list') throw new Error('Target list not found');

        const copy = await this.createItem({
            type: 'item',
            content: item.content || '',
            meta: { completed: item.meta?.completed || false }
        });

        const links = toList.links ? [...toList.links] : [];
        links.unshift({ id: copy.id, order: 0 });
        links.forEach((link, i) => { link.order = i; });
        toList.links = links;
        toList.meta = { ...toList.meta, updatedAt: new Date().toISOString() };
        await this.saveItem(toList);

        return copy.id;
    }

    static async duplicateList(listId) {
        const list = await this.getItem(listId);
        if (!list || list.type !== 'list') throw new Error('List not found');

        const newList = await this.createItem({
            type: 'list',
            content: (list.content || 'Unnamed List') + ' (copy)',
            meta: { isDefault: false }
        });

        const linkedItems = await this.getLinkedItems(listId);
        const newLinks = [];
        for (const item of linkedItems) {
            const copy = await this.createItem({
                type: 'item',
                content: item.content || '',
                meta: { completed: item.meta?.completed || false }
            });
            newLinks.push({ id: copy.id, order: newLinks.length });
        }

        newList.links = newLinks;
        await this.saveItem(newList);

        return newList.id;
    }

    static async duplicateNote(noteId) {
        const note = await this.getItem(noteId);
        if (!note || note.type !== 'note') throw new Error('Note not found');

        const copy = await this.createItem({
            type: 'note',
            content: note.content || '',
            meta: { completed: false }
        });

        return copy.id;
    }

    static async copyNoteToList(noteId, listId) {
        const note = await this.getItem(noteId);
        const list = await this.getItem(listId);
        if (!note || note.type !== 'note') throw new Error('Note not found');
        if (!list || list.type !== 'list') throw new Error('List not found');

        const item = await this.createItem({
            type: 'item',
            content: note.content || '',
            meta: { completed: false }
        });

        const links = list.links ? [...list.links] : [];
        links.unshift({ id: item.id, order: 0 });
        links.forEach((link, i) => { link.order = i; });

        list.links = links;
        list.meta = { ...list.meta, updatedAt: new Date().toISOString() };
        await this.saveItem(list);
    }

    static #generateItemId(content, timestamp) {
        const date = timestamp ? new Date(timestamp) : new Date();
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

    static #extractTitle(content) {
        if (!content) return 'Untitled';
        const firstLine = content.split('\n')[0].trim();
        return firstLine.slice(0, 20) || 'Untitled';
    }

    static #legacyNoteToItem(note) {
        const now = new Date().toISOString();
        let content = note.content || '';
        if (note.title) {
            content = note.title + '\n' + content;
        }
        return {
            id: String(note.id),
            type: 'note',
            content: String(content),
            links: [],
            meta: {
                createdAt: note.createdAt || now,
                updatedAt: note.updatedAt || now,
                archived: false,
                completed: false
            }
        };
    }

    static #itemToLegacyNote(item) {
        const lines = (item.content || '').split('\n');
        const title = lines[0] || '';
        const content = lines.slice(1).join('\n');
        return {
            id: item.id,
            title: title,
            content: content,
            createdAt: item.meta.createdAt,
            updatedAt: item.meta.updatedAt
        };
    }

    static async #itemToLegacyList(item) {
        const linkedItems = await this.getLinkedItems(item.id);
        const todos = linkedItems.map((todoItem, index) => ({
            id: todoItem.id,
            text: todoItem.content || '',
            completed: todoItem.meta.completed || false,
            createdAt: todoItem.meta.createdAt,
            order: index
        }));

        return {
            id: item.id,
            name: item.content || '',
            todos: todos,
            isDefault: item.meta.isDefault || false,
            order: typeof item.meta.order === 'number' ? item.meta.order : 0,
            createdAt: item.meta.createdAt || Date.now(),
            updatedAt: item.meta.updatedAt || Date.now(),
            lastAccessed: item.meta.updatedAt || Date.now()
        };
    }
}
