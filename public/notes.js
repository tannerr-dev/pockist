class LocalNotes extends HTMLElement {
	constructor() {
		super();
		this.db = null;
		this.timeoutId = null;
		this.textArea = null;
	}

	async connectedCallback() {
		// Clone template and append to DOM
		const template = document.getElementById("local-notes");
		if (!template) {
			console.error("Template with id 'local-notes' not found");
			return;
		}
		const content = template.content.cloneNode(true);
		this.appendChild(content);

		// Get reference to the textarea
		this.textArea = this.querySelector('#box');
		if (!this.textArea) {
			console.error("Textarea with id 'box' not found in LocalNotes template");
			return;
		}

		// Initialize the component
		await this.#init();
	}

	// Initialize the textarea with saved data and event listeners
	async #init() {
		try {
			// Load saved data from IndexedDB
			const storedValue = await this.#getDataFromIndexedDB();
			this.textArea.value = storedValue;
		} catch (error) {
			console.error("Error fetching from IndexedDB:", error);
		}

		// Set up auto-save on input
		this.textArea.addEventListener("input", () => {
			this.#handleInput();
		});
	}

	// Handle textarea input with debounced saving
	#handleInput() {
		clearTimeout(this.timeoutId);
		this.timeoutId = setTimeout(async () => {
			const currentValue = this.textArea.value;
			try {
				await this.#saveDataToIndexedDB(currentValue);
				console.log("Changes saved to IndexedDB");
			} catch (error) {
				console.error("Error saving to IndexedDB:", error);
			}
		}, 1000); // Wait 1 second before saving
	}

	// Open IndexedDB connection
	async #openDB() {
		if (this.db) {
			return; // Already connected
		}

		return new Promise((resolve, reject) => {
			const request = indexedDB.open("textAreaDB", 1);

			request.onupgradeneeded = (e) => {
				this.db = e.target.result;
				this.db.createObjectStore("textAreaStore");
			};

			request.onsuccess = (e) => {
				this.db = e.target.result;
				resolve();
			};

			request.onerror = (e) => {
				reject(e);
			};
		});
	}

	// Save data to IndexedDB
	async #saveDataToIndexedDB(value) {
		await this.#openDB();
		return new Promise((resolve, reject) => {
			const transaction = this.db.transaction(["textAreaStore"], "readwrite");
			const store = transaction.objectStore("textAreaStore");
			const request = store.put({ value: value }, "singleRecord");

			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	// Get data from IndexedDB
	async #getDataFromIndexedDB() {
		await this.#openDB();
		return new Promise((resolve, reject) => {
			const transaction = this.db.transaction(["textAreaStore"], "readonly");
			const store = transaction.objectStore("textAreaStore");
			const request = store.get("singleRecord");

			request.onsuccess = () => {
				resolve(request.result?.value ?? "");
			};
			request.onerror = () => reject(request.error);
		});
	}

	// Clean up when element is removed
	disconnectedCallback() {
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
		}
		if (this.db) {
			this.db.close();
		}
	}
}

customElements.define("local-notes", LocalNotes);

document.addEventListener('DOMContentLoaded', function() {
	const mainElement = document.querySelector("main");
	if (mainElement) {
		mainElement.appendChild(new LocalNotes());

	}
});

