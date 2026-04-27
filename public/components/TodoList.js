import { Router } from "../services/Router.js";

export class TodoList extends HTMLElement {
	#lists = [];
	#currentListId = null;
	#db = null;
	#dbName = "TodoDB";
	#storeName = "todos";
	#key = "todoLists";
	#mode = "single"; // "single" for home page (one list), "all" for /list page

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
		if (name === "mode" && oldValue !== newValue) {
			this.#mode = newValue || "single";
			if (this.#containerEl) {
				this.#render();
			}
		}
	}

	connectedCallback() {
		const template = document.getElementById("todo-list");
		if (!template) {
			console.error("Template with id 'todo-list' not found");
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

		this.#mode = this.getAttribute("mode") || "single";

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
		try {
			await this.#loadFromDB();
			// Ensure at least one list exists
			if (this.#lists.length === 0) {
				this.#lists.push({
					id: "default",
					name: "My Todos",
					todos: [],
					isDefault: true,
					createdAt: Date.now(),
				});
				await this.#saveToDB();
			}
			// Set current list to default if not set
			if (!this.#currentListId) {
				const defaultList = this.#lists.find((l) => l.isDefault);
				this.#currentListId = defaultList?.id || this.#lists[0]?.id;
			}
			this.#render();
		} catch (error) {
			console.error("Error loading todos from IndexedDB:", error);
		}

		// Event listeners for single list mode
		if (this.#addBtn) {
			this.#addBtn.addEventListener("click", () => this.#handleAdd());
		}
		if (this.#inputEl) {
			this.#inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") this.#handleAdd();
			});
		}
		if (this.#clearCompletedBtn) {
			this.#clearCompletedBtn.addEventListener("click", () =>
				this.#clearCompleted()
			);
		}

		// Event listeners for new list creation
		if (this.#newListBtn) {
			this.#newListBtn.addEventListener("click", () => this.#handleNewList());
		}
		if (this.#newListInputEl) {
			this.#newListInputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") this.#handleNewList();
			});
		}

		// Event listener for list selector
		if (this.#listSelectorEl) {
			this.#listSelectorEl.addEventListener("change", (e) => {
				this.#currentListId = e.target.value;
				this.#render();
			});
		}
	}

	#getCurrentList() {
		return this.#lists.find((l) => l.id === this.#currentListId);
	}

	#handleAdd() {
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

		list.todos.push(todo);
		this.#inputEl.value = "";
		this.#saveToDB();
		this.#render();
	}

	#toggleTodo(listId, todoId) {
		const list = this.#lists.find((l) => l.id === listId);
		if (!list) return;

		const todo = list.todos.find((t) => t.id === todoId);
		if (todo) {
			todo.completed = !todo.completed;
			this.#saveToDB();
			this.#render();
		}
	}

	#editTodo(listId, todoId, newText) {
		const list = this.#lists.find((l) => l.id === listId);
		if (!list) return;

		const todo = list.todos.find((t) => t.id === todoId);
		if (todo && newText.trim()) {
			todo.text = newText.trim();
			this.#saveToDB();
			this.#render();
		}
	}

	#deleteTodo(listId, todoId) {
		const list = this.#lists.find((l) => l.id === listId);
		if (!list) return;

		list.todos = list.todos.filter((t) => t.id !== todoId);
		this.#saveToDB();
		this.#render();
	}

	#clearCompleted() {
		const list = this.#getCurrentList();
		if (!list) return;

		list.todos = list.todos.filter((t) => !t.completed);
		this.#saveToDB();
		this.#render();
	}

	#handleNewList() {
		const name = this.#newListInputEl?.value.trim();
		if (!name) return;

		const newList = {
			id: Date.now().toString(),
			name: name,
			todos: [],
			isDefault: false,
			createdAt: Date.now(),
		};

		this.#lists.push(newList);
		this.#currentListId = newList.id;
		this.#newListInputEl.value = "";
		this.#saveToDB();
		this.#render();
	}

	#setDefaultList(listId) {
		this.#lists.forEach((l) => {
			l.isDefault = l.id === listId;
		});
		this.#saveToDB();
		this.#render();
	}

	#deleteList(listId) {
		if (this.#lists.length <= 1) {
			alert("Cannot delete the last list");
			return;
		}

		this.#lists = this.#lists.filter((l) => l.id !== listId);

		// If we deleted the current list, switch to default or first
		if (this.#currentListId === listId) {
			const defaultList = this.#lists.find((l) => l.isDefault);
			this.#currentListId = defaultList?.id || this.#lists[0]?.id;
		}

		this.#saveToDB();
		this.#render();
	}

	#editListName(listId, newName) {
		const list = this.#lists.find((l) => l.id === listId);
		if (!list || !newName) return;

		if (newName.trim() && newName.trim() !== list.name) {
			list.name = newName.trim();
			this.#saveToDB();
			this.#render();
		}
	}

	#render() {
		if (this.#mode === "single") {
			this.#renderSingleMode();
		} else {
			this.#renderAllMode();
		}
	}

	#renderSingleMode() {
		// Show list selector dropdown
		if (this.#listSelectorEl) {
			this.#listSelectorEl.innerHTML = this.#lists
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

		// Render all lists
		if (this.#listsContainerEl) {
			this.#listsContainerEl.innerHTML = "";

			this.#lists.forEach((list) => {
				const listSection = document.createElement("div");
				listSection.className = "todo-list-section";

				const isDefault = list.isDefault;
				listSection.innerHTML = `
					<div class="todo-list-header">
						<h3 class="list-title" contenteditable="true" data-list-id="${list.id}">${this.#escapeHtml(list.name)}</h3> ${isDefault ? '<span class="default-badge">default</span>' : ""}
						<div class="todo-list-actions">
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
			});
		}
	}

	#renderTodoList(listId, container) {
		const list = this.#lists.find((l) => l.id === listId);
		if (!container) return;

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
		container.innerHTML = "";

		if (list.todos.length === 0) {
			container.innerHTML =
				'<li class="todo-empty">No todos yet. Add one above!</li>';
			return;
		}

		list.todos.forEach((todo) => {
			const li = document.createElement("li");
			li.className = `todo-item ${todo.completed ? "completed" : ""}`;
			li.dataset.todoId = todo.id;
			li.dataset.listId = list.id;

			li.innerHTML = `
				<input type="checkbox" class="todo-checkbox" ${
					todo.completed ? "checked" : ""
				}>
				<span class="todo-text" contenteditable="true">${this.#escapeHtml(
					todo.text
				)}</span>
				<button class="todo-delete" aria-label="Delete todo">×</button>
			`;

			const checkbox = li.querySelector(".todo-checkbox");
			const textSpan = li.querySelector(".todo-text");
			const deleteBtn = li.querySelector(".todo-delete");

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

			container.appendChild(li);
		});
	}

	#addTodoToList(listId, text) {
		if (!text.trim()) return;

		const list = this.#lists.find((l) => l.id === listId);
		if (!list) return;

		const todo = {
			id: Date.now().toString(),
			text: text.trim(),
			completed: false,
			createdAt: Date.now(),
		};

		list.todos.push(todo);
		this.#saveToDB();
		this.#render();
	}

	#clearCompletedForList(listId) {
		const list = this.#lists.find((l) => l.id === listId);
		if (!list) return;

		list.todos = list.todos.filter((t) => !t.completed);
		this.#saveToDB();
		this.#render();
	}

	#escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}

	// IndexedDB methods
	async #openDB() {
		if (this.#db) return;

		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.#dbName, 1);

			request.onupgradeneeded = (e) => {
				this.#db = e.target.result;
				if (!this.#db.objectStoreNames.contains(this.#storeName)) {
					this.#db.createObjectStore(this.#storeName);
				}
			};

			request.onsuccess = (e) => {
				this.#db = e.target.result;
				resolve();
			};

			request.onerror = (e) => reject(e);
		});
	}

	async #saveToDB() {
		await this.#openDB();
		return new Promise((resolve, reject) => {
			const transaction = this.#db.transaction([this.#storeName], "readwrite");
			const store = transaction.objectStore(this.#storeName);
			const request = store.put(this.#lists, this.#key);

			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	async #loadFromDB() {
		await this.#openDB();
		return new Promise((resolve, reject) => {
			const transaction = this.#db.transaction([this.#storeName], "readonly");
			const store = transaction.objectStore(this.#storeName);
			const request = store.get(this.#key);

			request.onsuccess = () => {
				this.#lists = request.result || [];
				resolve();
			};
			request.onerror = () => reject(request.error);
		});
	}

	disconnectedCallback() {
		if (this.#db) {
			this.#db.close();
		}
	}
}

customElements.define("todo-list", TodoList);
