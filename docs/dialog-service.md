# DialogService — Deep Dive

This document explains `DialogService` (`public/services/DialogService.js`) in detail, with a focus on **timing, state management, the native `<dialog>` API usage, and logic flaws** that could cause bugs.

---

## Table of Contents

1. [What It Is](#what-it-is)
2. [Architecture Overview](#architecture-overview)
3. [The Native `<dialog>` API](#the-native-dialog-api)
4. [Method Reference](#method-reference)
5. [Timing & Event Flow](#timing--event-flow)
6. [The Keyboard Adjustment System](#the-keyboard-adjustment-system)
7. [XSS Prevention](#xss-prevention)
8. [Integration with Components](#integration-with-components)
9. [Known Logic Flaws & Race Conditions](#known-logic-flaws--race-conditions)
10. [Annotated Code Reference](#annotated-code-reference)
11. [File Reference](#file-reference)

---

## What It Is

`DialogService` is a singleton object that provides **modal dialog primitives** for the Pockist PWA. It creates, manages, and destroys native `<dialog>` elements on demand. Every method returns a `Promise`, making it easy to use with `async/await`.

**File:** `public/services/DialogService.js`

### Why Native `<dialog>`?

- Built into the browser (no library dependency).
- Handles focus trapping, backdrop click, and Escape key automatically.
- `showModal()` creates a top-layer that blocks interaction with the rest of the page.
- Accessible by default (ARIA roles, focus management).

---

## Architecture Overview

### Singleton Pattern

```javascript
export const DialogService = {
  confirm(message, confirmText) { ... },
  prompt(message, defaultValue) { ... },
  promptTextarea(message, defaultValue, onChange) { ... },
  showActions(actions) { ... },
  pickItem(items, options) { ... },
  escapeHtml(text) { ... },
  _adjustDialogForKeyboard(dialog) { ... }
};
```

There is no constructor or instance state. Every call creates a fresh `<dialog>` element, appends it to `document.body`, and returns a `Promise` that resolves when the dialog closes.

### Lifecycle of Every Dialog

```
1. Caller invokes DialogService.confirm() [or prompt, showActions, etc.]
   |
2. Create <dialog> element dynamically
   ├── Set className
   ├── Build innerHTML from template + escaped user data
   └── Append to document.body
   |
3. Wire up event listeners (buttons, input keydown, backdrop click, close)
   |
4. dialog.showModal() — dialog appears, page is blocked
   |
5. _adjustDialogForKeyboard(dialog) — starts visualViewport tracking
   |
6. User interacts (clicks button, presses Enter/Escape, taps backdrop)
   |
7. Handler calls dialog.close()
   |
8. "close" event fires → cleanup() → dialog.remove() → Promise resolves
   |
9. Back in caller: await returns with value
```

---

## The Native `<dialog>` API

`DialogService` relies on the browser's `<dialog>` element. Understanding these native behaviors is critical:

| Method | Behavior |
|--------|----------|
| `dialog.showModal()` | Opens dialog modally. Creates a backdrop. Traps focus. Blocks the page. |
| `dialog.close()` | Closes the dialog. Fires a `close` event. Does NOT remove the element from DOM. |
| `dialog.open` | Boolean property. `true` while modal is open. |
| `dialog.returnValue` | String you can pass to `close(returnValue)`. Not used by DialogService. |

### Native Events

| Event | When | Default Behavior |
|-------|------|------------------|
| `close` | After `dialog.close()` | None (customizable) |
| `cancel` | User presses Escape | Calls `dialog.close()` |
| `click` on backdrop | User clicks outside dialog content | Not handled natively; DialogService wires this manually. |

**Important:** The `close` event fires **after** `dialog.close()` has been called. If you call `dialog.remove()` before `dialog.close()`, the `close` event never fires.

---

## Method Reference

### `confirm(message, confirmText = "Confirm")`

**Returns:** `Promise<boolean>` — `true` if confirmed, `false` if cancelled.

**Buttons:** Cancel (ghost), Confirm (outline).

**Close paths:**
- Click "Cancel" → resolves `false`
- Click "Confirm" → resolves `true`
- Click backdrop → resolves `false`
- Press Escape → resolves `false` (via native `cancel` → `close` → `close` event)

```javascript
const shouldDelete = await DialogService.confirm(
  "Delete this item?",
  "Delete"
);
if (shouldDelete) { ... }
```

---

### `prompt(message, defaultValue = "")`

**Returns:** `Promise<string|null>` — the trimmed input value, or `null` if cancelled.

**Input:** Single-line `<input type="text">`.

**Keyboard shortcuts:**
- Enter → submits (resolves value)
- Escape → cancels (resolves `null`)

**Close paths:**
- Click "OK" → resolves trimmed value (or `null` if empty)
- Click "Cancel" → resolves `null`
- Click backdrop → resolves `null`
- Press Escape → resolves `null`
- Press Enter in input → resolves value

```javascript
const name = await DialogService.prompt("List name:", "My List");
if (name) { ... }
```

---

### `promptTextarea(message, defaultValue = "", onChange = null)`

**Returns:** `Promise<null>` — always resolves `null` when closed.

**Input:** Multi-line `<textarea>` with debounced auto-save.

**Behavior:**
- The `onChange` callback is fired **during typing** (debounced 300ms) and **on close** (flushed immediately).
- The "Close" button closes the dialog.
- Does NOT have an "OK" or "Save" button. It's a live-save pattern.

**Keyboard shortcuts:**
- Escape → closes dialog

**Important quirk:** The input listener does `if (!value) return;`. If the user clears the textarea completely, `onChange` is NOT called with an empty string until the dialog is closed (via the flush logic).

```javascript
await DialogService.promptTextarea(
  "Edit note:",
  note.content,
  (newValue) => {
    note.content = newValue;
    DBManager.saveItem(note);
  }
);
```

---

### `showActions(actions)`

**Returns:** `Promise<string|null>` — the `action` key of the selected button, or `null` if cancelled.

**Input:** Array of action objects:

```javascript
{
  label: string,
  icon?: string,      // HTML string, inserted raw (not escaped!)
  action: string,     // key returned on selection
  danger?: boolean    // adds danger styling class
}
```

**Close paths:**
- Click any action row → resolves that row's `action` string
- Click "Cancel" → resolves `null`
- Click backdrop → resolves `null`
- Press Escape → resolves `null`

```javascript
const action = await DialogService.showActions([
  { label: "Duplicate", action: "duplicate" },
  { label: "Archive", action: "archive", danger: true },
  { label: "Delete", action: "delete", danger: true }
]);
```

**Security note:** `a.icon` is inserted via template literal interpolation and is **not escaped**. If `icon` comes from user data, it could be an XSS vector.

---

### `pickItem(items, options = {})`

**Returns:** `Promise<Object|null>` — the selected item object from the `items` array, or `null` if cancelled.

**Input:**
- `items`: Array of `{ id, title?, subtitle? }`
- `options.title`: Optional heading text
- `options.emptyText`: Message shown when `items` is empty

**Close paths:**
- Click any item → resolves the full item object
- Click "Cancel" → resolves `null`
- Click backdrop → resolves `null`
- Press Escape → resolves `null`

**Matching logic:**
```javascript
const id = btn.dataset.id;  // Always a string!
const selected = items.find(i => i.id === id) || null;
```

**Bug risk:** If your `items` have numeric `id` values, `dataset.id` is always a **string**, so `===` comparison will fail. Use `==` or `String(i.id) === id`.

---

## Timing & Event Flow

### The "Double Resolve" Problem

Every method has **at least two paths** that call `resolve()`:

1. **Button/backdrop click handler** — calls `dialog.close()`, then `cleanup()`, then `resolve(value)`.
2. **`close` event listener** — calls `cleanup()`, then `resolve(cancelValue)`.

When you click a button:

```
click handler
  ├── dialog.close()
  ├── cleanup()          ← removes element from DOM
  └── resolve(true)      ← Promise settles
  
  ...later, event loop...
  
close event fires
  ├── cleanup()          ← no-op (already removed)
  └── resolve(false)     ← silently ignored (Promise already settled)
```

**Why this is "safe":** A Promise can only settle once. The second `resolve()` is a no-op.

**Why this is a flaw:**
- The `cleanup()` function runs **twice**.
- For `promptTextarea`, `clearTimeout(debounceTimer)` runs twice. Harmless, but wasteful.
- The close event listener is never removed. It stays on the detached DOM element until garbage collection.
- If the code were ever changed to do something non-idempotent in `cleanup()` (e.g., decrement a counter), it would double-fire.

### Event Listener Lifecycle Diagram

```
[Dialog Open]
  │
  ├── dialog.click (backdrop detection)
  ├── dialog.close (cleanup + resolve)
  ├── button.click (resolve + dialog.close)
  ├── input.keydown (Enter/Escape handling)
  └── window.visualViewport.resize (keyboard adjustment)
  │
  [User clicks "Confirm"]
  │
  ├── button.click fires
  │   ├── dialog.close()
  │   ├── cleanup() ──► dialog.remove()
  │   └── resolve(true)
  │
  ├── dialog.close event fires
  │   ├── cleanup() ──► dialog.remove() [redundant]
  │   └── resolve(false) [ignored, already settled]
  │
  [All listeners orphaned on detached element]
```

---

## The Keyboard Adjustment System

### `_adjustDialogForKeyboard(dialog)`

This method prevents dialogs from being hidden behind the on-screen keyboard on mobile devices.

```javascript
_adjustDialogForKeyboard(dialog) {
  const vv = window.visualViewport;
  if (!vv) return;

  const onResize = () => {
    const keyboardHeight = window.innerHeight - vv.height;
    if (keyboardHeight > 100) {
      // Keyboard is open: push dialog to top
      dialog.style.marginTop = '10px';
      dialog.style.marginBottom = 'auto';
      if (dialog.classList.contains('dialog--textarea')) {
        dialog.style.maxHeight = (vv.height - 20) + 'px';
      }
    } else {
      // Keyboard closed: reset margins
      dialog.style.marginTop = '';
      dialog.style.marginBottom = '';
      if (dialog.classList.contains('dialog--textarea')) {
        dialog.style.maxHeight = '';
      }
    }
  };

  vv.addEventListener('resize', onResize);
  dialog.addEventListener('close', () => {
    vv.removeEventListener('resize', onResize);
  }, { once: true });

  onResize();
}
```

### How It Works

1. Listens to `visualViewport.resize` (fires when keyboard opens/closes).
2. Calculates keyboard height: `window.innerHeight - visualViewport.height`.
3. If height > 100px, assumes keyboard is open and adjusts dialog margins.
4. For textarea dialogs, also constrains `maxHeight` to fit above the keyboard.
5. The `close` event listener (with `{ once: true }`) removes the resize listener when the dialog closes.

### Potential Flaw: Listener Leak

The resize listener is only removed in the `close` event handler. If `cleanup()` is ever called **without** calling `dialog.close()` first, the `close` event never fires, and the `visualViewport` resize listener leaks forever.

In the current code, `cleanup()` is always called after `dialog.close()`, so this is safe. But it's a fragile invariant.

### Potential Flaw: Hardcoded Thresholds

- `100` pixels is the keyboard detection threshold. On tablets or split keyboards, this might not trigger.
- `10px` margin top and `vv.height - 20` max height are arbitrary. On very small screens, the dialog might still be partially hidden.

---

## XSS Prevention

### `escapeHtml(text)`

**Importing Utils**

```javascript
import * as Utils from '../services/Utils.js';
```

**Where it's used:**
- `message` parameters
- `defaultValue` in `prompt` and `promptTextarea`
- `confirmText` in `confirm`
- `label`, `action` in `showActions`
- `title`, `subtitle`, `id` in `pickItem`
- `emptyText` in `pickItem`

```javascript
Utils.escapeHtml(text)
```

### What's NOT Escaped

| Data | Method | Risk |
|------|--------|------|
| `a.icon` | `showActions` | **Raw HTML injection.** If `icon` comes from user data, XSS is possible. |
| `options.title` | `pickItem` | Actually, it IS escaped via `escapeHtml`. Safe. |

**The `a.icon` vulnerability:**

```javascript
const rows = actions.map((a) => `
  <button ...>
    ${a.icon ? `<span class="dialog-action-icon">${a.icon}</span>` : ''}
    ...
  </button>
`).join('');
```

If someone passes:
```javascript
{ label: "Hack", action: "hack", icon: "<img src=x onerror=alert('xss')>" }
```

The `onerror` handler executes. Since this is a client-side PWA with no server rendering, the impact is limited to the current session, but it's still a flaw.

---

## Integration with Components

### Typical Usage Pattern

Components import and call `DialogService` methods directly:

```javascript
import { DialogService } from '../services/DialogService.js';

class ListBase extends HTMLElement {
  async _archiveList() {
    const confirmed = await DialogService.confirm(
      `Archive "${this._listItem.content}"?`,
      "Archive"
    );
    if (confirmed) {
      await DBManager.deleteItem(this._listItem.id);
      this._renderContent();
    }
  }
}
```

### No Global Queue or Stack

`DialogService` has **no protection against multiple simultaneous dialogs**. If two parts of the code call it at the same time:

```javascript
// Somewhere in the app:
DialogService.confirm("Are you sure?");

// Simultaneously elsewhere:
DialogService.showActions([...]);
```

Both dialogs are created and appended to `document.body`. The second one appears on top of the first (because `showModal()` uses the top layer). The first dialog is still "open" but blocked. When the second closes, the first is accessible again.

**Is this a bug?** It depends. Native `<dialog>` supports multiple modals (they stack). But it can lead to confusing UX. DialogService does nothing to prevent or warn about it.

### Dialogs Are Not Centered in Code

The centering is handled entirely by CSS:

```css
/* Expected CSS */
dialog {
  margin: auto;           /* Native default centers horizontally */
  /* vertical centering is native for showModal() */
}
```

The `_adjustDialogForKeyboard` method overrides `marginTop` to `10px` when the keyboard opens, which pushes the dialog to the top of the viewport.

---

## Known Logic Flaws & Race Conditions

### 1. **Promise Resolves Multiple Times**

**Severity:** Low (Promises are idempotent for settlement, but cleanup runs twice).

In `confirm()`:
```javascript
// Path A: Backdrop click
handleCancel();
  ├── dialog.close();
  ├── cleanup();
  └── resolve(false);

// Path B: close event (fires after Path A)
dialog.addEventListener("close", () => {
  cleanup();
  resolve(false);
});
```

Both paths call `resolve(false)`. The Promise ignores the second call, but `cleanup()` runs twice.

**Same flaw exists in:** `prompt`, `promptTextarea`, `showActions`, `pickItem`.

**Fix:** Remove the `close` event listener in the button handlers, or only resolve in one place.

```javascript
// Better pattern:
const handleCancel = () => {
  dialog.removeEventListener('close', onClose);
  dialog.close();
  cleanup();
  resolve(false);
};

const onClose = () => {
  cleanup();
  resolve(false);
};
dialog.addEventListener('close', onClose);
```

---

### 2. **Visual Viewport Listener Leak**

**Severity:** Low (requires misuse, but fragile).

If `cleanup()` is called without `dialog.close()`:
```javascript
cleanup();        // removes dialog from DOM
dialog.close();   // close event never fires (element is gone)
// resize listener leaks forever!
```

In current code, this never happens. But if a future refactor moves `cleanup()` before `dialog.close()`, it's a leak.

---

### 3. **No Simultaneous Dialog Protection**

**Severity:** Medium (UX issue).

Two dialogs can be open at once. The second overlays the first. The first is trapped underneath, still consuming the modal backdrop.

**Example scenario:**
1. Component A calls `DialogService.confirm()`.
2. Before user responds, Component B (e.g., a background sync) calls `DialogService.confirm()`.
3. User sees Dialog B. They can't access Dialog A until B closes.

**Fix:** Add a global flag or queue.

```javascript
let activeDialog = null;

// In each method:
if (activeDialog) {
  // Queue, reject, or ignore
}
activeDialog = dialog;
dialog.addEventListener('close', () => { activeDialog = null; });
```

---

### 4. **`showActions` Icon XSS**

**Severity:** Medium (if icons come from untrusted sources).

The `a.icon` property is inserted as raw HTML:

```javascript
${a.icon ? `<span class="dialog-action-icon">${a.icon}</span>` : ''}
```

If a component constructs actions from user-generated content:

```javascript
const actions = userData.map(u => ({
  label: u.name,
  icon: u.avatarUrl,  // Could be: "<script>...</script>"
  action: 'select'
}));
```

**Fix:** Escape `a.icon` or restrict it to a safe set of values.

---

### 5. **`pickItem` String/Number ID Mismatch**

**Severity:** Low (depends on data types used).

```javascript
const id = btn.dataset.id;  // ALWAYS a string
const selected = items.find(i => i.id === id) || null;
```

If `items` has numeric IDs:
```javascript
const items = [{ id: 1, title: "One" }];
// dataset.id === "1"
// i.id === 1
// "1" === 1 → false!
```

The item is never found; resolves `null`.

**Fix:** Use `String(i.id) === id` or `i.id == id`.

---

### 6. **`promptTextarea` Doesn't Save Empty Strings**

**Severity:** Low (behavioral quirk).

```javascript
textarea.addEventListener("input", () => {
  const value = textarea.value.trim();
  if (!value) return;  // ← Skips empty strings entirely!
  debouncedSave(value);
});
```

If the user clears the textarea, `onChange` is not called. The flush on close:

```javascript
const value = textarea.value.trim();
if (value && value !== lastSavedValue) {
  doSave(value);
}
```

Also skips empty strings. So **there is no way for `onChange` to receive an empty string** through normal interaction. The only way is if the initial `defaultValue` is empty and the user never types anything.

**Is this intentional?** Maybe — perhaps empty textareas are considered invalid. But it's an undocumented constraint.

---

### 7. **Focus Timing in `prompt`**

```javascript
setTimeout(() => input.focus(), 0);
```

This is a microtask deferral. It works most of the time, but it's not guaranteed. If the dialog animation takes longer than one tick, focus might not land correctly.

**Better:** Use `dialog.addEventListener('animationend', ...)` or the native focus trap.

---

### 8. **`promptTextarea` Close Button Focus**

```javascript
dialog.showModal();
closeBtn.focus();
```

The close button receives focus immediately. This means:
- Tab navigation starts from the close button (skipping the textarea).
- On mobile, this might not open the keyboard automatically.

**Is this intentional?** For a live-save textarea dialog, maybe focus should be on the textarea instead.

---

### 9. **Missing `Escape` Handling in `showActions` and `pickItem`**

`confirm` and `prompt` have explicit `close` event listeners that resolve with cancel values. `showActions` and `pickItem` also have them. So Escape works natively (fires `cancel` → `close` → resolves `null`).

But the `input` keydown listeners in `prompt` and `promptTextarea` call `e.preventDefault()` and `e.stopPropagation()` for Escape. In `showActions` and `pickItem`, there is no such listener. The native dialog behavior handles it. This is inconsistent but not necessarily a bug.

---

## Annotated Code Reference

### Dialog Creation Pattern (Shared by all methods)

```javascript
const dialog = document.createElement("dialog");
dialog.className = "dialog";
dialog.innerHTML = `...`;  // Template with escaped user data
document.body.appendChild(dialog);
```

**Why `document.body.appendChild`?**
- `<dialog>` doesn't need to be in any specific DOM position for `showModal()` to work.
- Appending to `body` avoids z-index and stacking context issues.

### The Close-Resolve Pattern

```javascript
// Every method follows this pattern:
const cleanup = () => { dialog.remove(); };

const handleCancel = () => {
  dialog.close();
  cleanup();
  resolve(null);
};

// Button listener
btn.addEventListener("click", handleCancel);

// Backdrop listener
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) handleCancel();
});

// Close event listener (fallback)
dialog.addEventListener("close", () => {
  cleanup();
  resolve(null);
});
```

**The flaw:** If `handleCancel` is called, it triggers `dialog.close()`, which fires the `close` event, which calls `cleanup()` and `resolve()` again.

### The Keyboard Adjustment Pattern

```javascript
_adjustDialogForKeyboard(dialog) {
  const vv = window.visualViewport;
  if (!vv) return;  // Graceful degradation for older browsers

  const onResize = () => { ... };

  vv.addEventListener('resize', onResize);
  dialog.addEventListener('close', () => {
    vv.removeEventListener('resize', onResize);
  }, { once: true });

  onResize();  // Run immediately in case keyboard is already open
}
```

**Why `{ once: true }`?**
- Ensures the listener is automatically removed after the first `close` event.
- Prevents manual tracking of the listener reference.

---

## File Reference

| File | Purpose |
|------|---------|
| `public/services/DialogService.js` | The dialog utility itself |
| `public/components/ListBase.js` | Uses `confirm`, `prompt`, `showActions` |
| `public/components/NoteBase.js` | Uses `confirm`, `showActions` |
| `public/components/ListIndexPage.js` | Uses `prompt`, `confirm`, `showActions`, `pickItem` |
| `public/components/NoteIndexPage.js` | Uses `confirm`, `showActions` |
| `public/components/NoteDetailPage.js` | Uses `promptTextarea` |
| `public/app.css` or component CSS | Defines `.dialog`, `.dialog--actions`, `.dialog--picker`, `.dialog--textarea` styles |

---

## Summary of Key Timing

| Event | What Happens | Potential Issue |
|-------|-------------|-----------------|
| Method called | `<dialog>` created, appended to body | None |
| `showModal()` | Dialog visible, focus trapped, backdrop shown | None |
| `_adjustDialogForKeyboard()` | `visualViewport.resize` listener added | Leaks if `close` never fires |
| Button click | `dialog.close()` → `cleanup()` → `resolve()` | `close` event fires again → double cleanup |
| Backdrop click | Same as button click | Same double-resolve issue |
| Escape key | Native `cancel` → `close` → `resolve(cancel)` | Works correctly |
| `cleanup()` | `dialog.remove()` from DOM | Element is detached but listeners remain until GC |

