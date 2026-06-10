# Database Schema Migration Plan (v9 → v10)

## Overview
Migrate the unified `items` store to use a dedicated `items` array for list children, while reserving `links` for general inter-item relationships. Also delete the old `notes` and `lists` object stores.

## Changes Summary

### DBManager.js
1. **Version bump**: `VERSION: 9` → `VERSION: 10`
2. **Comment update**: Update header comment to reflect v10 schema
3. **Store cleanup in `onupgradeneeded`**: Delete old `notes` and `lists` stores after confirming migration
4. **New index**: Add `idx_items` index on `items` array (optional, but useful for querying)
5. **Rename `getLinkedItems` → `getListItems`**
6. **Rename `updateLinkOrder` → `updateItemOrder`**
7. **Update `createItem`**: Initialize `items: []` alongside `links: []`
8. **Update `saveList`**: Replace `links` with `items` for todo syncing
9. **Update `migrateToItems`**: Use `items` array when creating lists
10. **Add `migrateToItemsArray()`**: Migrate existing lists from `links` to `items`
11. **Update all merge/move/convert helpers**: Replace `links` with `items` for list operations
12. **Update `deleteList`**: Use `items` array for cleanup
13. **Update `getListMetadata`**: Count from `items` array
14. **Update `#itemToLegacyList`**: Use `items` array

### app.js
- Add `DBManager.migrateToItemsArray()` call after `migrateToItems()`

### ListBase.js
- Replace all `links` references with `items` for list CRUD operations
- `_getLinkedItems()` stays but uses `items` array internally

### ListIndexPage.js
- `item.links?.length` → `item.items?.length` for item count

### ListDetailPage.js
- `getLinkedItems` → `getListItems`

### NoteBase.js / NoteIndexPage.js / NoteDetailPage.js
- `l.links?.length` → `l.items?.length` for list subtitles in dialogs

### ImportExportService.js
- `links` → `items` for list exports
- `getLinkedItems` → `getListItems`

### ShareView.js
- `links` → `items` for list exports

### ShareButton.js
- `getLinkedItems` → `getListItems`

### ArchivePage.js
- `links` → `items` for parent list operations, deleting items from lists, cleanup

## Detailed Edits

### DBManager.js - VERSION and comment
```javascript
// Change:
 * Unified v9 schema: everything is an 'item' in a single object store.
 * Views (notes, lists, archive) are just queries on the items store.
 */

const DB_CONFIG = {
    NAME: 'pockist-db',
    VERSION: 9,

// To:
 * Unified v10 schema: everything is an 'item' in a single object store.
 * Lists track child items via 'items' array.
 * 'links' array is reserved for general item relationships (notes, lists, etc.).
 * Views (notes, lists, archive) are just queries on the items store.
 */

const DB_CONFIG = {
    NAME: 'pockist-db',
    VERSION: 10,
```

### DBManager.js - onupgradeneeded (delete old stores)
After creating the items store, add:
```javascript
// v10: delete legacy stores after migration
if (event.oldVersion < 10) {
    if (db.objectStoreNames.contains(DB_CONFIG.STORES.NOTES)) {
        db.deleteObjectStore(DB_CONFIG.STORES.NOTES);
    }
    if (db.objectStoreNames.contains(DB_CONFIG.STORES.LISTS)) {
        db.deleteObjectStore(DB_CONFIG.STORES.LISTS);
    }
}
```

### DBManager.js - getLinkedItems → getListItems
```javascript
// Change:
    static async getLinkedItems(listId) {
        const list = await this.getItem(listId);
        if (!list || !Array.isArray(list.links)) return [];
        const links = [...list.links].sort((a, b) => (a.order || 0) - (b.order || 0));
// To:
    static async getListItems(listId) {
        const list = await this.getItem(listId);
        if (!list || !Array.isArray(list.items)) return [];
        const items = [...list.items].sort((a, b) => (a.order || 0) - (b.order || 0));
        const results = [];
        for (const item of items) {
            const result = await this.getItem(item.id);
            if (result) results.push(result);
        }
        return results;
    }
```

### DBManager.js - updateLinkOrder → updateItemOrder
```javascript
    static async updateItemOrder(listId, newItems) {
        const list = await this.getItem(listId);
        if (!list) throw new Error('List not found');
        list.items = newItems;
        await this.saveItem(list);
    }
```

