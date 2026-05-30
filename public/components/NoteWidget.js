/**
 * NoteWidget - Paginated note widget for the homepage.
 *
 * Fixed-height 5-item viewport with Up / Down navigation buttons.
 * Extends NoteBase for shared loading, sorting, and action logic.
 */
import { NoteBase } from './NoteBase.js';
import { DialogService } from '../services/DialogService.js';
import { Router } from '../services/Router.js';

export class NoteWidget extends NoteBase {
	#offset = 0;
	#navContainer = null;
	#itemsContainer = null;
	#upBtn = null;
	#downBtn = null;

	_getTemplateId() {
		return 'pockist-note-widget';
	}

	connectedCallback() {
		super.connectedCallback();
		this.#navContainer = this.querySelector('.note-widget-nav-container');
		this.#itemsContainer = this.querySelector('.note-widget-items');
	}

	_setupEventListeners() {
		const newNoteBtn = this.querySelector('.note-widget-new-btn');
		newNoteBtn?.addEventListener('click', async () => {
			const content = await DialogService.prompt('Start your new note:');
			if (!content || !content.trim()) return;
			await this._createNoteWithContent(content.trim());
			this.#offset = 0;
			this._renderContent();
		});

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
		const endIndex = Math.min(clampedOffset + 5, total);
		const visibleNotes = this._notes.slice(startIndex, endIndex);

		visibleNotes.forEach(note => {
			const el = this._createNoteItem(note);
			el.classList.add('note-item--enter');
			this.#itemsContainer.appendChild(el);
			requestAnimationFrame(() => {
				el.classList.remove('note-item--enter');
			});
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
		if (total <= 5) {
			this.#offset = 0;
		} else {
			const maxOffset = total - 5;
			this.#offset = Math.max(0, Math.min(this.#offset, maxOffset));
		}
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

		if (total <= 5) {
			this.#navContainer.innerHTML = '';
			this.#upBtn = null;
			this.#downBtn = null;
			return;
		}

		const maxOffset = total - 5;

		// Create once, update disabled state on subsequent renders
		if (!this.#upBtn) {
			this.#upBtn = this.#createNavButton(-1);
			this.#upBtn.addEventListener('click', () => {
				this.#offset = Math.max(0, this.#offset - 1);
				this._renderContent();
			});
			this.#navContainer.appendChild(this.#upBtn);
		}
		if (!this.#downBtn) {
			this.#downBtn = this.#createNavButton(1);
			this.#downBtn.addEventListener('click', () => {
				this.#offset = Math.min(maxOffset, this.#offset + 1);
				this._renderContent();
			});
			this.#navContainer.appendChild(this.#downBtn);
		}

		this.#upBtn.disabled = offset === 0;
		this.#downBtn.disabled = offset >= maxOffset;
	}
}

customElements.define('pockist-note-widget', NoteWidget);
