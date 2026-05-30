/**
 * Notes Component
 *
 * A custom web component that provides a multi-note editor with offline storage.
 * Notes are persisted to the unified items store (v9 schema) as type='note'.
 * Title is derived from the first line of content.
 */

import { DBManager } from '../services/DBManager.js';
import { DialogService } from '../services/DialogService.js';
import { Router } from '../services/Router.js';
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
		this.editorMoreBtn = this.querySelector("#editor-more-btn");

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

		if (this.editorMoreBtn) {
			this.editorMoreBtn.addEventListener("click", () => this.#showNoteActions(this.currentNoteId));
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

			const moreBtn = document.createElement('button');
			moreBtn.className = 'btn-icon-more note-more-btn';
			moreBtn.type = 'button';
			moreBtn.title = 'More actions';
			moreBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>`;
			moreBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.#showNoteActions(note.id);
			});

			const actionsDiv = document.createElement('div');
			actionsDiv.className = 'note-item-actions';
			actionsDiv.appendChild(moreBtn);

			contentWrapper.addEventListener('click', () => this.#openNote(note.id));

			noteEl.appendChild(contentWrapper);
			noteEl.appendChild(actionsDiv);
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

	async #showNoteActions(noteId) {
		const note = this.notes.find(n => n.id === noteId);
		if (!note) return;

		const action = await DialogService.showActions([
			{ label: 'Share', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>', action: 'share' },
			{ label: 'Convert to List', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>', action: 'convert' },
			{ label: 'Move to List', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>', action: 'move-to-list' },
			{ label: 'Merge with Note', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>', action: 'merge' },
			{ label: 'Delete', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>', action: 'delete', danger: true }
		]);

		if (!action) return;

		try {
			switch (action) {
				case 'share':
					await this.#doShareNote(noteId);
					break;
				case 'convert':
					await this.#doConvertToList(noteId);
					break;
				case 'move-to-list':
					await this.#doMoveToList(noteId);
					break;
				case 'merge':
					await this.#doMergeWithNote(noteId);
					break;
				case 'delete':
					await this.#doDeleteNote(noteId);
					break;
			}
		} catch (error) {
			console.error('Note action error:', error);
			alert(error.message || 'Action failed');
		}
	}

	async #doShareNote(noteId) {
		const note = this.notes.find(n => n.id === noteId);
		if (!note) return;
		const title = this.#extractTitle(note.content);

		// Create a temporary share-button element to reuse its dialog logic
		const shareBtn = document.createElement('share-button');
		shareBtn.setAttribute('type', 'note');
		shareBtn.setAttribute('data-id', noteId);
		shareBtn.setAttribute('title', title);

		// The share-button component needs to be in the DOM for connectedCallback to run
		shareBtn.style.position = 'fixed';
		shareBtn.style.top = '-9999px';
		shareBtn.style.left = '-9999px';
		document.body.appendChild(shareBtn);

		// Give the component a tick to connect, then trigger its click
		requestAnimationFrame(() => {
			const btn = shareBtn.querySelector('button, .share-trigger-btn, [type="button"]');
			if (btn) {
				btn.click();
			} else {
				// Fallback: dispatch a click on the element itself
				shareBtn.click();
			}
			// Remove the temporary element after the dialog is spawned
			setTimeout(() => {
				if (shareBtn.parentNode) shareBtn.parentNode.removeChild(shareBtn);
			}, 100);
		});
	}

	async #doConvertToList(noteId) {
		const note = this.notes.find(n => n.id === noteId);
		const title = this.#extractTitle(note.content);
		const confirmed = await DialogService.confirm(`Convert "${title}" to a list? Each line will become an item.`, 'Convert');
		if (!confirmed) return;

		const newListId = await DBManager.convertNoteToList(noteId);
		this.notes = this.notes.filter(n => n.id !== noteId);
		this.#showListView();
		Router.go(`/list/${newListId}`);
	}

	async #doMoveToList(noteId) {
		const lists = await DBManager.getItems({ type: 'list', archived: false });
		if (lists.length === 0) {
			alert('No lists available. Create a list first.');
			return;
		}

		const note = this.notes.find(n => n.id === noteId);
		const title = this.#extractTitle(note.content);

		const target = await DialogService.pickItem(
			lists.map(l => ({ id: l.id, title: this.#extractTitle(l.content), subtitle: `${l.links?.length || 0} items` })),
			{ title: 'Move to which list?' }
		);
		if (!target) return;

		const confirmed = await DialogService.confirm(`Add "${title}" to "${this.#extractTitle(target.content)}"?`, 'Move');
		if (!confirmed) return;

		await DBManager.moveNoteToList(noteId, target.id);
		this.notes = this.notes.filter(n => n.id !== noteId);
		this.#showListView();
		Router.go(`/list/${target.id}`);
	}

	async #doMergeWithNote(sourceId) {
		const otherNotes = this.notes.filter(n => n.id !== sourceId);
		if (otherNotes.length === 0) {
			alert('No other notes to merge with.');
			return;
		}

		const source = this.notes.find(n => n.id === sourceId);
		const sourceTitle = this.#extractTitle(source.content);

		const target = await DialogService.pickItem(
			otherNotes.map(n => ({ id: n.id, title: this.#extractTitle(n.content), subtitle: this.#formatDate(n.meta?.updatedAt || n.meta?.createdAt) })),
			{ title: 'Merge into which note?' }
		);
		if (!target) return;

		const targetTitle = this.#extractTitle(target.content);
		const confirmed = await DialogService.confirm(`Merge "${sourceTitle}" into "${targetTitle}"?`, 'Merge');
		if (!confirmed) return;

		await DBManager.mergeNotes(target.id, sourceId);
		this.notes = this.notes.filter(n => n.id !== sourceId);

		if (this.currentNoteId === sourceId) {
			this.currentNoteId = target.id;
			const targetNote = this.notes.find(n => n.id === target.id);
			if (targetNote) {
				this.contentTextarea.value = targetNote.content || '';
				this.#updateSaveIndicator('Merged');
			} else {
				// Reload notes and open target
				this.notes = await DBManager.getItems({ type: 'note', archived: false });
				this.#sortNotes();
				this.currentNoteId = target.id;
				this.#loadCurrentNoteIntoEditor();
			}
		} else {
			this.notes = await DBManager.getItems({ type: 'note', archived: false });
			this.#sortNotes();
			this.#renderNoteList();
		}
	}

	async #doDeleteNote(noteId) {
		const note = this.notes.find(n => n.id === noteId);
		const title = note ? this.#extractTitle(note.content) : 'this note';
		const confirmed = await DialogService.confirm(`Delete "${title}"?`, 'Delete');
		if (!confirmed) return;

		await DBManager.deleteItem(noteId);
		this.notes = this.notes.filter(n => n.id !== noteId);

		if (this.currentNoteId === noteId) {
			this.#showListView();
		} else {
			this.#renderNoteList();
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
