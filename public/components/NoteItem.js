import * as Utils from '../services/Utils.js';
// import '../services/js'


/**
 * NoteItem - Leaf component for a single note row.
 *
 * Dispatches:
 *   note-open        — bubbled, detail: { noteId }
 *   note-more-actions — bubbled, detail: { noteId }
 */
export class NoteItem extends HTMLElement {
	static get observedAttributes() {
		return ['note-id', 'title', 'preview', 'date'];
	}

	connectedCallback() {
		this._render();
	}

	attributeChangedCallback() {
		this._render();
	}

	_render() {
		const noteId = this.getAttribute('note-id') || '';
		const title = this.getAttribute('title') || 'Untitled';
		const preview = this.getAttribute('preview') || '';
		const date = this.getAttribute('date') || '';

		this.innerHTML = '';
		this.className = 'note-item';
		this.dataset.noteId = noteId;

		const contentWrapper = document.createElement('div');
		contentWrapper.className = 'note-item-content';
		contentWrapper.innerHTML = `
			<div class="note-item-title">${Utils.escapeHtml(title)}</div>
			<div class="note-item-preview">${Utils.escapeHtml(preview)}</div>
			<div class="note-item-date">${Utils.escapeHtml(date)}</div>
		`;

		const moreBtn = document.createElement('button');
		moreBtn.className = 'btn-icon-more note-more-btn';
		moreBtn.type = 'button';
		moreBtn.title = 'More actions';
		moreBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>`;

		const actionsDiv = document.createElement('div');
		actionsDiv.className = 'note-item-actions';
		actionsDiv.appendChild(moreBtn);

		contentWrapper.addEventListener('click', () => {
			this.dispatchEvent(new CustomEvent('note-open', {
				bubbles: true,
				detail: { noteId }
			}));
		});

		moreBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.dispatchEvent(new CustomEvent('note-more-actions', {
				bubbles: true,
				detail: { noteId }
			}));
		});

		this.appendChild(contentWrapper);
		this.appendChild(actionsDiv);
	}
}

customElements.define('note-item', NoteItem);
