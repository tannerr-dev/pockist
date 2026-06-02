import { ListBase } from './ListBase.js';
import { DraggableList } from '../services/DraggableList.js';

/**
 * ListWidget - Paginated list for homepage widget.
 *
 * Fixed-height 8-item viewport with Up / Down buttons below the list.
 */
export class ListWidget extends ListBase {
	#offset = 0;
	#navContainer = null;
	#draggableList = null;

	_getTemplateId() {
		return 'pockist-list-widget';
	}

	connectedCallback() {
		super.connectedCallback();
		this.#navContainer = this.querySelector('.list-widget-nav-container');
	}

	disconnectedCallback() {
		if (this.#draggableList) {
			this.#draggableList.destroy();
			this.#draggableList = null;
		}
	}

	_setupAddListeners() {
		const form = this.querySelector("#list-input-form");
		form?.addEventListener("submit", (e) => {
			e.preventDefault();
			this._handleAdd();
			this._inputEl?.blur();
		});

		this._inputEl?.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this._handleAdd();
				// Keep focus for rapid entry
			}
		});
	}

	_onAfterAdd() {
		this.#offset = 0;
		this._renderSlots();
	}

	_onAfterDelete() {
		this.#clampOffset();
		this._renderSlots();
	}

	_onAfterMove(itemId, direction, oldIndex, newIndex) {
		this._renderSlots();
	}

	_onAfterClear() {
		this.#clampOffset();
		this._renderSlots();
	}

	_onAfterSort() {
		this.#offset = 0;
		this._renderSlots();
	}

	_renderContent() {
		this._renderSlots();
	}

	#clampOffset() {
		const total = this._getLinkedItems().length || 0;
		if (total <= 8) {
			this.#offset = 0;
		} else {
			const maxOffset = total - 8;
			this.#offset = Math.max(0, Math.min(this.#offset, maxOffset));
		}
	}

	#createNavButton(direction) {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'list-widget-nav-btn btn btn-ghost';
		const svg = direction === -1
			? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>'
			: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
		btn.innerHTML = svg + (direction === -1 ? ' Up' : ' Down');
		return btn;
	}

	#renderNav(total, offset) {
		if (!this.#navContainer) return;
		this.#navContainer.innerHTML = '';

		if (total <= 8) return;

		const maxOffset = total - 8;

		const upBtn = this.#createNavButton(-1);
		upBtn.disabled = offset === 0;
		upBtn.addEventListener('click', () => {
			this.#offset = Math.max(0, this.#offset - 2);
			this._renderSlots();
		});

		const downBtn = this.#createNavButton(1);
		downBtn.disabled = offset >= maxOffset;
		downBtn.addEventListener('click', () => {
			const remaining = maxOffset - this.#offset;
			const step = remaining >= 2 ? 2 : remaining;
			this.#offset += step;
			this._renderSlots();
		});

		this.#navContainer.appendChild(upBtn);
		this.#navContainer.appendChild(downBtn);
	}

	_renderSlots() {
		const items = this._getLinkedItems();

		if (!this._listsContainerEl) return;
		this._listsContainerEl.innerHTML = '';

		if (items.length === 0) {
			this._listsContainerEl.innerHTML = '<div class="list-empty">No items yet. Add one above!</div>';
			this.#renderNav(0, 0);
			this._updateFooter();
			this.#initDraggableList();
			return;
		}

		const total = items.length;
		const offset = this.#offset;

		this.#clampOffset();
		const clampedOffset = this.#offset;

		const startIndex = clampedOffset;
		const endIndex = Math.min(clampedOffset + 8, total);

		const visibleItems = items.slice(startIndex, endIndex);

		visibleItems.forEach((item, idx) => {
			const globalIndex = startIndex + idx;
			const li = this._createItemElement(item, globalIndex, total);
			this._listsContainerEl.appendChild(li);
		});

		this.#renderNav(total, clampedOffset);
		this._updateFooter();
		this.#initDraggableList();
	}

	#initDraggableList() {
		if (this.#draggableList) {
			this.#draggableList.destroy();
			this.#draggableList = null;
		}

		const items = this._getLinkedItems();
		if (items.length <= 1) return;

		this.#draggableList = new DraggableList(this._listsContainerEl, {
			itemSelector: 'list-item',
			handleSelector: '.drag-hint',
			onReorder: (oldIndex, newIndex) => {
				const globalOldIndex = this.#offset + oldIndex;
				const globalNewIndex = this.#offset + newIndex;
				this._reorderItem(globalOldIndex, globalNewIndex);
			}
		});
	}
}

customElements.define("pockist-list-widget", ListWidget);
