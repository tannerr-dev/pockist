import { ListBase } from './ListBase.js';

/**
 * TodoListWidget - Paginated todo list for homepage widget.
 *
 * Same features as TodoList but with 8-slot pagination instead of scrolling:
 * - First page: up to 7 todos + down bar
 * - Middle pages: up bar + 6 todos + down bar
 * - Last page: up bar + remaining todos (container shrinks)
 * - Reordering follows the moved item across page boundaries.
 */
export class TodoListWidget extends ListBase {
	#offset = 0;

	_getTemplateId() {
		return 'todo-list-widget';
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
		if (total <= 7) {
			this.#offset = 0;
		} else {
			this.#offset = Math.min(this.#offset, total - 7);
		}
	}

	#computeOffsetForIndex(index) {
		const total = this._getCurrentList()?.todos.length || 0;
		if (total <= 7) return 0;
		if (index <= 6) return 0;
		return Math.min(index - 5, total - 7);
	}

	#createNavElement(direction) {
		const div = document.createElement('div');
		div.className = 'todo-widget-nav';
		div.innerHTML = direction === -1
			? '<span>▲</span><span>Scroll up</span>'
			: '<span>▼</span><span>Scroll down</span>';

		div.addEventListener('click', () => {
			if (direction === -1) {
				this.#offset = Math.max(0, this.#offset - 1);
			} else {
				if (this.#offset === 0) {
					this.#offset = 2;
				} else {
					this.#offset += 1;
				}
				this.#clampOffset();
			}
			this._renderSlots();
		});

		return div;
	}

	_renderSlots() {
		const list = this._getCurrentList();

		if (!this._listsContainerEl) return;
		this._listsContainerEl.innerHTML = '';

		if (!list || list.todos.length === 0) {
			this._listsContainerEl.innerHTML = '<div class="todo-empty">No todos yet. Add one above!</div>';
			this._updateFooter();
			return;
		}

		const total = list.todos.length;
		const offset = this.#offset;

		let startIndex, endIndex, showUp, showDown;

		if (total <= 7) {
			startIndex = 0;
			endIndex = total;
			showUp = false;
			showDown = false;
		} else if (offset === 0) {
			startIndex = 0;
			endIndex = 7;
			showUp = false;
			showDown = true;
		} else {
			const remaining = total - offset;
			if (remaining <= 7) {
				startIndex = offset;
				endIndex = total;
				showUp = true;
				showDown = false;
			} else {
				startIndex = offset;
				endIndex = offset + 6;
				showUp = true;
				showDown = true;
			}
		}

		const items = list.todos.slice(startIndex, endIndex);

		if (showUp) {
			this._listsContainerEl.appendChild(this.#createNavElement(-1));
		}

		items.forEach((todo, idx) => {
			const globalIndex = startIndex + idx;
			const li = this._createTodoElement(todo, globalIndex, total);
			this._listsContainerEl.appendChild(li);
		});

		if (showDown) {
			this._listsContainerEl.appendChild(this.#createNavElement(1));
		}

		this._updateFooter();
	}
}

customElements.define("todo-list-widget", TodoListWidget);
