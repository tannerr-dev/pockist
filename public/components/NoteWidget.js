/**
 * NoteWidget - Paginated note widget for the homepage.
 *
 * Fixed-height 8-item viewport with Up / Down navigation buttons.
 * Extends NoteBase for shared loading, sorting, and action logic.
 */
import { NoteBase } from './NoteBase.js';
import { Router } from '../services/Router.js';

export class NoteWidget extends NoteBase {
	#offset = 0;
	#navContainer = null;
	#itemsContainer = null;

	_getTemplateId() {
		return 'pockist-note-widget';
	}

	connectedCallback() {
		super.connectedCallback();
		this.#navContainer = this.querySelector('.note-widget-nav-container');
		this.#itemsContainer = this.querySelector('.note-widget-items');
	}

	_setupEventListeners() {
		// New note button
		const newNoteBtn = this.querySelector('.note-widget-new-btn');
		newNoteBtn?.addEventListener('click', () => this._createNewNote());

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
			this.#itemsContainer.innerHTML = '<div class="note-widget-empty">No notes yet.</div>';
			this.#renderNav(0, 0);
			return;
		}

		const total = this._notes.length;
		this.#clampOffset();
		const clampedOffset = this.#offset;
		const startIndex = clampedOffset;
		const endIndex = Math.min(clampedOffset + 8, total);
		const visibleNotes = this._notes.slice(startIndex, endIndex);

		visibleNotes.forEach(note => {
			const el = this._createNoteItem(note);
			this.#itemsContainer.appendChild(el);
		});

		this.#renderNav(total, clampedOffset);
	}

	_createNoteItem(note) {
		const el = document.createElement('note-item');
		el.setAttribute('note-id', note.id);
		el.setAttribute('title', this._extractTitle(note.content));
		el.setAttribute('preview', this._getPreview(note.content));
		el.setAttribute('date', this._formatDate(note.meta?.updatedAt || note.meta?.createdAt));
		return el;
	}

	#clampOffset() {
		const total = this._notes.length || 0;
		if (total <= 8) {
			this.#offset = 0;
		} else {
			const maxOffset = total - 8;
			this.#offset = Math.max(0, Math.min(this.#offset, maxOffset));
		}
	}

	#computeOffsetForIndex(index) {
		const total = this._notes.length || 0;
		if (total <= 8) return 0;
		return Math.max(0, Math.min(index - 3, total - 8));
	}

	#createNavButton(direction) {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'note-widget-nav-btn btn btn-ghost';
		const svg = direction === -1
			? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>'
			: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
		btn.innerHTML = svg + (direction === -1 ? ' Up' : ' Down');
		return btn;
	}

	#renderNav(total, offset) {
		if (!this.#navContainer) return;
		this.#navContainer.innerHTML = '';

		if (total <= 8) return;

		const maxOffset = total - 8;

		const upBtn = this.#createNavButton(-1);
		upBtn.disabled = offset === 0;
		upBtn.addEventListener('click', () => {
			this.#offset = Math.max(0, this.#offset - 2);
			this._renderContent();
		});

		const downBtn = this.#createNavButton(1);
		downBtn.disabled = offset >= maxOffset;
		downBtn.addEventListener('click', () => {
			const remaining = maxOffset - this.#offset;
			const step = remaining >= 2 ? 2 : remaining;
			this.#offset += step;
			this._renderContent();
		});

		this.#navContainer.appendChild(upBtn);
		this.#navContainer.appendChild(downBtn);
	}

}

customElements.define('pockist-note-widget', NoteWidget);
