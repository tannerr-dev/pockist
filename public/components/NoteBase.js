/**
 * NoteBase - Abstract base class for note views (widget, index).
 *
 * Shared logic: loading, sorting, utilities, action handlers.
 * Subclasses implement:
 *   _getTemplateId()       → template id string
 *   _renderContent()       → render notes into the container
 *   _setupEventListeners() → attach UI event listeners
 */
import { DBManager } from '../services/DBManager.js';
import { DialogService } from '../services/DialogService.js';
import { Router } from '../services/Router.js';
import './NoteItem.js';
import './ShareButton.js';

export class NoteBase extends HTMLElement {
	_notes = [];
	_sortMode = 'updated-desc';
	_timeoutId = null;
	_isListView = true;

	connectedCallback() {
		const templateId = this._getTemplateId();
		const template = document.getElementById(templateId);
		if (!template) {
			console.error(`NoteBase: Template with id '${templateId}' not found`);
			return;
		}
		const content = template.content.cloneNode(true);
		this.appendChild(content);

		this._init();
	}

	async _init() {
		try {
			await DBManager.init();
			this._notes = await DBManager.getItems({ type: 'note', archived: false });
			this._sortNotes();
			this._renderContent();
			this._setupEventListeners();
		} catch (error) {
			console.error('Error initializing notes:', error);
			this._notes = [];
			this._renderContent();
			this._setupEventListeners();
		}
	}

	// ------------------------------------------------------------------
	// Sorting
	// ------------------------------------------------------------------
	_sortNotes() {
		const mode = this._sortMode;
		this._notes.sort((a, b) => {
			if (mode === 'title-asc') {
				const titleA = (this._extractTitle(a.content) || '').toLowerCase();
				const titleB = (this._extractTitle(b.content) || '').toLowerCase();
				return titleA.localeCompare(titleB);
			}
			if (mode === 'created-asc') {
				const dateA = new Date(a.meta?.createdAt || 0);
				const dateB = new Date(b.meta?.createdAt || 0);
				return dateA - dateB;
			}
			// updated-desc (default) and created-desc both use updatedAt, falling back to createdAt
			const dateA = new Date(a.meta?.updatedAt || a.meta?.createdAt || 0);
			const dateB = new Date(b.meta?.updatedAt || b.meta?.createdAt || 0);
			return dateB - dateA;
		});
	}

	_setSortMode(mode) {
		if (this._sortMode === mode) return;
		this._sortMode = mode;
		this._sortNotes();
		this._renderContent();
	}

	// ------------------------------------------------------------------
	// Utilities
	// ------------------------------------------------------------------
	_extractTitle(content) {
		if (!content) return 'Untitled';
		const firstLine = content.split('\n')[0].trim();
		return firstLine || 'Untitled';
	}

	_getPreview(content, maxLength = 60) {
		if (!content) return '';
		const text = content.replace(/\n/g, ' ').trim();
		if (text.length <= maxLength) return text;
		return text.slice(0, maxLength) + '...';
	}

	_formatDate(dateString) {
		if (!dateString) return '';
		return new Date(dateString).toLocaleString();
	}

	_generateNoteId(content) {
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

	_escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	// ------------------------------------------------------------------
	// CRUD helpers
	// ------------------------------------------------------------------
	async _createNewNote() {
		const now = new Date().toISOString();
		const newNote = {
			id: this._generateNoteId(''),
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

		this._notes.unshift(newNote);
		try {
			await DBManager.saveItem(newNote);
		} catch (error) {
			console.error('Error creating new note:', error);
		}
		Router.go(`/note/${newNote.id}`);
	}

	async _createNoteWithContent(content) {
		const now = new Date().toISOString();
		const newNote = {
			id: this._generateNoteId(content),
			type: 'note',
			content: content,
			links: [],
			meta: {
				createdAt: now,
				updatedAt: now,
				archived: false,
				completed: false
			}
		};
		this._notes.unshift(newNote);
		try {
			await DBManager.saveItem(newNote);
		} catch (error) {
			console.error('Error creating note:', error);
		}
		return newNote;
	}

	async _reloadNotes() {
		this._notes = await DBManager.getItems({ type: 'note', archived: false });
		this._sortNotes();
		this._renderContent();
	}

	// ------------------------------------------------------------------
	// Shared action handlers
	// ------------------------------------------------------------------
	async _showNoteActions(noteId) {
		const note = this._notes.find(n => n.id === noteId);
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
					await this._doShareNote(noteId);
					break;
				case 'convert':
					await this._doConvertToList(noteId);
					break;
				case 'move-to-list':
					await this._doMoveToList(noteId);
					break;
				case 'merge':
					await this._doMergeWithNote(noteId);
					break;
				case 'delete':
					await this._doDeleteNote(noteId);
					break;
			}
		} catch (error) {
			console.error('Note action error:', error);
			alert(error.message || 'Action failed');
		}
	}

	async _doShareNote(noteId) {
		const note = this._notes.find(n => n.id === noteId);
		if (!note) return;
		const title = this._extractTitle(note.content);

		const shareBtn = document.createElement('share-button');
		shareBtn.setAttribute('type', 'note');
		shareBtn.setAttribute('data-id', noteId);
		shareBtn.setAttribute('title', title);
		shareBtn.style.position = 'fixed';
		shareBtn.style.top = '-9999px';
		shareBtn.style.left = '-9999px';
		document.body.appendChild(shareBtn);

		requestAnimationFrame(() => {
			const btn = shareBtn.querySelector('button, .share-trigger-btn, [type="button"]');
			if (btn) {
				btn.click();
			} else {
				shareBtn.click();
			}
			setTimeout(() => {
				if (shareBtn.parentNode) shareBtn.parentNode.removeChild(shareBtn);
			}, 100);
		});
	}

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

	async _doDeleteNote(noteId) {
		const note = this._notes.find(n => n.id === noteId);
		const title = note ? this._extractTitle(note.content) : 'this note';
		const confirmed = await DialogService.confirm(`Delete "${title}"?`, 'Delete');
		if (!confirmed) return;

		await DBManager.deleteItem(noteId);
		await this._reloadNotes();
	}

	// ------------------------------------------------------------------
	// Abstract methods — subclasses must implement
	// ------------------------------------------------------------------
	_getTemplateId() {
		throw new Error('NoteBase subclasses must implement _getTemplateId()');
	}
	_renderContent() {
		throw new Error('NoteBase subclasses must implement _renderContent()');
	}
	_setupEventListeners() {
		throw new Error('NoteBase subclasses must implement _setupEventListeners()');
	}
}
