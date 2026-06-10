import { Router } from "../services/Router.js";
import { DBManager } from "../services/DBManager.js";
import { DialogService } from "../services/DialogService.js";
import { DraggableList } from "../services/DraggableList.js";
import * as Utils from '../services/Utils.js';

export class ListIndexPage extends HTMLElement {
	_lists = [];
	#draggableList = null;

	connectedCallback() {
		const template = document.getElementById("pockist-list-index");
		const content = template.content.cloneNode(true);
		this.appendChild(content);

		this._init();
	}

	disconnectedCallback() {
		if (this.#draggableList) {
			this.#draggableList.destroy();
			this.#draggableList = null;
		}
	}

	async _init() {
		try {
			await DBManager.init();
			await DBManager.migrateFromTodoDB();
			await DBManager.migrateToItems();
			this._lists = await DBManager.getItems({ type: 'list', archived: false });
			this._lists.sort((a, b) => (a.meta?.order || 0) - (b.meta?.order || 0));
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

		const dragHandleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="18" x2="16" y2="18"/></svg>`;

		container.innerHTML = this._lists.map((item) => {
			const total = item.links ? item.links.length : 0;
			return `
				<div class="list-index-card" data-list-id="${item.id}">
					<div class="list-index-card-content">
						<div class="list-index-card-name" data-list-id="${item.id}">${Utils.escapeHtml(item.content || 'Unnamed List')}</div>
						<div class="list-index-card-meta">${total} item${total !== 1 ? 's' : ''}</div>
					</div>
					<span class="drag-hint list-index-drag-hint" aria-hidden="true">${dragHandleSvg}</span>
					<div class="list-index-card-actions">
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
			const btn = e.target.closest('.list-index-more');
			if (!btn) return;
			e.stopPropagation();
			await this._showListActions(btn.dataset.listId);
		});

