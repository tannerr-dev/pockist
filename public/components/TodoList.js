import { Router } from "../services/Router.js";
import { DBManager } from "../services/DBManager.js";

export class TodoList extends HTMLElement {
	#lists = [];
	#currentListId = null;
	#mode = "single"; // "single" for home page (one list), "all" for /list page
	#initialized = false;

	// DOM element references
	#containerEl = null;
	#listSelectorEl = null;
	#listsContainerEl = null;
	#inputEl = null;
	#addBtn = null;
	#itemsLeftEl = null;
	#clearCompletedBtn = null;
	#newListInputEl = null;
	#newListBtn = null;

	static get observedAttributes() {
		return ["mode"];
	}

	attributeChangedCallback(name, oldValue, newValue) {
		console.log('[TodoList] attributeChangedCallback:', name, oldValue, '->', newValue);
		if (name === "mode" && oldValue !== newValue) {
			this.#mode = newValue || "single";
			if (this.#containerEl) {
				this.#render();
			}
		}
	}

	connectedCallback() {
		console.log('[TodoList] connectedCallback called');
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
		this.#newListInputEl = this.querySelector("#new-list-input");
		this.#newListBtn = this.querySelector("#new-list-btn");

		console.log('[TodoList] DOM elements cached:', {
			container: !!this.#containerEl,
			listSelector: !!this.#listSelectorEl,
			listsContainer: !!this.#listsContainerEl,
			input: !!this.#inputEl,
			addBtn: !!this.#addBtn,
			itemsLeft: !!this.#itemsLeftEl,
			clearCompleted: !!this.#clearCompletedBtn,
			newListInput: !!this.#newListInputEl,
			newListBtn: !!this.#newListBtn
		});

		this.#mode = this.getAttribute("mode") || "single";
		console.log('[TodoList] Mode set to:', this.#mode);

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
		console.log('[TodoList] #init() starting...');
		
		if (this.#initialized) {
			console.log('[TodoList] Already initialized, skipping');
			return;
		}

		try {
			// First, ensure DBManager is initialized
			console.log('[TodoList] Initializing DBManager...');
			await DBManager.init();
			console.log('[TodoList] DBManager initialized successfully');

			// Migrate from old TodoDB if needed
			console.log('[TodoList] Running TodoDB migration...');
			await DBManager.migrateFromTodoDB();
			console.log('[TodoList] TodoDB migration completed');

			// Load lists from pockist-db
			console.log('[TodoList] Loading lists from pockist-db...');
			this.#lists = await DBManager.getLists();
			console.log('[TodoList] Loaded lists:', this.#lists.length, 'lists');

			// Migrate lists to add order field (backward compatibility)
			this.#lists.forEach((list, index) => {
				if (typeof list.order !== 'number') {
					list.order = index;
				}
			});

			// Ensure at least one list exists
			if (this.#lists.length === 0) {
				console.log('[TodoList] No lists found, creating default list');
				this.#lists.push({
					id: "default",
					name: "My Todos",
					todos: [],
					isDefault: true,
					createdAt: Date.now(),
					order: 0,
				});
				console.log('[TodoList] Saving default list...');
				await DBManager.saveLists(this.#lists);
				console.log('[TodoList] Default list saved');
			}
			
			// Set current list to default if not set
			if (!this.#currentListId) {
				const defaultList = this.#lists.find((l) => l.isDefault);
				this.#currentListId = defaultList?.id || this.#lists[0]?.id;
				console.log('[TodoList] Current list ID set to:', this.#currentListId);
			}

			this.#initialized = true;
			console.log('[TodoList] Initialization complete, rendering...');
			this.#render();
			console.log('[TodoList] Initial render complete');
		} catch (error) {
			console.error("[TodoList] CRITICAL ERROR in #init():", error);
			console.error("[TodoList] Error stack:", error.stack);
			// Show error in the UI
			if (this.#containerEl) {
				this.#containerEl.innerHTML = `
					<div style="padding: 20px; color: red; border: 1px solid red; margin: 10px;">
						<strong>Error loading todo lists:</strong><br>
						${error.message}<br>
						<small>Check browser console for details</small>
					</div>
				`;
			}
			throw error; // Re-throw so caller knows initialization failed
		}

		// Event listeners for single list mode
		console.log('[TodoList] Setting up event listeners...');
		if (this.#addBtn) {
			this.#addBtn.addEventListener("click", () => this.#handleAdd());
			console.log('[TodoList] Add button listener attached');
		}
		if (this.#inputEl) {
			this.#inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") this.#handleAdd();
			});
			console.log('[TodoList] Input keydown listener attached');
		}
		if (this.#clearCompletedBtn) {
			this.#clearCompletedBtn.addEventListener("click", () =>
				this.#clearCompleted()
			);
			console.log('[TodoList] Clear completed listener attached');
		}

		// Event listeners for new list creation
		if (this.#newListBtn) {
			this.#newListBtn.addEventListener("click", () => this.#handleNewList());
			console.log('[TodoList] New list button listener attached');
		}
		if (this.#newListInputEl) {
			this.#newListInputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") this.#handleNewList();
			});
			console.log('[TodoList] New list input listener attached');
		}

		// Event listener for list selector
		if (this.#listSelectorEl) {
			this.#listSelectorEl.addEventListener("change", (e) => {
				this.#currentListId = e.target.value;
				console.log('[TodoList] List selector changed to:', this.#currentListId);
				this.#render();
			});
			console.log('[TodoList] List selector listener attached');
		}
		
		console.log('[TodoList] #init() finished');
	}

	#getCurrentList() {
		const list = this.#lists.find((l) => l.id === this.#currentListId);
		if (!list) {
			console.warn('[TodoList] getCurrentList() - no list found for ID:', this.#currentListId);
		}
		return list;
	}

	async #handleAdd() {
		console.log('[TodoList] #handleAdd() called');
		const text = this.#inputEl?.value.trim();
		if (!text) {
			console.log('[TodoList] No text entered, ignoring');
			return;
		}

		const list = this.#getCurrentList();
		if (!list) {
			console.error('[TodoList] No current list found!');
			return;
		}

		const todo = {
			id: Date.now().toString(),
			text: text,
			completed: false,
			createdAt: Date.now(),
			order: list.todos.length,
		};

		console.log('[TodoList] Adding todo:', todo);
		list.todos.push(todo);
		this.#inputEl.value = "";
		
		try {
			console.log('[TodoList] Saving lists...');
			await DBManager.saveLists(this.#lists);
			console.log('[TodoList] Lists saved successfully');
			this.#renderWithTransition();
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

	async #toggleTodo(listId, todoId) {
		console.log('[TodoList] #toggleTodo() called:', listId, todoId);
		const list = this.#lists.find((l) => l.id === listId);
		if (!list) {
			console.error('[TodoList] List not found:', listId);
			return;
		}

		const todo = list.todos.find((t) => t.id === todoId);
		if (todo) {
			todo.completed = !todo.completed;
			console.log('[TodoList] Todo toggled, new state:', todo.completed);
			try {
				await DBManager.saveLists(this.#lists);
				console.log('[TodoList] Lists saved after toggle');
				this.#renderWithTransition();
			} catch (error) {
				console.error('[TodoList] Error saving after toggle:', error);
			}
		} else {
			console.warn('[TodoList] Todo not found:', todoId);
		}
	}

	async #editTodo(listId, todoId, newText) {
		console.log('[TodoList] #editTodo() called:', listId, todoId, newText);
		const list = this.#lists.find((l) => l.id === listId);
		if (!list) {
			console.error('[TodoList] List not found:', listId);
			return;
		}

		const todo = list.todos.find((t) => t.id === todoId);
		if (todo && newText.trim()) {
			todo.text = newText.trim();
			console.log('[TodoList] Todo text updated');
			try {
				await DBManager.saveLists(this.#lists);
				console.log('[TodoList] Lists saved after edit');
				this.#renderWithTransition();
			} catch (error) {
				console.error('[TodoList] Error saving after edit:', error);
			}
		}
	}

	async #deleteTodo(listId, todoId) {
		console.log('[TodoList] #deleteTodo() called:', listId, todoId);
		const list = this.#lists.find((l) => l.id === listId);
		if (!list) {
			console.error('[TodoList] List not found:', listId);
			return;
		}

		const originalLength = list.todos.length;
		list.todos = list.todos.filter((t) => t.id !== todoId);
		console.log('[TodoList] Todos filtered, removed:', originalLength - list.todos.length);
		
		// Reorder remaining todos
		list.todos.forEach((todo, index) => {
			todo.order = index;
		});
		
		try {
			await DBManager.saveLists(this.#lists);
			console.log('[TodoList] Lists saved after delete');
			this.#renderWithTransition();
		} catch (error) {
			console.error('[TodoList] Error saving after delete:', error);
		}
	}

	async #moveTodo(listId, todoId, direction) {
		console.log('[TodoList] #moveTodo() called:', listId, todoId, direction);
		const list = this.#lists.find((l) => l.id === listId);
		if (!list) {
			console.error('[TodoList] List not found:', listId);
			return;
		}

		// Ensure todos have order field (backward compatibility)
		list.todos.forEach((todo, index) => {
			if (typeof todo.order !== 'number') {
				todo.order = index;
			}
		});

		const todoIndex = list.todos.findIndex((t) => t.id === todoId);
		if (todoIndex === -1) {
			console.warn('[TodoList] Todo not found:', todoId);
			return;
		}

		const newIndex = todoIndex + direction;
		if (newIndex < 0 || newIndex >= list.todos.length) {
			console.log('[TodoList] Cannot move todo, already at boundary');
			return;
		}

		// Swap the todos and update their order values
		const tempOrder = list.todos[todoIndex].order;
		list.todos[todoIndex].order = list.todos[newIndex].order;
		list.todos[newIndex].order = tempOrder;

		// Sort todos by order
		list.todos.sort((a, b) => a.order - b.order);

		console.log('[TodoList] Todo moved from', todoIndex, 'to', newIndex);
		
		try {
			await DBManager.saveLists(this.#lists);
			console.log('[TodoList] Lists saved after move');
			this.#renderWithTransition();
		} catch (error) {
			console.error('[TodoList] Error saving after move:', error);
		}
	}

	async #clearCompleted() {
		console.log('[TodoList] #clearCompleted() called');
		const list = this.#getCurrentList();
		if (!list) {
			console.error('[TodoList] No current list found');
			return;
		}

		const originalLength = list.todos.length;
		list.todos = list.todos.filter((t) => !t.completed);
		console.log('[TodoList] Cleared completed todos, removed:', originalLength - list.todos.length);
		
		// Reorder remaining todos
		list.todos.forEach((todo, index) => {
			todo.order = index;
		});
		
		try {
			await DBManager.saveLists(this.#lists);
			console.log('[TodoList] Lists saved after clear completed');
			this.#renderWithTransition();
		} catch (error) {
			console.error('[TodoList] Error saving after clear:', error);
		}
	}

	async #handleNewList() {
		console.log('[TodoList] #handleNewList() called');
		const name = this.#newListInputEl?.value.trim();
		if (!name) {
			console.log('[TodoList] No list name entered');
			return;
		}

		const newList = {
			id: Date.now().toString(),
			name: name,
			todos: [],
			isDefault: false,
			createdAt: Date.now(),
			order: this.#lists.length,
		};

		console.log('[TodoList] Creating new list:', newList);
		this.#lists.push(newList);
		this.#currentListId = newList.id;
		this.#newListInputEl.value = "";
		
		try {
			await DBManager.saveLists(this.#lists);
			console.log('[TodoList] New list saved');
			this.#renderWithTransition();
		} catch (error) {
			console.error('[TodoList] Error saving new list:', error);
		}
	}

	async #setDefaultList(listId) {
		console.log('[TodoList] #setDefaultList() called:', listId);
		this.#lists.forEach((l) => {
			l.isDefault = l.id === listId;
		});
		
		try {
			await DBManager.saveLists(this.#lists);
			console.log('[TodoList] Default list set and saved');
			this.#renderWithTransition();
		} catch (error) {
			console.error('[TodoList] Error saving default list:', error);
		}
	}

	async #deleteList(listId) {
		console.log('[TodoList] #deleteList() called:', listId);
		if (this.#lists.length <= 1) {
			alert("Cannot delete the last list");
			console.log('[TodoList] Cannot delete last list');
			return;
		}

		this.#lists = this.#lists.filter((l) => l.id !== listId);
		console.log('[TodoList] List removed, remaining:', this.#lists.length);

		// Reorder remaining lists
		this.#lists.forEach((list, index) => {
			list.order = index;
		});

		// If we deleted the current list, switch to default or first
		if (this.#currentListId === listId) {
			const defaultList = this.#lists.find((l) => l.isDefault);
			this.#currentListId = defaultList?.id || this.#lists[0]?.id;
			console.log('[TodoList] Switched to list:', this.#currentListId);
		}

		try {
			await DBManager.saveLists(this.#lists);
			console.log('[TodoList] Lists saved after delete');
			this.#renderWithTransition();
		} catch (error) {
			console.error('[TodoList] Error saving after list delete:', error);
		}
	}

	async #editListName(listId, newName) {
		console.log('[TodoList] #editListName() called:', listId, newName);
		const list = this.#lists.find((l) => l.id === listId);
		if (!list || !newName) {
			console.log('[TodoList] List not found or no name provided');
			return;
		}

		if (newName.trim() && newName.trim() !== list.name) {
			list.name = newName.trim();
			console.log('[TodoList] List name updated to:', list.name);
			
			try {
				await DBManager.saveLists(this.#lists);
				console.log('[TodoList] Lists saved after name edit');
				this.#renderWithTransition();
			} catch (error) {
				console.error('[TodoList] Error saving after name edit:', error);
			}
		}
	}

	async #moveList(listId, direction) {
		console.log('[TodoList] #moveList() called:', listId, direction);
		
		// Ensure all lists have order field
		this.#lists.forEach((list, index) => {
			if (typeof list.order !== 'number') {
				list.order = index;
			}
		});

		const listIndex = this.#lists.findIndex((l) => l.id === listId);
		if (listIndex === -1) {
			console.warn('[TodoList] List not found:', listId);
			return;
		}

		const newIndex = listIndex + direction;
		if (newIndex < 0 || newIndex >= this.#lists.length) {
			console.log('[TodoList] Cannot move list, already at boundary');
			return;
		}

		// Swap order values
		const tempOrder = this.#lists[listIndex].order;
		this.#lists[listIndex].order = this.#lists[newIndex].order;
		this.#lists[newIndex].order = tempOrder;

		// Sort lists by order
		this.#lists.sort((a, b) => a.order - b.order);

		console.log('[TodoList] List moved from', listIndex, 'to', newIndex);
		
		try {
			await DBManager.saveLists(this.#lists);
			console.log('[TodoList] Lists saved after move');
			this.#renderWithTransition();
		} catch (error) {
			console.error('[TodoList] Error saving after list move:', error);
		}
	}

	#render() {
		console.log('[TodoList] #render() called, mode:', this.#mode);
		if (!this.#containerEl) {
			console.error('[TodoList] Cannot render - container element not found');
			return;
		}
		
		if (this.#mode === "single") {
			this.#renderSingleMode();
		} else {
			this.#renderAllMode();
		}
	}

	#renderSingleMode() {
		console.log('[TodoList] #renderSingleMode() called, lists:', this.#lists.length);
		
		// Sort lists by order for the dropdown
		const sortedLists = [...this.#lists].sort((a, b) => {
			const orderA = typeof a.order === 'number' ? a.order : 0;
			const orderB = typeof b.order === 'number' ? b.order : 0;
			return orderA - orderB;
		});
		
		// Show list selector dropdown
		if (this.#listSelectorEl) {
			this.#listSelectorEl.innerHTML = sortedLists
				.map(
					(l) =>
						`<option value="${l.id}" ${
							l.id === this.#currentListId ? "selected" : ""
						}>${this.#escapeHtml(l.name)} ${l.isDefault ? "(default)" : ""}</option>`
				)
				.join("");
			this.#listSelectorEl.style.display = "block";
		}

		// Show input for current list
		if (this.#inputEl) {
			this.#inputEl.style.display = "block";
		}
		if (this.#addBtn) {
			this.#addBtn.style.display = "block";
		}

		// Hide new list input in single mode
		if (this.#newListInputEl)
			this.#newListInputEl.parentElement.style.display = "none";

		// Render todos for current list
		this.#renderTodoList(this.#currentListId, this.#listsContainerEl);
	}

	#renderAllMode() {
		console.log('[TodoList] #renderAllMode() called, lists:', this.#lists.length);
		
		// Hide list selector in all mode
		if (this.#listSelectorEl) {
			this.#listSelectorEl.style.display = "none";
		}

		// Hide single input in all mode
		if (this.#inputEl) {
			this.#inputEl.style.display = "none";
		}
		if (this.#addBtn) {
			this.#addBtn.style.display = "none";
		}
		if (this.#itemsLeftEl) {
			this.#itemsLeftEl.style.display = "none";
		}
		if (this.#clearCompletedBtn) {
			this.#clearCompletedBtn.style.display = "none";
		}

		// Show new list input
		if (this.#newListInputEl)
			this.#newListInputEl.parentElement.style.display = "flex";

		// Render all lists (sorted by order)
		if (this.#listsContainerEl) {
			this.#listsContainerEl.innerHTML = "";

			// Sort lists by order
			const sortedLists = [...this.#lists].sort((a, b) => {
				const orderA = typeof a.order === 'number' ? a.order : 0;
				const orderB = typeof b.order === 'number' ? b.order : 0;
				return orderA - orderB;
			});

			sortedLists.forEach((list, index) => {
				const listSection = document.createElement("div");
				listSection.className = "todo-list-section";
				listSection.style.viewTransitionName = `list-${list.id}`;

				const isDefault = list.isDefault;
				const isFirst = index === 0;
				const isLast = index === sortedLists.length - 1;

				listSection.innerHTML = `
					<div class="todo-list-header">
						<h3 class="list-title" contenteditable="true" data-list-id="${list.id}">${this.#escapeHtml(list.name)}</h3> ${isDefault ? '<span class="default-badge">default</span>' : ""}
						<div class="todo-list-actions">
							<div class="list-reorder">
								<button class="list-move-up ${isFirst ? 'disabled' : ''}" data-list-id="${list.id}" aria-label="Move list up" ${isFirst ? 'disabled' : ''}>▲</button>
								<button class="list-move-down ${isLast ? 'disabled' : ''}" data-list-id="${list.id}" aria-label="Move list down" ${isLast ? 'disabled' : ''}>▼</button>
							</div>
							${!isDefault ? `<button class="button-link set-default-btn" data-list-id="${list.id}">Set as default</button>` : ""}
							<button class="button-link delete-list-btn" data-list-id="${list.id}">Delete</button>
						</div>
					</div>
					<div class="todo-input-row">
						<input type="text" class="list-todo-input" data-list-id="${list.id}" placeholder="Add a task..." autocomplete="off">
						<button class="list-add-btn button" data-list-id="${list.id}">Add</button>
					</div>
					<ul class="todo-list-ul" data-list-id="${list.id}"></ul>
					<div class="todo-footer">
						<span class="items-left" data-list-id="${list.id}">0 items left</span>
						<button class="clear-completed-btn button-link" data-list-id="${list.id}">Clear completed</button>
					</div>
				`;

				this.#listsContainerEl.appendChild(listSection);

				// Render todos for this list
				const listUl = listSection.querySelector(
					`.todo-list-ul[data-list-id="${list.id}"]`
				);
				this.#renderTodosForList(list, listUl);

				// Update items left count
				const itemsLeftEl = listSection.querySelector(
					`.items-left[data-list-id="${list.id}"]`
				);
				const activeCount = list.todos.filter((t) => !t.completed).length;
				itemsLeftEl.textContent = `${activeCount} item${activeCount !== 1 ? "s" : ""} left`;

				// Show/hide clear completed
				const clearBtn = listSection.querySelector(
					`.clear-completed-btn[data-list-id="${list.id}"]`
				);
				const hasCompleted = list.todos.some((t) => t.completed);
				clearBtn.style.display = hasCompleted ? "inline" : "none";

				// Attach event listeners
				const input = listSection.querySelector(
					`.list-todo-input[data-list-id="${list.id}"]`
				);
				const addBtn = listSection.querySelector(
					`.list-add-btn[data-list-id="${list.id}"]`
				);

				addBtn.addEventListener("click", () => {
					this.#addTodoToList(list.id, input.value.trim());
					input.value = "";
				});

				input.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						this.#addTodoToList(list.id, input.value.trim());
						input.value = "";
					}
				});

				clearBtn.addEventListener("click", () => {
					this.#clearCompletedForList(list.id);
				});

				// Set default button
				const setDefaultBtn = listSection.querySelector(
					`.set-default-btn[data-list-id="${list.id}"]`
				);
				if (setDefaultBtn) {
					setDefaultBtn.addEventListener("click", () => {
						this.#setDefaultList(list.id);
					});
				}

				// Delete list button
				const deleteListBtn = listSection.querySelector(
					`.delete-list-btn[data-list-id="${list.id}"]`
				);
				deleteListBtn.addEventListener("click", () => {
					if (confirm(`Delete "${list.name}"? This cannot be undone.`)) {
						this.#deleteList(list.id);
					}
				});

				// Edit list title
				const titleEl = listSection.querySelector(
					`.list-title[data-list-id="${list.id}"]`
				);
				if (titleEl) {
					titleEl.addEventListener("blur", () => {
						this.#editListName(list.id, titleEl.textContent.trim());
					});

					titleEl.addEventListener("keydown", (e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							titleEl.blur();
						}
					});
				}

				// Move list up/down buttons
				const moveUpBtn = listSection.querySelector(
					`.list-move-up[data-list-id="${list.id}"]`
				);
				const moveDownBtn = listSection.querySelector(
					`.list-move-down[data-list-id="${list.id}"]`
				);

				if (moveUpBtn && !isFirst) {
					moveUpBtn.addEventListener("click", () => {
						this.#moveList(list.id, -1);
					});
				}

				if (moveDownBtn && !isLast) {
					moveDownBtn.addEventListener("click", () => {
						this.#moveList(list.id, 1);
					});
				}
			});
		}
	}

	#renderTodoList(listId, container) {
		console.log('[TodoList] #renderTodoList() called:', listId);
		const list = this.#lists.find((l) => l.id === listId);
		if (!container) {
			console.error('[TodoList] No container provided for renderTodoList');
			return;
		}

		container.innerHTML = "";

		if (!list || list.todos.length === 0) {
			container.innerHTML =
				'<li class="todo-empty">No todos yet. Add one above!</li>';
		} else {
			this.#renderTodosForList(list, container);
		}

		// Update footer for single mode
		if (this.#mode === "single") {
			const activeCount = list?.todos.filter((t) => !t.completed).length || 0;
			if (this.#itemsLeftEl) {
				this.#itemsLeftEl.textContent = `${activeCount} item${
					activeCount !== 1 ? "s" : ""
				} left`;
			}
			const hasCompleted = list?.todos.some((t) => t.completed);
			if (this.#clearCompletedBtn) {
				this.#clearCompletedBtn.style.display = hasCompleted
					? "inline"
					: "none";
			}
		}
	}

	#renderTodosForList(list, container) {
		console.log('[TodoList] #renderTodosForList() called:', list.name, 'todos:', list.todos.length);
		container.innerHTML = "";

		if (list.todos.length === 0) {
			container.innerHTML =
				'<li class="todo-empty">No todos yet. Add one above!</li>';
			return;
		}

		// Sort: active items first (by order), then completed items (by order)
		const sortedTodos = [...list.todos].sort((a, b) => {
			// Completed items go to the bottom
			if (a.completed !== b.completed) {
				return a.completed ? 1 : -1;
			}
			// Within same completion status, sort by order
			const orderA = typeof a.order === 'number' ? a.order : 0;
			const orderB = typeof b.order === 'number' ? b.order : 0;
			return orderA - orderB;
		});

		sortedTodos.forEach((todo, index) => {
			const li = document.createElement("li");
			li.className = `todo-item ${todo.completed ? "completed" : ""}`;
			li.dataset.todoId = todo.id;
			li.dataset.listId = list.id;
			li.style.viewTransitionName = `todo-${todo.id}`;

			const isFirst = index === 0;
			const isLast = index === sortedTodos.length - 1;

			li.innerHTML = `
				<input type="checkbox" class="todo-checkbox" ${
					todo.completed ? "checked" : ""
				}>
				<span class="todo-text" contenteditable="true">${this.#escapeHtml(
					todo.text
				)}</span>
				<div class="todo-reorder">
					<button class="todo-move-up ${isFirst ? 'disabled' : ''}" aria-label="Move up" ${isFirst ? 'disabled' : ''}>▲</button>
					<button class="todo-move-down ${isLast ? 'disabled' : ''}" aria-label="Move down" ${isLast ? 'disabled' : ''}>▼</button>
				</div>
				<button class="todo-delete" aria-label="Delete todo">×</button>
			`;

			const checkbox = li.querySelector(".todo-checkbox");
			const textSpan = li.querySelector(".todo-text");
			const deleteBtn = li.querySelector(".todo-delete");
			const moveUpBtn = li.querySelector(".todo-move-up");
			const moveDownBtn = li.querySelector(".todo-move-down");

			checkbox.addEventListener("change", () => {
				this.#toggleTodo(list.id, todo.id);
			});

			textSpan.addEventListener("blur", () => {
				this.#editTodo(list.id, todo.id, textSpan.textContent);
			});

			textSpan.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					textSpan.blur();
				}
			});

			deleteBtn.addEventListener("click", () => {
				this.#deleteTodo(list.id, todo.id);
			});

			if (!isFirst) {
				moveUpBtn.addEventListener("click", () => {
					this.#moveTodo(list.id, todo.id, -1);
				});
			}

			if (!isLast) {
				moveDownBtn.addEventListener("click", () => {
					this.#moveTodo(list.id, todo.id, 1);
				});
			}

			container.appendChild(li);
		});
	}

	async #addTodoToList(listId, text) {
		console.log('[TodoList] #addTodoToList() called:', listId, text);
		if (!text.trim()) {
			console.log('[TodoList] Empty text, ignoring');
			return;
		}

		const list = this.#lists.find((l) => l.id === listId);
		if (!list) {
			console.error('[TodoList] List not found:', listId);
			return;
		}

		const todo = {
			id: Date.now().toString(),
			text: text.trim(),
			completed: false,
			createdAt: Date.now(),
			order: list.todos.length,
		};

		console.log('[TodoList] Adding todo to list:', todo);
		list.todos.push(todo);
		
		try {
			await DBManager.saveLists(this.#lists);
			console.log('[TodoList] Lists saved after adding todo');
			this.#renderWithTransition();
		} catch (error) {
			console.error('[TodoList] Error saving after adding todo:', error);
		}
	}

	async #clearCompletedForList(listId) {
		console.log('[TodoList] #clearCompletedForList() called:', listId);
		const list = this.#lists.find((l) => l.id === listId);
		if (!list) {
			console.error('[TodoList] List not found:', listId);
			return;
		}

		const originalLength = list.todos.length;
		list.todos = list.todos.filter((t) => !t.completed);
		console.log('[TodoList] Cleared completed for list, removed:', originalLength - list.todos.length);
		
		// Reorder remaining todos
		list.todos.forEach((todo, index) => {
			todo.order = index;
		});
		
		try {
			await DBManager.saveLists(this.#lists);
			console.log('[TodoList] Lists saved after clear completed for list');
			this.#renderWithTransition();
		} catch (error) {
			console.error('[TodoList] Error saving after clear list completed:', error);
		}
	}

	#escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}
}

customElements.define("todo-list", TodoList);
console.log('[TodoList] Custom element registered');