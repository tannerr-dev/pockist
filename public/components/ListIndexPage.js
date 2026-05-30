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
						<button class="btn btn-icon btn-ghost list-index-move-up ${isFirst ? 'disabled' : ''}" data-list-id="${item.id}" ${isFirst ? 'disabled' : ''} title="Move up"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg></button>
						<button class="btn btn-icon btn-ghost list-index-move-down ${isLast ? 'disabled' : ''}" data-list-id="${item.id}" ${isLast ? 'disabled' : ''} title="Move down"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>
						<button class="btn-icon-more list-index-more" data-list-id="${item.id}" title="More actions" type="button">
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
							</svg>
						</button>
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
			const btn = e.target.closest('.list-index-more');
			if (!btn) return;
			e.stopPropagation();
			await this._showListActions(btn.dataset.listId);
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

	async _showListActions(listId) {
		const listIndex = this._lists.findIndex(l => l.id === listId);
		const isFirst = listIndex === 0;
		const isLast = listIndex === this._lists.length - 1;

		const action = await DialogService.showActions([
			{ label: 'Move Up', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>', action: 'move-up' },
			{ label: 'Move Down', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>', action: 'move-down' },
			{ label: 'Merge into Another List', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>', action: 'merge' },
			{ label: 'Archive', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>', action: 'archive', danger: true }
		]);

		if (!action) return;

		try {
			if (action === 'move-up' && !isFirst) {
				await this._moveList(listId, -1);
			} else if (action === 'move-down' && !isLast) {
				await this._moveList(listId, 1);
			} else if (action === 'merge') {
				await this._doMergeList(listId);
			} else if (action === 'archive') {
				await this._archiveList(listId);
			}
		} catch (error) {
			console.error('List action error:', error);
			alert(error.message || 'Action failed');
		}
	}

	async _doMergeList(sourceId) {
		const otherLists = this._lists.filter(l => l.id !== sourceId);
		if (otherLists.length === 0) {
			alert('No other lists to merge into.');
			return;
		}

		const source = this._lists.find(l => l.id === sourceId);
		const target = await DialogService.pickItem(
			otherLists.map(l => ({ id: l.id, title: l.content || 'Unnamed List', subtitle: `${l.links?.length || 0} items` })),
			{ title: 'Merge into which list?' }
		);
		if (!target) return;

		const mode = await DialogService.showActions([
			{ label: 'Smart Merge', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>', action: 'smart' },
			{ label: 'Append All', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>', action: 'append' }
		]);
		if (!mode) return;

		await DBManager.mergeLists(target.id, sourceId, mode);
		this._lists = await DBManager.getItems({ type: 'list', archived: false });
		this._render();
		Router.go(`/list/${target.id}`);
	}

	async _archiveList(listId) {
		const item = this._lists.find(l => l.id === listId);
		const confirmed = await DialogService.confirm(
			`Archive "${item?.content || 'this list'}"?`,
			"Archive"
		);
		if (!confirmed) return;

		try {
			await DBManager.archiveItem(listId);
			this._lists = this._lists.filter(l => l.id !== listId);
			this._render();
		} catch (error) {
			console.error('[ListIndexPage] Error archiving list:', error);
		}
	}

	_escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}
}

customElements.define("pockist-list-index", ListIndexPage);
