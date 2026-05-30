import { ListBase } from './ListBase.js';

/**
 * TodoListWidget - Paginated todo list for homepage widget.
 *
 * Fixed-height 8-item viewport with Up / Down buttons below the list.
 * - Up on the left, Down on the right.
 * - Scrolls 2 items at a time; falls back to 1 when only 1 remains.
 * - Reordering follows the moved item across viewport boundaries.
 */
export class TodoListWidget extends ListBase {
	#offset = 0;
	#navContainer = null;

	_getTemplateId() {
		return 'todo-list-widget';
	}

	connectedCallback() {
		super.connectedCallback();
		this.#navContainer = this.querySelector('.todo-widget-nav-container');
	}

	_setupAddListeners() {
		const form = this.querySelector("#todo-input-form");
		form?.addEventListener("submit", (e) => {
			e.preventDefault();
			this._handleAdd();
			this._inputEl?.focus();
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

	_onAfterMove(todoId, direction, oldIndex, newIndex) {
		this.#offset = this.#computeOffsetForIndex(newIndex);
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

	// -------------------------------------------------------------------------
	// Pagination helpers
	// -------------------------------------------------------------------------
	#clampOffset() {
		const total = this._getCurrentList()?.todos.length || 0;
		if (total <= 8) {
			this.#offset = 0;
		} else {
			const maxOffset = total - 8;
			this.#offset = Math.max(0, Math.min(this.#offset, maxOffset));
		}
	}

	#computeOffsetForIndex(index) {
		const total = this._getCurrentList()?.todos.length || 0;
		if (total <= 8) return 0;
		return Math.max(0, Math.min(index - 3, total - 8));
	}

	#createNavButton(direction) {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'todo-widget-nav-btn btn btn-ghost';
		btn.textContent = direction === -1 ? '▲ Up' : '▼ Down';
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
		const list = this._getCurrentList();

		if (!this._listsContainerEl) return;
		this._listsContainerEl.innerHTML = '';

		if (!list || list.todos.length === 0) {
			this._listsContainerEl.innerHTML = '<div class="todo-empty">No todos yet. Add one above!</div>';
			this.#renderNav(0, 0);
			this._updateFooter();
			return;
		}

		const total = list.todos.length;
		const offset = this.#offset;

		this.#clampOffset();
		const clampedOffset = this.#offset;

		const startIndex = clampedOffset;
		const endIndex = Math.min(clampedOffset + 8, total);

		const items = list.todos.slice(startIndex, endIndex);

		items.forEach((todo, idx) => {
			const globalIndex = startIndex + idx;
			const li = this._createTodoElement(todo, globalIndex, total);
			this._listsContainerEl.appendChild(li);
		});

		this.#renderNav(total, clampedOffset);
		this._updateFooter();
	}
}

customElements.define("todo-list-widget", TodoListWidget);
