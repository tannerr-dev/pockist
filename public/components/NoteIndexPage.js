/**
 * NoteIndexPage - Full note index page at /note.
 *
 * Shows all notes with sort controls. Search input structurally ready (not wired yet).
 * Extends NoteBase for shared loading, sorting, and action logic.
 */
import { NoteBase } from './NoteBase.js';
import { DBManager } from '../services/DBManager.js';
import { DialogService } from '../services/DialogService.js';
import { Router } from '../services/Router.js';

export class NoteIndexPage extends NoteBase {
	#itemsContainer = null;
	#countEl = null;
	#emptyState = null;

	_getTemplateId() {
		return 'pockist-note-index';
	}

	connectedCallback() {
		super.connectedCallback();
		this.#itemsContainer = this.querySelector('.note-index-items');
		this.#countEl = this.querySelector('.note-index-count');
		this.#emptyState = this.querySelector('.note-index-empty');
	}

	_setupEventListeners() {
		// New note button
		const newNoteBtn = this.querySelector('.note-index-new-btn');
		newNoteBtn?.addEventListener('click', () => this._createNewNote());

		// Empty state new note button
		const emptyNewBtn = this.querySelector('.note-index-empty-new-btn');
		emptyNewBtn?.addEventListener('click', () => this._createNewNote());

		// Sort select
		const sortSelect = this.querySelector('.note-index-sort');
		if (sortSelect) {
			sortSelect.value = this._sortMode;
			sortSelect.addEventListener('change', () => {
				this._setSortMode(sortSelect.value);
			});
		}

		// Note open / more-actions delegation
		this.#itemsContainer?.addEventListener('note-open', (e) => {
			Router.go(`/note/${e.detail.noteId}`);
		});
		this.#itemsContainer?.addEventListener('note-more-actions', (e) => {
			this._showNoteActions(e.detail.noteId);
		});
	}

	_renderContent() {
		if (!this.#itemsContainer) return;
		this.#itemsContainer.innerHTML = '';

		if (this._notes.length === 0) {
			if (this.#emptyState) this.#emptyState.style.display = 'flex';
			this.#itemsContainer.style.display = 'none';
			if (this.#countEl) this.#countEl.textContent = '0 notes';
			return;
		}

		if (this.#emptyState) this.#emptyState.style.display = 'none';
		this.#itemsContainer.style.display = 'flex';

		const count = this._notes.length;
		if (this.#countEl) {
			this.#countEl.textContent = `${count} note${count !== 1 ? 's' : ''}`;
		}

		this._notes.forEach(note => {
			const el = this._createNoteItem(note);
			this.#itemsContainer.appendChild(el);
		});
	}

	_createNoteItem(note) {
		const el = document.createElement('note-item');
		el.setAttribute('note-id', note.id);
		el.setAttribute('title', this._extractTitle(note.content));
		el.setAttribute('preview', this._getPreview(note.content));
		el.setAttribute('date', this._formatDate(note.meta?.updatedAt || note.meta?.createdAt));
		return el;
	}

	// Override action handlers to re-fetch after destructive actions
	async _doConvertToList(noteId) {
		const note = this._notes.find(n => n.id === noteId);
		const title = this._extractTitle(note.content);
		const confirmed = await DialogService.confirm(`Convert "${title}" to a list? Each line will become an item.`, 'Convert');
		if (!confirmed) return;

		const newListId = await DBManager.convertNoteToList(noteId);
		await this._reloadNotes();
		Router.go(`/list/${newListId}`);
	}

	async _doMoveToList(noteId) {
		const lists = await DBManager.getItems({ type: 'list', archived: false });
		if (lists.length === 0) {
			alert('No lists available. Create a list first.');
			return;
		}

		const note = this._notes.find(n => n.id === noteId);
		const title = this._extractTitle(note.content);

		const target = await DialogService.pickItem(
			lists.map(l => ({ id: l.id, title: this._extractTitle(l.content), subtitle: `${l.links?.length || 0} items` })),
			{ title: 'Move to which list?' }
		);
		if (!target) return;

		const confirmed = await DialogService.confirm(`Add "${title}" to "${this._extractTitle(target.content)}"?`, 'Move');
		if (!confirmed) return;

		await DBManager.moveNoteToList(noteId, target.id);
		await this._reloadNotes();
		Router.go(`/list/${target.id}`);
	}

	async _doMergeWithNote(sourceId) {
		const otherNotes = this._notes.filter(n => n.id !== sourceId);
		if (otherNotes.length === 0) {
			alert('No other notes to merge with.');
			return;
		}

		const source = this._notes.find(n => n.id === sourceId);
		const sourceTitle = this._extractTitle(source.content);

		const target = await DialogService.pickItem(
			otherNotes.map(n => ({ id: n.id, title: this._extractTitle(n.content), subtitle: this._formatDate(n.meta?.updatedAt || n.meta?.createdAt) })),
			{ title: 'Merge into which note?' }
		);
		if (!target) return;

		const targetTitle = this._extractTitle(target.content);
		const confirmed = await DialogService.confirm(`Merge "${sourceTitle}" into "${targetTitle}"?`, 'Merge');
		if (!confirmed) return;

		await DBManager.mergeNotes(target.id, sourceId);
		await this._reloadNotes();
	}

	async _doArchiveNote(noteId) {
		await DBManager.archiveItem(noteId);
		await this._reloadNotes();
	}
}

customElements.define('pockist-note-index', NoteIndexPage);