### DBManager.js - createItem
```javascript
// Change:
            links: data.links || [],
// To:
            links: data.links || [],
            items: data.items || [],
```

### DBManager.js - saveList
Replace all `links` with `items` in the todo syncing logic.

### DBManager.js - migrateToItems
Replace `links` with `items` when creating lists from legacy data.

### DBManager.js - migrateToItemsArray (new method)
```javascript
    static async migrateToItemsArray() {
        if (localStorage.getItem('itemsArrayMigrationComplete') === 'true') return false;
        try {
            await this.init();
            const lists = await this.getItems({ type: 'list' });
            for (const list of lists) {
                if (Array.isArray(list.links) && list.links.length > 0 && (!list.items || list.items.length === 0)) {
                    list.items = [...list.links];
                    list.links = [];
                    await this.saveItem(list);
                }
            }
            localStorage.setItem('itemsArrayMigrationComplete', 'true');
            return true;
        } catch (error) {
            console.error('[DBManager] Items array migration failed:', error);
            throw error;
        }
    }
```

### DBManager.js - deleteList
```javascript
// Change:
        if (item.links) {
            for (const link of item.links) {
                await this.deleteItem(link.id);
            }
        }
// To:
        if (item.items) {
            for (const itemRef of item.items) {
                await this.deleteItem(itemRef.id);
            }
        }
```

### DBManager.js - getListMetadata
```javascript
// Change:
            todoCount: item.links ? item.links.length : 0
// To:
            todoCount: item.items ? item.items.length : 0
```

### DBManager.js - convertNoteToList
```javascript
// Change:
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
// To:
        const items = [];
        for (let i = 0; i < lines.length; i++) {
            const item = await this.createItem({
                type: 'item',
                content: lines[i],
                meta: { completed: false }
            });
            items.push({ id: item.id, order: i });
        }
        newList.items = items;
```

### DBManager.js - moveNoteToList
```javascript
// Change:
        const links = list.links ? [...list.links] : [];
        links.unshift({ id: item.id, order: 0 });
        links.forEach((link, i) => { link.order = i; });
        list.links = links;
// To:
        const items = list.items ? [...list.items] : [];
        items.unshift({ id: item.id, order: 0 });
        items.forEach((itemRef, i) => { itemRef.order = i; });
        list.items = items;
```

### DBManager.js - mergeLists
```javascript
// Change:
        const existingLinks = target.links ? [...target.links] : [];
        const newLinks = [];
        for (const item of sourceLinked) {
            newLinks.push({ id: item.id, order: 0 });
        }
        const links = [...newLinks, ...existingLinks];
        links.forEach((link, i) => { link.order = i; });
        target.links = links;
// To:
        const existingItems = target.items ? [...target.items] : [];
        const newItems = [];
        for (const item of sourceLinked) {
            newItems.push({ id: item.id, order: 0 });
        }
        const items = [...newItems, ...existingItems];
        items.forEach((itemRef, i) => { itemRef.order = i; });
        target.items = items;
```

### DBManager.js - moveItemToList
```javascript
// Change:
        fromList.links = (fromList.links || []).filter(l => l.id !== itemId);
        fromList.links.forEach((l, i) => { l.order = i; });
        const toLinks = toList.links ? [...toList.links] : [];
        toLinks.unshift({ id: itemId, order: 0 });
        toLinks.forEach((link, i) => { link.order = i; });
        toList.links = toLinks;
// To:
        fromList.items = (fromList.items || []).filter(l => l.id !== itemId);
        fromList.items.forEach((l, i) => { l.order = i; });
        const toItems = toList.items ? [...toList.items] : [];
        toItems.unshift({ id: itemId, order: 0 });
        toItems.forEach((itemRef, i) => { itemRef.order = i; });
        toList.items = toItems;
```

### DBManager.js - convertItemToNote
```javascript
// Change:
        fromList.links = (fromList.links || []).filter(l => l.id !== itemId);
        fromList.links.forEach((l, i) => { l.order = i; });
// To:
        fromList.items = (fromList.items || []).filter(l => l.id !== itemId);
        fromList.items.forEach((l, i) => { l.order = i; });
```

