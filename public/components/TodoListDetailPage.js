import { Router } from "../services/Router.js";
import { DBManager } from "../services/DBManager.js";
import './TodoList.js';
import './ShareButton.js';

export class TodoListDetailPage extends HTMLElement {
	_timeoutId = null;
	_originalName = '';

	connectedCallback() {
		this._listId = this.params?.[0] || null;

		const template = document.getElementById("todo-list-detail-page");
		const content = template.content.cloneNode(true);

		// Set list-id before connecting so ListBase picks it up in _init
		const todoListEl = content.querySelector('todo-list');
		if (todoListEl && this._listId) {
			todoListEl.setAttribute('list-id', this._listId);
		}

		this.appendChild(content);
		this._init();
	}

	async _init() {
		if (!this._listId) {
			Router.go('/list');
			return;
		}

		try {
			await DBManager.init();
			const list = await DBManager.getList(this._listId);
			if (!list) {
				Router.go('/list');
				return;
			}
			this._listName = list.name || 'Untitled List';
			this._originalName = this._listName;

			const heading = this.querySelector('.list-detail-heading');
			if (heading) {
				heading.textContent = this._escapeHtml(this._listName);
				this._attachHeadingListeners(heading);
			}

			const backBtn = this.querySelector('.list-detail-back');
			if (backBtn) {
				backBtn.addEventListener('click', () => Router.go('/list'));
			}

			const shareBtn = this.querySelector('.list-detail-share-btn');
			if (shareBtn) {
				shareBtn.setAttribute('data-id', this._listId);
				shareBtn.setAttribute('title', this._listName);
			}
		} catch (error) {
			console.error('[TodoListDetailPage] Error loading list:', error);
		}
	}

	_attachHeadingListeners(heading) {
		// Debounced save on input
		heading.addEventListener('input', () => {
			if (this._timeoutId) {
				clearTimeout(this._timeoutId);
			}
			this._timeoutId = setTimeout(() => {
				this._saveName(heading);
			}, 1000);
		});

		// Immediate save on blur, clear pending debounce
		heading.addEventListener('blur', () => {
			if (this._timeoutId) {
				clearTimeout(this._timeoutId);
				this._timeoutId = null;
			}
			this._saveName(heading);
		});

		// Keyboard shortcuts
		heading.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				heading.blur();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				heading.textContent = this._originalName;
				if (this._timeoutId) {
					clearTimeout(this._timeoutId);
					this._timeoutId = null;
				}
				heading.blur();
			}
		});
	}

	async _saveName(heading) {
		const newName = heading.textContent.trim();
		if (!newName || newName === this._listName) {
			if (!newName) {
				heading.textContent = this._escapeHtml(this._listName);
			}
			return;
		}

		try {
			const list = await DBManager.getList(this._listId);
			if (!list) return;
			list.name = newName;
			await DBManager.saveList(list);
			this._listName = newName;
			this._originalName = newName;
		} catch (error) {
			console.error('[TodoListDetailPage] Error renaming list:', error);
			heading.textContent = this._escapeHtml(this._listName);
		}
	}

	_escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}
}

customElements.define("todo-list-detail-page", TodoListDetailPage);
