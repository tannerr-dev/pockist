import { Router } from "../services/Router.js";
import { DBManager } from "../services/DBManager.js";
import { DialogService } from "../services/DialogService.js";
import { ShareService } from "../services/ShareService.js";
import { ImportExportService } from "../services/ImportExportService.js";
import { ListItem } from "./ListItem.js";

/**
 * ListBase - Abstract base class for list components.
 *
 * Encapsulates all shared state, CRUD operations, list management,
 * sharing, and dialog logic. Subclasses provide rendering via hooks.
 */
export class ListBase extends HTMLElement {
	// -------------------------------------------------------------------------
	// Shared state
	// -------------------------------------------------------------------------
	_listMetadata = [];
	_currentList = null;
	_currentListId = null;
	_initialized = false;

	// -------------------------------------------------------------------------
	// DOM refs (populated from template by subclass or here)
	// -------------------------------------------------------------------------
	_containerEl = null;
	_listSelectorBtn = null;
	_listsContainerEl = null;
	_inputEl = null;
	_addBtn = null;
	_clearCompletedBtn = null;
	_sortTodosBtn = null;
	_listActionsEl = null;

	// -------------------------------------------------------------------------
	// Abstract: template ID
	// -------------------------------------------------------------------------
	_getTemplateId() {
		throw new Error("_getTemplateId() must be implemented by subclass");
	}

	// -------------------------------------------------------------------------
	// Abstract: set up add-todo event listeners (click/keydown vs form submit)
	// -------------------------------------------------------------------------
	_setupAddListeners() {
		throw new Error("_setupAddListeners() must be implemented by subclass");
	}

	// -------------------------------------------------------------------------
	// Hooks: called after successful mutations so subclass can update DOM
	// -------------------------------------------------------------------------
	_onAfterAdd(todo, list) { /* subclass */ }
	_onAfterToggle(todoId, newState, li) { /* subclass */ }
	_onAfterEdit(todoId) { /* subclass */ }
	_onAfterDelete(todoId) { /* subclass */ }
	_onAfterMove(todoId, direction, oldIndex, newIndex) { /* subclass */ }
	_onAfterClear(completedIds) { /* subclass */ }
	_onAfterSort() { /* subclass */ }

	// -------------------------------------------------------------------------
	// Abstract: render the list content area (scroll UL vs paginated slots)
	// -------------------------------------------------------------------------
	_renderContent() {
		throw new Error("_renderContent() must be implemented by subclass");
	}

	// -------------------------------------------------------------------------
	// Lifecycle
	// -------------------------------------------------------------------------
	connectedCallback() {
		const template = document.getElementById(this._getTemplateId());
		if (!template) {
			console.error(`[${this.constructor.name}] Template '${this._getTemplateId()}' not found`);
			return;
		}
		const content = template.content.cloneNode(true);
		this.appendChild(content);

		this._containerEl = this.querySelector(".todo-list-container");
		this._listSelectorBtn = this.querySelector("#list-selector-btn");
		this._listsContainerEl = this.querySelector("#lists-container");
		this._inputEl = this.querySelector("#todo-input");
		this._addBtn = this.querySelector("#add-btn");
		this._clearCompletedBtn = this.querySelector("#clear-completed");
		this._sortTodosBtn = this.querySelector("#sort-todos");
		this._listActionsEl = this.querySelector("#list-actions");

		const headingLink = this.querySelector(".todo-heading-link");
		if (headingLink) {
			headingLink.addEventListener("click", (e) => {
				e.preventDefault();
				Router.go("/list");
			});
		}

		// When list-id is locked (detail page), hide the selector row and heading
		if (this.hasAttribute('list-id')) {
			const selectorRow = this.querySelector('.todo-list-selector-row');
			if (selectorRow) selectorRow.style.display = 'none';
		}

		this._init();
	}

