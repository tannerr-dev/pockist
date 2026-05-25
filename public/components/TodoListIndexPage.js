import { Router } from "../services/Router.js";
import { DBManager } from "../services/DBManager.js";
import { DialogService } from "../services/DialogService.js";

export class TodoListIndexPage extends HTMLElement {
	connectedCallback() {
		const template = document.getElementById("todo-list-index-page");
		const content = template.content.cloneNode(true);
		this.appendChild(content);

		this._lists = [];
		this._init();
	}

	async _init() {
		try {
			await DBManager.init();
			await DBManager.migrateFromTodoDB();
			this._lists = await DBManager.getListMetadata();
			this._render();
			this._attachListeners();
		} catch (error) {
			console.error('[TodoListIndexPage] Init error:', error);
			this.querySelector('.lists-index-container').innerHTML = `
				<div style="padding: 20px; color: red; border: 1px solid red; margin: 10px;">
					<strong>Error loading lists:</strong><br>${error.message}
				</div>
			`;
		}
	}

	_render() {
		const container = this.querySelector('.lists-index-grid');
		const emptyState = this.querySelector('.lists-index-empty');

		if (!this._lists || this._lists.length === 0) {
			container.innerHTML = '';
			emptyState.style.display = 'flex';
			return;
		}

		emptyState.style.display = 'none';
		container.innerHTML = this._lists.map((meta, index) => {
			const total = meta.todoCount || 0;
			const isFirst = index === 0;
			const isLast = index === this._lists.length - 1;
			return `
				<div class="list-index-card ${meta.isDefault ? 'is-default' : ''}" data-list-id="${meta.id}">
					<div class="list-index-card-content">
						<div class="list-index-card-name" data-list-id="${meta.id}">${this._escapeHtml(meta.name)}</div>
						<div class="list-index-card-meta">${total} item${total !== 1 ? 's' : ''}${meta.isDefault ? ' &middot; default' : ''}</div>
					</div>
					<div class="list-index-card-actions">
						${!meta.isDefault ? `<button class="list-index-set-default" data-list-id="${meta.id}" title="Set as default">&#9734;</button>` : ''}
						<button class="list-index-move-up ${isFirst ? 'disabled' : ''}" data-list-id="${meta.id}" ${isFirst ? 'disabled' : ''} title="Move up">&#9650;</button>
						<button class="list-index-move-down ${isLast ? 'disabled' : ''}" data-list-id="${meta.id}" ${isLast ? 'disabled' : ''} title="Move down">&#9660;</button>
						<button class="list-index-delete" data-list-id="${meta.id}" title="Delete list">&times;</button>
					</div>
				</div>
			`;
		}).join('');
	}

	_attachListeners() {
		const container = this.querySelector('.lists-index-container');
		const newListBtn = this.querySelector('.lists-index-new-btn');

		// New list buttons
		newListBtn?.addEventListener('click', () => this._createList());
		const emptyNewBtn = this.querySelector('.lists-index-new-btn-empty');
		emptyNewBtn?.addEventListener('click', () => this._createList());

		// Click on card content navigates to list
		container?.addEventListener('click', (e) => {
			const card = e.target.closest('.list-index-card');
			if (!card) return;

			// If clicking actions, don't navigate
			if (e.target.closest('.list-index-card-actions')) return;

			const listId = card.dataset.listId;
			if (listId) {
				Router.go(`/list/${listId}`);
			}
		});

		// Set default
		container?.addEventListener('click', async (e) => {
			const btn = e.target.closest('.list-index-set-default');
			if (!btn) return;
			e.stopPropagation();
			await this._setDefault(btn.dataset.listId);
		});

		// Move up
		container?.addEventListener('click', async (e) => {
			const btn = e.target.closest('.list-index-move-up:not(.disabled)');
			if (!btn) return;
			e.stopPropagation();
			await this._moveList(btn.dataset.listId, -1);
		});

		// Move down
		container?.addEventListener('click', async (e) => {
			const btn = e.target.closest('.list-index-move-down:not(.disabled)');
			if (!btn) return;
			e.stopPropagation();
			await this._moveList(btn.dataset.listId, 1);
		});

		// Delete list
		container?.addEventListener('click', async (e) => {
			const btn = e.target.closest('.list-index-delete');
			if (!btn) return;
			e.stopPropagation();
			await this._deleteList(btn.dataset.listId);
		});
	}

	async _createList() {
		const name = await DialogService.prompt("Enter a name for the new list:");
		if (!name || !name.trim()) return;

		try {
			await DBManager.createList({ name: name.trim(), isDefault: false });
			this._lists = await DBManager.getListMetadata();
			this._render();
		} catch (error) {
			console.error('[TodoListIndexPage] Error creating list:', error);
		}
	}

	async _setDefault(listId) {
		try {
			await DBManager.setDefaultList(listId);
			this._lists = await DBManager.getListMetadata();
			this._render();
		} catch (error) {
			console.error('[TodoListIndexPage] Error setting default:', error);
		}
	}

	async _moveList(listId, direction) {
		const listIndex = this._lists.findIndex((l) => l.id === listId);
		if (listIndex === -1) return;

		const newIndex = listIndex + direction;
		if (newIndex < 0 || newIndex >= this._lists.length) return;

		const listA = this._lists[listIndex];
		const listB = this._lists[newIndex];

		const tempOrder = listA.order;
		listA.order = listB.order;
		listB.order = tempOrder;
		this._lists.sort((a, b) => a.order - b.order);

		try {
			await DBManager.updateListOrder(listA.id, listA.order);
			await DBManager.updateListOrder(listB.id, listB.order);
			this._render();
		} catch (error) {
			console.error('[TodoListIndexPage] Error moving list:', error);
		}
	}

	async _deleteList(listId) {
		if (this._lists.length <= 1) {
			alert("Cannot delete the last list");
			return;
		}
		const meta = this._lists.find(l => l.id === listId);
		const confirmed = await DialogService.confirm(
			`Delete "${meta?.name || 'this list'}"? This cannot be undone.`,
			"Delete"
		);
		if (!confirmed) return;

		try {
			await DBManager.deleteList(listId);
			this._lists = this._lists.filter(l => l.id !== listId);
			this._render();
		} catch (error) {
			console.error('[TodoListIndexPage] Error deleting list:', error);
		}
	}

	_escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}
}

customElements.define("todo-list-index-page", TodoListIndexPage);
