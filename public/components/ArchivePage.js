/**
 * ArchivePage - Browse, restore, and permanently delete archived items.
 *
 * Route: /archive
 * Shows archived notes, lists, and list items grouped by type.
 */
import { DBManager } from '../services/DBManager.js';
import { DialogService } from '../services/DialogService.js';
import * as Utils from '../services/Utils.js';

export class ArchivePage extends HTMLElement {
	_archivedItems = [];

	connectedCallback() {
		const template = document.getElementById('pockist-archive');
		if (!template) {
			console.error('ArchivePage: Template not found');
			return;
		}
		const content = template.content.cloneNode(true);
		this.appendChild(content);
		this._init();
	}

	async _init() {
		try {
			await DBManager.init();
			await this._loadArchivedItems();
			this._render();
			this._attachListeners();
		} catch (error) {
			console.error('[ArchivePage] Init error:', error);
		}
	}

	async _loadArchivedItems() {
		this._archivedItems = await DBManager.getItems({ archived: true });
	}

	_extractTitle(content) {
		if (!content) return 'Untitled';
		const firstLine = content.split('\n')[0].trim();
		return firstLine || 'Untitled';
	}

	_formatDate(dateString) {
		if (!dateString) return '';
		return new Date(dateString).toLocaleString();
	}

	_render() {
		const notesSection = this.querySelector('.archive-section--notes');
		const listsSection = this.querySelector('.archive-section--lists');
		const itemsSection = this.querySelector('.archive-section--items');
		const emptyState = this.querySelector('.archive-empty');
		const deleteAllBtn = this.querySelector('.archive-delete-all-btn');

		const notes = this._archivedItems.filter(i => i.type === 'note');
		const lists = this._archivedItems.filter(i => i.type === 'list');
		const items = this._archivedItems.filter(i => i.type === 'item');

		if (notes.length === 0 && lists.length === 0 && items.length === 0) {
			notesSection.style.display = 'none';
			listsSection.style.display = 'none';
			itemsSection.style.display = 'none';
			emptyState.style.display = 'flex';
			if (deleteAllBtn) deleteAllBtn.style.display = 'none';
			return;
		}

		emptyState.style.display = 'none';
		if (deleteAllBtn) deleteAllBtn.style.display = '';

		this._renderSection(notesSection, notes, 'Notes');
		this._renderSection(listsSection, lists, 'Lists');
		this._renderSection(itemsSection, items, 'List Items');
	}

	async _renderSection(sectionEl, items, title) {
		const listEl = sectionEl.querySelector('.archive-list');
		const headingEl = sectionEl.querySelector('.archive-section-heading');

		if (items.length === 0) {
			sectionEl.style.display = 'none';
			return;
		}
		sectionEl.style.display = 'block';
		headingEl.textContent = `${title} (${items.length})`;
		listEl.innerHTML = '';

		for (const item of items) {
			const row = document.createElement('div');
			row.className = 'archive-row';
			row.dataset.itemId = item.id;

			const itemTitle = item.type === 'item'
				? (item.content || 'Unnamed item')
				: this._extractTitle(item.content);

			const parentInfo = item.type === 'item'
				? await this._getParentListName(item.id)
				: '';

			row.innerHTML = `
				<div class="archive-row-info">
					<div class="archive-row-title">${Utils.escapeHtml(itemTitle)}</div>
					${parentInfo ? `<div class="archive-row-parent">${Utils.escapeHtml(parentInfo)}</div>` : ''}
					<div class="archive-row-date">${this._formatDate(item.meta?.updatedAt || item.meta?.createdAt)}</div>
				</div>
				<div class="archive-row-actions">
					<button class="btn btn-outline-secondary archive-restore-btn" type="button" data-item-id="${item.id}">Restore</button>
					<button class="btn btn-outline-danger archive-delete-btn" type="button" data-item-id="${item.id}" title="Permanently delete">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
					</button>
				</div>
			`;

			listEl.appendChild(row);
		}
	}

	async _getParentListName(itemId) {
		try {
			const allLists = await DBManager.getItems({ type: 'list', archived: false });
			for (const list of allLists) {
				if (list.links?.some(l => l.id === itemId)) {
					return `in "${list.content || 'Unnamed List'}"`;
				}
			}
		} catch (e) {
			console.error('[ArchivePage] Error finding parent:', e);
		}
		return '';
	}

