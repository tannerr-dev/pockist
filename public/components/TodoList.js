import { Router } from "../services/Router.js";
import { DBManager } from "../services/DBManager.js";
import { DialogService } from "../services/DialogService.js";
import { ShareService } from "../services/ShareService.js";
import { ImportExportService } from "../services/ImportExportService.js";
import './ShareButton.js';

export class TodoList extends HTMLElement {
	// State: metadata for all lists (lightweight, no todos)
	#listMetadata = [];
	// State: full current list data (including todos)
	#currentList = null;
	#currentListId = null;
	#initialized = false;

	// DOM element references
	#containerEl = null;
	#listSelectorBtn = null;
	#listsContainerEl = null;
	#inputEl = null;
	#addBtn = null;
	#clearCompletedBtn = null;
	#sortTodosBtn = null;
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
		this.#listSelectorBtn = this.querySelector("#list-selector-btn");
		this.#listsContainerEl = this.querySelector("#lists-container");
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

			// Load metadata for all lists (lightweight, no todos)
			this.#listMetadata = await DBManager.getListMetadata();

			// Ensure at least one list exists
			if (this.#listMetadata.length === 0) {
				const newList = await DBManager.createList({
					name: "My Todos",
					isDefault: true
				});
				this.#listMetadata = await DBManager.getListMetadata();
				this.#currentListId = newList.id;
			} else if (!this.#currentListId) {
				// Set current list to default if not set
				const defaultList = this.#listMetadata.find((l) => l.isDefault);
				this.#currentListId = defaultList?.id || this.#listMetadata[0]?.id;
			}

			// Load the full current list data (with todos)
			await this.#loadCurrentList();

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

