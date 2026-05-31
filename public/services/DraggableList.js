/**
 * DraggableList - Touch/mouse drag-and-drop reordering with long-press activation.
 *
 * Usage:
 *   const dl = new DraggableList(container, {
 *     itemSelector: ':scope > *',
 *     scrollContainer: scrollableAncestor,
 *     onReorder: (oldIndex, newIndex) => { ... }
 *   });
 *
 * Features:
 *   - Long-press (~350ms) anywhere on an item to start drag
 *   - Excludes interactive elements (buttons, inputs, links, contenteditable)
 *   - Suppresses the next click after a drag to prevent navigation/select
 *   - Slight "pop" animation on lift
 *   - Drop indicator line between items
 *   - Auto-scroll when dragging near container edges
 *   - Haptic feedback on lift/drop (if supported)
 */
export class DraggableList {
	constructor(container, options = {}) {
		this.container = container;
		this.itemSelector = options.itemSelector || ':scope > *';
		this.onReorder = options.onReorder || (() => {});
		this.scrollContainer = options.scrollContainer || container;
		this.longPressDelay = options.longPressDelay || 350;
		this.moveThreshold = options.moveThreshold || 10;

		this._pendingDrag = null;
		this._dragState = null;
		this._dropIndicator = null;
		this._scrollRAF = null;
		this._suppressClick = false;

		this._boundHandlePointerDown = this._handlePointerDown.bind(this);
		this.container.addEventListener('touchstart', this._boundHandlePointerDown, { passive: true });
		this.container.addEventListener('mousedown', this._boundHandlePointerDown);
	}

	destroy() {
		this._cancelLongPress();
		this._endDrag();
		this.container.removeEventListener('touchstart', this._boundHandlePointerDown);
		this.container.removeEventListener('mousedown', this._boundHandlePointerDown);
	}

