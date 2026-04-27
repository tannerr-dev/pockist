/**
 * LocalNotes Component
 * 
 * A custom web component that provides a multi-note editor with offline storage.
 * Notes are persisted to IndexedDB using the shared DBManager service.
 * Each note has: id, title, content, createdAt, updatedAt
 */

import { DBManager } from '../services/DBManager.js';

export class LocalNotes extends HTMLElement {
	constructor() {
		super();
		this.notes = [];
		this.currentNoteId = null;
		this.timeoutId = null;
		this.isListView = true;
		
		// DOM element references
		this.listContainer = null;
		this.editorContainer = null;
		this.titleInput = null;
		this.contentTextarea = null;
		this.emptyState = null;
	}

	async connectedCallback() {
		const template = document.getElementById("local-note");
		if (!template) {
			console.error("LocalNotes: Template with id 'local-note' not found");
			return;
		}
		
		const content = template.content.cloneNode(true);
		this.appendChild(content);

		// Cache DOM references
		this.listContainer = this.querySelector("#notes-list");
		this.editorContainer = this.querySelector("#note-editor");
		this.emptyState = this.querySelector("#empty-state");
		this.titleInput = this.querySelector("#note-title");
		this.contentTextarea = this.querySelector("#note-content");
		
		if (!this.listContainer || !this.editorContainer) {
			console.error("LocalNotes: Required containers not found in template");
			return;
		}

		await this.#init();
	}

	async #init() {
		try {
			await DBManager.init();
			const rawNotes = await DBManager.getAllNotes();

			// Normalize notes to fix any corrupted data
			this.notes = rawNotes.map(note => this.#normalizeNote(note));

			// Sort by updatedAt (most recent first)
			this.#sortNotes();

			// Show list view by default
			this.#showListView();

			// Setup event listeners
			this.#setupEventListeners();
		} catch (error) {
			console.error("Error initializing notes:", error);
			this.notes = [];
			this.#showListView();
		}
	}

