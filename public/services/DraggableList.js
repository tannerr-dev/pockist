 // * DraggableList - Touch/mouse drag-and-drop reordering with deferred scroll blocking.
 // *
 // * Usage:
 // *   const dl = new DraggableList(container, {
 // *     itemSelector: ':scope > *',
 // *     handleSelector: '.drag-hint',
 // *     onReorder: (oldIndex, newIndex) => { ... }
 // *   });
 // *
 // * Features:
 // *   - Touch: long-press (~150ms) on handle to start drag. Scroll is NOT blocked
 // *     during the hold — only after the timer fires and drag actually begins.
 // *   - Mouse: immediate drag on handle mousedown.
 // *   - Excludes interactive elements (buttons, inputs, links, contenteditable)
 // *   - Suppresses the next click after a drag to prevent navigation/select
 // *   - Slight "pop" animation on lift
 // *   - Drop indicator line between items
 // *   - Haptic feedback on lift/drop (if supported)
export class DraggableList {
	constructor(container, options = {}) {
		this.container = container;
		this.itemSelector = options.itemSelector || ':scope > *';
		this.handleSelector = options.handleSelector || null;
		this.onReorder = options.onReorder || (() => {});
		this.longPressDelay = options.longPressDelay || 150;
		this.moveThreshold = options.moveThreshold || 10;

		this._pendingDrag = null;
		this._dragState = null;
		this._dropIndicator = null;
		this._suppressClick = false;

		// Touch: deferred hold-to-drag
		this._boundHandleTouchStart = this._handleTouchStart.bind(this);
		this.container.addEventListener('touchstart', this._boundHandleTouchStart, { passive: true });

		// Mouse: immediate drag
		this._boundHandleMouseDown = this._handleMouseDown.bind(this);
		this.container.addEventListener('mousedown', this._boundHandleMouseDown);
	}

	destroy() {
		this._cancelLongPress();
		this._endDrag();
		this.container.removeEventListener('touchstart', this._boundHandleTouchStart);
		this.container.removeEventListener('mousedown', this._boundHandleMouseDown);
	}

	_isHandle(el) {
		return this.handleSelector && el.closest(this.handleSelector);
	}