	_attachListeners() {
		// Restore button clicks
		this.addEventListener('click', async (e) => {
			const restoreBtn = e.target.closest('.archive-restore-btn');
			if (restoreBtn) {
				const itemId = restoreBtn.dataset.itemId;
				if (!itemId) return;

				try {
					const item = await DBManager.getItem(itemId);
					if (!item) return;

					item.meta = { ...item.meta, archived: false, updatedAt: new Date().toISOString() };
					await DBManager.saveItem(item);
					await this._loadArchivedItems();
					this._render();
				} catch (error) {
					console.error('[ArchivePage] Restore error:', error);
					alert('Failed to restore item');
				}
				return;
			}

			// Delete button clicks
			const deleteBtn = e.target.closest('.archive-delete-btn');
			if (deleteBtn) {
				const itemId = deleteBtn.dataset.itemId;
				if (!itemId) return;
				await this._deleteItem(itemId);
				return;
			}

			// Delete all button clicks
			const deleteAllBtn = e.target.closest('.archive-delete-all-btn');
			if (deleteAllBtn) {
				await this._deleteAll();
			}
		});
	}

	async _deleteItem(itemId) {
		try {
			const item = await DBManager.getItem(itemId);
			if (!item) return;

			const title = item.type === 'item'
				? (item.content || 'Unnamed item')
				: this._extractTitle(item.content);

			const confirmed = await DialogService.confirm(
				`Permanently delete "${title}"? This cannot be undone.`,
				'Delete'
			);
			if (!confirmed) return;

			if (item.type === 'list') {
				// Delete linked items first, then the list
				const linkedItems = await DBManager.getLinkedItems(itemId);
				for (const linked of linkedItems) {
					await DBManager.hardDeleteItem(linked.id);
				}
				await DBManager.hardDeleteItem(itemId);
			} else if (item.type === 'item') {
				// Remove from any parent lists first
				const allLists = await DBManager.getItems({ type: 'list' });
				for (const list of allLists) {
					if (list.links?.some(l => l.id === itemId)) {
						list.links = list.links.filter(l => l.id !== itemId);
						list.links.forEach((l, i) => { l.order = i; });
						list.meta = { ...list.meta, updatedAt: new Date().toISOString() };
						await DBManager.saveItem(list);
					}
				}
				await DBManager.hardDeleteItem(itemId);
			} else {
				// Notes and anything else
				await DBManager.hardDeleteItem(itemId);
			}

			await this._loadArchivedItems();
			this._render();
		} catch (error) {
			console.error('[ArchivePage] Delete error:', error);
			alert('Failed to delete item');
		}
	}

	async _deleteAll() {
		if (this._archivedItems.length === 0) return;

		const count = this._archivedItems.length;
		const confirmed = await DialogService.confirm(
			`Permanently delete all ${count} archived item${count === 1 ? '' : 's'}? This cannot be undone.`,
			'Delete All'
		);
		if (!confirmed) return;

		try {
			// Get all lists first so we can efficiently clean up parent references
			const allLists = await DBManager.getItems({ type: 'list' });
			const listsToSave = new Map();

			for (const item of this._archivedItems) {
				if (item.type === 'list') {
					// Delete linked items first, then the list
					const linkedItems = await DBManager.getLinkedItems(item.id);
					for (const linked of linkedItems) {
						await DBManager.hardDeleteItem(linked.id);
					}
					await DBManager.hardDeleteItem(item.id);
				} else if (item.type === 'item') {
					// Queue parent list cleanup
					for (const list of allLists) {
						if (list.links?.some(l => l.id === item.id)) {
							const workingList = listsToSave.get(list.id) || { ...list, links: [...list.links] };
							workingList.links = workingList.links.filter(l => l.id !== item.id);
							workingList.links.forEach((l, i) => { l.order = i; });
							workingList.meta = { ...workingList.meta, updatedAt: new Date().toISOString() };
							listsToSave.set(list.id, workingList);
						}
					}
					await DBManager.hardDeleteItem(item.id);
				} else {
					await DBManager.hardDeleteItem(item.id);
				}
			}

			// Save any modified parent lists
			for (const list of listsToSave.values()) {
				await DBManager.saveItem(list);
			}

			this._archivedItems = [];
			this._render();
		} catch (error) {
			console.error('[ArchivePage] Delete all error:', error);
			alert('Failed to delete all items');
		}
	}
}

customElements.define('pockist-archive', ArchivePage);
