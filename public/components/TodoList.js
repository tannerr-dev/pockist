import { Router } from "../services/Router.js";
import { DBManager } from "../services/DBManager.js";
import { DialogService } from "../services/DialogService.js";
import { ShareService } from "../services/ShareService.js";
import './ShareButton.js';

export class TodoList extends HTMLElement {
	#lists = [];
	#currentListId = null;
	#initialized = false;

	// DOM element references
	#containerEl = null;
	#listSelectorEl = null;
	#listsContainerEl = null;
	#inputEl = null;
	#addBtn = null;
	#itemsLeftEl = null;
	#clearCompletedBtn = null;
	#sortTodosBtn = null;
	#newListInputEl = null;
	#newListBtn = null;
	#listActionsEl = null;

	connectedCallback() {
		const template = document.getElementById("todo-list");
		if (!template) {
			console.error("[TodoList] Template with id 'todo-list' not found");
			return;
		}
		const content = template.content.cloneNode(true);
		this.appendChild(content);

		// Cache DOM elements
		this.#containerEl = this.querySelector(".todo-list-container");
		this.#listSelectorEl = this.querySelector("#list-selector");
		this.#listsContainerEl = this.querySelector("#lists-container");
		this.#inputEl = this.querySelector("#todo-input");
		this.#addBtn = this.querySelector("#add-btn");
		this.#itemsLeftEl = this.querySelector("#items-left");
		this.#clearCompletedBtn = this.querySelector("#clear-completed");
		this.#sortTodosBtn = this.querySelector("#sort-todos");
		this.#newListInputEl = this.querySelector("#new-list-input");
		this.#newListBtn = this.querySelector("#new-list-btn");
		this.#listActionsEl = this.querySelector("#list-actions");

		// Add click handler for heading link
		const headingLink = this.querySelector(".todo-heading-link");
		if (headingLink) {
			headingLink.addEventListener("click", (e) => {
				e.preventDefault();
				Router.go("/list");
			});
		}

		this.#init();
	}

	async #init() {
		if (this.#initialized) return;

		try {
			await DBManager.init();
			await DBManager.migrateFromTodoDB();

			this.#lists = await DBManager.getLists();

			// Migrate lists to add order field (backward compatibility)
			this.#lists.forEach((list, index) => {
				if (typeof list.order !== 'number') {
					list.order = index;
				}
			});