	#sortNotes() {
		this.notes.sort((a, b) => {
			const dateA = new Date(a.updatedAt || a.createdAt || 0);
			const dateB = new Date(b.updatedAt || b.createdAt || 0);
			return dateB - dateA;
		});
	}

	#setupEventListeners() {
		// New note button
		const newNoteBtn = this.querySelector("#new-note-btn");
		if (newNoteBtn) {
			newNoteBtn.addEventListener("click", () => this.#createNewNote());
		}

		// Empty state button
		const emptyStateBtn = this.querySelector("#create-first-note-btn");
		if (emptyStateBtn) {
			emptyStateBtn.addEventListener("click", () => this.#createNewNote());
		}

		// Back button
		const backBtn = this.querySelector("#back-btn");
		if (backBtn) {
			backBtn.addEventListener("click", () => this.#showListView());
		}

		// Delete button
		const deleteBtn = this.querySelector("#delete-btn");
		if (deleteBtn) {
			deleteBtn.addEventListener("click", () => this.#deleteCurrentNote());
		}

		// Title input change
		if (this.titleInput) {
			this.titleInput.addEventListener("input", () => {
				this.#handleInput();
			});
		}

		// Content textarea change
		if (this.contentTextarea) {
			this.contentTextarea.addEventListener("input", () => {
				this.#autoFillTitle();
				this.#handleInput();
			});
		}
	}

	#autoFillTitle() {
		// Only auto-fill if title is empty and this is a new note
		if (this.titleInput && !this.titleInput.value.trim() && this.contentTextarea) {
			const content = this.contentTextarea.value.trim();
			if (content) {
				const firstLine = content.split('\n')[0];
				const autoTitle = firstLine.slice(0, 20);
				this.titleInput.value = autoTitle;
			}
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
		// Handle case where content might not be a string
		if (!content) return '';
		if (typeof content !== 'string') {
			// Try to extract content from corrupted double-wrapped object
			if (typeof content === 'object') {
				if (content.content && typeof content.content === 'string') {
					content = content.content;
				} else {
					// Fallback: convert object to string, but avoid "[object Object]"
					content = JSON.stringify(content);
				}
			} else {
				content = String(content);
			}
		}
		const text = content.replace(/\n/g, ' ').trim();
		if (text.length <= maxLength) return text;
		return text.slice(0, maxLength) + '...';
	}

	/**
	 * Normalize a note object, fixing any corrupted data structures.
	 * This handles notes where content was accidentally stored as an object.
	 * @param {Object} note - The note to normalize
	 * @returns {Object} The normalized note
	 */
	#normalizeNote(note) {
		if (!note) return note;

		const normalized = { ...note };

		// Fix corrupted content that was stored as an object
		if (note.content && typeof note.content === 'object') {
			const corruptedContent = note.content;
			normalized.content = corruptedContent.content || '';
			normalized.title = note.title || corruptedContent.title || '';
			normalized.createdAt = note.createdAt || corruptedContent.createdAt;
			normalized.updatedAt = note.updatedAt || corruptedContent.updatedAt;
		}

		// Ensure content is always a string
		if (typeof normalized.content !== 'string') {
			normalized.content = String(normalized.content || '');
		}

		return normalized;
	}

	#createNewNote() {
		const now = new Date().toISOString();
		const newNote = {
			id: this.#generateNoteId(''),
			title: '',
			content: '',
			createdAt: now,
			updatedAt: now
		};
		
		this.currentNoteId = newNote.id;
		this.notes.unshift(newNote);
		
		// Save to DB immediately
		DBManager.saveNote(newNote.id, newNote).catch(error => {
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

		// Clear current list
		notesListEl.innerHTML = '';

		// Show/hide empty state
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

		// Update notes count
		const notesCountEl = this.listContainer.querySelector('.notes-count');
		if (notesCountEl) {
			const count = this.notes.length;
			notesCountEl.textContent = `${count} note${count !== 1 ? 's' : ''}`;
		}

		// Render each note (normalize to ensure clean data)
		this.notes.forEach(note => {
			const normalizedNote = this.#normalizeNote(note);
			const noteEl = document.createElement('div');
			noteEl.className = 'note-item';
			noteEl.dataset.noteId = normalizedNote.id;

			const title = normalizedNote.title || 'Untitled';
			const preview = this.#getNotePreview(normalizedNote.content);
			const date = this.#formatDate(normalizedNote.updatedAt || normalizedNote.createdAt);

			noteEl.innerHTML = `
				<div class="note-item-title">${this.#escapeHtml(title)}</div>
				<div class="note-item-preview">${this.#escapeHtml(preview)}</div>
				<div class="note-item-date">${date}</div>
			`;

			noteEl.addEventListener('click', () => this.#openNote(normalizedNote.id));

			notesListEl.appendChild(noteEl);
		});
	}

	#loadCurrentNoteIntoEditor() {
		if (!this.titleInput || !this.contentTextarea) return;

		const rawNote = this.notes.find(n => n.id === this.currentNoteId);
		if (!rawNote) {
			// Note not found, go back to list
			this.#showListView();
			return;
		}

		// Normalize the note to fix any corrupted data
		const note = this.#normalizeNote(rawNote);

		// Ensure we're working with strings
		this.titleInput.value = note.title || '';
		this.contentTextarea.value = note.content || '';

		// Clear any save indicator
		this.#updateSaveIndicator('');
	}

	#handleInput() {
		// Clear existing timeout
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
		}
		
		// Show saving indicator
		this.#updateSaveIndicator('Saving...');
		
		// Debounce save
		this.timeoutId = setTimeout(async () => {
			await this.#saveCurrentNote();
		}, 1000);
	}

	async #saveCurrentNote() {
		if (!this.currentNoteId) return;
		
		const note = this.notes.find(n => n.id === this.currentNoteId);
		if (!note) return;
		
		// Update note data
		note.title = this.titleInput ? this.titleInput.value.trim() : '';
		note.content = this.contentTextarea ? this.contentTextarea.value : '';
		note.updatedAt = new Date().toISOString();
		
		try {
			await DBManager.saveNote(note.id, note);
			this.#updateSaveIndicator('Saved');
			
			// Move to top of list (most recently updated)
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
		const title = note ? (note.title || 'this note') : 'this note';
		
		if (!confirm(`Delete "${title}"?`)) {
			return;
		}
		
		try {
			await DBManager.deleteNote(this.currentNoteId);
			
			// Remove from local array
			this.notes = this.notes.filter(n => n.id !== this.currentNoteId);
			
			// Go back to list
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
		
		// Save any pending changes
		if (this.currentNoteId && !this.isListView) {
			this.#saveCurrentNote();
		}
	}
}

customElements.define("local-notes", LocalNotes);
