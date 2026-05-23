/**
 * ListItem - A single list item component with edit-mode toggle.
 *
 * Default mode: checkbox + read-only text + Edit button.
 * Edit mode: editable text + reorder buttons + delete button + Done button.
 */
export class ListItem extends HTMLElement {
	_checkbox = null;
	_textEl = null;
	_moveUpBtn = null;
	_moveDownBtn = null;
	_deleteBtn = null;
	_editBtn = null;

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
			case 'index':
			case 'total':
				this._updateReorderButtons();
				break;
		}
	}

	connectedCallback() {
		this.className = `todo-item list-item ${this.completed ? 'completed' : ''}`;
		this.innerHTML = `
			<input type="checkbox" class="todo-checkbox" ${this.completed ? 'checked' : ''}>
			<span class="todo-text">${this._escapeHtml(this.text || '')}</span>
			<button class="todo-delete" aria-label="Delete todo">×</button>
			<div class="todo-reorder">
				<button class="todo-move-up" aria-label="Move up">▲</button>
				<button class="todo-move-down" aria-label="Move down">▼</button>
			</div>
			<button class="list-item-edit-btn" aria-label="Edit todo">✎</button>
		`;

		this._checkbox = this.querySelector('.todo-checkbox');
		this._textEl = this.querySelector('.todo-text');
		this._moveUpBtn = this.querySelector('.todo-move-up');
		this._moveDownBtn = this.querySelector('.todo-move-down');
		this._deleteBtn = this.querySelector('.todo-delete');
		this._editBtn = this.querySelector('.list-item-edit-btn');

		this._setupEventListeners();
		this._updateReorderButtons();
	}

	_setupEventListeners() {
		this._checkbox.addEventListener('change', () => {
			this.dispatchEvent(new CustomEvent('list-toggle', {
				bubbles: true,
				detail: { itemId: this.itemId, completed: this._checkbox.checked }
			}));
		});

		this._textEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				this._exitEditMode();
			}
		});

		this._deleteBtn.addEventListener('click', () => {
			this.dispatchEvent(new CustomEvent('list-delete', {
				bubbles: true,
				detail: { itemId: this.itemId }
			}));
		});

		this._moveUpBtn.addEventListener('click', () => {
			this.dispatchEvent(new CustomEvent('list-move-up', {
				bubbles: true,
				detail: { itemId: this.itemId }
			}));
		});

		this._moveDownBtn.addEventListener('click', () => {
			this.dispatchEvent(new CustomEvent('list-move-down', {
				bubbles: true,
				detail: { itemId: this.itemId }
			}));
		});

		this._editBtn.addEventListener('click', () => {
			if (this.classList.contains('edit-mode')) {
				this._exitEditMode();
			} else {
				this._enterEditMode();
			}
		});
	}

	_enterEditMode() {
		if (this.classList.contains('edit-mode')) return;

		this.classList.add('edit-mode');
		this._editBtn.textContent = '✓';
		this._editBtn.setAttribute('aria-label', 'Done editing');
		this._textEl.contentEditable = 'true';
		this._textEl.focus();

		// Move cursor to the end of the text
		const range = document.createRange();
		range.selectNodeContents(this._textEl);
		range.collapse(false);
		const sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);
	}

	_exitEditMode() {
		if (!this.classList.contains('edit-mode')) return;

		this.classList.remove('edit-mode');
		this._editBtn.textContent = '✎';
		this._editBtn.setAttribute('aria-label', 'Edit todo');
		this._textEl.contentEditable = 'false';

		const newText = this._textEl.textContent.trim();
		if (newText && newText !== this.text) {
			this.dispatchEvent(new CustomEvent('list-edit', {
				bubbles: true,
				detail: { itemId: this.itemId, text: newText }
			}));
		}
	}

	_updateReorderButtons() {
		const isAtTop = this.index === 0;
		const isAtBottom = this.index === this.total - 1;

		if (this._moveUpBtn) {
			this._moveUpBtn.disabled = isAtTop;
			this._moveUpBtn.classList.toggle('disabled', isAtTop);
		}
		if (this._moveDownBtn) {
			this._moveDownBtn.disabled = isAtBottom;
			this._moveDownBtn.classList.toggle('disabled', isAtBottom);
		}
	}

	_escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}
}

customElements.define('list-item', ListItem);
