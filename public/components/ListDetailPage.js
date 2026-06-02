import { Router } from "../services/Router.js";
import { DBManager } from "../services/DBManager.js";
import { DialogService } from "../services/DialogService.js";
import './List.js';
import './ShareButton.js';

export class ListDetailPage extends HTMLElement {
	_timeoutId = null;
	_originalName = '';

	connectedCallback() {
		this._listId = this.params?.[0] || null;

		const template = document.getElementById("pockist-list-detail");
		const content = template.content.cloneNode(true);

		const listEl = content.querySelector('pockist-list');
		if (listEl && this._listId) {
			listEl.setAttribute('list-id', this._listId);
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
			const list = await DBManager.getItem(this._listId);
			if (!list) {
				Router.go('/list');
				return;
			}
			this._listName = list.content || 'Untitled List';
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

			const moreBtn = this.querySelector('.list-detail-more-btn');
			if (moreBtn) {
				moreBtn.addEventListener('click', () => this._showActions());
			}
		} catch (error) {
			console.error('[ListDetailPage] Error loading list:', error);
		}
	}

	async _showActions() {
		const items = await DBManager.getLinkedItems(this._listId);
		const hasCompleted = items.some(i => i.meta?.completed);

		const actions = [
			{ label: 'Duplicate List', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>', action: 'duplicate' },
			{ label: 'Merge into Another List', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>', action: 'merge' }
		];

		if (hasCompleted) {
			actions.push(
				{ label: 'Sort Complete', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>', action: 'sort-items' },
				{ label: 'Archive Complete', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>', action: 'clear-completed' }
			);
		}

		actions.push({ label: 'Archive', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>', action: 'archive', danger: true });

		const action = await DialogService.showActions(actions);

		if (!action) return;

		try {
			if (action === 'duplicate') {
				await this._doDuplicateList();
			} else if (action === 'merge') {
				await this._doMergeList();
			} else if (action === 'sort-items') {
				const listEl = this.querySelector('pockist-list');
				if (listEl) await listEl._sortItems();
			} else if (action === 'clear-completed') {
				const listEl = this.querySelector('pockist-list');
				if (listEl) await listEl._clearCompleted();
			} else if (action === 'archive') {
				await this._doArchiveList();
			}
		} catch (error) {
			console.error('[ListDetailPage] Action error:', error);
			alert(error.message || 'Action failed');
		}
	}

	async _doDuplicateList() {
		const newListId = await DBManager.duplicateList(this._listId);
		Router.go(`/list/${newListId}`);
	}

	async _doMergeList() {
		const allLists = await DBManager.getItems({ type: 'list', archived: false });
		const otherLists = allLists.filter(l => l.id !== this._listId);
		if (otherLists.length === 0) {
			alert('No other lists to merge into.');
			return;
		}

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

		await DBManager.mergeLists(target.id, this._listId, mode);
		Router.go(`/list/${target.id}`);
	}

	async _doArchiveList() {
		const confirmed = await DialogService.confirm(
			`Archive "${this._listName}"?`,
			"Archive"
		);
		if (!confirmed) return;

		await DBManager.archiveItem(this._listId);
		Router.go('/list');
	}

	_attachHeadingListeners(heading) {
		heading.addEventListener('input', () => {
			if (this._timeoutId) {
				clearTimeout(this._timeoutId);
			}
			this._timeoutId = setTimeout(() => {
				this._saveName(heading);
			}, 1000);
		});

		heading.addEventListener('blur', () => {
			if (this._timeoutId) {
				clearTimeout(this._timeoutId);
				this._timeoutId = null;
			}
			this._saveName(heading);
		});

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
			const list = await DBManager.getItem(this._listId);
			if (!list) return;
			list.content = newName;
			await DBManager.saveItem(list);
			this._listName = newName;
			this._originalName = newName;
		} catch (error) {
			console.error('[ListDetailPage] Error renaming list:', error);
			heading.textContent = this._escapeHtml(this._listName);
		}
	}

	_escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}
}

customElements.define("pockist-list-detail", ListDetailPage);
