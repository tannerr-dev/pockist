/**
 * Notes Component
 *
 * A custom web component that provides a multi-note editor with offline storage.
 * Notes are persisted to the unified items store (v9 schema) as type='note'.
 * Title is derived from the first line of content.
 */

import { DBManager } from '../services/DBManager.js';
import { DialogService } from '../services/DialogService.js';
import './ShareButton.js';

export class Notes extends HTMLElement {
	constructor() {
		super();
		this.notes = [];
		this.currentNoteId = null;
		this.timeoutId = null;
		this.isListView = true;

		this.listContainer = null;
		this.editorContainer = null;
		this.contentTextarea = null;
		this.emptyState = null;
		this.editorShareBtn = null;
	}

	async connectedCallback() {
		const template = document.getElementById("pockist-notes");
		if (!template) {
			console.error("Notes: Template with id 'pockist-notes' not found");
			return;
		}

		const content = template.content.cloneNode(true);
		this.appendChild(content);

		this.listContainer = this.querySelector("#notes-list");
		this.editorContainer = this.querySelector("#note-editor");
		this.emptyState = this.querySelector("#empty-state");
		this.contentTextarea = this.querySelector("#note-content");
		this.editorShareBtn = this.querySelector("#editor-share-btn");

		if (!this.listContainer || !this.editorContainer) {
			console.error("Notes: Required containers not found in template");
			return;
		}

		await this.#init();
	}

