export class TodoList extends HTMLElement {
	#todos = [];
	#db = null;
	#dbName = "TodoDB";
	#storeName = "todos";
	#key = "todoList";

	// DOM element references
	#listEl = null;
	#inputEl = null;
	#addBtn = null;
	#itemsLeftEl = null;
	#clearCompletedBtn = null;

	connectedCallback() {
		const template = document.getElementById("todo-list");
		if (!template) {
			console.error("Template with id 'todo-list' not found");
			return;
		}
		const content = template.content.cloneNode(true);
		this.appendChild(content);

		// Cache DOM elements
		this.#listEl = this.querySelector("#todo-list-ul");
		this.#inputEl = this.querySelector("#todo-input");
		this.#addBtn = this.querySelector("#add-btn");
		this.#itemsLeftEl = this.querySelector("#items-left");
		this.#clearCompletedBtn = this.querySelector("#clear-completed");

		if (!this.#listEl || !this.#inputEl || !this.#addBtn) {
			console.error("Required elements not found in TodoList template");
			return;
		}

		this.#init();
	}

	async #init() {
		try {
			await this.#loadFromDB();
			this.#render();
		} catch (error) {
			console.error("Error loading todos from IndexedDB:", error);
		}

		// Event listeners
		this.#addBtn.addEventListener("click", () => this.#handleAdd());
		this.#inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") this.#handleAdd();
		});
		this.#clearCompletedBtn.addEventListener("click", () => this.#clearCompleted());
	}

	#handleAdd() {
		const text = this.#inputEl.value.trim();
		if (!text) return;

		const todo = {
			id: Date.now().toString(),
			text: text,
			completed: false,
			createdAt: Date.now(),
		};

		this.#todos.push(todo);
		this.#inputEl.value = "";
		this.#saveToDB();
		this.#render();
	}

	#toggleTodo(id) {
		const todo = this.#todos.find((t) => t.id === id);
		if (todo) {
			todo.completed = !todo.completed;
			this.#saveToDB();
			this.#render();
		}
	}

	#editTodo(id, newText) {
		const todo = this.#todos.find((t) => t.id === id);
		if (todo && newText.trim()) {
			todo.text = newText.trim();
			this.#saveToDB();
			this.#render();
		}
	}

	#deleteTodo(id) {
		this.#todos = this.#todos.filter((t) => t.id !== id);
		this.#saveToDB();
		this.#render();
	}

	#clearCompleted() {
		this.#todos = this.#todos.filter((t) => !t.completed);
		this.#saveToDB();
		this.#render();
	}

	#render() {
		this.#listEl.innerHTML = "";

		if (this.#todos.length === 0) {
			this.#listEl.innerHTML =
				'<li class="todo-empty">No todos yet. Add one above!</li>';
		} else {
			this.#todos.forEach((todo) => {
				const li = document.createElement("li");
				li.className = `todo-item ${todo.completed ? "completed" : ""}`;
				li.dataset.id = todo.id;

				li.innerHTML = `
					<input type="checkbox" class="todo-checkbox" ${todo.completed ? "checked" : ""}>
					<span class="todo-text" contenteditable="true">${this.#escapeHtml(todo.text)}</span>
					<button class="todo-delete" aria-label="Delete todo">×</button>
				`;

				// Event listeners for this item
				const checkbox = li.querySelector(".todo-checkbox");
				const textSpan = li.querySelector(".todo-text");
				const deleteBtn = li.querySelector(".todo-delete");

				checkbox.addEventListener("change", () => this.#toggleTodo(todo.id));

				textSpan.addEventListener("blur", () => {
					this.#editTodo(todo.id, textSpan.textContent);
				});

				textSpan.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						textSpan.blur();
					}
				});

				deleteBtn.addEventListener("click", () => this.#deleteTodo(todo.id));

				this.#listEl.appendChild(li);
			});
		}

		// Update footer
		const activeCount = this.#todos.filter((t) => !t.completed).length;
		this.#itemsLeftEl.textContent = `${activeCount} item${activeCount !== 1 ? "s" : ""} left`;

		// Show/hide clear completed button
		const hasCompleted = this.#todos.some((t) => t.completed);
		this.#clearCompletedBtn.style.display = hasCompleted ? "inline" : "none";
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
			const request = store.put(this.#todos, this.#key);

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
				this.#todos = request.result || [];
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
