import { Router } from "../services/Router.js";
import { DBManager } from "../services/DBManager.js";
import { DialogService } from "../services/DialogService.js";

export class ListIndexPage extends HTMLElement {
	connectedCallback() {
		const template = document.getElementById("pockist-list-index");
		const content = template.content.cloneNode(true);
		this.appendChild(content);

		this._lists = [];
		this._init();
	}

	async _init() {
		try {
			await DBManager.init();
			await DBManager.migrateFromTodoDB();
			await DBManager.migrateToItems();
			this._lists = await DBManager.getItems({ type: 'list', archived: false });
			this._render();
			this._attachListeners();
		} catch (error) {
			console.error('[ListIndexPage] Init error:', error);
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
		container.innerHTML = this._lists.map((item, index) => {
			const total = item.links ? item.links.length : 0;
			const isFirst = index === 0;
			const isLast = index === this._lists.length - 1;
			return `
				<div class="list-index-card" data-list-id="${item.id}">
					<div class="list-index-card-content">
						<div class="list-index-card-name" data-list-id="${item.id}">${this._escapeHtml(item.content || 'Unnamed List')}</div>
						<div class="list-index-card-meta">${total} item${total !== 1 ? 's' : ''}</div>
					</div>
					<div class="list-index-card-actions">
						<button class="btn btn-icon btn-ghost list-index-move-up ${isFirst ? 'disabled' : ''}" data-list-id="${item.id}" ${isFirst ? 'disabled' : ''} title="Move up">&#9650;</button>
						<button class="btn btn-icon btn-ghost list-index-move-down ${isLast ? 'disabled' : ''}" data-list-id="${item.id}" ${isLast ? 'disabled' : ''} title="Move down">&#9660;</button>
						<button class="btn btn-icon btn-outline-danger list-index-delete" data-list-id="${item.id}" title="Delete list">&times;</button>
					</div>
				</div>
			`;
		}).join('');
	}

	_attachListeners() {
		const container = this.querySelector('.lists-index-container');
		const newListBtn = this.querySelector('.lists-index-new-btn');

		newListBtn?.addEventListener('click', () => this._createList());
		const emptyNewBtn = this.querySelector('.lists-index-new-btn-empty');
		emptyNewBtn?.addEventListener('click', () => this._createList());

		container?.addEventListener('click', async (e) => {
			const card = e.target.closest('.list-index-card');
			if (!card) return;
			if (e.target.closest('.list-index-card-actions')) return;

			const listId = card.dataset.listId;
			if (listId) {
				await DBManager.setDefaultList(listId);
				Router.go(`/list/${listId}`);
			}
		});

		container?.addEventListener('click', async (e) => {
			const btn = e.target.closest('.list-index-move-up:not(.disabled)');
			if (!btn) return;
			e.stopPropagation();
			await this._moveList(btn.dataset.listId, -1);
		});

		container?.addEventListener('click', async (e) => {
			const btn = e.target.closest('.list-index-move-down:not(.disabled)');
			if (!btn) return;
			e.stopPropagation();
			await this._moveList(btn.dataset.listId, 1);
		});

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
			await DBManager.createItem({
				type: 'list',
				content: name.trim(),
				meta: { isDefault: false, order: this._lists.length }
			});
			this._lists = await DBManager.getItems({ type: 'list', archived: false });
			this._render();
		} catch (error) {
			console.error('[ListIndexPage] Error creating list:', error);
		}
	}

	async _moveList(listId, direction) {
		const listIndex = this._lists.findIndex((l) => l.id === listId);
		if (listIndex === -1) return;

		const newIndex = listIndex + direction;
		if (newIndex < 0 || newIndex >= this._lists.length) return;

		const listA = this._lists[listIndex];
		const listB = this._lists[newIndex];

		const tempOrder = listA.meta.order;
		listA.meta = { ...listA.meta, order: listB.meta.order };
		listB.meta = { ...listB.meta, order: tempOrder };
		this._lists.sort((a, b) => a.meta.order - b.meta.order);

		try {
			await DBManager.saveItem(listA);
			await DBManager.saveItem(listB);
			this._render();
		} catch (error) {
			console.error('[ListIndexPage] Error moving list:', error);
		}
	}

	async _deleteList(listId) {
		if (this._lists.length <= 1) {
			alert("Cannot delete the last list");
			return;
		}
		const item = this._lists.find(l => l.id === listId);
		const confirmed = await DialogService.confirm(
			`Delete "${item?.content || 'this list'}"? This cannot be undone.`,
			"Delete"
		);
		if (!confirmed) return;

		try {
			await DBManager.deleteItem(listId);
			this._lists = this._lists.filter(l => l.id !== listId);
			this._render();
		} catch (error) {
			console.error('[ListIndexPage] Error deleting list:', error);
		}
	}

	_escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}
}

customElements.define("pockist-list-index", ListIndexPage);