		// Event listener for list selector button
		this.#listSelectorBtn?.addEventListener("click", () => this.#showListSelectorDialog());
	}

	// Load the full current list from DB (including todos)
	async #loadCurrentList() {
		if (!this.#currentListId) return;
		
		try {
			this.#currentList = await DBManager.getList(this.#currentListId);
			
			// Migrate old data: if todos have order fields, sort by them and strip them
			// Array index is now the source of truth for display order (index 0 = top)
			if (this.#currentList?.todos?.some(t => typeof t.order === 'number')) {
				this.#currentList.todos.sort((a, b) => (b.order || 0) - (a.order || 0));
				this.#currentList.todos.forEach(t => delete t.order);
				await DBManager.saveList(this.#currentList);
			}
			
			// Update last accessed timestamp
			await DBManager.updateLastAccessed(this.#currentListId);
			
			// Update metadata in memory too
			const metaIndex = this.#listMetadata.findIndex(m => m.id === this.#currentListId);
			if (metaIndex >= 0) {
				this.#listMetadata[metaIndex].lastAccessed = Date.now();
			}
		} catch (error) {
			console.error('[TodoList] Error loading current list:', error);
			this.#currentList = null;
		}
	}

	// Get the current list metadata (lightweight info)
	#getCurrentListMeta() {
		return this.#listMetadata.find((m) => m.id === this.#currentListId);
	}

	// Get the full current list (with todos) - from cached state
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

		// Add to state at the top (index 0 = top of list)
		list.todos.unshift(todo);
		this.#inputEl.value = "";

		// Surgical DOM update: insert new todo at top with animation
		let ul = this.#listsContainerEl.querySelector('.todo-list-ul');
		
		// If list was empty, remove empty message and create UL
		if (!ul) {
			this.#listsContainerEl.innerHTML = '';
			ul = document.createElement('ul');
			ul.className = 'todo-list-ul';
			this.#listsContainerEl.appendChild(ul);
		}

		// Create new element and insert at top
		const li = this.#createTodoElement(todo, 0, list.todos.length);
		li.style.opacity = '0';
		li.style.transform = 'translateY(-10px)';
		ul.insertBefore(li, ul.firstChild);

		// Animate in
		requestAnimationFrame(() => {
			li.style.transition = 'opacity 0.2s, transform 0.2s';
			li.style.opacity = '1';
			li.style.transform = 'translateY(0)';
		});

		// Update move buttons (old top item now has up button enabled)
		this.#updateMoveButtons();
		this.#updateFooter();

		// Save to DB in background
		try {
			await DBManager.saveList(list);
			// Update metadata
			const metaIndex = this.#listMetadata.findIndex(m => m.id === list.id);
			if (metaIndex >= 0) {
				this.#listMetadata[metaIndex].todoCount = list.todos.length;
			}
		} catch (error) {
			console.error('[TodoList] Error saving list:', error);
			// On error, revert: remove the added todo
			li.remove();
			list.todos.pop();
			this.#updateFooter();
			// TODO: Show error notification
		}
	}

	async #toggleTodo(todoId) {
		const list = this.#getCurrentList();
		if (!list) return;

		const todo = list.todos.find((t) => t.id === todoId);
		if (!todo) return;

		// Toggle in state
		const newCompletedState = !todo.completed;
		todo.completed = newCompletedState;

		// Surgical DOM update: toggle class only
		const li = this.#listsContainerEl.querySelector(`[data-todo-id="${todoId}"]`);
		if (li) {
			li.classList.toggle('completed', newCompletedState);
		}

		// Update footer stats immediately
		this.#updateFooter();

		// Save to DB in background
		try {
			await DBManager.saveList(list);
		} catch (error) {
			console.error('[TodoList] Error saving after toggle:', error);
			// Revert on error
			todo.completed = !newCompletedState;
			if (li) {
				li.classList.toggle('completed', !newCompletedState);
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

		// Store original text for potential revert
		const originalText = todo.text;

		// Update state
		todo.text = trimmedText;

		// DOM is already updated by contenteditable, just save to DB
		try {
			await DBManager.saveList(list);
		} catch (error) {
			console.error('[TodoList] Error saving after edit:', error);
			// Revert on error
			todo.text = originalText;
			// Update DOM to show original text
			const li = this.#listsContainerEl.querySelector(`[data-todo-id="${todoId}"]`);
			if (li) {
				const textSpan = li.querySelector('.todo-text');
				if (textSpan) {
					textSpan.textContent = originalText;
				}
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

		// Find DOM element
		const li = this.#listsContainerEl.querySelector(`[data-todo-id="${todoId}"]`);

		// Remove from state
		const deletedTodo = todo;
		const deletedIndex = list.todos.findIndex((t) => t.id === todoId);
		list.todos = list.todos.filter((t) => t.id !== todoId);

		// Surgical DOM update: animate out then remove
		if (li) {
			li.style.transition = 'opacity 0.2s, transform 0.2s';
			li.style.opacity = '0';
			li.style.transform = 'translateX(20px)';

			setTimeout(() => {
				li.remove();
				// If list is now empty, show empty message
				if (list.todos.length === 0) {
					this.#listsContainerEl.innerHTML = '<li class="todo-empty">No todos yet. Add one above!</li>';
				}
			}, 200);
		}

		// Update move buttons and footer
		this.#updateMoveButtons();
		this.#updateFooter();

		// Save to DB in background
		try {
			await DBManager.saveList(list);
			// Update metadata
			const metaIndex = this.#listMetadata.findIndex(m => m.id === list.id);
			if (metaIndex >= 0) {
				this.#listMetadata[metaIndex].todoCount = list.todos.length;
			}
		} catch (error) {
			console.error('[TodoList] Error saving after delete:', error);
			// Revert on error: restore todo and re-render
			list.todos.splice(deletedIndex, 0, deletedTodo);
			// Full re-render to restore state
			this.#renderTodoList();
		}
	}

	async #moveTodo(todoId, direction) {
		const list = this.#getCurrentList();
		if (!list) return;

		const todoIndex = list.todos.findIndex((t) => t.id === todoId);
		if (todoIndex === -1) return;

		const newIndex = todoIndex + direction;
		if (newIndex < 0 || newIndex >= list.todos.length) return;

		// Find DOM elements
		const items = Array.from(this.#listsContainerEl.querySelectorAll('.todo-item'));
		const currentLi = items.find(li => li.dataset.todoId === todoId);
		if (!currentLi) return;

		const targetLi = direction === -1 
			? currentLi.previousElementSibling 
			: currentLi.nextElementSibling;
		if (!targetLi) return;

		// Swap the todos in the array
		const temp = list.todos[todoIndex];
		list.todos[todoIndex] = list.todos[newIndex];
		list.todos[newIndex] = temp;

		// Surgical DOM update: animate and swap positions
		currentLi.style.transition = 'transform 0.2s';
		targetLi.style.transition = 'transform 0.2s';

		// Actually swap in DOM
		if (direction === -1) {
			currentLi.parentNode.insertBefore(currentLi, targetLi);
		} else {
			currentLi.parentNode.insertBefore(targetLi, currentLi);
		}

		// Update move buttons (enabled/disabled states may have changed)
		this.#updateMoveButtons();

		// Save to DB in background
		try {
			await DBManager.saveList(list);
		} catch (error) {
			console.error('[TodoList] Error saving after move:', error);
			// Revert on error: swap back in array
			const revertTemp = list.todos[todoIndex];
			list.todos[todoIndex] = list.todos[newIndex];
			list.todos[newIndex] = revertTemp;

			// Revert DOM
			if (direction === -1) {
				currentLi.parentNode.insertBefore(targetLi, currentLi);
			} else {
				currentLi.parentNode.insertBefore(currentLi, targetLi);
			}
			this.#updateMoveButtons();
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

		// Store completed IDs for DOM removal
		const completedIds = completedTodos.map(t => t.id);

		// Remove from state
		list.todos = list.todos.filter((t) => !t.completed);

		// Surgical DOM update: animate out completed todos
		completedIds.forEach((id, index) => {
			const li = this.#listsContainerEl.querySelector(`[data-todo-id="${id}"]`);
			if (li) {
				li.style.transition = 'opacity 0.2s, transform 0.2s';
				li.style.opacity = '0';
				li.style.transform = 'translateX(20px)';
				
				setTimeout(() => {
					li.remove();
				}, 200 + (index * 50)); // Stagger animations
			}
		});

		// Update footer and buttons
		this.#updateMoveButtons();
		this.#updateFooter();

		// If list is now empty, show empty message after animations
		if (list.todos.length === 0) {
			setTimeout(() => {
				this.#listsContainerEl.innerHTML = '<li class="todo-empty">No todos yet. Add one above!</li>';
			}, 200 + (completedIds.length * 50));
		}

		// Save to DB in background
		try {
			await DBManager.saveList(list);
			// Update metadata
			const metaIndex = this.#listMetadata.findIndex(m => m.id === list.id);
			if (metaIndex >= 0) {
				this.#listMetadata[metaIndex].todoCount = list.todos.length;
			}
		} catch (error) {
			console.error('[TodoList] Error saving after clear:', error);
			// On error, full re-render to restore state
			this.#renderTodoList();
		}
	}

	async #sortTodos() {
		const list = this.#getCurrentList();
		if (!list) return;

		// Sort: active items first, then completed items
		// Within each group, maintain current relative order (stable sort)
		list.todos.sort((a, b) => {
			// Completed items go to the bottom
			if (a.completed !== b.completed) {
				return a.completed ? 1 : -1;
			}
			return 0;
		});

		// Full re-render needed since everything reordered
		// But we can animate the reordering
		const ul = this.#listsContainerEl.querySelector('.todo-list-ul');
		if (ul) {
			ul.style.opacity = '0.5';
			ul.style.transition = 'opacity 0.2s';
		}

		try {
			await DBManager.saveList(list);
			
			// Re-render the todo list (not full render)
			this.#renderTodoList();
		} catch (error) {
			console.error('[TodoList] Error saving after sort:', error);
			// Re-render to restore state
			this.#renderTodoList();
		}
	}

	async #handleCreateList() {
		const name = await DialogService.prompt("Enter a name for the new list:");
		if (!name || !name.trim()) return;

		try {
			// Use DBManager.createList() to properly create with metadata
			const newList = await DBManager.createList({
				name: name.trim(),
				isDefault: false
			});

			// Refresh metadata
			this.#listMetadata = await DBManager.getListMetadata();
			
			// Switch to new list
			this.#currentListId = newList.id;
			this.#currentList = newList;
			
			this.#render();
		} catch (error) {
			console.error('[TodoList] Error creating new list:', error);
		}
	}

	async #setDefaultList(listId) {
		try {
			// Use granular method to set default
			await DBManager.setDefaultList(listId);
			
			// Refresh metadata to reflect changes
			this.#listMetadata = await DBManager.getListMetadata();
			
			// Update current list if needed
			if (this.#currentList) {
				this.#currentList.isDefault = (this.#currentList.id === listId);
			}
			
			this.#render();
		} catch (error) {
			console.error('[TodoList] Error setting default list:', error);
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
			// Use granular delete method
			await DBManager.deleteList(listId);
			
			// Remove from local metadata
			this.#listMetadata = this.#listMetadata.filter((l) => l.id !== listId);

			// If we deleted the current list, switch to default or first
			if (this.#currentListId === listId) {
				const defaultList = this.#listMetadata.find((l) => l.isDefault);
				this.#currentListId = defaultList?.id || this.#listMetadata[0]?.id;
				
				// Load the new current list
				await this.#loadCurrentList();
			}
			
			this.#render();
		} catch (error) {
			console.error('[TodoList] Error deleting list:', error);
		}
	}

	async #editListName() {
		const list = this.#getCurrentList();
		if (!list) return;

		const newName = await DialogService.prompt("Rename list:", list.name);
		if (newName && newName.trim() && newName.trim() !== list.name) {
			list.name = newName.trim();
			try {
				// Save only this list, not all lists
				await DBManager.saveList(list);
				// Update metadata in memory
				const metaIndex = this.#listMetadata.findIndex(m => m.id === list.id);
				if (metaIndex >= 0) {
					this.#listMetadata[metaIndex].name = list.name;
				}
				this.#render();
			} catch (error) {
				console.error('[TodoList] Error saving after name edit:', error);
			}
		}
	}

	async #editListNameById(listId, newName) {
		const trimmedName = newName.trim();
		if (!trimmedName) return;

		// Check if this is the current list
		if (this.#currentList && this.#currentList.id === listId) {
			if (trimmedName === this.#currentList.name) return;
			this.#currentList.name = trimmedName;
			try {
				await DBManager.saveList(this.#currentList);
			} catch (error) {
				console.error('[TodoList] Error saving after name edit:', error);
				return;
			}
		} else {
			// Need to load the list first
			try {
				const list = await DBManager.getList(listId);
				if (!list || trimmedName === list.name) return;
				list.name = trimmedName;
				await DBManager.saveList(list);
			} catch (error) {
				console.error('[TodoList] Error saving after name edit:', error);
				return;
			}
		}

		// Update metadata in memory
		const metaIndex = this.#listMetadata.findIndex(m => m.id === listId);
		if (metaIndex >= 0) {
			this.#listMetadata[metaIndex].name = trimmedName;
		}
		this.#render();
	}

	async #moveList(listId, direction) {
		// Find the list in metadata
		const listIndex = this.#listMetadata.findIndex((l) => l.id === listId);
		if (listIndex === -1) return;

		const newIndex = listIndex + direction;
		if (newIndex < 0 || newIndex >= this.#listMetadata.length) return;

		// Get the two lists involved
		const listA = this.#listMetadata[listIndex];
		const listB = this.#listMetadata[newIndex];

		// Swap order values in metadata
		const tempOrder = listA.order;
		listA.order = listB.order;
		listB.order = tempOrder;

		// Sort metadata by order
		this.#listMetadata.sort((a, b) => a.order - b.order);

		try {
			// Update order in DB for both lists
			await DBManager.updateListOrder(listA.id, listA.order);
			await DBManager.updateListOrder(listB.id, listB.order);
			
			this.#render();
		} catch (error) {
			console.error('[TodoList] Error saving after list move:', error);
		}
	}

	async #shareList() {
		const list = this.#getCurrentList();
		if (!list) return;

		const dialog = document.createElement('dialog');
		dialog.className = 'dialog';
		dialog.innerHTML = `
			<div class="dialog-content">
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
				console.error('[TodoList] Export failed:', error);
				alert(`Failed to export list: ${error.message}`);
			}
		});

		mdBtn.addEventListener('click', async () => {
			cleanup();
			try {
				await ImportExportService.exportMarkdown(list, 'list');
			} catch (error) {
				console.error('[TodoList] Markdown export failed:', error);
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
			const shareData = {
				notes: [],
				lists: [list]
			};

			const result = await ShareService.createShare('list', shareData, list.name || 'Untitled List');
			const fullUrl = `${window.location.origin}${result.url}`;

			const dialog = document.createElement('dialog');
			dialog.className = 'dialog';
			dialog.innerHTML = `
				<div class="dialog-content">
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
			console.error('[TodoList] Share failed:', error);
			alert(`Failed to share list: ${error.message}`);
		}
	}

	#showListSelectorDialog() {
		// Metadata is already sorted by order from getListMetadata()
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

		// Handle list selection (click on item, but not on editable name or action buttons)
		dialog.querySelectorAll('.list-selector-item').forEach(item => {
			item.addEventListener('click', async (e) => {
				// Don't select if clicking on action buttons or the editable name
				if (e.target.closest('.list-selector-item-actions')) return;
				if (e.target.classList.contains('list-selector-item-name')) return;

				const listId = item.dataset.listId;
				this.#currentListId = listId;
				dialog.close();
				document.body.removeChild(dialog);
				
				// Load the selected list (with todos) and track lastAccessed
				await this.#loadCurrentList();
				this.#render();
			});
		});

		// Handle editable list names (rename)
		dialog.querySelectorAll('.list-selector-item-name').forEach(nameEl => {
			const listId = nameEl.dataset.listId;
			let originalName = '';

			// Enable editing on click
			nameEl.addEventListener('click', (e) => {
				e.stopPropagation();
				originalName = nameEl.textContent;
				nameEl.contentEditable = 'true';
				nameEl.focus();
				// Select all text for easy editing
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
					// Restore original name if empty or unchanged
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

		// Handle move up buttons
		dialog.querySelectorAll('.list-selector-move-up:not(.disabled)').forEach(btn => {
			btn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const listId = btn.dataset.listId;
				await this.#moveList(listId, -1);
				// Refresh dialog
				dialog.close();
				document.body.removeChild(dialog);
				this.#showListSelectorDialog();
			});
		});

		// Handle move down buttons
		dialog.querySelectorAll('.list-selector-move-down:not(.disabled)').forEach(btn => {
			btn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const listId = btn.dataset.listId;
				await this.#moveList(listId, 1);
				// Refresh dialog
				dialog.close();
				document.body.removeChild(dialog);
				this.#showListSelectorDialog();
			});
		});

		// Handle set default buttons
		dialog.querySelectorAll('.list-selector-set-default').forEach(btn => {
			btn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const listId = btn.dataset.listId;
				await this.#setDefaultList(listId);
				// Select this list and close dialog
				this.#currentListId = listId;
				dialog.close();
				document.body.removeChild(dialog);
				
				// Load the selected list and track lastAccessed
				await this.#loadCurrentList();
				this.#render();
			});
		});

		// Handle delete buttons
		dialog.querySelectorAll('.list-selector-delete').forEach(btn => {
			btn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const listId = btn.dataset.listId;
				await this.#deleteList(listId);
				// Refresh dialog
				dialog.close();
				document.body.removeChild(dialog);
				if (this.#listMetadata.length > 0) {
					this.#showListSelectorDialog();
				}
			});
		});

		// Handle create new list button
		const createBtn = dialog.querySelector('.list-selector-create-btn');
		createBtn.addEventListener('click', async () => {
			dialog.close();
			document.body.removeChild(dialog);
			await this.#handleCreateList();
			if (this.#listMetadata.length > 0) {
				this.#showListSelectorDialog();
			}
		});

		// Close on backdrop click
		dialog.addEventListener('click', (e) => {
			if (e.target === dialog) {
				dialog.close();
				document.body.removeChild(dialog);
			}
		});
	}

	// ============================================================================
	// SURGICAL DOM UPDATE HELPERS
	// These methods update only what changed, avoiding full re-renders
	// ============================================================================

	/**
	 * Create a DOM element for a single todo
	 * @param {Object} todo - The todo object
	 * @param {number} index - The index in the list (for move button states)
	 * @param {number} total - Total number of todos
	 * @returns {HTMLElement} The list item element
	 */
	#createTodoElement(todo, index, total) {
		const li = document.createElement('li');
		li.className = `todo-item ${todo.completed ? "completed" : ""}`;
		li.dataset.todoId = todo.id;
		li.style.viewTransitionName = `todo-${todo.id}`;

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

		// Attach event listeners
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

	/**
	 * Update footer button visibility
	 */
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

	/**
	 * Update the disabled states of move buttons after reordering
	 */
	#updateMoveButtons() {
		const list = this.#getCurrentList();
		if (!list || !this.#listsContainerEl) return;

		const items = this.#listsContainerEl.querySelectorAll('.todo-item');
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

	/**
	 * Get ordered todos array (sorted by order descending)
	 */
	#getOrderedTodos() {
		const list = this.#getCurrentList();
		if (!list) return [];
		
		// Array index is the source of truth for display order
		return [...list.todos];
	}

	// ============================================================================
	// END OF SURGICAL DOM UPDATE HELPERS
	// ============================================================================

	#render() {
		if (!this.#containerEl) return;

		const currentList = this.#getCurrentList();
		const currentMeta = this.#getCurrentListMeta();

		// Update list selector button
		if (this.#listSelectorBtn) {
			const nameSpan = this.#listSelectorBtn.querySelector('.list-selector-name');
			if (nameSpan) {
				nameSpan.textContent = currentMeta?.name || 'Select List';
			}
		}

		// Update list actions (share only)
		if (this.#listActionsEl) {
			this.#listActionsEl.innerHTML = `
				<button class="button-link share-list-btn" title="Share list">Share</button>
			`;

			const shareBtn = this.#listActionsEl.querySelector('.share-list-btn');
			if (shareBtn) {
				shareBtn.addEventListener('click', () => this.#shareList());
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
			const ul = document.createElement('ul');
			ul.className = 'todo-list-ul';

			list.todos.forEach((todo, index) => {
				const li = this.#createTodoElement(todo, index, list.todos.length);
				ul.appendChild(li);
			});

			this.#listsContainerEl.appendChild(ul);
		}

		// Update footer after rendering
		this.#updateFooter();
	}

	#escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}
}

customElements.define("todo-list", TodoList);