	// -------------------------------------------------------------------------
	// Init
	// -------------------------------------------------------------------------
	async _init() {
		if (this._initialized) return;

		// If list-id attribute is set externally, lock to that list
		const attrListId = this.getAttribute('list-id');

		try {
			await DBManager.init();
			await DBManager.migrateFromTodoDB();

			this._listMetadata = await DBManager.getListMetadata();

			if (attrListId) {
				this._currentListId = attrListId;
				const exists = this._listMetadata.some(m => m.id === attrListId);
				if (!exists) {
					this._currentListId = null;
				}
			} else if (this._listMetadata.length === 0) {
				const newList = await DBManager.createList({
					name: "My Todos",
					isDefault: true
				});
				this._listMetadata = await DBManager.getListMetadata();
				this._currentListId = newList.id;
			} else if (!this._currentListId) {
				const defaultList = this._listMetadata.find((l) => l.isDefault);
				this._currentListId = defaultList?.id || this._listMetadata[0]?.id;
			}

			await this._loadCurrentList();

			this._initialized = true;
			this._render();
		} catch (error) {
			console.error(`[${this.constructor.name}] Error in _init():`, error);
			if (this._containerEl) {
				this._containerEl.innerHTML = `
					<div style="padding: 20px; color: red; border: 1px solid red; margin: 10px;">
						<strong>Error loading lists:</strong><br>
						${error.message}
					</div>
				`;
			}
			throw error;
		}

		this._setupAddListeners();

		this._clearCompletedBtn?.addEventListener("click", () => this._clearCompleted());
		this._sortTodosBtn?.addEventListener("click", () => this._sortTodos());
		this._listSelectorBtn?.addEventListener("click", () => this._showListSelectorDialog());

		this._listsContainerEl?.addEventListener("list-toggle", (e) => {
			this._toggleTodo(e.detail.itemId, e.detail.completed);
		});
		this._listsContainerEl?.addEventListener("list-edit", (e) => {
			this._editTodo(e.detail.itemId, e.detail.text);
		});
		this._listsContainerEl?.addEventListener("list-delete", (e) => {
			this._deleteTodo(e.detail.itemId);
		});
		this._listsContainerEl?.addEventListener("list-move-up", (e) => {
			this._moveTodo(e.detail.itemId, -1);
		});
		this._listsContainerEl?.addEventListener("list-move-down", (e) => {
			this._moveTodo(e.detail.itemId, 1);
		});
	}

	// -------------------------------------------------------------------------
	// Data loading
	// -------------------------------------------------------------------------
	async _loadCurrentList() {
		if (!this._currentListId) return;
		try {
			this._currentList = await DBManager.getList(this._currentListId);
			if (this._currentList?.todos?.some(t => typeof t.order === 'number')) {
				this._currentList.todos.sort((a, b) => (b.order || 0) - (a.order || 0));
				this._currentList.todos.forEach(t => delete t.order);
				await DBManager.saveList(this._currentList);
			}
			await DBManager.updateLastAccessed(this._currentListId);
			const metaIndex = this._listMetadata.findIndex(m => m.id === this._currentListId);
			if (metaIndex >= 0) {
				this._listMetadata[metaIndex].lastAccessed = Date.now();
			}
		} catch (error) {
			console.error(`[${this.constructor.name}] Error loading current list:`, error);
			this._currentList = null;
		}
	}

	_getCurrentListMeta() {
		return this._listMetadata.find((m) => m.id === this._currentListId);
	}

	_getCurrentList() {
		return this._currentList;
	}

	// -------------------------------------------------------------------------
	// Item CRUD
	// -------------------------------------------------------------------------
	async _handleAdd() {
		const text = this._inputEl?.value.trim();
		if (!text) return;

		const list = this._getCurrentList();
		if (!list) return;

		const todo = {
			id: Date.now().toString(),
			text: text,
			completed: false,
			createdAt: Date.now(),
		};

		list.todos.unshift(todo);
		this._inputEl.value = "";

		try {
			await DBManager.saveList(list);
			const metaIndex = this._listMetadata.findIndex(m => m.id === list.id);
			if (metaIndex >= 0) {
				this._listMetadata[metaIndex].todoCount = list.todos.length;
			}
			this._onAfterAdd(todo, list);
		} catch (error) {
			console.error(`[${this.constructor.name}] Error saving list:`, error);
			list.todos.shift();
			this._renderContent();
		}
	}