		// Initialize drag-and-drop
		const grid = this.querySelector('.lists-index-grid');
		if (grid && this._lists.length > 1) {
			this.#draggableList = new DraggableList(grid, {
				itemSelector: '.list-index-card',
				handleSelector: '.drag-hint',
				onReorder: async (oldIndex, newIndex) => {
					await this._reorderList(oldIndex, newIndex);
				}
			});
		}
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
			this._lists.sort((a, b) => (a.meta?.order || 0) - (b.meta?.order || 0));
			this._render();
			this.#reinitDraggableList();
		} catch (error) {
			console.error('[ListIndexPage] Error creating list:', error);
		}
	}

	async _reorderList(oldIndex, newIndex) {
		if (oldIndex === newIndex || oldIndex < 0 || oldIndex >= this._lists.length || newIndex < 0 || newIndex >= this._lists.length) return;

		const [moved] = this._lists.splice(oldIndex, 1);
		this._lists.splice(newIndex, 0, moved);
		this._lists.forEach((list, idx) => {
			list.meta = { ...list.meta, order: idx, updatedAt: new Date().toISOString() };
		});

		try {
			for (const list of this._lists) {
				await DBManager.saveItem(list);
			}
			this._render();
			this.#reinitDraggableList();
		} catch (error) {
			console.error('[ListIndexPage] Error reordering lists:', error);
			this._lists = await DBManager.getItems({ type: 'list', archived: false });
			this._lists.sort((a, b) => (a.meta?.order || 0) - (b.meta?.order || 0));
			this._render();
			this.#reinitDraggableList();
		}
	}

	async _moveListToTop(listId) {
		const index = this._lists.findIndex((l) => l.id === listId);
		if (index <= 0) return;

		const [moved] = this._lists.splice(index, 1);
		this._lists.unshift(moved);
		this._lists.forEach((list, idx) => {
			list.meta = { ...list.meta, order: idx, updatedAt: new Date().toISOString() };
		});

		try {
			for (const list of this._lists) {
				await DBManager.saveItem(list);
			}
			this._render();
			this.#reinitDraggableList();
		} catch (error) {
			console.error('[ListIndexPage] Error moving list to top:', error);
			this._lists = await DBManager.getItems({ type: 'list', archived: false });
			this._lists.sort((a, b) => (a.meta?.order || 0) - (b.meta?.order || 0));
			this._render();
			this.#reinitDraggableList();
		}
	}

	async _moveListToBottom(listId) {
		const index = this._lists.findIndex((l) => l.id === listId);
		if (index === -1 || index === this._lists.length - 1) return;

		const [moved] = this._lists.splice(index, 1);
		this._lists.push(moved);
		this._lists.forEach((list, idx) => {
			list.meta = { ...list.meta, order: idx, updatedAt: new Date().toISOString() };
		});

		try {
			for (const list of this._lists) {
				await DBManager.saveItem(list);
			}
			this._render();
			this.#reinitDraggableList();
		} catch (error) {
			console.error('[ListIndexPage] Error moving list to bottom:', error);
			this._lists = await DBManager.getItems({ type: 'list', archived: false });
			this._lists.sort((a, b) => (a.meta?.order || 0) - (b.meta?.order || 0));
			this._render();
			this.#reinitDraggableList();
		}
	}

	async _showListActions(listId) {
		const listIndex = this._lists.findIndex(l => l.id === listId);
		const isFirst = listIndex === 0;
		const isLast = listIndex === this._lists.length - 1;

		const action = await DialogService.showActions([
			{ label: 'Move to Top', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="20" y2="4"/><polyline points="18 10 12 4 6 10"/></svg>', action: 'move-top' },
			{ label: 'Move to Bottom', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="20" x2="20" y2="20"/><polyline points="6 14 12 20 18 14"/></svg>', action: 'move-bottom' },
			{ label: 'Duplicate List', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>', action: 'duplicate' },
			{ label: 'Merge into Another List', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>', action: 'merge' },
			{ label: 'Archive', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>', action: 'archive', danger: true }
		]);

		if (!action) return;

		try {
			if (action === 'move-top' && !isFirst) {
				await this._moveListToTop(listId);
			} else if (action === 'move-bottom' && !isLast) {
				await this._moveListToBottom(listId);
			} else if (action === 'duplicate') {
				await this._doDuplicateList(listId);
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
		this._lists.sort((a, b) => (a.meta?.order || 0) - (b.meta?.order || 0));
		this._render();
		this.#reinitDraggableList();
		Router.go(`/list/${target.id}`);
	}

	async _doDuplicateList(listId) {
		try {
			const newListId = await DBManager.duplicateList(listId);
			this._lists = await DBManager.getItems({ type: 'list', archived: false });
			this._lists.sort((a, b) => (a.meta?.order || 0) - (b.meta?.order || 0));
			this._render();
			this.#reinitDraggableList();
			Router.go(`/list/${newListId}`);
		} catch (error) {
			console.error('[ListIndexPage] Error duplicating list:', error);
			alert('Failed to duplicate list');
		}
	}

	async _archiveList(listId) {
		try {
			await DBManager.archiveItem(listId);
			this._lists = this._lists.filter(l => l.id !== listId);
			this._render();
			this.#reinitDraggableList();
		} catch (error) {
			console.error('[ListIndexPage] Error archiving list:', error);
		}
	}

	#reinitDraggableList() {
		if (this.#draggableList) {
			this.#draggableList.destroy();
			this.#draggableList = null;
		}
		const grid = this.querySelector('.lists-index-grid');
		if (grid && this._lists.length > 1) {
			this.#draggableList = new DraggableList(grid, {
				itemSelector: '.list-index-card',
				handleSelector: '.drag-hint',
				onReorder: async (oldIndex, newIndex) => {
					await this._reorderList(oldIndex, newIndex);
				}
			});
		}
	}
}

customElements.define("pockist-list-index", ListIndexPage);
