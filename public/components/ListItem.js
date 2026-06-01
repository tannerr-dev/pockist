import { DialogService } from '../services/DialogService.js';

/**
 * ListItem - A single list item component.
 *
 * Tapping the text opens a dialog for editing.
 * Hold the drag handle to reorder via drag-and-drop.
 */
export class ListItem extends HTMLElement {
	_checkbox = null;
	_textEl = null;
	_moreBtn = null;
	_resizeObserver = null;

	static get observedAttributes() {
		return ['item-id', 'text', 'completed', 'index', 'total'];
	}

	get itemId() { return this.getAttribute('item-id'); }
	set itemId(v) { this.setAttribute('item-id', v); }

	get text() { return this.getAttribute('text'); }
	set text(v) { this.setAttribute('text', v); }

	get completed() { return this.hasAttribute('completed'); }
	set completed(v) { this.toggleAttribute('completed', v); }

	get index() {
		return parseInt(this.getAttribute('index') || '0', 10);
	}
	set index(v) { this.setAttribute('index', String(v)); }

	get total() {
		return parseInt(this.getAttribute('total') || '1', 10);
	}
	set total(v) { this.setAttribute('total', String(v)); }

	attributeChangedCallback(name, oldVal, newVal) {
		if (oldVal === newVal) return;
		switch (name) {
			case 'text':
				if (this._textEl) this._textEl.textContent = newVal;
				break;
			case 'completed':
				this.classList.toggle('completed', this.completed);
				if (this._checkbox) this._checkbox.checked = this.completed;
				break;
		}
	}

	connectedCallback() {
		const dragHandleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="18" x2="16" y2="18"/></svg>`;
		this.className = `item-row list-item ${this.completed ? 'completed' : ''}`;
		this.innerHTML = `
			<input type="checkbox" class="item-checkbox" ${this.completed ? 'checked' : ''}>
			<span class="item-text">${this._escapeHtml(this.text || '')}</span>
			<span class="drag-hint item-drag-hint" aria-hidden="true">${dragHandleSvg}</span>
			<button class="btn-icon-more item-more" aria-label="More actions" type="button">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
				</svg>
			</button>
		`;

		this._checkbox = this.querySelector('.item-checkbox');
		this._textEl = this.querySelector('.item-text');
		this._moreBtn = this.querySelector('.item-more');

		this._setupEventListeners();
		this._checkOverflow();

		this._resizeObserver = new ResizeObserver(() => this._checkOverflow());
		if (this._textEl) this._resizeObserver.observe(this._textEl);
	}

	disconnectedCallback() {
		if (this._resizeObserver) {
			this._resizeObserver.disconnect();
			this._resizeObserver = null;
		}
	}

	_setupEventListeners() {
		this._checkbox.addEventListener('change', () => {
			this.dispatchEvent(new CustomEvent('list-toggle', {
				bubbles: true,
				detail: { itemId: this.itemId, completed: this._checkbox.checked }
			}));
		});

		this._moreBtn.addEventListener('click', () => {
			this.dispatchEvent(new CustomEvent('list-more-actions', {
				bubbles: true,
				detail: { itemId: this.itemId }
			}));
		});

		this._textEl.addEventListener('click', () => {
			this._openEditDialog();
		});
	}

	_checkOverflow() {
		if (!this._textEl) return;
		const isOverflowing = this._textEl.scrollHeight > this._textEl.clientHeight;
		this.classList.toggle('is-overflowing', isOverflowing);
	}

	async _openEditDialog() {
		await DialogService.promptTextarea('Edit item', this.text || '', (value) => {
			if (value && value !== this.text) {
				this.dispatchEvent(new CustomEvent('list-edit', {
					bubbles: true,
					detail: { itemId: this.itemId, text: value }
				}));
			}
		});
	}

	_escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}
}

customElements.define('list-item', ListItem);