	async _toggleTodo(todoId, newCompletedState) {
		const list = this._getCurrentList();
		if (!list) return;

		const todo = list.todos.find((t) => t.id === todoId);
		if (!todo) return;

		if (newCompletedState === undefined) {
			newCompletedState = !todo.completed;
		}
		todo.completed = newCompletedState;

		const item = this._listsContainerEl.querySelector(`list-item[item-id="${todoId}"]`);
		if (item) {
			item.completed = newCompletedState;
		}

		this._updateFooter();

		try {
			await DBManager.saveList(list);
			this._onAfterToggle(todoId, newCompletedState, item);
		} catch (error) {
			console.error(`[${this.constructor.name}] Error saving after toggle:`, error);
			todo.completed = !newCompletedState;
			if (item) {
				item.completed = !newCompletedState;
			}
			this._updateFooter();
		}
	}

	async _editTodo(todoId, newText) {
		const list = this._getCurrentList();
		if (!list) return;

		const todo = list.todos.find((t) => t.id === todoId);
		if (!todo) return;

		const trimmedText = newText.trim();
		if (!trimmedText || trimmedText === todo.text) return;

		const originalText = todo.text;
		todo.text = trimmedText;

		try {
			await DBManager.saveList(list);
			const item = this._listsContainerEl.querySelector(`list-item[item-id="${todoId}"]`);
			if (item) {
				item.text = trimmedText;
			}
			this._onAfterEdit(todoId);
		} catch (error) {
			console.error(`[${this.constructor.name}] Error saving after edit:`, error);
			todo.text = originalText;
			const item = this._listsContainerEl.querySelector(`list-item[item-id="${todoId}"]`);
			if (item) {
				item.text = originalText;
			}
		}
	}

	async _deleteTodo(todoId) {
		const list = this._getCurrentList();
		if (!list) return;

		const todo = list.todos.find((t) => t.id === todoId);
		if (!todo) return;

		const confirmed = await DialogService.confirm(`Delete "${todo.text}"? This cannot be undone.`, "Delete");
		if (!confirmed) return;

		const deletedIndex = list.todos.findIndex((t) => t.id === todoId);
		const deletedTodo = todo;
		list.todos = list.todos.filter((t) => t.id !== todoId);

		try {
			await DBManager.saveList(list);
			const metaIndex = this._listMetadata.findIndex(m => m.id === list.id);
			if (metaIndex >= 0) {
				this._listMetadata[metaIndex].todoCount = list.todos.length;
			}
			this._onAfterDelete(todoId);
		} catch (error) {
			console.error(`[${this.constructor.name}] Error saving after delete:`, error);
			list.todos.splice(deletedIndex, 0, deletedTodo);
			this._renderContent();
		}
	}

	async _moveTodo(todoId, direction) {
		const list = this._getCurrentList();
		if (!list) return;

		const todoIndex = list.todos.findIndex((t) => t.id === todoId);
		if (todoIndex === -1) return;

		const newIndex = todoIndex + direction;
		if (newIndex < 0 || newIndex >= list.todos.length) return;

		const temp = list.todos[todoIndex];
		list.todos[todoIndex] = list.todos[newIndex];
		list.todos[newIndex] = temp;

		try {
			await DBManager.saveList(list);
			this._onAfterMove(todoId, direction, todoIndex, newIndex);
		} catch (error) {
			console.error(`[${this.constructor.name}] Error saving after move:`, error);
			const revertTemp = list.todos[todoIndex];
			list.todos[todoIndex] = list.todos[newIndex];
			list.todos[newIndex] = revertTemp;
			this._renderContent();
		}
	}

