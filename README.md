# new home
https://codeberg.org/tannerr/pockist

---


# pockist
#personalproject

*pocket assistant*

https://pockist.com

---

## TODO / Reminders

### Drop old IndexedDB stores (notes, lists)

In a future DB version bump (v10+), drop the legacy `notes` and `lists` IndexedDB object stores after confirming the unified `items` migration has completed.

The full migration chain must remain intact for users upgrading from v8 or earlier, but once `migrateToItems()` has successfully copied data into `items`, the old stores are orphaned and can be deleted inside `onupgradeneeded`.

Plan:
1. Bump `DB_VERSION` to 10
2. In `onupgradeneeded` (oldVersion < 10):
   - Check `localStorage.getItem('itemsMigrationComplete')`
   - If true, `db.deleteObjectStore('notes')` and `db.deleteObjectStore('lists')`
   - If false (e.g. v8 → v10 direct), inline-migrate data first, then delete
3. `migrateToItems()` becomes a no-op if old stores don't exist

This will also be the point to clean up the legacy `TodoDB` and `textAreaDB` migration code if desired.


I am using golang with sqlite on the backend with html, css, and javascript on the frontend. 
Deployed with docker on a five dollar vps.

This is a "vanilla" project, with the least amount of dependencies as possible. 
I chose thie because I want to learn the fundamentals of every "tool" in the stack, 
to be as lightweight as possible and to avoid package driven development.

The idea is to have a self hosted private personal data app for my daily needs.

I know there are probably options for selfhosted apps for these things,
but I am using this as a learning experience and because its fun.

Pockist Cloud coming soon?

## Deploy notes

### Local: Build and package
docker build -t pockist:latest .
docker save pockist:latest | gzip > pockist.tar.gz
scp pockist.tar.gz user@server:/opt/pockist/

### Server: Deploy
ssh user@server "cd /opt/pockist && docker load < pockist.tar.gz && docker stop pockist && docker rm pockist && docker run -d --name pockist -p 8080:8080 pockist:latest"
Note: The scripts assume you have SSH access to your server and Docker is installed there. Update SERVER_HOST, SERVER_USER, and other variables as needed.

## Docker Build Cache

The `Dockerfile` is optimized so that changes to the `public/` directory (static assets) do not force a full `go build` recompile.

How it works:
- `COPY` instructions explicitly list only the Go source files (`main.go`, `handlers/`, `pkg/`, `token/`) before the build step.
- `.dockerignore` excludes `data/`, `.git/`, `.env`, `.air.toml`, docs, and packaging files from the build context.
- `public/` is copied into the builder stage **after** the binary is compiled.
- The final stage pulls both the binary and `public/` from the builder.

**Why:** If you change a CSS file or a JS component, Docker will reuse the cached compiled binary and only rebuild the layers that copy assets into the final image.

**Note:** If you add a new Go package directory, add a corresponding `COPY` line in the Dockerfile before the `go build` step.

## Fully Manual Deploy

### Local: Build and package
docker build -t pockist:latest . && docker save pockist:latest | gzip > pockist.tar.gz && scp pockist.tar.gz user@server:/opt/pockist/

### Server: Deploy
cd /opt/pockist && docker stop pockist && docker rm pockist && docker load < pockist.tar.gz && docker run -d --name pockist -p 8081:8081 pockist:latest


---


## Dependencies not checked into git