			// Ensure at least one list exists
			if (this.#lists.length === 0) {
				this.#lists.push({
					id: "default",
					name: "My Todos",
					todos: [],
					isDefault: true,
					createdAt: Date.now(),
					order: 0,
				});
				await DBManager.saveLists(this.#lists);
			}

			// Set current list to default if not set
			if (!this.#currentListId) {
				const defaultList = this.#lists.find((l) => l.isDefault);
				this.#currentListId = defaultList?.id || this.#lists[0]?.id;
			}

			this.#initialized = true;
			this.#render();
		} catch (error) {
			console.error("[TodoList] Error in #init():", error);
			if (this.#containerEl) {
				this.#containerEl.innerHTML = `
					<div style="padding: 20px; color: red; border: 1px solid red; margin: 10px;">
						<strong>Error loading todo lists:</strong><br>
						${error.message}
					</div>
				`;
			}
			throw error;
		}

		// Event listeners for adding todos
		this.#addBtn?.addEventListener("click", () => this.#handleAdd());
		this.#inputEl?.addEventListener("keydown", (e) => {
			if (e.key === "Enter") this.#handleAdd();
		});

		// Event listeners for clearing completed and sorting
		this.#clearCompletedBtn?.addEventListener("click", () => this.#clearCompleted());
		this.#sortTodosBtn?.addEventListener("click", () => this.#sortTodos());

		// Event listeners for new list creation
		this.#newListBtn?.addEventListener("click", () => this.#handleNewList());
		this.#newListInputEl?.addEventListener("keydown", (e) => {
			if (e.key === "Enter") this.#handleNewList();
		});

		// Event listener for list selector
		this.#listSelectorEl?.addEventListener("change", (e) => {
			this.#currentListId = e.target.value;
			this.#render();
		});
	}

	#getCurrentList() {
		return this.#lists.find((l) => l.id === this.#currentListId);
	}

	async #handleAdd() {
		const text = this.#inputEl?.value.trim();
		if (!text) return;

		const list = this.#getCurrentList();
		if (!list) return;

		const todo = {
			id: Date.now().toString(),
			text: text,
			completed: false,
			createdAt: Date.now(),
			order: list.todos.length,
		};

		list.todos.push(todo);
		this.#inputEl.value = "";

		try {
			await DBManager.saveLists(this.#lists);
			this.#render();
		} catch (error) {
			console.error('[TodoList] Error saving lists:', error);
		}
	}

	#renderWithTransition() {
		if (document.startViewTransition) {
			document.startViewTransition(() => this.#render());
		} else {
			this.#render();
		}
	}

	async #toggleTodo(todoId) {
		const list = this.#getCurrentList();
		if (!list) return;

		const todo = list.todos.find((t) => t.id === todoId);
		if (todo) {
			todo.completed = !todo.completed;
			try {
				await DBManager.saveLists(this.#lists);
				this.#render();
			} catch (error) {
				console.error('[TodoList] Error saving after toggle:', error);
			}
		}
	}

	async #editTodo(todoId, newText) {
		const list = this.#getCurrentList();
		if (!list) return;

		const todo = list.todos.find((t) => t.id === todoId);
		if (todo && newText.trim()) {
			todo.text = newText.trim();
			try {
				await DBManager.saveLists(this.#lists);
				this.#render();
			} catch (error) {
				console.error('[TodoList] Error saving after edit:', error);
			}
		}
	}

	async #deleteTodo(todoId) {
		const list = this.#getCurrentList();
		if (!list) return;

		const todo = list.todos.find((t) => t.id === todoId);
		if (!todo) return;

		const confirmed = await DialogService.confirm(`Delete "${todo.text}"? This cannot be undone.`, "Delete");
		if (confirmed) {
			list.todos = list.todos.filter((t) => t.id !== todoId);

			// Reorder remaining todos with descending order (newest/highest on top)
			list.todos.forEach((todo, index) => {
				todo.order = list.todos.length - 1 - index;
			});

			try {
				await DBManager.saveLists(this.#lists);
				this.#renderWithTransition();
			} catch (error) {
				console.error('[TodoList] Error saving after delete:', error);
			}
		}
	}

	async #moveTodo(todoId, direction) {
		const list = this.#getCurrentList();
		if (!list) return;

		// Ensure todos have order field (backward compatibility)
		list.todos.forEach((todo, index) => {
			if (typeof todo.order !== 'number') {
				todo.order = index;
			}
		});

		const todoIndex = list.todos.findIndex((t) => t.id === todoId);
		if (todoIndex === -1) return;

		const newIndex = todoIndex + direction;
		if (newIndex < 0 || newIndex >= list.todos.length) return;

		// Swap the todos and update their order values
		const tempOrder = list.todos[todoIndex].order;
		list.todos[todoIndex].order = list.todos[newIndex].order;
		list.todos[newIndex].order = tempOrder;

		// Sort todos by order descending (highest first for newest-on-top)
		list.todos.sort((a, b) => b.order - a.order);

		try {
			await DBManager.saveLists(this.#lists);
			this.#renderWithTransition();
		} catch (error) {
			console.error('[TodoList] Error saving after move:', error);
		}
	}

	async #clearCompleted() {
		const list = this.#getCurrentList();
		if (!list) return;

		const completedCount = list.todos.filter((t) => t.completed).length;
		if (completedCount === 0) return;

		const itemText = completedCount === 1 ? 'item' : 'items';
		const confirmed = await DialogService.confirm(
			`Clear ${completedCount} completed ${itemText}? This cannot be undone.`,
			'Clear'
		);

		if (!confirmed) return;

		list.todos = list.todos.filter((t) => !t.completed);

		// Sort by order descending (newest first) before reassigning
		list.todos.sort((a, b) => {
			const orderA = typeof a.order === 'number' ? a.order : 0;
			const orderB = typeof b.order === 'number' ? b.order : 0;
			return orderB - orderA;
		});

		// Reassign order values to maintain descending order
		list.todos.forEach((todo, index) => {
			todo.order = list.todos.length - 1 - index;
		});

		try {
			await DBManager.saveLists(this.#lists);
			this.#renderWithTransition();
		} catch (error) {
			console.error('[TodoList] Error saving after clear:', error);
		}
	}

	async #sortTodos() {
		const list = this.#getCurrentList();
		if (!list) return;

		// Sort: active items first, then completed items
		// Within each group, sort by order descending (newest first within each group)
		list.todos.sort((a, b) => {
			// Completed items go to the bottom
			if (a.completed !== b.completed) {
				return a.completed ? 1 : -1;
			}
			// Within same completion status, sort by order descending (highest/newest first)
			const orderA = typeof a.order === 'number' ? a.order : 0;
			const orderB = typeof b.order === 'number' ? b.order : 0;
			return orderB - orderA;
		});

		// Reassign order values to reflect new positions
		list.todos.forEach((todo, index) => {
			todo.order = list.todos.length - 1 - index;
		});

		try {
			await DBManager.saveLists(this.#lists);
			this.#renderWithTransition();
		} catch (error) {
			console.error('[TodoList] Error saving after sort:', error);
		}
	}

	async #handleNewList() {
		const name = this.#newListInputEl?.value.trim();
		if (!name) return;

		const newList = {
			id: Date.now().toString(),
			name: name,
			todos: [],
			isDefault: false,
			createdAt: Date.now(),
			order: this.#lists.length,
		};

		this.#lists.push(newList);
		this.#currentListId = newList.id;
		this.#newListInputEl.value = "";

		try {
			await DBManager.saveLists(this.#lists);
			this.#renderWithTransition();
		} catch (error) {
			console.error('[TodoList] Error saving new list:', error);
		}
	}

	async #setDefaultList() {
		const listId = this.#currentListId;
		this.#lists.forEach((l) => {
			l.isDefault = l.id === listId;
		});

		try {
			await DBManager.saveLists(this.#lists);
			this.#renderWithTransition();
		} catch (error) {
			console.error('[TodoList] Error saving default list:', error);
		}
	}

	async #deleteList() {
		const listId = this.#currentListId;

		if (this.#lists.length <= 1) {
			alert("Cannot delete the last list");
			return;
		}

		const list = this.#lists.find((l) => l.id === listId);
		const confirmed = await DialogService.confirm(`Delete "${list?.name || 'this list'}"? This cannot be undone.`, "Delete");
		if (!confirmed) return;

		this.#lists = this.#lists.filter((l) => l.id !== listId);

		// Reorder remaining lists
		this.#lists.forEach((list, index) => {
			list.order = index;
		});

		// Switch to default or first list
		const defaultList = this.#lists.find((l) => l.isDefault);
		this.#currentListId = defaultList?.id || this.#lists[0]?.id;

		try {
			await DBManager.saveLists(this.#lists);
			this.#renderWithTransition();
		} catch (error) {
			console.error('[TodoList] Error saving after list delete:', error);
		}
	}

	async #editListName() {
		const list = this.#getCurrentList();
		if (!list) return;

		const newName = await DialogService.prompt("Rename list:", list.name);
		if (newName && newName.trim() && newName.trim() !== list.name) {
			list.name = newName.trim();
			try {
				await DBManager.saveLists(this.#lists);
				this.#renderWithTransition();
			} catch (error) {
				console.error('[TodoList] Error saving after name edit:', error);
			}
		}
	}

	async #moveList(direction) {
		const listId = this.#currentListId;

		// Ensure all lists have order field
		this.#lists.forEach((list, index) => {
			if (typeof list.order !== 'number') {
				list.order = index;
			}
		});

		const listIndex = this.#lists.findIndex((l) => l.id === listId);
		if (listIndex === -1) return;

		const newIndex = listIndex + direction;
		if (newIndex < 0 || newIndex >= this.#lists.length) return;

		// Swap order values
		const tempOrder = this.#lists[listIndex].order;
		this.#lists[listIndex].order = this.#lists[newIndex].order;
		this.#lists[newIndex].order = tempOrder;

		// Sort lists by order
		this.#lists.sort((a, b) => a.order - b.order);

		try {
			await DBManager.saveLists(this.#lists);
			this.#renderWithTransition();
		} catch (error) {
			console.error('[TodoList] Error saving after list move:', error);
		}
	}

	async #shareList() {
		const list = this.#getCurrentList();
		if (!list) return;

		try {
			const shareData = {
				notes: [],
				lists: [list]
			};

			const result = await ShareService.createShare('list', shareData, list.name || 'Untitled List');
			const fullUrl = `${window.location.origin}${result.url}`;

			const dialog = document.createElement('dialog');
			dialog.className = 'share-dialog';
			dialog.innerHTML = `
				<div class="share-dialog-content">
					<h3>List Shared!</h3>
					<p>"${this.#escapeHtml(list.name || 'Untitled List')}"</p>
					<div class="share-info">
						<span class="share-expiry">Link expires in ${result.expiresIn}</span>
					</div>
					<div class="share-result">
						<input type="text" class="share-url" value="${fullUrl}" readonly />
						<button class="share-copy-btn" type="button">Copy</button>
						<p class="share-success">Share link created!</p>
					</div>
					<div class="share-actions">
						<button class="share-close-btn" type="button">Close</button>
					</div>
				</div>
			`;

			document.body.appendChild(dialog);
			dialog.showModal();

			const copyBtn = dialog.querySelector('.share-copy-btn');
			const urlInput = dialog.querySelector('.share-url');
			copyBtn.addEventListener('click', () => {
				urlInput.select();
				document.execCommand('copy');
				copyBtn.textContent = 'Copied!';
				setTimeout(() => {
					copyBtn.textContent = 'Copy';
				}, 2000);
			});

			const closeBtn = dialog.querySelector('.share-close-btn');
			closeBtn.addEventListener('click', () => {
				dialog.close();
				document.body.removeChild(dialog);
			});

			dialog.addEventListener('click', (e) => {
				if (e.target === dialog) {
					dialog.close();
					document.body.removeChild(dialog);
				}
			});
		} catch (error) {
			console.error('[TodoList] Share failed:', error);
			alert(`Failed to share list: ${error.message}`);
		}
	}

	#render() {
		if (!this.#containerEl) return;

		// Sort lists by order for the dropdown
		const sortedLists = [...this.#lists].sort((a, b) => {
			const orderA = typeof a.order === 'number' ? a.order : 0;
			const orderB = typeof b.order === 'number' ? b.order : 0;
			return orderA - orderB;
		});

		// Update list selector dropdown
		if (this.#listSelectorEl) {
			this.#listSelectorEl.innerHTML = sortedLists
				.map((l) =>
					`<option value="${l.id}" ${l.id === this.#currentListId ? "selected" : ""}>
						${this.#escapeHtml(l.name)} ${l.isDefault ? "(default)" : ""}
					</option>`
				)
				.join("");
		}

		// Update list actions (reorder buttons, etc.)
		const currentList = this.#getCurrentList();
		const currentListIndex = sortedLists.findIndex((l) => l.id === this.#currentListId);
		const isFirst = currentListIndex === 0;
		const isLast = currentListIndex === sortedLists.length - 1;
		const isDefault = currentList?.isDefault;

		if (this.#listActionsEl) {
			this.#listActionsEl.innerHTML = `
				<button class="button-link list-move-up ${isFirst ? 'disabled' : ''}" ${isFirst ? 'disabled' : ''} title="Move list up">▲</button>
				<button class="button-link list-move-down ${isLast ? 'disabled' : ''}" ${isLast ? 'disabled' : ''} title="Move list down">▼</button>
				<button class="button-link rename-list-btn" title="Rename list">Rename</button>
				<button class="button-link share-list-btn" title="Share list">Share</button>
				${!isDefault ? '<button class="button-link set-default-btn" title="Set as default">Set default</button>' : ''}
				<button class="button-link delete-list-btn" title="Delete list">Delete</button>
			`;

			// Attach event listeners to action buttons
			const moveUpBtn = this.#listActionsEl.querySelector('.list-move-up');
			const moveDownBtn = this.#listActionsEl.querySelector('.list-move-down');
			const renameBtn = this.#listActionsEl.querySelector('.rename-list-btn');
			const shareBtn = this.#listActionsEl.querySelector('.share-list-btn');
			const setDefaultBtn = this.#listActionsEl.querySelector('.set-default-btn');
			const deleteBtn = this.#listActionsEl.querySelector('.delete-list-btn');

			if (moveUpBtn && !isFirst) {
				moveUpBtn.addEventListener('click', () => this.#moveList(-1));
			}
			if (moveDownBtn && !isLast) {
				moveDownBtn.addEventListener('click', () => this.#moveList(1));
			}
			if (renameBtn) {
				renameBtn.addEventListener('click', () => this.#editListName());
			}
			if (shareBtn) {
				shareBtn.addEventListener('click', () => this.#shareList());
			}
			if (setDefaultBtn) {
				setDefaultBtn.addEventListener('click', () => this.#setDefaultList());
			}
			if (deleteBtn) {
				deleteBtn.addEventListener('click', () => this.#deleteList());
			}
		}

		// Render todos for current list
		this.#renderTodoList();
	}

	#renderTodoList() {
		const list = this.#getCurrentList();

		if (!this.#listsContainerEl) return;
		this.#listsContainerEl.innerHTML = "";

		if (!list || list.todos.length === 0) {
			this.#listsContainerEl.innerHTML = '<li class="todo-empty">No todos yet. Add one above!</li>';
		} else {
			// Render todos in descending order (newest/highest order on top)
			const orderedTodos = [...list.todos].sort((a, b) => {
				const orderA = typeof a.order === 'number' ? a.order : 0;
				const orderB = typeof b.order === 'number' ? b.order : 0;
				return orderB - orderA;
			});

			const ul = document.createElement('ul');
			ul.className = 'todo-list-ul';

			orderedTodos.forEach((todo, index) => {
				const li = document.createElement('li');
				li.className = `todo-item ${todo.completed ? "completed" : ""}`;
				li.dataset.todoId = todo.id;
				li.style.viewTransitionName = `todo-${todo.id}`;

				const isAtTop = index === 0;
				const isAtBottom = index === orderedTodos.length - 1;

				li.innerHTML = `
					<input type="checkbox" class="todo-checkbox" ${todo.completed ? "checked" : ""}>
					<span class="todo-text" contenteditable="true">${this.#escapeHtml(todo.text)}</span>
					<div class="todo-reorder">
						<button class="todo-move-up ${isAtTop ? 'disabled' : ''}" aria-label="Move up" ${isAtTop ? 'disabled' : ''}>▲</button>
						<button class="todo-move-down ${isAtBottom ? 'disabled' : ''}" aria-label="Move down" ${isAtBottom ? 'disabled' : ''}>▼</button>
					</div>
					<button class="todo-delete" aria-label="Delete todo">×</button>
				`;

				const checkbox = li.querySelector(".todo-checkbox");
				const textSpan = li.querySelector(".todo-text");
				const deleteBtn = li.querySelector(".todo-delete");
				const moveUpBtn = li.querySelector(".todo-move-up");
				const moveDownBtn = li.querySelector(".todo-move-down");

				checkbox.addEventListener("change", () => {
					this.#toggleTodo(todo.id);
				});

				textSpan.addEventListener("blur", () => {
					this.#editTodo(todo.id, textSpan.textContent);
				});

				textSpan.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						textSpan.blur();
					}
				});

				deleteBtn.addEventListener("click", () => {
					this.#deleteTodo(todo.id);
				});

				if (!isAtTop) {
					moveUpBtn.addEventListener("click", () => {
						this.#moveTodo(todo.id, 1);
					});
				}

				if (!isAtBottom) {
					moveDownBtn.addEventListener("click", () => {
						this.#moveTodo(todo.id, -1);
					});
				}

				ul.appendChild(li);
			});

			this.#listsContainerEl.appendChild(ul);
		}

		// Update footer
		const activeCount = list?.todos.filter((t) => !t.completed).length || 0;
		if (this.#itemsLeftEl) {
			this.#itemsLeftEl.textContent = `${activeCount} item${activeCount !== 1 ? "s" : ""} left`;
		}

		const hasCompleted = list?.todos.some((t) => t.completed);
		if (this.#clearCompletedBtn) {
			this.#clearCompletedBtn.classList.toggle('hidden', !hasCompleted);
		}

		if (this.#sortTodosBtn) {
			this.#sortTodosBtn.classList.toggle('hidden', !(list?.todos.length > 0));
		}
	}

	#escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}
}

customElements.define("todo-list", TodoList);