	async _clearCompleted() {
		const list = this._getCurrentList();
		if (!list) return;

		const completedTodos = list.todos.filter((t) => t.completed);
		if (completedTodos.length === 0) return;

		const itemText = completedTodos.length === 1 ? 'item' : 'items';
		const confirmed = await DialogService.confirm(
			`Clear ${completedTodos.length} completed ${itemText}? This cannot be undone.`,
			'Clear'
		);
		if (!confirmed) return;

		const completedIds = completedTodos.map(t => t.id);
		list.todos = list.todos.filter((t) => !t.completed);

		try {
			await DBManager.saveList(list);
			const metaIndex = this._listMetadata.findIndex(m => m.id === list.id);
			if (metaIndex >= 0) {
				this._listMetadata[metaIndex].todoCount = list.todos.length;
			}
			this._onAfterClear(completedIds);
		} catch (error) {
			console.error(`[${this.constructor.name}] Error saving after clear:`, error);
			await this._loadCurrentList();
			this._renderContent();
		}
	}

	async _sortTodos() {
		const list = this._getCurrentList();
		if (!list) return;

		list.todos.sort((a, b) => {
			if (a.completed !== b.completed) {
				return a.completed ? 1 : -1;
			}
			return 0;
		});

		try {
			await DBManager.saveList(list);
			this._onAfterSort();
		} catch (error) {
			console.error(`[${this.constructor.name}] Error saving after sort:`, error);
			await this._loadCurrentList();
			this._renderContent();
		}
	}

	// -------------------------------------------------------------------------
	// List management
	// -------------------------------------------------------------------------
	async _handleCreateList() {
		const name = await DialogService.prompt("Enter a name for the new list:");
		if (!name || !name.trim()) return;

		try {
			const newList = await DBManager.createList({
				name: name.trim(),
				isDefault: false
			});
			this._listMetadata = await DBManager.getListMetadata();
			this._currentListId = newList.id;
			this._currentList = newList;
			this._render();
		} catch (error) {
			console.error(`[${this.constructor.name}] Error creating new list:`, error);
		}
	}

	async _setDefaultList(listId) {
		try {
			await DBManager.setDefaultList(listId);
			this._listMetadata = await DBManager.getListMetadata();
			if (this._currentList) {
				this._currentList.isDefault = (this._currentList.id === listId);
			}
			this._render();
		} catch (error) {
			console.error(`[${this.constructor.name}] Error setting default list:`, error);
		}
	}

	async _deleteList(listId) {
		if (this._listMetadata.length <= 1) {
			alert("Cannot delete the last list");
			return;
		}

		const listMeta = this._listMetadata.find((l) => l.id === listId);
		const confirmed = await DialogService.confirm(`Delete "${listMeta?.name || 'this list'}"? This cannot be undone.`, "Delete");
		if (!confirmed) return;

		try {
			await DBManager.deleteList(listId);
			this._listMetadata = this._listMetadata.filter((l) => l.id !== listId);
			if (this._currentListId === listId) {
				const defaultList = this._listMetadata.find((l) => l.isDefault);
				this._currentListId = defaultList?.id || this._listMetadata[0]?.id;
				await this._loadCurrentList();
			}
			this._render();
		} catch (error) {
			console.error(`[${this.constructor.name}] Error deleting list:`, error);
		}
	}

	async _editListName() {
		const list = this._getCurrentList();
		if (!list) return;

		const newName = await DialogService.prompt("Rename list:", list.name);
		if (newName && newName.trim() && newName.trim() !== list.name) {
			list.name = newName.trim();
			try {
				await DBManager.saveList(list);
				const metaIndex = this._listMetadata.findIndex(m => m.id === list.id);
				if (metaIndex >= 0) {
					this._listMetadata[metaIndex].name = list.name;
				}
				this._render();
			} catch (error) {
				console.error(`[${this.constructor.name}] Error saving after name edit:`, error);
			}
		}
	}

