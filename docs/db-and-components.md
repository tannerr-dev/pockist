# DBManager & Components Architecture

This document describes how `DBManager` (the client-side data layer) and the frontend Web Components work together in the Pockist application.

---

## Table of Contents

1. [DBManager Overview](#dbmanager-overview)
2. [The Unified v9 Schema](#the-unified-v9-schema)
3. [Migrations](#migrations)
4. [Component Architecture](#component-architecture)
5. [How They Interact](#how-they-interact)
6. [Data Flow Patterns](#data-flow-patterns)
7. [Key Architectural Patterns](#key-architectural-patterns)
8. [File Reference](#file-reference)

---

## DBManager Overview

`DBManager` is a static-class wrapper around the browser's **IndexedDB**. It is the single source of truth for all client-side data persistence.

**File:** `public/services/DBManager.js`

### Core Responsibilities

- **Database Initialization:** Opens `pockist-db` (version 9) and creates object stores inside `onupgradeneeded`.
- **Schema Management:** Defines the unified `items` store, `settings` store, and `imports` store.
- **Legacy Migrations:** Runs a chain of migrations on app startup to preserve user data across schema versions.
- **CRUD Operations:** Create, read, update, and soft-delete items.
- **Link Resolution:** Lists contain a `links[]` array of references; `DBManager` resolves those IDs into full item objects.
- **Cross-Type Operations:** Convert notes to lists, merge lists, move items, duplicate, etc.
- **Settings & Import Tracking:** Persists user settings and tracks import history to prevent duplicates.
- **Deletion Tokens:** Stores tokens for the share feature so users can delete shares they created.

### Key Methods

```javascript
// Initialization
static async init()
static async migrateFromOldDB()
static async migrateToMultiNoteFormat()
static async migrateFromTodoDB()
static async migrateToItems()

// CRUD
static async createItem(data)
static async getItem(id)
static async saveItem(item)
static async deleteItem(id)      // soft delete (archive)
static async hardDeleteItem(id)  // permanent delete
static async getItems({ type, archived })
static async getAllItems()

// Link resolution
static async getLinkedItems(listId)

// Cross-type operations
static async convertNoteToList(noteId)
static async moveNoteToList(noteId, targetListId)
static async mergeNotes(targetId, sourceId)
static async mergeLists(targetId, sourceId)
static async moveItemToList(itemId, targetListId)
static async convertItemToNote(itemId)
static async duplicateItem(id)
static async duplicateList(id)
static async duplicateNote(id)

// Settings
static async getSetting(key)
static async saveSetting(key, value)

// Import tracking
static async recordImport(hash)
static async hasImportBeenProcessed(hash)
static async getImportHistory()

// Share deletion tokens
static async saveDeletionToken(shareId, token, expiresAt)
static async getDeletionToken(shareId)
static async deleteDeletionToken(shareId)
```

---

## The Unified v9 Schema

Everything is stored as an `item` in a single `items` object store. Notes, lists, and generic items are distinguished by a `type` field.

### Item Shape

```javascript
{
  id: "20260530-120000-my-note",
  type: "note" | "list" | "item",
  content: "string",
  links: [
    { id: "...", order: 0 }
  ],
  meta: {
    createdAt: "ISO-8601",
    updatedAt: "ISO-8601",
    archived: false,
    completed: false,
    isDefault: false,   // lists only
    order: 0            // lists only
  }
}
```

### Object Stores

| Store | Purpose |
|-------|---------|
| `items` | All notes, lists, and todo items (unified) |
| `settings` | Key/value pairs for app configuration |
| `imports` | Hash log of previously imported files/shares |

---

## Migrations

When the app boots, `app.js` runs the migration chain in sequence. Each migration is idempotent and safe to run multiple times.

### Migration Chain (in `app.js`)

```javascript
// On DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
  await DBManager.init();
  await DBManager.migrateFromOldDB();
  await DBManager.migrateToMultiNoteFormat();
  await DBManager.migrateFromTodoDB();
  await DBManager.migrateToItems();
  // ... then router init, SW registration, etc.
});
```

### 1. `migrateFromOldDB()` — v1 to v2

Migrates legacy `textAreaDB` (single-note store) into the multi-note format.

- Opens the old `textAreaDB` database.
- Reads the single stored note.
- Creates a new note item with `type: 'note'` in the unified store.
- Deletes the old database.

### 2. `migrateToMultiNoteFormat()` — v2 to v3

Converts the flat note storage into the multi-note structure with individual note records.

- Reads existing notes from the old format.
- Splits or restructures them into separate note items, each with its own `id` and `meta`.
- Saves each as a distinct `item` with `type: 'note'`.

### 3. `migrateFromTodoDB()` — TodoDB to Lists

Migrates the legacy `TodoDB` (separate todo database) into the new list format.

- Opens the old `TodoDB` database.
- Reads all todo items and their associated list metadata.
- Creates new `list` items and `item` entries in the unified store.
- Preserves completion state and ordering.
- Deletes the old database.

### 4. `migrateToItems()` — v8 to v9 (The Big Unification)

The final migration that unifies everything into a single `items` store.

- Opens the current database.
- Reads all existing notes, lists, and items from their separate stores.
- Transforms each into the unified item shape with `type`, `links`, and `meta`.
- Writes them all into the new `items` store.
- Drops the old separate stores.
- Updates the database version to 9.

### Why Migrations Matter

Because this is a client-side PWA, users may have old data sitting in IndexedDB from previous versions. The migration chain ensures:

- **No data loss:** Old notes and todos are preserved.
- **Forward compatibility:** Once migrated, the app only talks to the unified `items` store.
- **Idempotency:** Running migrations twice is safe; they check for already-migrated data before acting.

---

## Component Architecture

The frontend is built with vanilla JavaScript Web Components (Custom Elements). There are no frameworks like React or Vue. Components are organized around two abstract base classes that contain all shared data logic.

### Abstract Base Classes

#### `ListBase` — `public/components/ListBase.js`

Contains all shared logic for list-related components:

- DB initialization (`await DBManager.init()`)
- List selection and switching
- Item CRUD: add, toggle, edit, archive, move, sort
- List management: create, rename, reorder, merge, archive
- List-selector dialog
- Event delegation for `list-toggle`, `list-edit`, `list-delete`, `list-more-actions`

**Concrete subclasses override:**
- `_getTemplateId()` — which HTML template to clone
- `_setupAddListeners()` / `_setupEventListeners()` — UI wiring
- `_renderContent()` — how to render the list of items
- `_onAfterAdd()`, `_onAfterDelete()` — lifecycle hooks

#### `NoteBase` — `public/components/NoteBase.js`

Contains all shared logic for note-related components:

- DB initialization
- Loading notes from `DBManager`
- Sorting utilities (by date, title, etc.)
- Shared action handlers: share, duplicate, copy to list, convert to list, move to list, merge, archive
- Title extraction, preview generation, date formatting

**Concrete subclasses override:**
- `_getTemplateId()`
- `_setupEventListeners()`
- `_renderContent()`
- `_onAfterLoad()`, `_onAfterSave()` — lifecycle hooks

### Concrete Components

#### List Components

| Component | File | Extends | Purpose |
|-----------|------|---------|---------|
| `List` (`<pockist-list>`) | `public/components/List.js` | `ListBase` | Full list view. Used inside list detail pages and standalone. Renders all items, supports drag-and-drop, DOM animations. |
| `ListWidget` | `public/components/ListWidget.js` | `ListBase` | Homepage widget. Fixed 8-item viewport with Up/Down pagination. Uses `DraggableList` for reordering. |
| `ListDetailPage` | `public/components/ListDetailPage.js` | — | Route `/list/:listId`. Wraps `<pockist-list>`, displays editable list name heading, attaches share/more-actions buttons. |
| `ListIndexPage` | `public/components/ListIndexPage.js` | — | Route `/list`. Grid of all lists with item counts. Supports create, reorder, duplicate, merge, archive, navigate. |
| `ListItem` | `public/components/ListItem.js` | — | Custom element representing a single todo item inside a list. |

#### Note Components

| Component | File | Extends | Purpose |
|-----------|------|---------|---------|
| `NoteWidget` | `public/components/NoteWidget.js` | `NoteBase` | Homepage notes widget. Fixed 5-item viewport with Up/Down pagination. |
| `NoteIndexPage` | `public/components/NoteIndexPage.js` | `NoteBase` | Route `/note`. Full notes list with sort controls. |
| `NoteDetailPage` | `public/components/NoteDetailPage.js` | — | Route `/note/:noteId`. Note editor with auto-save, share, and more-actions. |
| `NoteItem` | `public/components/NoteItem.js` | — | Custom element representing a single note card in index/widget views. |

#### Other Pages & Components

| Component | File | Purpose |
|-----------|------|---------|
| `HomePage` | `public/components/HomePage.js` | Reads widget layout from `DBManager.getSetting('homepage-layout')` and injects widgets into zones. |
| `ArchivePage` | `public/components/ArchivePage.js` | Displays archived notes, lists, and items grouped by type. Supports restore (un-archive). |
| `ShareButton` | `public/components/ShareButton.js` | Trigger button for sharing an item. |
| `ShareView` | `public/components/ShareView.js` | Displays shared content from a URL and allows import/download. |
| `HomeSettingsDrawer` | `public/components/HomeSettingsDrawer.js` | Drawer for configuring homepage widgets. |
| `MyNav` | `public/components/MyNav.js` | Navigation component. |

---

## How They Interact

### Initialization & Migration Flow

```
app.js (DOMContentLoaded)
  |
  +---> DBManager.init()
  +---> DBManager.migrateFromOldDB()
  +---> DBManager.migrateToMultiNoteFormat()
  +---> DBManager.migrateFromTodoDB()
  +---> DBManager.migrateToItems()
  |
  +---> Router.init()
  +---> Service Worker registration
  +---> setupImportExportHandlers()
```

Every component that needs data calls `await DBManager.init()` before reading. This is safe because `init()` is a no-op if the DB is already open.

### Component -> DBManager Data Flow

Components do **not** cache state for long. They follow a load-mutate-reload pattern:

1. **Load** from `DBManager` on mount / connectedCallback.
2. **Mutate** via `DBManager` methods.
3. **Re-load** from `DBManager` after mutations to refresh local state and re-render.

#### Example: ListBase Adding an Item

```javascript
// Inside ListBase
async _handleAdd(text) {
  // 1. Create the new item
  const newItem = await DBManager.createItem({
    type: 'item',
    content: text
  });

  // 2. Link it to the current list
  this._listItem.links.push({
    id: newItem.id,
    order: this._linkedItems.length
  });

  // 3. Save the updated list
  await DBManager.saveItem(this._listItem);

  // 4. Reload linked items and re-render
  this._linkedItems = await DBManager.getLinkedItems(this._listItem.id);
  this._renderContent();
}
```

#### Example: NoteDetailPage Auto-Save

```javascript
// Inside NoteDetailPage
this._textarea.addEventListener('input', () => {
  clearTimeout(this._saveTimeout);
  this._saveTimeout = setTimeout(() => {
    this._note.content = this._textarea.value;
    DBManager.saveItem(this._note);
    this._updateSavedIndicator();
  }, 1000); // debounce 1s
});

this._textarea.addEventListener('blur', () => {
  clearTimeout(this._saveTimeout);
  this._note.content = this._textarea.value;
  DBManager.saveItem(this._note);
});
```

### Component -> Component Communication (Custom Events)

Because this is vanilla JS with Web Components, child-to-parent communication uses **Custom Events** that bubble up the DOM.

#### ListItem Events (bubbling up to ListBase)

| Event | Detail | Handler in ListBase |
|-------|--------|---------------------|
| `list-toggle` | `{ itemId, completed }` | `_toggleItem()` |
| `list-edit` | `{ itemId, text }` | `_editItem()` |
| `list-delete` | `{ itemId }` | `_deleteItem()` |
| `list-more-actions` | `{ itemId }` | `_showMoreActions()` |

```javascript
// In ListBase
this._listsContainerEl.addEventListener('list-toggle', (e) => {
  this._toggleItem(e.detail.itemId, e.detail.completed);
});
```

#### NoteItem Events (bubbling up to NoteBase)

| Event | Detail | Handler |
|-------|--------|---------|
| `note-open` | `{ noteId }` | Navigate to `/note/:noteId` |
| `note-more-actions` | `{ noteId }` | Show actions dialog |

### Props / Attributes

Web Components pass data via **HTML attributes** and **JS properties**:

| Element | Attributes / Properties |
|---------|------------------------|
| `<list-item>` | `itemId`, `text`, `completed`, `index`, `total` |
| `<note-item>` | `note-id`, `title`, `preview`, `date` |
| `<pockist-list>` | `list-id` (optional, locks to a specific list) |
| `<share-button>` | `type`, `data-id`, `title` |

---

## Data Flow Patterns

### Homepage Layout Flow

```
HomePage
  |
  +---> DBManager.getSetting('homepage-layout')
  +---> WidgetRegistry.getDefaultLayout() (fallback)
  +---> For each widgetId in layout.main:
        +---> createElement(widget.tag)
        +---> inject into [data-zone="main"]
```

Widgets like `NoteWidget` and `ListWidget` are self-contained: they fetch their own data from `DBManager` on mount.

### Share & Import/Export Flow

#### Sharing

```
ShareButton (click)
  |
  +---> ShareService.createShare(type, data, title)
        +---> POST /api/share
        +---> DBManager.saveDeletionToken(shareId, token, expiresAt)
        +---> copy URL to clipboard
```

#### Receiving a Share

```
ShareView (on /share/:id)
  |
  +---> ShareService.getShare(shareId)
  +---> ShareService.importToLocal(shareData)
        +---> ImportExportService.importFromShare(payload)
              +---> DBManager.getItem() / saveItem() (merge/create logic)
              +---> DBManager.recordImport()
```

#### Export

```
App Export Button
  |
  +---> ImportExportService.exportAll()
        +---> DBManager.getAllItems()
        +---> download JSON file
```

#### Import

```
App Import Button
  |
  +---> ImportExportService.importFromFile(file)
        +---> read file -> JSON or Markdown
        +---> DBManager.getItem() / saveItem()
        +---> DBManager.recordImport()
        +---> window.location.reload()
```

---

## Key Architectural Patterns

### 1. Unified Items Store (v9 Schema)

There are no separate `notes` and `lists` tables at runtime. Views are just queries:

- **Notes:** `getItems({ type: 'note', archived: false })`
- **Lists:** `getItems({ type: 'list', archived: false })`
- **Archive:** `getItems({ archived: true })`

Links between lists and their items are stored as an array of `{ id, order }` references, not embedded objects. This avoids deep nesting and keeps items independently accessible.

### 2. Abstract Base Classes for DRY Logic

`ListBase` and `NoteBase` contain all data logic. Concrete subclasses only override presentation and lifecycle hooks:

- `_getTemplateId()`
- `_setupAddListeners()` / `_setupEventListeners()`
- `_renderContent()`
- `_onAfterAdd()`, `_onAfterDelete()`, `_onAfterLoad()`

### 3. Optimistic UI with Rollback

Components update the DOM immediately (e.g., toggle checkbox, move item), then call `DBManager.saveItem()`. If the save fails, they revert the DOM change and reload from the DB.

### 4. Soft Deletes (Archiving)

Nothing is permanently deleted through normal UI. `deleteItem()` sets `meta.archived = true`. `hardDeleteItem()` exists but is only used internally for orphaned links or migrations. The `ArchivePage` allows restoring archived items.

### 5. Debounced Auto-Save

`NoteDetailPage` and `ListDetailPage` use `setTimeout` debouncing (1000ms) on `input` events, with an immediate save on `blur`. This prevents excessive IndexedDB writes while typing.

### 6. Dialog-Driven Actions

Most complex actions (merge, copy, move, convert) use `DialogService` to present choices, then call `DBManager` methods. This keeps UI logic decoupled from data logic.

### 7. No Build Step / Vanilla JS

The project uses ES modules directly in the browser, Web Components (custom elements, templates, light DOM), and no frontend framework. This aligns with the project's goal of learning fundamentals and staying lightweight.

### 8. Service Worker & PWA

`app.js` registers `/sw.js`. An update banner is shown when a new service worker is installed, prompting the user to refresh for the latest version.

---

## File Reference

### Core Service

| File | Purpose |
|------|---------|
| `public/services/DBManager.js` | Central IndexedDB wrapper and migration runner |

### App Entry Point

| File | Purpose |
|------|---------|
| `public/app.js` | Boots app, runs migrations, initializes router, registers SW |

### Abstract Base Classes

| File | Purpose |
|------|---------|
| `public/components/ListBase.js` | Shared list logic (CRUD, selection, management) |
| `public/components/NoteBase.js` | Shared note logic (load, sort, actions) |

### List Components

| File | Purpose |
|------|---------|
| `public/components/List.js` | Full list view with all items and drag-and-drop |
| `public/components/ListWidget.js` | Homepage list widget with pagination |
| `public/components/ListDetailPage.js` | Route `/list/:listId`, wraps `<pockist-list>` |
| `public/components/ListIndexPage.js` | Route `/list`, grid of all lists |
| `public/components/ListItem.js` | Single todo item custom element |

### Note Components

| File | Purpose |
|------|---------|
| `public/components/NoteWidget.js` | Homepage notes widget with pagination |
| `public/components/NoteIndexPage.js` | Route `/note`, full notes list |
| `public/components/NoteDetailPage.js` | Route `/note/:noteId`, note editor with auto-save |
| `public/components/NoteItem.js` | Single note card custom element |

### Other Pages & Components

| File | Purpose |
|------|---------|
| `public/components/HomePage.js` | Homepage layout and widget injection |
| `public/components/ArchivePage.js` | Archived items view with restore |
| `public/components/ShareButton.js` | Share trigger button |
| `public/components/ShareView.js` | Share display and import |
| `public/components/HomeSettingsDrawer.js` | Homepage widget configuration drawer |
| `public/components/MyNav.js` | Navigation component |
| `public/components/WidgetRegistry.js` | Widget metadata registry |

### Services

| File | Purpose |
|------|---------|
| `public/services/ImportExportService.js` | JSON/Markdown import and export |
| `public/services/ShareService.js` | Frontend API client for `/api/share` |
| `public/services/DialogService.js` | Reusable modal/dialog primitives |
| `public/services/DraggableList.js` | Drag-and-drop reordering utility |
| `public/services/Router.js` | Vanilla JS client-side router |
| `public/services/Store.js` | Simple reactive store (auth/JWT state) |
| `public/services/API.js` | Backend API client |
| `public/services/WeatherService.js` | Weather data fetching |
