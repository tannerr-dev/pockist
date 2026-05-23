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
		let ul = this._listsContainerEl.querySelector('.todo-list-ul');

		if (!ul) {
			this._listsContainerEl.innerHTML = '';
			ul = document.createElement('ul');
			ul.className = 'todo-list-ul';
			this._listsContainerEl.appendChild(ul);
		}

		const li = this._createTodoElement(todo, 0, list.todos.length);
		li.style.opacity = '0';
		li.style.transform = 'translateY(-10px)';
		ul.insertBefore(li, ul.firstChild);

		requestAnimationFrame(() => {
			li.style.transition = 'opacity 0.2s, transform 0.2s';
			li.style.opacity = '1';
			li.style.transform = 'translateY(0)';
		});

		this.#updateMoveButtons();
		this._updateFooter();
	}

	_onAfterDelete(todoId) {
		const li = this._listsContainerEl.querySelector(`[data-todo-id="${todoId}"]`);
		const list = this._getCurrentList();

		if (li) {
			li.style.transition = 'opacity 0.2s, transform 0.2s';
			li.style.opacity = '0';
			li.style.transform = 'translateX(20px)';

			setTimeout(() => {
				li.remove();
				if (list?.todos.length === 0) {
					this._listsContainerEl.innerHTML = '<li class="todo-empty">No todos yet. Add one above!</li>';
				}
			}, 200);
		}

		this.#updateMoveButtons();
		this._updateFooter();
	}

	_onAfterMove(todoId, direction, oldIndex, newIndex) {
		const items = Array.from(this._listsContainerEl.querySelectorAll('.todo-item'));
		const currentLi = items.find(li => li.dataset.todoId === todoId);
		if (!currentLi) return;

		const targetLi = direction === -1
			? currentLi.previousElementSibling
			: currentLi.nextElementSibling;
		if (!targetLi) return;

		currentLi.style.transition = 'transform 0.2s';
		targetLi.style.transition = 'transform 0.2s';

		if (direction === -1) {
			currentLi.parentNode.insertBefore(currentLi, targetLi);
		} else {
			currentLi.parentNode.insertBefore(targetLi, currentLi);
		}

		this.#updateMoveButtons();
	}

	_onAfterClear(completedIds) {
		const list = this._getCurrentList();

		completedIds.forEach((id, index) => {
			const li = this._listsContainerEl.querySelector(`[data-todo-id="${id}"]`);
			if (li) {
				li.style.transition = 'opacity 0.2s, transform 0.2s';
				li.style.opacity = '0';
				li.style.transform = 'translateX(20px)';

				setTimeout(() => {
					li.remove();
				}, 200 + (index * 50));
			}
		});

		this.#updateMoveButtons();
		this._updateFooter();

		if (list?.todos.length === 0) {
			setTimeout(() => {
				this._listsContainerEl.innerHTML = '<li class="todo-empty">No todos yet. Add one above!</li>';
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
			this._listsContainerEl.innerHTML = '<li class="todo-empty">No todos yet. Add one above!</li>';
		} else {
			const ul = document.createElement('ul');
			ul.className = 'todo-list-ul';

			list.todos.forEach((todo, index) => {
				const li = this._createTodoElement(todo, index, list.todos.length);
				ul.appendChild(li);
			});

			this._listsContainerEl.appendChild(ul);
		}

		this._updateFooter();
	}

	#updateMoveButtons() {
		const list = this._getCurrentList();
		if (!list || !this._listsContainerEl) return;

		const items = this._listsContainerEl.querySelectorAll('.todo-item');
		items.forEach((li, index) => {
			const moveUpBtn = li.querySelector('.todo-move-up');
			const moveDownBtn = li.querySelector('.todo-move-down');

			if (moveUpBtn) {
				const isAtTop = index === 0;
				moveUpBtn.disabled = isAtTop;
				moveUpBtn.classList.toggle('disabled', isAtTop);
			}

			if (moveDownBtn) {
				const isAtBottom = index === items.length - 1;
				moveDownBtn.disabled = isAtBottom;
				moveDownBtn.classList.toggle('disabled', isAtBottom);
			}
		});
	}
}

customElements.define("todo-list", TodoList);