[Observable Plot & D3](https://observablehq.com/plot/getting-started)

d3.min.js

plot.min.js

or

```javascript
<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
<script src="https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6"></script>
```

---

## Cache control

- everything 30 seconds on client
- weather api 20 min on server
- geolocation like 7 days?

---

## Share Feature

Pockist now supports sharing notes and lists via temporary, self-destructing links.

### Overview

The share feature allows users to create temporary shareable links for individual notes, todo lists, or full backups. These links are active for **24 hours** and are automatically deleted from the server after expiration.

### Features

- **Temporary Shares**: All shared content expires after 24 hours
- **Self-Deletion**: Only the creator can delete a share before it expires
- **Import/Download**: Recipients can import shared content directly into their local IndexedDB or download as a JSON file
- **Rate Limiting**: 5 shares per hour per IP address
- **Security**: HTML sanitization removes all script tags and potentially harmful content

### How It Works

1. **Creating a Share**: User clicks the "Share" button on a note or list
2. **Deletion Token**: When a share is created, a unique deletion token is stored in the creator's browser (IndexedDB)
3. **Sharing**: Creator copies the share URL and sends it to recipients
4. **Viewing**: Recipients open the URL to view the shared content
5. **Import**: Recipients can import the content into their local database
6. **Deletion**: Creator can delete the share at any time using their deletion token

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/share` | POST | Create a new share |
| `/api/share/{id}` | GET | Retrieve shared content |
| `/api/share/{id}` | DELETE | Delete a share (requires deletion token) |

### Technical Details

- **Storage**: SQLite database with automatic cleanup of expired shares
- **Size Limit**: Maximum 500KB per share
- **Background Cleanup**: Expired shares are removed every 10 minutes
- **Creator Identification**: Determined by presence of deletion token in IndexedDB (no account required)

### Docker Volume

To persist shared data across container restarts, mount a volume:

```yaml
volumes:
  pockist-data:
services:
  app:
    volumes:
      - pockist-data:/app/data
```

The SQLite database is stored at `/app/data/pockist.db`.

---

## Import/Export Feature

Pockist supports importing and exporting data for backup and migration purposes.

### Features

- **Full Backup**: Export all items as a single JSON file
- **Individual Export**: Export specific notes or lists
- **Import**: Import data from JSON files with merge options
- **Smart Merge**: Skip duplicate items when importing lists
- **Duplicate Detection**: Tracks imported files to prevent accidental re-imports
- **Version Tracking**: Export format versioning for future compatibility
- **Backwards Compatible**: Can still import v1.0 backups

### File Format v2.0 (Current)

Uses the unified `items` schema:

```json
{
  "version": "2.0",
  "type": "pockist-backup",
  "scope": "full|note|list",
  "exportId": "uuid-timestamp",
  "exportedAt": "2026-04-28T10:30:00Z",
  "appVersion": "1.0.0",
  "data": {
    "items": [
      {
        "id": "note-20260530",
        "type": "note",
        "content": "Note title\nNote body...",
        "links": [],
        "meta": {
          "createdAt": "2026-05-30T10:00:00Z",
          "updatedAt": "2026-05-30T10:00:00Z",
          "archived": false,
          "completed": false
        }
      },
      {
        "id": "list-20260530",
        "type": "list",
        "content": "My List",
        "links": [
          { "id": "item-1", "order": 0 },
          { "id": "item-2", "order": 1 }
        ],
        "meta": {
          "createdAt": "2026-05-30T10:00:00Z",
          "updatedAt": "2026-05-30T10:00:00Z",
          "archived": false,
          "completed": false,
          "isDefault": false,
          "order": 0
        }
      }
    ]
  }
}
```

### Legacy File Format v1.0

Older backups used separate `notes` and `lists` arrays. These are automatically converted to the unified v2.0 format during import and shown the same merge dialog as v2.0 backups.

```json
{
  "version": "1.0",
  "type": "pockist-backup",
  "data": {
    "notes": [...],
    "lists": [...]
  }
}
```

### Usage

Access import/export via the hamburger menu (drawer):
- **Export All**: Creates a timestamped backup file
- **Import Data**: Select a JSON file to import

### Import Options

When importing a single note or list, you can choose:

- **Create New**: Import as fresh items (renames conflicts)
- **Smart Merge** (lists only): Skip duplicate items, add only new ones
- **Append to Existing**: Add all items to an existing note/list

When importing a full backup:
- **Create All New**: Import everything as fresh items

---

## Full-Text Search

Pockist supports searching across all notes, lists, and list items from any page.

### Features

- **Universal Scope**: Search matches note content, list names, and individual list item text
- **Multi-term Matching**: Splits query on whitespace; all terms must match (AND logic)
- **Archived Items**: Archived notes and items appear in search results with an "Archived" badge
- **Text Highlighting**: Matching terms are highlighted in the search results
- **Keyboard Shortcut**: Press `/` on desktop to instantly focus the search input
- **Parent Navigation**: Clicking a list item result navigates to its parent list and scrolls to / highlights the item

### How It Works

1. **Trigger**: Click the search icon in the top nav, or press `/`
2. **Search Overlay**: A popover panel appears with a live search input
3. **Debounced Results**: Search runs 200ms after you stop typing
4. **Grouped Results**: Results are grouped by type — Notes, Lists, List Items — each with a count
5. **Navigation**: Click any result to jump directly to it

### Implementation

- **Frontend only**: Search runs entirely in the browser via IndexedDB
- `DBManager.searchItems(query)` — fetches all items, builds a **reverse parent lookup Map** once per search (itemId → list), then filters by matching terms
- `SearchPopover` component — overlay UI with debounced search, highlighting, and result grouping
- `ListBase._checkScrollToItem()` — after navigating to a list from a search result, scrolls to the target item and plays a brief pulse highlight animation

---