	_isInteractive(el) {
		const tag = el.tagName;
		if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'A' || tag === 'TEXTAREA') return true;
		if (el.isContentEditable) return true;
		if (el.closest('button, input, a, textarea, [contenteditable="true"]')) return true;
		return false;
	}

	_handlePointerDown(e) {
		const item = e.target.closest(this.itemSelector);
		if (!item || !this.container.contains(item)) return;
		if (this._isInteractive(e.target)) return;

		const clientX = e.touches ? e.touches[0].clientX : e.clientX;
		const clientY = e.touches ? e.touches[0].clientY : e.clientY;

		this._pendingDrag = {
			item,
			startX: clientX,
			startY: clientY,
			timer: setTimeout(() => this._beginDrag(e, item), this.longPressDelay)
		};

		this._boundCancelIfMoved = (e) => this._cancelIfMoved(e);
		this._boundCancelLongPress = () => this._cancelLongPress();

		window.addEventListener('touchmove', this._boundCancelIfMoved, { passive: true });
		window.addEventListener('touchend', this._boundCancelLongPress);
		window.addEventListener('touchcancel', this._boundCancelLongPress);
		window.addEventListener('mousemove', this._boundCancelIfMoved);
		window.addEventListener('mouseup', this._boundCancelLongPress);
	}

	_cancelIfMoved(e) {
		if (!this._pendingDrag) return;
		const clientX = e.touches ? e.touches[0].clientX : e.clientX;
		const clientY = e.touches ? e.touches[0].clientY : e.clientY;
		const dx = clientX - this._pendingDrag.startX;
		const dy = clientY - this._pendingDrag.startY;
		if (Math.sqrt(dx * dx + dy * dy) > this.moveThreshold) {
			this._cancelLongPress();
		}
	}

	_cancelLongPress() {
		if (!this._pendingDrag) return;
		clearTimeout(this._pendingDrag.timer);
		this._pendingDrag = null;
		window.removeEventListener('touchmove', this._boundCancelIfMoved);
		window.removeEventListener('touchend', this._boundCancelLongPress);
		window.removeEventListener('touchcancel', this._boundCancelLongPress);
		window.removeEventListener('mousemove', this._boundCancelIfMoved);
		window.removeEventListener('mouseup', this._boundCancelLongPress);
	}

	_beginDrag(e, item) {
		this._cancelLongPress();

		// Prevent default to stop browser scrolling/context menus
		if (e.cancelable !== false) {
			try { e.preventDefault(); } catch (_) {}
		}

		const clientY = e.touches ? e.touches[0].clientY : e.clientY;

		this._dragState = {
			item,
			startY: clientY,
			startIndex: this._getItemIndex(item),
			currentY: clientY
		};

		// Pop animation on lift
		item.classList.add('dragging');
		requestAnimationFrame(() => {
			if (this._dragState) item.classList.add('drag-pop');
		});

		// After pop, remove transition so dragging is instant
		setTimeout(() => {
			if (this._dragState) {
				item.classList.remove('drag-pop');
				item.style.transition = 'none';
			}
		}, 200);

		// Haptic feedback on lift
		if (navigator.vibrate) navigator.vibrate(10);

		this._boundOnDragMove = (e) => this._onDragMove(e);
		this._boundOnDragEnd = (e) => this._onDragEnd(e);

		window.addEventListener('touchmove', this._boundOnDragMove, { passive: false });
		window.addEventListener('mousemove', this._boundOnDragMove);
		window.addEventListener('touchend', this._boundOnDragEnd);
		window.addEventListener('touchcancel', this._boundOnDragEnd);
		window.addEventListener('mouseup', this._boundOnDragEnd);

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

	_onDragMove(e) {
		if (!this._dragState) return;
		e.preventDefault();

		const clientY = e.touches ? e.touches[0].clientY : e.clientY;
		this._dragState.currentY = clientY;

		const deltaY = clientY - this._dragState.startY;
		this._dragState.item.style.transform = `translateY(${deltaY}px)`;

		const insertBeforeIndex = this._computeInsertBeforeIndex(clientY);
		this._updateDropIndicator(insertBeforeIndex);

		if (!this._scrollRAF) {
			this._scrollRAF = requestAnimationFrame(() => this._autoScroll());
		}
	}

	_autoScroll() {
		if (!this._dragState) return;

		const clientY = this._dragState.currentY;
		const container = this.scrollContainer;
		const rect = container.getBoundingClientRect();
		const scrollSpeed = 12;
		const edgeThreshold = 70;

		let scrolled = false;
		if (clientY < rect.top + edgeThreshold) {
			container.scrollTop -= scrollSpeed;
			scrolled = true;
		} else if (clientY > rect.bottom - edgeThreshold) {
			container.scrollTop += scrollSpeed;
			scrolled = true;
		}

		if (scrolled && this._dragState) {
			this._scrollRAF = requestAnimationFrame(() => this._autoScroll());
		} else {
			this._scrollRAF = null;
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

	_onDragEnd(e) {
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

		if (this._scrollRAF) {
			cancelAnimationFrame(this._scrollRAF);
			this._scrollRAF = null;
		}

		window.removeEventListener('touchmove', this._boundOnDragMove);
		window.removeEventListener('mousemove', this._boundOnDragMove);
		window.removeEventListener('touchend', this._boundOnDragEnd);
		window.removeEventListener('touchcancel', this._boundOnDragEnd);
		window.removeEventListener('mouseup', this._boundOnDragEnd);

		if (newIndex !== oldIndex) {
			this._suppressClick = true;
			if (navigator.vibrate) navigator.vibrate(15);
			this.onReorder(oldIndex, newIndex);
		} else {
			this._suppressClick = false;
		}

		this._dragState = null;
	}

	_endDrag() {
		if (this._dragState) {
			this._onDragEnd({});
		}
	}

	_getItems() {
		return Array.from(this.container.querySelectorAll(this.itemSelector));
	}

	_getItemIndex(item) {
		return this._getItems().indexOf(item);
	}
}
