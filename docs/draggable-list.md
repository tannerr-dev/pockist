# DraggableList — Deep Dive

This document explains `DraggableList` (`public/services/DraggableList.js`) in detail, with a focus on **timing, state transitions, and the deferred scroll-blocking logic**. It also flags potential logic flaws and race conditions.

---

## Table of Contents

1. [What It Is](#what-it-is)
2. [State Machine](#state-machine)
3. [Constructor & Configuration](#constructor--configuration)
4. [The Two Input Paths](#the-two-input-paths)
5. [Deferred Scroll Blocking — Deep Dive](#deferred-scroll-blocking--deep-dive)
6. [Drop Indicator Logic](#drop-indicator-logic)
7. [CSS Classes Applied](#css-classes-applied)
8. [Cleanup & Destruction](#cleanup--destruction)
9. [Integration with Components](#integration-with-components)
10. [Known Logic Flaws & Race Conditions](#known-logic-flaws--race-conditions)
11. [Annotated Code Reference](#annotated-code-reference)
12. [File Reference](#file-reference)

---

## What It Is

`DraggableList` is a vanilla-JS drag-and-drop reordering utility for the Pockist PWA. It wraps a container element and makes its direct children draggable via a drag handle. It supports **both touch and mouse** input, but uses **radically different strategies** for each to solve the "scroll vs. drag" problem on mobile.

**Why not use a library?** The project is intentionally framework/library-free. This class is ~364 lines of pure DOM event manipulation.

---

## State Machine

The class can be in one of four conceptual states:

```
┌─────────┐     touchstart on handle      ┌──────────┐
│  IDLE   │ ─────────────────────────────►│ PENDING  │
│         │                               │ (hold)   │
│         │ ◄──────── move > 10px ────────┤ ~150ms   │
│         │           or touchend           │ timer    │
│         │                               └────┬─────┘
│         │                                    │ timer fires
│         │ ◄──────────────────────────────────┘
│         │     mousedown on handle  ┌──────────┐
│         │ ────────────────────────►│ DRAGGING │
│         │                          │          │
│         │ ◄──────── mouseup / ─────┤ touch    │
│         │          touchend        │ move     │
│         │                          │ events   │
│         │                          └────┬─────┘
│         │                               │
│         │ ◄─────────────────────────────┘
│         │        FINISHING (cleanup + onReorder)
└─────────┘
```

### State Descriptions

| State | Internal Check | Description |
|-------|---------------|-------------|
| **IDLE** | `!_pendingDrag && !_dragState` | No active interaction. Only `touchstart` and `mousedown` on the container are listening. |
| **PENDING** | `_pendingDrag && !_dragState` | Touch only. A `setTimeout` is waiting for the long-press delay. `touchmove` and `touchend` listeners are on `window` to detect cancellation. |
| **DRAGGING** | `_dragState` | Active drag. The dragged item has `transform: translateY(...)`, `.dragging` class, and a drop indicator is visible. Different listeners for touch vs. mouse. |
| **FINISHING** | transient | `_finishDrag()` resets styles, removes listeners, fires `onReorder(oldIndex, newIndex)`, and returns to IDLE. |

---

## Constructor & Configuration

```javascript
const dl = new DraggableList(container, {
  itemSelector: ':scope > *',   // Which children are draggable
  handleSelector: '.drag-hint', // Optional: only start drag on this child
  onReorder: (oldIndex, newIndex) => { ... },
  longPressDelay: 150,          // ms before touch drag begins
  moveThreshold: 10             // px: cancel long-press if moved more than this
});
```

### Options

| Option | Default | Purpose |
|--------|---------|---------|
| `itemSelector` | `':scope > *'` | Query selector for draggable children. Defaults to all direct children. |
| `handleSelector` | `null` | If set, drag only starts when the event target is inside this selector. If `null`, any part of the item is a handle. |
| `onReorder` | `() => {}` | Callback fired **after** a successful drop with `(oldIndex, newIndex)`. |
| `longPressDelay` | `150` | How long (ms) to hold a touch before drag begins. |
| `moveThreshold` | `10` | Pixels. If finger moves more than this during the hold, the pending drag is cancelled. |

### Instance Properties

```javascript
this.container           // The DOM element passed to constructor
this.itemSelector        // From options
this.handleSelector      // From options
this.onReorder          // From options
this.longPressDelay      // From options
this.moveThreshold       // From options

this._pendingDrag          // Object | null — touch hold state
this._dragState            // Object | null — active drag state
this._dropIndicator        // Element | null — the visual line
this._popTimer             // Timeout ID for the "pop" animation cleanup
this._suppressClickUntil   // Number — timestamp; suppress clicks until this time (300 ms window)
this._previousUserSelect   // String — saved user-select value (mouse path)
```

---

## The Two Input Paths

### Touch Path: Deferred Hold-to-Drag

**The Problem:** On mobile, users need to scroll lists. If you block scrolling immediately on `touchstart`, the list becomes unscrollable. If you don't block scrolling, how do you distinguish a scroll from a drag?

**The Solution:** Don't block scroll during the hold. Only block it **after** the long-press timer fires and drag actually begins.

#### Step-by-Step Flow

```
1. touchstart on handle
   └── _handleTouchStart()
       ├── Check: not already pending or dragging
       ├── Check: target is inside itemSelector and container
       ├── Check: target is NOT interactive (button, input, link, contenteditable)
       ├── Check: target IS a handle (if handleSelector is set)
       ├── Capture touch identifier, startX, startY
       ├── Set _pendingDrag = { item, touchId, startX, startY, timer }
       ├── timer = setTimeout(_beginTouchDrag, 150ms)
       └── Add window listeners: touchmove, touchend, touchcancel

2. During the hold (~0-150ms)
   ├── Normal scrolling IS allowed (touchstart was { passive: true })
   ├── touchmove → _onTouchMoveDuringHold()
   │   └── If moved > 10px: _cancelLongPress() → back to IDLE
   └── touchend/touchcancel → _onTouchEndDuringHold()
       └── _cancelLongPress() → back to IDLE

3. Timer fires (150ms elapsed, finger still down)
   └── _beginTouchDrag(item)
       ├── _cancelLongPress() (clears timer, removes hold listeners)
       ├── Set _dragState = { item, isTouch: true, touchId, startY, startIndex, currentY }
       ├── Add .dragging class to item
       ├── requestAnimationFrame → add .drag-pop class
       ├── setTimeout 200ms → remove .drag-pop, set transition: none
       ├── navigator.vibrate(10) (if supported)
       ├── Add NEW window listeners: touchmove ({ passive: false }), touchend, touchcancel
       ├── _createDropIndicator()
       └── NOW scroll is blocked (next touchmove will call e.preventDefault())

4. Active drag
   └── touchmove → _onTouchDragMove(e)
       ├── e.preventDefault()  ← SCROLL BLOCKED HERE
       ├── Update currentY
       ├── Apply transform: translateY(deltaY)
       ├── _computeInsertBeforeIndex(touch.clientY)
       └── _updateDropIndicator(insertBeforeIndex)

5. Drop
   └── touchend/touchcancel → _onTouchDragEnd()
       ├── Find matching changed touch
       └── _finishDrag()
           ├── Compute final insertBeforeIndex from currentY
           ├── Calculate newIndex (adjust if moved downward)
           ├── Remove .dragging, .drag-pop, reset transform/transition
           ├── Remove drop indicator
           ├── Remove touch drag listeners
            ├── Set _suppressClickUntil = Date.now() + 300
            ├── If newIndex !== oldIndex:
           │   ├── navigator.vibrate(15)
           │   └── this.onReorder(oldIndex, newIndex)
           └── _dragState = null → IDLE
```

### Mouse Path: Immediate Drag

**The Problem:** On desktop, there's no scroll ambiguity. Mousedown on handle should immediately start dragging.

#### Step-by-Step Flow

```
1. mousedown on handle
   └── _handleMouseDown(e)
       ├── Check: e.button === 0 (reject right/middle clicks)
       ├── Same guard checks as touch (interactive, handle, etc.)
       ├── e.preventDefault() — prevents text selection
       ├── Set _dragState immediately (no pending state!)
       ├── Add .dragging, .drag-pop (same as touch)
       ├── setTimeout 200ms → remove .drag-pop, set transition: none
       ├── navigator.vibrate(10)
       ├── Add window listeners: mousemove, mouseup
       ├── Save container.style.userSelect, set to 'none'
       └── _createDropIndicator()
```

---

## Deferred Scroll Blocking — Deep Dive

This is the most complex and bug-prone part of the class.

### The Core Mechanism

| Phase | Event | passive | preventDefault | Scroll Allowed? |
|-------|-------|---------|----------------|-----------------|
| Hold | `touchstart` | `true` | No | **Yes** |
| Hold | `touchmove` | `true` | No | **Yes** |
| Drag | `touchmove` | `false` | **Yes** | **No** |

The **critical insight:** There are **two separate sets** of `touchmove`/`touchend` listeners:

1. **Hold listeners** (`_boundTouchMove`, `_boundTouchEnd`, `_boundTouchCancel`) — added during `_handleTouchStart()`, removed during `_cancelLongPress()`.
2. **Drag listeners** (`_boundOnTouchDragMove`, `_boundOnTouchDragEnd`, `_boundOnTouchDragCancel`) — added during `_beginTouchDrag()`, removed during `_finishDrag()`.

### Why Two Sets?

Because they have different behavior:
- **Hold listeners** are `{ passive: true }` — they must not block scroll while the user is deciding whether to drag or scroll.
- **Drag listeners** are `{ passive: false }` — they MUST call `e.preventDefault()` to block scroll once dragging has begun.

### The Handoff

```
_handleTouchStart()
  └── adds: window.touchmove (passive=true), window.touchend, window.touchcancel
      └── timer fires ──► _beginTouchDrag()
          └── _cancelLongPress()
              └── removes: window.touchmove (passive=true), window.touchend, window.touchcancel
          └── adds: window.touchmove (passive=false), window.touchend, window.touchcancel
```

### Potential Flaw: Listener Leak

Look at `_beginTouchDrag()`:

```javascript
_beginTouchDrag(item) {
  if (!this._pendingDrag) return;  // guard against stale timer
  this._cancelLongPress();  // removes hold listeners
  // ...
  this._boundOnTouchDragMove = (e) => this._onTouchDragMove(e);
  this._boundOnTouchDragEnd = (e) => this._onTouchDragEnd(e);
  window.addEventListener('touchmove', this._boundOnTouchDragMove, { passive: false });
  window.addEventListener('touchend', this._boundOnTouchDragEnd);
  window.addEventListener('touchcancel', this._boundOnTouchDragEnd);
}
```

**Note:** The `if (!this._pendingDrag) return;` guard prevents a race where `destroy()` or `_cancelLongPress()` clears the pending state after the timer fires but before the callback executes.

**What if `_cancelLongPress()` is called DURING `_beginTouchDrag()`?** It can't be — `_cancelLongPress()` is only called from the hold-phase listeners or from `_beginTouchDrag()` itself. Once `_beginTouchDrag()` starts, the hold listeners are already removed.

**Real potential flaw:** If `_finishDrag()` fails to run (e.g., an exception in `onReorder`), the drag listeners are never removed. The class would be in an unrecoverable state.

---

## Drop Indicator Logic

The drop indicator is a `<div class="drop-indicator">` appended to the container. It shows a horizontal line where the dragged item will be inserted.

### How Position Is Calculated

```javascript
_computeInsertBeforeIndex(pointerY) {
  const items = this._getItems();
  for (let i = 0; i < items.length; i++) {
    if (items[i] === draggedItem) continue;  // skip the dragged item itself
    const rect = items[i].getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    if (pointerY < centerY) return i;
  }
  return items.length;
}
```

**Logic:** The dragged item will be inserted **before** the first item whose center is below the pointer. If none, it goes at the end.

### How the Indicator Is Positioned

```javascript
_updateDropIndicator(insertBeforeIndex) {
  const items = this._getItems();
  const containerRect = this.container.getBoundingClientRect();

  let top;
  if (insertBeforeIndex >= items.length) {
    // After the last item
    const lastRect = items[items.length - 1].getBoundingClientRect();
    top = lastRect.bottom - containerRect.top;
  } else {
    // Before the target item
    const targetRect = items[insertBeforeIndex].getBoundingClientRect();
    top = targetRect.top - containerRect.top;
  }

  this._dropIndicator.style.top = `${top - 1.5}px`;
  this._dropIndicator.style.display = 'block';
}
```

**Note:** The indicator is positioned relative to the container using `getBoundingClientRect()` math. If the container scrolls during drag, the indicator might drift. However, scroll is blocked during drag, so this shouldn't happen.

### New Index Calculation

```javascript
let newIndex = insertBeforeIndex;
if (newIndex > oldIndex) newIndex -= 1;
```

**Why subtract 1?** If the item is dragged downward, the `insertBeforeIndex` includes the dragged item's own slot in the array. Since the item will be removed from its old position first, the true new index is one less.

---

## CSS Classes Applied

The utility applies these classes dynamically. Your CSS must define them.

| Class | When Applied | Purpose |
|-------|-------------|---------|
| `.dragging` | Immediately when drag starts | Style the lifted item (e.g., opacity, box-shadow, z-index) |
| `.drag-pop` | 1 frame after drag starts (rAF) | Brief scale/elevation animation. Removed after 200ms. |
| `.drop-indicator` | When drag starts | Visual line showing drop position. Created as a `<div>` and appended to container. |

### Example CSS (what your app likely has)

```css
.dragging {
  opacity: 0.8;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 1000;
  will-change: transform;
}

.drag-pop {
  transform: scale(1.02);
  transition: transform 0.2s ease;
}

.drop-indicator {
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--accent-color, #007bff);
  border-radius: 2px;
  pointer-events: none;
  display: none;
}
```

---

## Cleanup & Destruction

### `destroy()`

```javascript
destroy() {
  this._cancelLongPress();
  this._endDrag();
  this.container.removeEventListener('touchstart', this._boundHandleTouchStart);
  this.container.removeEventListener('mousedown', this._boundHandleMouseDown);
  this.container.removeEventListener('click', this._boundClickSuppressor, { capture: true });
}
```

**Purpose:** Remove all listeners. Should be called before the container is removed from the DOM or before re-rendering the list.

**When to call:**
- Before `innerHTML = ''` or re-rendering the list
- When the component disconnects (e.g., in `disconnectedCallback()`)
- When navigating away from a page that uses drag-and-drop

---

## Integration with Components

### Where `DraggableList` Is Instantiated

Search the codebase for `new DraggableList`:

- **`ListBase.js`** — likely in `_initDraggable()` or similar method. Called after rendering items.
- **`ListIndexPage.js`** — drag-to-reorder lists in the grid.
- Any other component that needs drag-and-drop reordering.

### Typical Integration Pattern

```javascript
// Inside a component class
_initDraggable() {
  if (this._draggableList) {
    this._draggableList.destroy();
  }

  const container = this.shadowRoot.querySelector('.items-container');
  // or: const container = this.querySelector('.items-container');

  this._draggableList = new DraggableList(container, {
    itemSelector: ':scope > .item',
    handleSelector: '.drag-handle',
    onReorder: async (oldIndex, newIndex) => {
      // 1. Reorder the links array in memory
      const [moved] = this._linkedItems.splice(oldIndex, 1);
      this._linkedItems.splice(newIndex, 0, moved);

      // 2. Update the list item's links
      this._listItem.links = this._linkedItems.map((item, i) => ({
        id: item.id,
        order: i
      }));

      // 3. Save to DB
      await DBManager.saveItem(this._listItem);

      // 4. Re-render (which will call _initDraggable() again)
      this._renderContent();
    }
  });
}
```

### The Re-render Problem

**Critical:** If `onReorder` triggers a re-render (which destroys and recreates the DOM), the `DraggableList` instance must be `destroy()`ed first. Otherwise:
1. Old listeners leak onto `window`.
2. The dragged item reference becomes detached/stale.
3. The drop indicator is orphaned.

**Pattern to avoid bugs:**
```javascript
_renderContent() {
  if (this._draggableList) {
    this._draggableList.destroy();
    this._draggableList = null;
  }

  // ... render items ...

  this._draggableList = new DraggableList(container, { ... });
}
```

---

## Known Logic Flaws & Race Conditions

### 1. **Potential Double Listener Registration (Touch)**

In `_beginTouchDrag()`:
```javascript
this._boundOnTouchDragMove = (e) => this._onTouchDragMove(e);
this._boundOnTouchDragEnd = (e) => this._onTouchDragEnd(e);
window.addEventListener('touchmove', this._boundOnTouchDragMove, { passive: false });
window.addEventListener('touchend', this._boundOnTouchDragEnd);
window.addEventListener('touchcancel', this._boundOnTouchDragEnd);
```

**Issue:** These bound functions are recreated every time `_beginTouchDrag()` is called. If for some reason `_beginTouchDrag()` is called twice, you'd register duplicate listeners. However, `_beginTouchDrag()` now has an early-return guard (`if (!this._pendingDrag) return;`), and the guard at the top of `_handleTouchStart()` (`if (this._pendingDrag || this._dragState) return`) prevents duplicate timer scheduling. This flaw is now mitigated.

### 2. **Exception in `onReorder` Leaves Listeners Behind**

In `_finishDrag()`:
```javascript
if (newIndex !== oldIndex) {
  if (navigator.vibrate) navigator.vibrate(15);
  this.onReorder(oldIndex, newIndex);  // <-- if this throws...
}
this._dragState = null;  // <-- ...this never runs
```

**Issue:** If `onReorder` throws an exception, `_dragState` is never reset. The class remains in DRAGGING state forever. The window listeners are never removed. The user must refresh the page.

**Fix:** Wrap `onReorder` in try/finally.

### 3. **Click Suppression is Time-Bound (Fixed)**

```javascript
this._suppressClickUntil = Date.now() + 300;
// ...
this._boundClickSuppressor = (e) => {
  if (Date.now() < this._suppressClickUntil) {
    this._suppressClickUntil = 0;
    e.stopPropagation();
    e.preventDefault();
  }
};
```

**Previous Issue:** `_suppressClick` was a blunt boolean that suppressed the very next click anywhere in the container, even if it was on a different element (e.g., a delete button).

**Fix:** Suppression is now time-bound to a 300 ms window after drag ends. This prevents accidental suppression of legitimate clicks on other items while still blocking the ghost click from the drag itself.

### 4. **Drop Indicator Not Removed if `_finishDrag` Early-Returns**

```javascript
_finishDrag() {
  if (!this._dragState) return;  // Early return
  // ... cleanup code that removes indicator ...
}
```

**Issue:** If `_finishDrag()` is called when `_dragState` is null (e.g., double-call), it returns early. But `_endDrag()` calls `_finishDrag()` unconditionally. If `_finishDrag()` was already called (e.g., by `touchend` and then `destroy()`), the second call does nothing. This is probably fine, but worth noting.

### 5. **`_getItems()` Includes the Drop Indicator in Edge Cases**

```javascript
_getItems() {
  return Array.from(this.container.querySelectorAll(this.itemSelector))
    .filter(el => el !== this._dropIndicator);
}
```

**Issue:** The filter checks `el !== this._dropIndicator`. This works if `itemSelector` matches the drop indicator. But if `itemSelector` is specific (e.g., `:scope > .list-item`) and the drop indicator doesn't match, the filter is unnecessary. If `itemSelector` is broad (e.g., `:scope > *`), the filter is critical. Not a bug, but a fragile assumption.

### 6. **Touch Identifier Matching**

```javascript
_findTouch(touchList, identifier) {
  for (let i = 0; i < touchList.length; i++) {
    if (touchList[i].identifier === identifier) return touchList[i];
  }
  return null;
}
```

**Issue:** If the user uses multiple fingers, the tracked touch might not be in `e.touches` (it could be in `e.changedTouches` only). `_onTouchDragMove` looks in `e.touches`, but if the tracked finger is the only one and it moves, it might only appear in `changedTouches` on some browsers. This could cause the drag to stop tracking mid-drag.

**Fix:** Check both `e.touches` and `e.changedTouches`.

### 7. **Long-Press Timer Doesn't Check if Element Is Still Pressed**

The timer fires after 150ms regardless of whether the finger is still on the element. However, `_onTouchEndDuringHold()` cancels the timer on `touchend`, so this is handled. But what about if the finger leaves the element (not the screen)? The `touchmove` listener checks movement threshold but doesn't check if the target changed.

### 8. **`_beginTouchDrag` Null Guard (Fixed)**

```javascript
_beginTouchDrag(item) {
  if (!this._pendingDrag) return;  // <-- early return if cancelled
  const startY = this._pendingDrag.startY;
  const touchId = this._pendingDrag.touchId;
  this._cancelLongPress();
  // ...
}
```

**Previous Issue:** If `destroy()` or `_cancelLongPress()` cleared `_pendingDrag` between the timer firing and the callback executing, `_beginTouchDrag` would create a broken drag state with `touchId: null` and leaked window listeners.

**Fix:** Added an explicit `if (!this._pendingDrag) return;` guard at the top of the method before reading any properties.

### 9. **Passive Listener on `touchstart` Prevents `preventDefault()` If Needed**

```javascript
this.container.addEventListener('touchstart', this._boundHandleTouchStart, { passive: true });
```

**Issue:** The `touchstart` listener is passive, which is correct for scrolling. But if the class ever needs to call `e.preventDefault()` in `_handleTouchStart()` (e.g., to prevent a browser default action), it can't. This isn't currently needed, but it's a constraint.

---

## Annotated Code Reference

### Event Listener Attachment

```javascript
// Captures clicks to suppress the next one after a drag (300 ms window)
this.container.addEventListener('click', this._boundClickSuppressor, { capture: true });

// Touch: passive=true allows scroll during the hold phase
this.container.addEventListener('touchstart', this._boundHandleTouchStart, { passive: true });

// Mouse: standard capture (left button only)
this.container.addEventListener('mousedown', this._boundHandleMouseDown);
```

### The Guard Checks

```javascript
// Prevents starting a new drag while one is active
if (this._pendingDrag || this._dragState) return;

// Ensures the event target is actually a draggable item
const item = e.target.closest(this.itemSelector);
if (!item || !this.container.contains(item)) return;

// Prevents drag from starting on interactive elements
if (this._isInteractive(e.target)) return;

// Ensures drag only starts on the handle (if configured)
if (!this._isHandle(e.target)) return;
```

### The `_isHandle` Check

```javascript
_isHandle(el) {
  return this.handleSelector && el.closest(this.handleSelector);
}
```

**Note:** If `handleSelector` is `null` (default), this returns `null` (falsy), and the guard `if (!this._isHandle(e.target)) return` would block ALL drags. Wait — actually no, look at the constructor:

```javascript
this.handleSelector = options.handleSelector || null;
```

And the check:
```javascript
if (!this._isHandle(e.target)) return;
```

If `handleSelector` is `null`, `_isHandle()` returns `null`, which is falsy, so `!this._isHandle(e.target)` is `true`, and it returns. **This means if you don't pass a `handleSelector`, no drag ever starts.**

**Wait — is this actually how it's used?** Check the usages. If components always pass a `handleSelector`, this is fine. But it's a trap for anyone creating a `DraggableList` without one.

### Touch Move During Hold vs. During Drag

```javascript
// HOLD phase: passive=true, no preventDefault
window.addEventListener('touchmove', this._boundTouchMove, { passive: true });

// DRAG phase: passive=false, calls e.preventDefault()
window.addEventListener('touchmove', this._boundOnTouchDragMove, { passive: false });
```

These are different functions bound to the same event type on `window`. They are never active at the same time (the hold ones are removed before the drag ones are added), so there's no conflict.

---

## File Reference

| File | Purpose |
|------|---------|
| `public/services/DraggableList.js` | The drag-and-drop utility itself |
| `public/components/ListBase.js` | Likely instantiates `DraggableList` for item reordering |
| `public/components/ListIndexPage.js` | Likely instantiates `DraggableList` for list reordering |
| `public/app.css` or component CSS | Defines `.dragging`, `.drag-pop`, `.drop-indicator` styles |

---

## Summary of Key Timing

| Event | Time | Action |
|-------|------|--------|
| `touchstart` on handle | T+0ms | `_handleTouchStart`: set `_pendingDrag`, start 150ms timer, add hold listeners |
| `touchmove` during hold | T+0 to T+150ms | `_onTouchMoveDuringHold`: if moved >10px, cancel |
| Timer fires | T+150ms | `_beginTouchDrag`: remove hold listeners, add drag listeners, block scroll |
| `touchmove` during drag | T+150ms+ | `_onTouchDragMove`: `e.preventDefault()`, update transform, update indicator |
| `touchend` | drag end | `_onTouchDragEnd` → `_finishDrag`: cleanup, fire `onReorder` |
| `mousedown` on handle | T+0ms | `_handleMouseDown`: immediately start drag, no pending phase |
| `mousemove` | during drag | `_onMouseDragMove`: update transform, update indicator |
| `mouseup` | drag end | `_onMouseDragEnd` → `_finishDrag`: cleanup, fire `onReorder` |