	async #init() {
		try {
			await DBManager.init();
			this.notes = await DBManager.getItems({ type: 'note', archived: false });
			this.#sortNotes();
			this.#showListView();
			this.#setupEventListeners();
		} catch (error) {
			console.error("Error initializing notes:", error);
			this.notes = [];
			this.#showListView();
		}
	}

	#sortNotes() {
		this.notes.sort((a, b) => {
			const dateA = new Date(a.meta?.updatedAt || a.meta?.createdAt || 0);
			const dateB = new Date(b.meta?.updatedAt || b.meta?.createdAt || 0);
			return dateB - dateA;
		});
	}

	#setupEventListeners() {
		const newNoteBtn = this.querySelector("#new-note-btn");
		if (newNoteBtn) {
			newNoteBtn.addEventListener("click", () => this.#createNewNote());
		}

		const backBtn = this.querySelector("#back-btn");
		if (backBtn) {
			backBtn.addEventListener("click", () => this.#showListView());
		}

		const deleteBtn = this.querySelector("#delete-btn");
		if (deleteBtn) {
			deleteBtn.addEventListener("click", () => this.#deleteCurrentNote());
		}

		if (this.contentTextarea) {
			this.contentTextarea.addEventListener("input", () => {
				this.#handleInput();
			});
		}
	}

	#generateNoteId(content) {
		const now = new Date();
		const timestamp = now.getFullYear().toString() +
			String(now.getMonth() + 1).padStart(2, '0') +
			String(now.getDate()).padStart(2, '0') +
			String(now.getHours()).padStart(2, '0') +
			String(now.getMinutes()).padStart(2, '0') +
			String(now.getSeconds()).padStart(2, '0');

		const text = content || 'untitled';
		const slug = text
			.slice(0, 20)
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');

		return `${timestamp}-${slug || 'note'}`;
	}

	#formatDate(dateString) {
		if (!dateString) return '';
		const date = new Date(dateString);
		return date.toLocaleString();
	}

	#getNotePreview(content, maxLength = 60) {
		if (!content) return '';
		if (typeof content !== 'string') {
			content = String(content);
		}
		const text = content.replace(/\n/g, ' ').trim();
		if (text.length <= maxLength) return text;
		return text.slice(0, maxLength) + '...';
	}

	#extractTitle(content) {
		if (!content) return 'Untitled';
		const firstLine = content.split('\n')[0].trim();
		return firstLine || 'Untitled';
	}

	#createNewNote() {
		const now = new Date().toISOString();
		const newNote = {
			id: this.#generateNoteId(''),
			type: 'note',
			content: '',
			links: [],
			meta: {
				createdAt: now,
				updatedAt: now,
				archived: false,
				completed: false
			}
		};

		this.currentNoteId = newNote.id;
		this.notes.unshift(newNote);

		DBManager.saveItem(newNote).catch(error => {
			console.error("Error creating new note:", error);
		});

		this.#showEditorView();
	}

	#openNote(noteId) {
		this.currentNoteId = noteId;
		this.#showEditorView();
	}

	#showListView() {
		this.isListView = true;
		this.currentNoteId = null;

		if (this.editorContainer) {
			this.editorContainer.style.display = 'none';
		}

		if (this.listContainer) {
			this.listContainer.style.display = 'block';
		}

		this.#renderNoteList();
	}

	#showEditorView() {
		this.isListView = false;

		if (this.listContainer) {
			this.listContainer.style.display = 'none';
		}

		if (this.editorContainer) {
			this.editorContainer.style.display = 'block';
		}

		this.#loadCurrentNoteIntoEditor();
	}

	#renderNoteList() {
		if (!this.listContainer) return;

		const notesListEl = this.listContainer.querySelector('#notes-items');
		if (!notesListEl) return;

		notesListEl.innerHTML = '';

		if (this.notes.length === 0) {
			if (this.emptyState) {
				this.emptyState.style.display = 'block';
			}
			notesListEl.style.display = 'none';
			return;
		} else {
			if (this.emptyState) {
				this.emptyState.style.display = 'none';
			}
			notesListEl.style.display = 'block';
		}

		const notesCountEl = this.listContainer.querySelector('.notes-count');
		if (notesCountEl) {
			const count = this.notes.length;
			notesCountEl.textContent = `${count} note${count !== 1 ? 's' : ''}`;
		}

		this.notes.forEach(note => {
			const title = this.#extractTitle(note.content);
			const preview = this.#getNotePreview(note.content);
			const date = this.#formatDate(note.meta?.updatedAt || note.meta?.createdAt);

			const noteEl = document.createElement('div');
			noteEl.className = 'note-item';
			noteEl.dataset.noteId = note.id;

			const contentWrapper = document.createElement('div');
			contentWrapper.className = 'note-item-content';
			contentWrapper.innerHTML = `
				<div class="note-item-title">${this.#escapeHtml(title)}</div>
				<div class="note-item-preview">${this.#escapeHtml(preview)}</div>
				<div class="note-item-date">${date}</div>
			`;

			const shareBtn = document.createElement('share-button');
			shareBtn.setAttribute('type', 'note');
			shareBtn.setAttribute('data-id', note.id);
			shareBtn.setAttribute('title', title);

			shareBtn.addEventListener('click', (e) => {
				e.stopPropagation();
			});

			contentWrapper.addEventListener('click', () => this.#openNote(note.id));

			noteEl.appendChild(contentWrapper);
			noteEl.appendChild(shareBtn);
			notesListEl.appendChild(noteEl);
		});
	}

	#loadCurrentNoteIntoEditor() {
		if (!this.contentTextarea) return;

		const note = this.notes.find(n => n.id === this.currentNoteId);
		if (!note) {
			this.#showListView();
			return;
		}

		this.contentTextarea.value = note.content || '';

		if (this.editorShareBtn) {
			const title = this.#extractTitle(note.content);
			this.editorShareBtn.setAttribute('data-id', note.id);
			this.editorShareBtn.setAttribute('title', title);
		}

		this.#updateSaveIndicator('');
	}

	#handleInput() {
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
		}

		this.#updateSaveIndicator('Saving...');

		this.timeoutId = setTimeout(async () => {
			await this.#saveCurrentNote();
		}, 1000);
	}

	async #saveCurrentNote() {
		if (!this.currentNoteId) return;

		const note = this.notes.find(n => n.id === this.currentNoteId);
		if (!note) return;

		note.content = this.contentTextarea ? this.contentTextarea.value : '';
		note.meta = {
			...note.meta,
			updatedAt: new Date().toISOString()
		};

		try {
			await DBManager.saveItem(note);
			this.#updateSaveIndicator('Saved');
			this.#sortNotes();
		} catch (error) {
			console.error("Error saving note:", error);
			this.#updateSaveIndicator('Error saving');
		}
	}

	#updateSaveIndicator(text) {
		const indicator = this.querySelector('#save-indicator');
		if (indicator) {
			indicator.textContent = text;
		}
	}

	async #deleteCurrentNote() {
		if (!this.currentNoteId) return;

		const note = this.notes.find(n => n.id === this.currentNoteId);
		const title = note ? this.#extractTitle(note.content) : 'this note';

		const confirmed = await DialogService.confirm(`Delete "${title}"?`, "Delete");
		if (!confirmed) {
			return;
		}

		try {
			await DBManager.deleteItem(this.currentNoteId);
			this.notes = this.notes.filter(n => n.id !== this.currentNoteId);
			this.#showListView();
		} catch (error) {
			console.error("Error deleting note:", error);
			alert('Failed to delete note');
		}
	}

	#escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	disconnectedCallback() {
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
			this.timeoutId = null;
		}

		if (this.currentNoteId && !this.isListView) {
			this.#saveCurrentNote();
		}
	}
}

customElements.define("pockist-notes", Notes);
