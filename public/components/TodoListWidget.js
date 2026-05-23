import { Router } from "../services/Router.js";
import { DBManager } from "../services/DBManager.js";
import { DialogService } from "../services/DialogService.js";
import { ShareService } from "../services/ShareService.js";
import { ImportExportService } from "../services/ImportExportService.js";

/**
 * TodoListWidget - Paginated todo list for homepage widget.
 *
 * Same features as TodoList but with 8-slot pagination instead of scrolling:
 * - First page: up to 7 todos + down bar
 * - Middle pages: up bar + 6 todos + down bar
 * - Last page: up bar + remaining todos (container shrinks)
 * - Reordering follows the moved item across page boundaries.
 */
export class TodoListWidget extends HTMLElement {
	// State: metadata for all lists (lightweight, no todos)
	#listMetadata = [];
	// State: full current list data (including todos)
	#currentList = null;
	#currentListId = null;
	#initialized = false;
	// Pagination: offset into the todos array
	#offset = 0;

	// DOM element references
	#containerEl = null;
	#listSelectorBtn = null;
	#slotsContainerEl = null;
	#inputEl = null;
	#addBtn = null;
	#clearCompletedBtn = null;
	#sortTodosBtn = null;
	#listActionsEl = null;

	connectedCallback() {
		const template = document.getElementById("todo-list-widget");
		if (!template) {
			console.error("[TodoListWidget] Template with id 'todo-list-widget' not found");
			return;
		}
		const content = template.content.cloneNode(true);
		this.appendChild(content);

		// Cache DOM elements
		this.#containerEl = this.querySelector(".todo-list-container");
		this.#listSelectorBtn = this.querySelector("#list-selector-btn");
		this.#slotsContainerEl = this.querySelector("#lists-container");
		this.#inputEl = this.querySelector("#todo-input");
		this.#addBtn = this.querySelector("#add-btn");
		this.#clearCompletedBtn = this.querySelector("#clear-completed");
		this.#sortTodosBtn = this.querySelector("#sort-todos");
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

			this.#listMetadata = await DBManager.getListMetadata();

			if (this.#listMetadata.length === 0) {
				const newList = await DBManager.createList({
					name: "My Todos",
					isDefault: true
				});
				this.#listMetadata = await DBManager.getListMetadata();
				this.#currentListId = newList.id;
			} else if (!this.#currentListId) {
				const defaultList = this.#listMetadata.find((l) => l.isDefault);
				this.#currentListId = defaultList?.id || this.#listMetadata[0]?.id;
			}

			await this.#loadCurrentList();

			this.#initialized = true;
			this.#render();
		} catch (error) {
			console.error("[TodoListWidget] Error in #init():", error);
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

		const form = this.querySelector("#todo-input-form");
		form?.addEventListener("submit", (e) => {
			e.preventDefault();
			this.#handleAdd();
			this.#inputEl?.focus();
		});

		this.#clearCompletedBtn?.addEventListener("click", () => this.#clearCompleted());
		this.#sortTodosBtn?.addEventListener("click", () => this.#sortTodos());
		this.#listSelectorBtn?.addEventListener("click", () => this.#showListSelectorDialog());
	}

	async #loadCurrentList() {
		if (!this.#currentListId) return;
		try {
			this.#currentList = await DBManager.getList(this.#currentListId);
			if (this.#currentList?.todos?.some(t => typeof t.order === 'number')) {
				this.#currentList.todos.sort((a, b) => (b.order || 0) - (a.order || 0));
				this.#currentList.todos.forEach(t => delete t.order);
				await DBManager.saveList(this.#currentList);
			}
			await DBManager.updateLastAccessed(this.#currentListId);
			const metaIndex = this.#listMetadata.findIndex(m => m.id === this.#currentListId);
			if (metaIndex >= 0) {
				this.#listMetadata[metaIndex].lastAccessed = Date.now();
			}
		} catch (error) {
			console.error('[TodoListWidget] Error loading current list:', error);
			this.#currentList = null;
		}
	}

	#getCurrentListMeta() {
		return this.#listMetadata.find((m) => m.id === this.#currentListId);
	}

	#getCurrentList() {
		return this.#currentList;
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
		};

		list.todos.unshift(todo);
		this.#inputEl.value = "";
		this.#offset = 0; // Jump to top

