/**
 * ArchivePage - Browse and restore archived items.
 *
 * Route: /archive
 * Shows archived notes, lists, and list items grouped by type.
 */
import { DBManager } from '../services/DBManager.js';
import { DialogService } from '../services/DialogService.js';

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

		const notes = this._archivedItems.filter(i => i.type === 'note');
		const lists = this._archivedItems.filter(i => i.type === 'list');
		const items = this._archivedItems.filter(i => i.type === 'item');

		if (notes.length === 0 && lists.length === 0 && items.length === 0) {
			notesSection.style.display = 'none';
			listsSection.style.display = 'none';
			itemsSection.style.display = 'none';
			emptyState.style.display = 'flex';
			return;
		}

		emptyState.style.display = 'none';

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

			const title = item.type === 'item'
				? (item.content || 'Unnamed item')
				: this._extractTitle(item.content);

			const parentInfo = item.type === 'item'
				? await this._getParentListName(item.id)
				: '';

			row.innerHTML = `
				<div class="archive-row-info">
					<div class="archive-row-title">${this._escapeHtml(title)}</div>
					${parentInfo ? `<div class="archive-row-parent">${this._escapeHtml(parentInfo)}</div>` : ''}
					<div class="archive-row-date">${this._formatDate(item.meta?.updatedAt || item.meta?.createdAt)}</div>
				</div>
				<button class="btn btn-outline-secondary archive-restore-btn" type="button" data-item-id="${item.id}">Restore</button>
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
		this.addEventListener('click', async (e) => {
			const btn = e.target.closest('.archive-restore-btn');
			if (!btn) return;

			const itemId = btn.dataset.itemId;
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
		});
	}

	_escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}
}

customElements.define('pockist-archive', ArchivePage);