	_isInteractive(el) {
		const tag = el.tagName;
		if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'A' || tag === 'TEXTAREA') return true;
		if (el.isContentEditable) return true;
		if (el.closest('button, input, a, textarea, [contenteditable="true"]')) return true;
		return false;
	}

	// -----------------------------------------------------------
	// Touch path: deferred hold-to-drag
	// -----------------------------------------------------------
	_handleTouchStart(e) {
		const item = e.target.closest(this.itemSelector);
		if (!item || !this.container.contains(item)) return;
		if (this._isInteractive(e.target)) return;
		if (!this._isHandle(e.target)) return;

		const touch = e.touches[0];
		const itemRef = item; // capture ref for timer closure

		this._pendingDrag = {
			item: itemRef,
			startX: touch.clientX,
			startY: touch.clientY,
			timer: setTimeout(() => this._beginTouchDrag(itemRef), this.longPressDelay)
		};

		this._boundTouchMove = (e) => this._onTouchMoveDuringHold(e);
		this._boundTouchEnd = () => this._cancelLongPress();

		window.addEventListener('touchmove', this._boundTouchMove, { passive: true });
		window.addEventListener('touchend', this._boundTouchEnd);
		window.addEventListener('touchcancel', this._boundTouchEnd);
	}

	_onTouchMoveDuringHold(e) {
		if (!this._pendingDrag) return;
		const touch = e.touches[0];
		const dx = touch.clientX - this._pendingDrag.startX;
		const dy = touch.clientY - this._pendingDrag.startY;
		if (Math.sqrt(dx * dx + dy * dy) > this.moveThreshold) {
			this._cancelLongPress();
		}
	}

	_beginTouchDrag(item) {
		this._cancelLongPress();

		this._dragState = {
			item,
			isTouch: true,
			startY: this._pendingDrag ? this._pendingDrag.startY : 0,
			startIndex: this._getItemIndex(item),
			currentY: this._pendingDrag ? this._pendingDrag.startY : 0
		};

		item.classList.add('dragging');
		requestAnimationFrame(() => {
			if (this._dragState) item.classList.add('drag-pop');
		});

		setTimeout(() => {
			if (this._dragState) {
				item.classList.remove('drag-pop');
				item.style.transition = 'none';
			}
		}, 200);

		if (navigator.vibrate) navigator.vibrate(10);

		this._boundOnTouchDragMove = (e) => this._onTouchDragMove(e);
		this._boundOnTouchDragEnd = (e) => this._onTouchDragEnd(e);

		window.addEventListener('touchmove', this._boundOnTouchDragMove, { passive: false });
		window.addEventListener('touchend', this._boundOnTouchDragEnd);
		window.addEventListener('touchcancel', this._boundOnTouchDragEnd);

		// Suppress the next click on the dragged item
		this._suppressClick = false;
		const clickSuppressor = (e) => {
			if (this._suppressClick) {
				e.stopPropagation();
				e.preventDefault();
				this._suppressClick = false;
			}
		};
		item.addEventListener('click', clickSuppressor, { capture: true, once: true });

		this._createDropIndicator();
	}

	_onTouchDragMove(e) {
		if (!this._dragState) return;
		e.preventDefault(); // Block scroll NOW that drag is active

		const touch = e.touches[0];
		this._dragState.currentY = touch.clientY;

		const deltaY = touch.clientY - this._dragState.startY;
		this._dragState.item.style.transform = `translateY(${deltaY}px)`;

		const insertBeforeIndex = this._computeInsertBeforeIndex(touch.clientY);
		this._updateDropIndicator(insertBeforeIndex);
	}

	_onTouchDragEnd(e) {
		if (!this._dragState || !this._dragState.isTouch) return;
		this._finishDrag();
	}

	// -----------------------------------------------------------
	// Mouse path: immediate drag
	// -----------------------------------------------------------
	_handleMouseDown(e) {
		const item = e.target.closest(this.itemSelector);
		if (!item || !this.container.contains(item)) return;
		if (this._isInteractive(e.target)) return;
		if (!this._isHandle(e.target)) return;

		e.preventDefault();

		this._dragState = {
			item,
			isTouch: false,
			startY: e.clientY,
			startIndex: this._getItemIndex(item),
			currentY: e.clientY
		};

		item.classList.add('dragging');
		requestAnimationFrame(() => {
			if (this._dragState) item.classList.add('drag-pop');
		});

		setTimeout(() => {
			if (this._dragState) {
				item.classList.remove('drag-pop');
				item.style.transition = 'none';
			}
		}, 200);

		if (navigator.vibrate) navigator.vibrate(10);

		this._boundOnMouseDragMove = (e) => this._onMouseDragMove(e);
		this._boundOnMouseDragEnd = (e) => this._onMouseDragEnd(e);

		window.addEventListener('mousemove', this._boundOnMouseDragMove);
		window.addEventListener('mouseup', this._boundOnMouseDragEnd);

		// Suppress the next click on the dragged item
		this._suppressClick = false;
		const clickSuppressor = (e) => {
			if (this._suppressClick) {
				e.stopPropagation();
				e.preventDefault();
				this._suppressClick = false;
			}
		};
		item.addEventListener('click', clickSuppressor, { capture: true, once: true });

		this._createDropIndicator();
	}

	_onMouseDragMove(e) {
		if (!this._dragState || this._dragState.isTouch) return;

		this._dragState.currentY = e.clientY;

		const deltaY = e.clientY - this._dragState.startY;
		this._dragState.item.style.transform = `translateY(${deltaY}px)`;

		const insertBeforeIndex = this._computeInsertBeforeIndex(e.clientY);
		this._updateDropIndicator(insertBeforeIndex);
	}

	_onMouseDragEnd(e) {
		if (!this._dragState || this._dragState.isTouch) return;
		this._finishDrag();
	}

	// -----------------------------------------------------------
	// Shared helpers
	// -----------------------------------------------------------
	_cancelLongPress() {
		if (!this._pendingDrag) return;
		clearTimeout(this._pendingDrag.timer);
		this._pendingDrag = null;
		window.removeEventListener('touchmove', this._boundTouchMove);
		window.removeEventListener('touchend', this._boundTouchEnd);
		window.removeEventListener('touchcancel', this._boundTouchEnd);
	}

	_finishDrag() {
		if (!this._dragState) return;

		const insertBeforeIndex = this._computeInsertBeforeIndex(this._dragState.currentY);
		const oldIndex = this._dragState.startIndex;

		let newIndex = insertBeforeIndex;
		if (newIndex > oldIndex) newIndex -= 1;

		// Restore styles
		this._dragState.item.classList.remove('dragging');
		this._dragState.item.style.transform = '';
		this._dragState.item.style.transition = '';

		if (this._dropIndicator) {
			this._dropIndicator.remove();
			this._dropIndicator = null;
		}

		// Clean up touch listeners
		if (this._dragState.isTouch) {
			window.removeEventListener('touchmove', this._boundOnTouchDragMove);
			window.removeEventListener('touchend', this._boundOnTouchDragEnd);
			window.removeEventListener('touchcancel', this._boundOnTouchDragEnd);
		} else {
			window.removeEventListener('mousemove', this._boundOnMouseDragMove);
			window.removeEventListener('mouseup', this._boundOnMouseDragEnd);
		}

		this._suppressClick = true;
		if (newIndex !== oldIndex) {
			if (navigator.vibrate) navigator.vibrate(15);
			this.onReorder(oldIndex, newIndex);
		}

		this._dragState = null;
	}

	_endDrag() {
		if (this._dragState) {
			this._finishDrag();
		}
	}

	_computeInsertBeforeIndex(pointerY) {
		const items = this._getItems();
		const draggedItem = this._dragState.item;

		for (let i = 0; i < items.length; i++) {
			if (items[i] === draggedItem) continue;
			const rect = items[i].getBoundingClientRect();
			const centerY = rect.top + rect.height / 2;
			if (pointerY < centerY) return i;
		}

		return items.length;
	}

	_createDropIndicator() {
		this._dropIndicator = document.createElement('div');
		this._dropIndicator.className = 'drop-indicator';
		this.container.appendChild(this._dropIndicator);
	}

	_updateDropIndicator(insertBeforeIndex) {
		if (!this._dropIndicator) return;

		const items = this._getItems();
		const containerRect = this.container.getBoundingClientRect();

		let top;
		if (insertBeforeIndex >= items.length) {
			if (items.length === 0) {
				top = 0;
			} else {
				const lastRect = items[items.length - 1].getBoundingClientRect();
				top = lastRect.bottom - containerRect.top;
			}
		} else {
			const targetRect = items[insertBeforeIndex].getBoundingClientRect();
			top = targetRect.top - containerRect.top;
		}

		this._dropIndicator.style.top = `${top - 1.5}px`;
		this._dropIndicator.style.display = 'block';
	}

	_getItems() {
		return Array.from(this.container.querySelectorAll(this.itemSelector));
	}

	_getItemIndex(item) {
		return this._getItems().indexOf(item);
	}
}