	async _editListNameById(listId, newName) {
		const trimmedName = newName.trim();
		if (!trimmedName) return;

		if (this._currentList && this._currentList.id === listId) {
			if (trimmedName === this._currentList.name) return;
			this._currentList.name = trimmedName;
			try {
				await DBManager.saveList(this._currentList);
			} catch (error) {
				console.error(`[${this.constructor.name}] Error saving after name edit:`, error);
				return;
			}
		} else {
			try {
				const list = await DBManager.getList(listId);
				if (!list || trimmedName === list.name) return;
				list.name = trimmedName;
				await DBManager.saveList(list);
			} catch (error) {
				console.error(`[${this.constructor.name}] Error saving after name edit:`, error);
				return;
			}
		}

		const metaIndex = this._listMetadata.findIndex(m => m.id === listId);
		if (metaIndex >= 0) {
			this._listMetadata[metaIndex].name = trimmedName;
		}
		this._render();
	}

	async _moveList(listId, direction) {
		const listIndex = this._listMetadata.findIndex((l) => l.id === listId);
		if (listIndex === -1) return;

		const newIndex = listIndex + direction;
		if (newIndex < 0 || newIndex >= this._listMetadata.length) return;

		const listA = this._listMetadata[listIndex];
		const listB = this._listMetadata[newIndex];

		const tempOrder = listA.order;
		listA.order = listB.order;
		listB.order = tempOrder;
		this._listMetadata.sort((a, b) => a.order - b.order);

		try {
			await DBManager.updateListOrder(listA.id, listA.order);
			await DBManager.updateListOrder(listB.id, listB.order);
			this._render();
		} catch (error) {
			console.error(`[${this.constructor.name}] Error saving after list move:`, error);
		}
	}

