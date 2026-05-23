import { ListBase } from './ListBase.js';
import './ShareButton.js';

export class TodoList extends ListBase {
	_getTemplateId() {
		return 'todo-list';
	}

	_setupAddListeners() {
		this._addBtn?.addEventListener("click", () => this._handleAdd());
		this._inputEl?.addEventListener("keydown", (e) => {
			if (e.key === "Enter") this._handleAdd();
		});
	}

	_onAfterAdd(todo, list) {
		let container = this._listsContainerEl.querySelector('.todo-list-ul');

		if (!container) {
			this._listsContainerEl.innerHTML = '';
			container = document.createElement('div');
			container.className = 'todo-list-ul';
			this._listsContainerEl.appendChild(container);
		}

		const item = this._createTodoElement(todo, 0, list.todos.length);
		item.style.opacity = '0';
		item.style.transform = 'translateY(-10px)';
		container.insertBefore(item, container.firstChild);

		requestAnimationFrame(() => {
			item.style.transition = 'opacity 0.2s, transform 0.2s';
			item.style.opacity = '1';
			item.style.transform = 'translateY(0)';
		});

		this.#updateItemIndices();
		this._updateFooter();
	}

	_onAfterDelete(todoId) {
		const item = this._listsContainerEl.querySelector(`list-item[item-id="${todoId}"]`);
		const list = this._getCurrentList();

		if (item) {
			item.style.transition = 'opacity 0.2s, transform 0.2s';
			item.style.opacity = '0';
			item.style.transform = 'translateX(20px)';

			setTimeout(() => {
				item.remove();
				if (list?.todos.length === 0) {
					this._listsContainerEl.innerHTML = '<div class="todo-empty">No todos yet. Add one above!</div>';
				}
			}, 200);
		}

		this.#updateItemIndices();
		this._updateFooter();
	}

	_onAfterMove(todoId, direction, oldIndex, newIndex) {
		const items = Array.from(this._listsContainerEl.querySelectorAll('list-item'));
		const currentItem = items.find(item => item.itemId === todoId);
		if (!currentItem) return;

		const targetItem = direction === -1
			? currentItem.previousElementSibling
			: currentItem.nextElementSibling;
		if (!targetItem || targetItem.classList.contains('todo-empty')) return;

		currentItem.style.transition = 'transform 0.2s';
		targetItem.style.transition = 'transform 0.2s';

		if (direction === -1) {
			currentItem.parentNode.insertBefore(currentItem, targetItem);
		} else {
			currentItem.parentNode.insertBefore(targetItem, currentItem);
		}

		this.#updateItemIndices();
	}

	_onAfterClear(completedIds) {
		const list = this._getCurrentList();

		completedIds.forEach((id, index) => {
			const item = this._listsContainerEl.querySelector(`list-item[item-id="${id}"]`);
			if (item) {
				item.style.transition = 'opacity 0.2s, transform 0.2s';
				item.style.opacity = '0';
				item.style.transform = 'translateX(20px)';

				setTimeout(() => {
					item.remove();
				}, 200 + (index * 50));
			}
		});

		this.#updateItemIndices();
		this._updateFooter();

		if (list?.todos.length === 0) {
			setTimeout(() => {
				this._listsContainerEl.innerHTML = '<div class="todo-empty">No todos yet. Add one above!</div>';
			}, 200 + (completedIds.length * 50));
		}
	}

	_onAfterSort() {
		const ul = this._listsContainerEl.querySelector('.todo-list-ul');
		if (ul) {
			ul.style.opacity = '0.5';
			ul.style.transition = 'opacity 0.2s';
		}
		this._renderTodoList();
	}

	_renderContent() {
		this._renderTodoList();
	}

	_renderTodoList() {
		const list = this._getCurrentList();

		if (!this._listsContainerEl) return;
		this._listsContainerEl.innerHTML = "";

		if (!list || list.todos.length === 0) {
			this._listsContainerEl.innerHTML = '<div class="todo-empty">No todos yet. Add one above!</div>';
		} else {
			const div = document.createElement('div');
			div.className = 'todo-list-ul';

			list.todos.forEach((todo, index) => {
				const item = this._createTodoElement(todo, index, list.todos.length);
				div.appendChild(item);
			});

			this._listsContainerEl.appendChild(div);
		}

		this._updateFooter();
	}

	#updateItemIndices() {
		const list = this._getCurrentList();
		if (!list || !this._listsContainerEl) return;

		const items = this._listsContainerEl.querySelectorAll('list-item');
		items.forEach((item, index) => {
			item.index = index;
			item.total = items.length;
		});
	}
}

customElements.define("todo-list", TodoList);