### DBManager.js - copyItemToList
```javascript
// Change:
        const links = toList.links ? [...toList.links] : [];
        links.unshift({ id: copy.id, order: 0 });
        links.forEach((link, i) => { link.order = i; });
        toList.links = links;
// To:
        const items = toList.items ? [...toList.items] : [];
        items.unshift({ id: copy.id, order: 0 });
        items.forEach((itemRef, i) => { itemRef.order = i; });
        toList.items = items;
```

### DBManager.js - duplicateList
```javascript
// Change:
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
// To:
        const linkedItems = await this.getListItems(listId);
        const newItems = [];
        for (const item of linkedItems) {
            const copy = await this.createItem({
                type: 'item',
                content: item.content || '',
                meta: { completed: item.meta?.completed || false }
            });
            newItems.push({ id: copy.id, order: newItems.length });
        }
        newList.items = newItems;
```

### DBManager.js - copyNoteToList
```javascript
// Change:
        const links = list.links ? [...list.links] : [];
        links.unshift({ id: item.id, order: 0 });
        links.forEach((link, i) => { link.order = i; });
        list.links = links;
// To:
        const items = list.items ? [...list.items] : [];
        items.unshift({ id: item.id, order: 0 });
        items.forEach((itemRef, i) => { itemRef.order = i; });
        list.items = items;
```

### DBManager.js - #itemToLegacyList
```javascript
// Change:
        const linkedItems = await this.getLinkedItems(item.id);
// To:
        const linkedItems = await this.getListItems(item.id);
```

### app.js
```javascript
// After:
    try {
        const itemsResult = await DBManager.migrateToItems();
    } catch (err) {
        console.error("[App] migrateToItems failed:", err);
    }

// Add:
    try {
        const itemsArrayResult = await DBManager.migrateToItemsArray();
    } catch (err) {
        console.error("[App] migrateToItemsArray failed:", err);
    }
```

### ListBase.js
All references to `listItem.links` for child items should become `listItem.items`.
- `_handleAdd()`: `listItem.links` → `listItem.items`
- `_moveItem()`: `listItem.links` → `listItem.items`
- `_clearCompleted()`: `listItem.links` → `listItem.items`
- `_sortItems()`: `listItem.links` → `listItem.items`
- `_showItemActions()`: `listItem.links` → `listItem.items`
- `_doDuplicateItem()`: `listItem.links` → `listItem.items`
- `_reorderItem()`: `listItem.links` → `listItem.items`
- `_moveItemToTop()`: `listItem.links` → `listItem.items`
- `_moveItemToBottom()`: `listItem.links` → `listItem.items`
- `_loadCurrentList()`: uses `getLinkedItems` → `getListItems`

### ListIndexPage.js
```javascript
// Change:
			const total = item.links ? item.links.length : 0;
// To:
			const total = item.items ? item.items.length : 0;
```

### ListDetailPage.js
```javascript
// Change:
		const items = await DBManager.getLinkedItems(this._listId);
// To:
		const items = await DBManager.getListItems(this._listId);
```

### NoteBase.js / NoteIndexPage.js / NoteDetailPage.js
```javascript
// Change:
			lists.map(l => ({ id: l.id, title: ..., subtitle: `${l.links?.length || 0} items` })),
// To:
			lists.map(l => ({ id: l.id, title: ..., subtitle: `${l.items?.length || 0} items` })),
```

### ImportExportService.js
- `item.links` → `item.items` for list checks
- `getLinkedItems` → `getListItems`
- `existingLinks` → `existingItems` / `newItems` etc.

### ShareView.js
- `listItem?.links` → `listItem?.items` for sorting and export

### ShareButton.js
- `getLinkedItems` → `getListItems`

### ArchivePage.js
- `list.links?.some(l => l.id === itemId)` → `list.items?.some(l => l.id === itemId)`
- `list.links = list.links.filter(...)` → `list.items = list.items.filter(...)`
- `getLinkedItems` → `getListItems`

## Testing Checklist
- [ ] Create a new list and add items
- [ ] Reorder items via drag-and-drop
- [ ] Toggle complete, sort, archive complete
- [ ] Move items between lists
- [ ] Convert item to note
- [ ] Copy note to list
- [ ] Export a list (includes items)
- [ ] Import a list (restores items)
- [ ] Archive a list item
- [ ] Restore archived item
- [ ] Permanently delete archived list
- [ ] Check list item count in UI
- [ ] Verify old `notes` and `lists` stores are deleted