	// -------------------------------------------------------------------------
	// Share
	// -------------------------------------------------------------------------
	async _shareList() {
		const list = this._getCurrentList();
		if (!list) return;

		const dialog = document.createElement('dialog');
		dialog.className = 'dialog share-dialog';
		dialog.innerHTML = `
			<div class="dialog-content share-dialog-content">
				<h3>Share List</h3>
				<p class="share-title">"${this._escapeHtml(list.name || 'Untitled List')}"</p>
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
			await this._createShareLink(list);
		});

		jsonBtn.addEventListener('click', async () => {
			cleanup();
			try {
				await ImportExportService.exportList(list);
			} catch (error) {
				console.error(`[${this.constructor.name}] Export failed:`, error);
				alert(`Failed to export list: ${error.message}`);
			}
		});

		mdBtn.addEventListener('click', async () => {
			cleanup();
			try {
				await ImportExportService.exportMarkdown(list, 'list');
			} catch (error) {
				console.error(`[${this.constructor.name}] Markdown export failed:`, error);
				alert(`Failed to export markdown: ${error.message}`);
			}
		});

		cancelBtn.addEventListener('click', cleanup);
		dialog.addEventListener('click', (e) => {
			if (e.target === dialog) cleanup();
		});
	}

	async _createShareLink(list) {
		try {
			const shareData = { notes: [], lists: [list] };
			const result = await ShareService.createShare('list', shareData, list.name || 'Untitled List');
			const fullUrl = `${window.location.origin}${result.url}`;

			const dialog = document.createElement('dialog');
			dialog.className = 'dialog share-dialog';
			dialog.innerHTML = `
				<div class="dialog-content share-dialog-content">
					<h3>List Shared!</h3>
					<p class="share-title">"${this._escapeHtml(list.name || 'Untitled List')}"</p>
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
			console.error(`[${this.constructor.name}] Share failed:`, error);
			alert(`Failed to share list: ${error.message}`);
		}
	}

	// -------------------------------------------------------------------------
	// List selector dialog
	// -------------------------------------------------------------------------
	_showListSelectorDialog() {
		const sortedMetadata = [...this._listMetadata];

		const dialog = document.createElement('dialog');
		dialog.className = 'dialog';

		const listItemsHtml = sortedMetadata.map((meta, index) => {
			const isFirst = index === 0;
			const isLast = index === sortedMetadata.length - 1;
			const isSelected = meta.id === this._currentListId;
			const isDefault = meta.isDefault;

			return `
				<div class="list-selector-item ${isSelected ? 'selected' : ''}" data-list-id="${meta.id}">
					<div class="list-selector-item-info">
						<span class="list-selector-item-name" contenteditable="false" data-list-id="${meta.id}">${this._escapeHtml(meta.name)}</span>
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
				this._currentListId = listId;
				dialog.close();
				document.body.removeChild(dialog);
				await this._loadCurrentList();
				this._render();
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
					await this._editListNameById(listId, newName);
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
				await this._moveList(listId, -1);
				dialog.close();
				document.body.removeChild(dialog);
				this._showListSelectorDialog();
			});
		});

		dialog.querySelectorAll('.list-selector-move-down:not(.disabled)').forEach(btn => {
			btn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const listId = btn.dataset.listId;
				await this._moveList(listId, 1);
				dialog.close();
				document.body.removeChild(dialog);
				this._showListSelectorDialog();
			});
		});

		dialog.querySelectorAll('.list-selector-set-default').forEach(btn => {
			btn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const listId = btn.dataset.listId;
				await this._setDefaultList(listId);
				this._currentListId = listId;
				dialog.close();
				document.body.removeChild(dialog);
				await this._loadCurrentList();
				this._render();
			});
		});

		dialog.querySelectorAll('.list-selector-delete').forEach(btn => {
			btn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const listId = btn.dataset.listId;
				await this._deleteList(listId);
				dialog.close();
				document.body.removeChild(dialog);
				if (this._listMetadata.length > 0) {
					this._showListSelectorDialog();
				}
			});
		});

		const createBtn = dialog.querySelector('.list-selector-create-btn');
		createBtn.addEventListener('click', async () => {
			dialog.close();
			document.body.removeChild(dialog);
			await this._handleCreateList();
			if (this._listMetadata.length > 0) {
				this._showListSelectorDialog();
			}
		});

		dialog.addEventListener('click', (e) => {
			if (e.target === dialog) {
				dialog.close();
				document.body.removeChild(dialog);
			}
		});
	}

	// -------------------------------------------------------------------------
	// Render helpers
	// -------------------------------------------------------------------------
	_render() {
		if (!this._containerEl) return;

		const currentMeta = this._getCurrentListMeta();

		if (this._listSelectorBtn) {
			const nameSpan = this._listSelectorBtn.querySelector('.list-selector-name');
			if (nameSpan) {
				nameSpan.textContent = currentMeta?.name || 'Select List';
			}
		}

		if (this._listActionsEl) {
			this._listActionsEl.innerHTML = `
				<button class="button-link share-list-btn" title="Share list">Share</button>
			`;

			const shareBtn = this._listActionsEl.querySelector('.share-list-btn');
			if (shareBtn) {
				shareBtn.addEventListener('click', () => this._shareList());
			}
		}

		this._renderContent();
	}

	_createTodoElement(todo, index, total) {
		const item = document.createElement('list-item');
		item.itemId = todo.id;
		item.text = todo.text;
		item.completed = todo.completed;
		item.index = index;
		item.total = total;
		item.style.viewTransitionName = `todo-${todo.id}`;
		return item;
	}

	_updateFooter() {
		const list = this._getCurrentList();

		const hasCompleted = list?.todos.some((t) => t.completed);
		if (this._clearCompletedBtn) {
			this._clearCompletedBtn.classList.toggle('hidden', !hasCompleted);
		}

		if (this._sortTodosBtn) {
			this._sortTodosBtn.classList.toggle('hidden', !(list?.todos.length > 0));
		}
	}

	_getOrderedTodos() {
		const list = this._getCurrentList();
		if (!list) return [];
		return [...list.todos];
	}

	_escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}
}
