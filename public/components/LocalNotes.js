/**
 * LocalNotes Component
 * 
 * A custom web component that provides a textarea for offline note-taking.
 * Notes are persisted to IndexedDB using the shared DBManager service.
 */

import { DBManager } from '../services/DBManager.js';

export class LocalNotes extends HTMLElement {
	constructor() {
		super();
		this.textArea = null;
		this.timeoutId = null;
		this.noteId = 1;
	}

	async connectedCallback() {
		const template = document.getElementById("local-note");
		if (!template) {
			console.error("LocalNotes: Template with id 'local-note' not found");
			return;
		}
		
		const content = template.content.cloneNode(true);
		this.appendChild(content);

		this.textArea = this.querySelector("#note");
		if (!this.textArea) {
			console.error("LocalNotes: Textarea with id 'note' not found");
			return;
		}

		await this.#init();
	}

	async #init() {
		try {
			await DBManager.init();
			const note = await DBManager.getNote(this.noteId);
			this.textArea.value = note?.content ?? "";
		} catch (error) {
			console.error("Error loading note:", error);
			this.textArea.value = "";
		}

		this.textArea.addEventListener("input", () => {
			this.#handleInput();
		});
	}

	#handleInput() {
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
		}
		
		this.timeoutId = setTimeout(async () => {
			const currentValue = this.textArea.value;
			
			try {
				await DBManager.saveNote(this.noteId, currentValue);
			} catch (error) {
				console.error("Error saving note:", error);
			}
		}, 1000);
	}

	disconnectedCallback() {
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
			this.timeoutId = null;
		}
	}
}

customElements.define("local-notes", LocalNotes);