		try {
			await DBManager.saveList(list);
			const metaIndex = this.#listMetadata.findIndex(m => m.id === list.id);
			if (metaIndex >= 0) {
				this.#listMetadata[metaIndex].todoCount = list.todos.length;
			}
			this.#renderSlots();
		} catch (error) {
			console.error('[TodoListWidget] Error saving list:', error);
			list.todos.shift();
			this.#renderSlots();
		}
	}

	async #toggleTodo(todoId) {
		const list = this.#getCurrentList();
		if (!list) return;

		const todo = list.todos.find((t) => t.id === todoId);
		if (!todo) return;

		const newCompletedState = !todo.completed;
		todo.completed = newCompletedState;

		const li = this.#slotsContainerEl.querySelector(`[data-todo-id="${todoId}"]`);
		if (li) {
			li.classList.toggle('completed', newCompletedState);
			const checkbox = li.querySelector('.todo-checkbox');
			if (checkbox) checkbox.checked = newCompletedState;
		}

		this.#updateFooter();

		try {
			await DBManager.saveList(list);
		} catch (error) {
			console.error('[TodoListWidget] Error saving after toggle:', error);
			todo.completed = !newCompletedState;
			if (li) {
				li.classList.toggle('completed', !newCompletedState);
				const checkbox = li.querySelector('.todo-checkbox');
				if (checkbox) checkbox.checked = !newCompletedState;
			}
			this.#updateFooter();
		}
	}

	async #editTodo(todoId, newText) {
		const list = this.#getCurrentList();
		if (!list) return;

		const todo = list.todos.find((t) => t.id === todoId);
		if (!todo) return;

		const trimmedText = newText.trim();
		if (!trimmedText || trimmedText === todo.text) return;

		const originalText = todo.text;
		todo.text = trimmedText;

		try {
			await DBManager.saveList(list);
		} catch (error) {
			console.error('[TodoListWidget] Error saving after edit:', error);
			todo.text = originalText;
			const li = this.#slotsContainerEl.querySelector(`[data-todo-id="${todoId}"]`);
			if (li) {
				const textSpan = li.querySelector('.todo-text');
				if (textSpan) textSpan.textContent = originalText;
			}
		}
	}

	async #deleteTodo(todoId) {
		const list = this.#getCurrentList();
		if (!list) return;

		const todo = list.todos.find((t) => t.id === todoId);
		if (!todo) return;

		const confirmed = await DialogService.confirm(`Delete "${todo.text}"? This cannot be undone.`, "Delete");
		if (!confirmed) return;

		const deletedIndex = list.todos.findIndex((t) => t.id === todoId);
		const deletedTodo = todo;
		list.todos = list.todos.filter((t) => t.id !== todoId);

		this.#clampOffset();

		try {
			await DBManager.saveList(list);
			const metaIndex = this.#listMetadata.findIndex(m => m.id === list.id);
			if (metaIndex >= 0) {
				this.#listMetadata[metaIndex].todoCount = list.todos.length;
			}
			this.#renderSlots();
		} catch (error) {
			console.error('[TodoListWidget] Error saving after delete:', error);
			list.todos.splice(deletedIndex, 0, deletedTodo);
			this.#clampOffset();
			this.#renderSlots();
		}
	}

	async #moveTodo(todoId, direction) {
		const list = this.#getCurrentList();
		if (!list) return;

		const todoIndex = list.todos.findIndex((t) => t.id === todoId);
		if (todoIndex === -1) return;

		const newIndex = todoIndex + direction;
		if (newIndex < 0 || newIndex >= list.todos.length) return;

		const temp = list.todos[todoIndex];
		list.todos[todoIndex] = list.todos[newIndex];
		list.todos[newIndex] = temp;

		// Follow the moved item
		this.#offset = this.#computeOffsetForIndex(newIndex);

		try {
			await DBManager.saveList(list);
			this.#renderSlots();
		} catch (error) {
			console.error('[TodoListWidget] Error saving after move:', error);
			const revertTemp = list.todos[todoIndex];
			list.todos[todoIndex] = list.todos[newIndex];
			list.todos[newIndex] = revertTemp;
			this.#offset = this.#computeOffsetForIndex(todoIndex);
			this.#renderSlots();
		}
	}

	async #clearCompleted() {
		const list = this.#getCurrentList();
		if (!list) return;

		const completedTodos = list.todos.filter((t) => t.completed);
		if (completedTodos.length === 0) return;

		const itemText = completedTodos.length === 1 ? 'item' : 'items';
		const confirmed = await DialogService.confirm(
			`Clear ${completedTodos.length} completed ${itemText}? This cannot be undone.`,
			'Clear'
		);
		if (!confirmed) return;

		list.todos = list.todos.filter((t) => !t.completed);
		this.#clampOffset();

		try {
			await DBManager.saveList(list);
			const metaIndex = this.#listMetadata.findIndex(m => m.id === list.id);
			if (metaIndex >= 0) {
				this.#listMetadata[metaIndex].todoCount = list.todos.length;
			}
			this.#renderSlots();
		} catch (error) {
			console.error('[TodoListWidget] Error saving after clear:', error);
			// Re-render to restore state
			await this.#loadCurrentList();
			this.#clampOffset();
			this.#renderSlots();
		}
	}

	async #sortTodos() {
		const list = this.#getCurrentList();
		if (!list) return;

		list.todos.sort((a, b) => {
			if (a.completed !== b.completed) {
				return a.completed ? 1 : -1;
			}
			return 0;
		});

		try {
			await DBManager.saveList(list);
			this.#offset = 0;
			this.#renderSlots();
		} catch (error) {
			console.error('[TodoListWidget] Error saving after sort:', error);
			await this.#loadCurrentList();
			this.#renderSlots();
		}
	}

	async #handleCreateList() {
		const name = await DialogService.prompt("Enter a name for the new list:");
		if (!name || !name.trim()) return;

		try {
			const newList = await DBManager.createList({
				name: name.trim(),
				isDefault: false
			});
			this.#listMetadata = await DBManager.getListMetadata();
			this.#currentListId = newList.id;
			this.#currentList = newList;
			this.#offset = 0;
			this.#render();
		} catch (error) {
			console.error('[TodoListWidget] Error creating new list:', error);
		}
	}

	async #setDefaultList(listId) {
		try {
			await DBManager.setDefaultList(listId);
			this.#listMetadata = await DBManager.getListMetadata();
			if (this.#currentList) {
				this.#currentList.isDefault = (this.#currentList.id === listId);
			}
			this.#render();
		} catch (error) {
			console.error('[TodoListWidget] Error setting default list:', error);
		}
	}

	async #deleteList(listId) {
		if (this.#listMetadata.length <= 1) {
			alert("Cannot delete the last list");
			return;
		}

		const listMeta = this.#listMetadata.find((l) => l.id === listId);
		const confirmed = await DialogService.confirm(`Delete "${listMeta?.name || 'this list'}"? This cannot be undone.`, "Delete");
		if (!confirmed) return;

		try {
			await DBManager.deleteList(listId);
			this.#listMetadata = this.#listMetadata.filter((l) => l.id !== listId);
			if (this.#currentListId === listId) {
				const defaultList = this.#listMetadata.find((l) => l.isDefault);
				this.#currentListId = defaultList?.id || this.#listMetadata[0]?.id;
				await this.#loadCurrentList();
			}
			this.#offset = 0;
			this.#render();
		} catch (error) {
			console.error('[TodoListWidget] Error deleting list:', error);
		}
	}

	async #editListName() {
		const list = this.#getCurrentList();
		if (!list) return;

		const newName = await DialogService.prompt("Rename list:", list.name);
		if (newName && newName.trim() && newName.trim() !== list.name) {
			list.name = newName.trim();
			try {
				await DBManager.saveList(list);
				const metaIndex = this.#listMetadata.findIndex(m => m.id === list.id);
				if (metaIndex >= 0) {
					this.#listMetadata[metaIndex].name = list.name;
				}
				this.#render();
			} catch (error) {
				console.error('[TodoListWidget] Error saving after name edit:', error);
			}
		}
	}

	async #editListNameById(listId, newName) {
		const trimmedName = newName.trim();
		if (!trimmedName) return;

		if (this.#currentList && this.#currentList.id === listId) {
			if (trimmedName === this.#currentList.name) return;
			this.#currentList.name = trimmedName;
			try {
				await DBManager.saveList(this.#currentList);
			} catch (error) {
				console.error('[TodoListWidget] Error saving after name edit:', error);
				return;
			}
		} else {
			try {
				const list = await DBManager.getList(listId);
				if (!list || trimmedName === list.name) return;
				list.name = trimmedName;
				await DBManager.saveList(list);
			} catch (error) {
				console.error('[TodoListWidget] Error saving after name edit:', error);
				return;
			}
		}

		const metaIndex = this.#listMetadata.findIndex(m => m.id === listId);
		if (metaIndex >= 0) {
			this.#listMetadata[metaIndex].name = trimmedName;
		}
		this.#render();
	}

	async #moveList(listId, direction) {
		const listIndex = this.#listMetadata.findIndex((l) => l.id === listId);
		if (listIndex === -1) return;

		const newIndex = listIndex + direction;
		if (newIndex < 0 || newIndex >= this.#listMetadata.length) return;

		const listA = this.#listMetadata[listIndex];
		const listB = this.#listMetadata[newIndex];

		const tempOrder = listA.order;
		listA.order = listB.order;
		listB.order = tempOrder;
		this.#listMetadata.sort((a, b) => a.order - b.order);

		try {
			await DBManager.updateListOrder(listA.id, listA.order);
			await DBManager.updateListOrder(listB.id, listB.order);
			this.#render();
		} catch (error) {
			console.error('[TodoListWidget] Error saving after list move:', error);
		}
	}

	async #shareList() {
		const list = this.#getCurrentList();
		if (!list) return;

		const dialog = document.createElement('dialog');
		dialog.className = 'dialog share-dialog';
		dialog.innerHTML = `
			<div class="dialog-content share-dialog-content">
				<h3>Share List</h3>
				<p class="share-title">"${this.#escapeHtml(list.name || 'Untitled List')}"</p>
				<div class="share-options">
					<button class="share-option-btn share-option-link" type="button">
						<span class="share-option-icon">&#128279;</span>
						<span class="share-option-label">Temporary Public Link</span>
						<span class="share-option-desc">Create a shareable link that expires in 24 hours</span>
					</button>
					<button class="share-option-btn share-option-json" type="button">
						<span class="share-option-icon">&#128190;</span>
						<span class="share-option-label">Download Pockist Format</span>
						<span class="share-option-desc">Export as JSON for backup or re-import</span>
					</button>
					<button class="share-option-btn share-option-md" type="button">
						<span class="share-option-icon">&#128196;</span>
						<span class="share-option-label">Download Markdown</span>
						<span class="share-option-desc">Export as a Markdown checklist file</span>
					</button>
				</div>
				<div class="share-actions">
					<button class="share-cancel-btn" type="button">Cancel</button>
				</div>
			</div>
		`;

		document.body.appendChild(dialog);
		dialog.showModal();

		const linkBtn = dialog.querySelector('.share-option-link');
		const jsonBtn = dialog.querySelector('.share-option-json');
		const mdBtn = dialog.querySelector('.share-option-md');
		const cancelBtn = dialog.querySelector('.share-cancel-btn');

		const cleanup = () => {
			dialog.close();
			document.body.removeChild(dialog);
		};

		linkBtn.addEventListener('click', async () => {
			cleanup();
			await this.#createShareLink(list);
		});

		jsonBtn.addEventListener('click', async () => {
			cleanup();
			try {
				await ImportExportService.exportList(list);
			} catch (error) {
				console.error('[TodoListWidget] Export failed:', error);
				alert(`Failed to export list: ${error.message}`);
			}
		});

		mdBtn.addEventListener('click', async () => {
			cleanup();
			try {
				await ImportExportService.exportMarkdown(list, 'list');
			} catch (error) {
				console.error('[TodoListWidget] Markdown export failed:', error);
				alert(`Failed to export markdown: ${error.message}`);
			}
		});

		cancelBtn.addEventListener('click', cleanup);
		dialog.addEventListener('click', (e) => {
			if (e.target === dialog) cleanup();
		});
	}

	async #createShareLink(list) {
		try {
			const shareData = { notes: [], lists: [list] };
			const result = await ShareService.createShare('list', shareData, list.name || 'Untitled List');
			const fullUrl = `${window.location.origin}${result.url}`;

			const dialog = document.createElement('dialog');
			dialog.className = 'dialog share-dialog';
			dialog.innerHTML = `
				<div class="dialog-content share-dialog-content">
					<h3>List Shared!</h3>
					<p class="share-title">"${this.#escapeHtml(list.name || 'Untitled List')}"</p>
					<div class="share-result-card">
						<span class="share-option-icon">&#128279;</span>
						<span class="share-option-label">Temporary Public Link</span>
						<span class="share-result-url">${fullUrl}</span>
						<span class="share-result-meta">Link expires in ${result.expiresIn}</span>
					</div>
					<div class="dialog-footer">
						<button class="dialog-btn dialog-btn--secondary share-close-btn" type="button">Close</button>
						<button class="dialog-btn dialog-btn--primary share-copy-btn" type="button">Copy Link</button>
					</div>
				</div>
			`;

			document.body.appendChild(dialog);
			dialog.showModal();

			const copyBtn = dialog.querySelector('.share-copy-btn');
			const urlSpan = dialog.querySelector('.share-result-url');
			copyBtn.addEventListener('click', () => {
				const url = urlSpan.textContent;
				navigator.clipboard.writeText(url).then(() => {
					copyBtn.textContent = 'Copied!';
					setTimeout(() => copyBtn.textContent = 'Copy Link', 2000);
				}).catch((err) => {
					console.error('Failed to copy:', err);
				});
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
			console.error('[TodoListWidget] Share failed:', error);
			alert(`Failed to share list: ${error.message}`);
		}
	}

	#showListSelectorDialog() {
		const sortedMetadata = [...this.#listMetadata];

		const dialog = document.createElement('dialog');
		dialog.className = 'dialog';

		const listItemsHtml = sortedMetadata.map((meta, index) => {
			const isFirst = index === 0;
			const isLast = index === sortedMetadata.length - 1;
			const isSelected = meta.id === this.#currentListId;
			const isDefault = meta.isDefault;

			return `
				<div class="list-selector-item ${isSelected ? 'selected' : ''}" data-list-id="${meta.id}">
					<div class="list-selector-item-info">
						<span class="list-selector-item-name" contenteditable="false" data-list-id="${meta.id}">${this.#escapeHtml(meta.name)}</span>
						${isDefault ? '<span class="list-selector-item-badge">default</span>' : ''}
					</div>
					<div class="list-selector-item-actions">
						<button class="list-selector-move-up ${isFirst ? 'disabled' : ''}" data-list-id="${meta.id}" ${isFirst ? 'disabled' : ''} title="Move up">▲</button>
						<button class="list-selector-move-down ${isLast ? 'disabled' : ''}" data-list-id="${meta.id}" ${isLast ? 'disabled' : ''} title="Move down">▼</button>
						${!isDefault ? `<button class="list-selector-set-default" data-list-id="${meta.id}" title="Set as default">★</button>` : ''}
						<button class="list-selector-delete" data-list-id="${meta.id}" title="Delete list">×</button>
					</div>
				</div>
			`;
		}).join('');

		dialog.innerHTML = `
			<div class="dialog-content">
				<h3>Select List</h3>
				<div class="list-selector-list">
					${listItemsHtml}
				</div>
				<div class="dialog-footer">
					<button class="list-selector-create-btn button" type="button">+ New List</button>
				</div>
			</div>
		`;

		document.body.appendChild(dialog);
		dialog.showModal();

		dialog.querySelectorAll('.list-selector-item').forEach(item => {
			item.addEventListener('click', async (e) => {
				if (e.target.closest('.list-selector-item-actions')) return;
				if (e.target.classList.contains('list-selector-item-name')) return;

				const listId = item.dataset.listId;
				this.#currentListId = listId;
				dialog.close();
				document.body.removeChild(dialog);
				this.#offset = 0;
				await this.#loadCurrentList();
				this.#render();
			});
		});

		dialog.querySelectorAll('.list-selector-item-name').forEach(nameEl => {
			const listId = nameEl.dataset.listId;
			let originalName = '';

			nameEl.addEventListener('click', (e) => {
				e.stopPropagation();
				originalName = nameEl.textContent;
				nameEl.contentEditable = 'true';
				nameEl.focus();
				const range = document.createRange();
				range.selectNodeContents(nameEl);
				const selection = window.getSelection();
				selection.removeAllRanges();
				selection.addRange(range);
			});

			nameEl.addEventListener('blur', async () => {
				nameEl.contentEditable = 'false';
				const newName = nameEl.textContent.trim();
				if (newName && newName !== originalName) {
					await this.#editListNameById(listId, newName);
				} else {
					nameEl.textContent = originalName;
				}
			});

			nameEl.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					nameEl.blur();
				} else if (e.key === 'Escape') {
					e.preventDefault();
					nameEl.textContent = originalName;
					nameEl.blur();
				}
			});
		});

		dialog.querySelectorAll('.list-selector-move-up:not(.disabled)').forEach(btn => {
			btn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const listId = btn.dataset.listId;
				await this.#moveList(listId, -1);
				dialog.close();
				document.body.removeChild(dialog);
				this.#showListSelectorDialog();
			});
		});

		dialog.querySelectorAll('.list-selector-move-down:not(.disabled)').forEach(btn => {
			btn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const listId = btn.dataset.listId;
				await this.#moveList(listId, 1);
				dialog.close();
				document.body.removeChild(dialog);
				this.#showListSelectorDialog();
			});
		});

		dialog.querySelectorAll('.list-selector-set-default').forEach(btn => {
			btn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const listId = btn.dataset.listId;
				await this.#setDefaultList(listId);
				this.#currentListId = listId;
				dialog.close();
				document.body.removeChild(dialog);
				this.#offset = 0;
				await this.#loadCurrentList();
				this.#render();
			});
		});

		dialog.querySelectorAll('.list-selector-delete').forEach(btn => {
			btn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const listId = btn.dataset.listId;
				await this.#deleteList(listId);
				dialog.close();
				document.body.removeChild(dialog);
				if (this.#listMetadata.length > 0) {
					this.#showListSelectorDialog();
				}
			});
		});

		const createBtn = dialog.querySelector('.list-selector-create-btn');
		createBtn.addEventListener('click', async () => {
			dialog.close();
			document.body.removeChild(dialog);
			await this.#handleCreateList();
			if (this.#listMetadata.length > 0) {
				this.#showListSelectorDialog();
			}
		});

		dialog.addEventListener('click', (e) => {
			if (e.target === dialog) {
				dialog.close();
				document.body.removeChild(dialog);
			}
		});
	}

	// ============================================================================
	// PAGINATION HELPERS
	// ============================================================================

	#clampOffset() {
		const total = this.#getCurrentList()?.todos.length || 0;
		if (total <= 7) {
			this.#offset = 0;
		} else {
			this.#offset = Math.min(this.#offset, total - 7);
		}
	}

	#computeOffsetForIndex(index) {
		const total = this.#getCurrentList()?.todos.length || 0;
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
				this.#offset += 1;
				this.#clampOffset();
			}
			this.#renderSlots();
		});

		return div;
	}

	// ============================================================================
	// END PAGINATION HELPERS
	// ============================================================================

	/**
	 * Create a DOM element for a single todo
	 */
	#createTodoElement(todo, index, total) {
		const li = document.createElement('li');
		li.className = `todo-item ${todo.completed ? "completed" : ""}`;
		li.dataset.todoId = todo.id;

		const isAtTop = index === 0;
		const isAtBottom = index === total - 1;

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
				this.#moveTodo(todo.id, -1);
			});
		}

		if (!isAtBottom) {
			moveDownBtn.addEventListener("click", () => {
				this.#moveTodo(todo.id, 1);
			});
		}

		return li;
	}

	#updateFooter() {
		const list = this.#getCurrentList();

		const hasCompleted = list?.todos.some((t) => t.completed);
		if (this.#clearCompletedBtn) {
			this.#clearCompletedBtn.classList.toggle('hidden', !hasCompleted);
		}

		if (this.#sortTodosBtn) {
			this.#sortTodosBtn.classList.toggle('hidden', !(list?.todos.length > 0));
		}
	}

	#getOrderedTodos() {
		const list = this.#getCurrentList();
		if (!list) return [];
		return [...list.todos];
	}

	#render() {
		if (!this.#containerEl) return;

		const currentList = this.#getCurrentList();
		const currentMeta = this.#getCurrentListMeta();

		if (this.#listSelectorBtn) {
			const nameSpan = this.#listSelectorBtn.querySelector('.list-selector-name');
			if (nameSpan) {
				nameSpan.textContent = currentMeta?.name || 'Select List';
			}
		}

		if (this.#listActionsEl) {
			this.#listActionsEl.innerHTML = `
				<button class="button-link share-list-btn" title="Share list">Share</button>
			`;

			const shareBtn = this.#listActionsEl.querySelector('.share-list-btn');
			if (shareBtn) {
				shareBtn.addEventListener('click', () => this.#shareList());
			}
		}

		this.#renderSlots();
	}

	#renderSlots() {
		const list = this.#getCurrentList();

		if (!this.#slotsContainerEl) return;
		this.#slotsContainerEl.innerHTML = '';

		if (!list || list.todos.length === 0) {
			this.#slotsContainerEl.innerHTML = '<div class="todo-empty">No todos yet. Add one above!</div>';
			this.#updateFooter();
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
			this.#slotsContainerEl.appendChild(this.#createNavElement(-1));
		}

		items.forEach((todo, idx) => {
			const globalIndex = startIndex + idx;
			const li = this.#createTodoElement(todo, globalIndex, total);
			this.#slotsContainerEl.appendChild(li);
		});

		if (showDown) {
			this.#slotsContainerEl.appendChild(this.#createNavElement(1));
		}

		this.#updateFooter();
	}

	#escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}
}

customElements.define("todo-list-widget", TodoListWidget);
