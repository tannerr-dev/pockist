import { Router } from "../services/Router.js";
import { DBManager } from "../services/DBManager.js";
import { DialogService } from "../services/DialogService.js";
import { ListItem } from "./ListItem.js";

/**
 * ListBase - Abstract base class for list components.
 *
 * Works directly with the unified items store (v9 schema).
 * Lists are items with type='list', linked items are resolved via links[] array.
 */
export class ListBase extends HTMLElement {
	// Shared state
	_listItems = [];
	_currentListItem = null;
	_currentListId = null;
	_linkedItems = [];
	_initialized = false;

	// DOM refs
	_containerEl = null;
	_listSelectorBtn = null;
	_listsContainerEl = null;
	_inputEl = null;
	_addBtn = null;
	_clearCompletedBtn = null;
	_sortItemsBtn = null;
	_listActionsEl = null;

	// Abstract: template ID
	_getTemplateId() {
		throw new Error("_getTemplateId() must be implemented by subclass");
	}

	// Abstract: set up add-item event listeners
	_setupAddListeners() {
		throw new Error("_setupAddListeners() must be implemented by subclass");
	}

	// Hooks
	_onAfterAdd(item, listItem) {}
	_onAfterToggle(itemId, newState, li) {}
	_onAfterEdit(itemId) {}
	_onAfterDelete(itemId) {}
	_onAfterMove(itemId, direction, oldIndex, newIndex) {}
	_onAfterClear(completedIds) {}
	_onAfterSort() {}

	// Abstract: render the list content area
	_renderContent() {
		throw new Error("_renderContent() must be implemented by subclass");
	}

	connectedCallback() {
		const template = document.getElementById(this._getTemplateId());
		if (!template) {
			console.error(`[${this.constructor.name}] Template '${this._getTemplateId()}' not found`);
			return;
		}
		const content = template.content.cloneNode(true);
		this.appendChild(content);

		this._containerEl = this.querySelector(".list-container");
		this._listSelectorBtn = this.querySelector("#list-selector-btn");
		this._listsContainerEl = this.querySelector("#lists-container");
		this._inputEl = this.querySelector("#list-input");
		this._addBtn = this.querySelector("#add-btn");
		this._clearCompletedBtn = this.querySelector("#clear-completed");
		this._sortItemsBtn = this.querySelector("#sort-items");
		this._listActionsEl = this.querySelector("#list-actions");

		const headingLink = this.querySelector(".list-heading-link");
		if (headingLink) {
			headingLink.addEventListener("click", (e) => {
				e.preventDefault();
				Router.go("/list");
			});
		}

		if (this.hasAttribute('list-id')) {
			const selectorRow = this.querySelector('.list-selector-row');
			if (selectorRow) selectorRow.style.display = 'none';
		}

		this._init();
	}

	async _init() {
		if (this._initialized) return;

		const attrListId = this.getAttribute('list-id');

		try {
			await DBManager.init();
			await DBManager.migrateFromTodoDB();
			await DBManager.migrateToItems();

			this._listItems = await DBManager.getItems({ type: 'list', archived: false });

			if (attrListId) {
				this._currentListId = attrListId;
				const exists = this._listItems.some(item => item.id === attrListId);
				if (!exists) this._currentListId = null;
			} else if (this._listItems.length === 0) {
				const newList = await DBManager.createItem({
					type: 'list',
					content: 'My List',
					meta: { isDefault: true, order: 0 }
				});
				this._listItems = await DBManager.getItems({ type: 'list', archived: false });
				this._currentListId = newList.id;
			} else if (!this._currentListId) {
				const defaultList = this._listItems.find(item => item.meta?.isDefault);
				this._currentListId = defaultList?.id || this._listItems[0]?.id;
			}

			await this._loadCurrentList();

			this._initialized = true;
			this._render();
		} catch (error) {
			console.error(`[${this.constructor.name}] Error in _init():`, error);
			if (this._containerEl) {
				this._containerEl.innerHTML = `
					<div style="padding: 20px; color: red; border: 1px solid red; margin: 10px;">
						<strong>Error loading lists:</strong><br>
						${error.message}
					</div>
				`;
			}
			throw error;
		}

		this._setupAddListeners();

		this._clearCompletedBtn?.addEventListener("click", () => this._clearCompleted());
		this._sortItemsBtn?.addEventListener("click", () => this._sortItems());
		this._listSelectorBtn?.addEventListener("click", () => this._showListSelectorDialog());

		this._listsContainerEl?.addEventListener("list-toggle", (e) => {
			this._toggleItem(e.detail.itemId, e.detail.completed);
		});
		this._listsContainerEl?.addEventListener("list-edit", (e) => {
			this._editItem(e.detail.itemId, e.detail.text);
		});
		this._listsContainerEl?.addEventListener("list-delete", (e) => {
			this._deleteItem(e.detail.itemId);
		});
		this._listsContainerEl?.addEventListener("list-move-up", (e) => {
			this._moveItem(e.detail.itemId, -1);
		});
		this._listsContainerEl?.addEventListener("list-move-down", (e) => {
			this._moveItem(e.detail.itemId, 1);
		});
		this._listsContainerEl?.addEventListener("list-more-actions", (e) => {
			this._showItemActions(e.detail.itemId);
		});
	}

	async _loadCurrentList() {
		if (!this._currentListId) return;
		try {
			this._currentListItem = await DBManager.getItem(this._currentListId);
			this._linkedItems = await DBManager.getLinkedItems(this._currentListId);
			await DBManager.updateLastAccessed(this._currentListId);
		} catch (error) {
			console.error(`[${this.constructor.name}] Error loading current list:`, error);
			this._currentListItem = null;
			this._linkedItems = [];
		}
	}

	_getCurrentListMeta() {
		return this._listItems.find(item => item.id === this._currentListId);
	}

	_getCurrentListItem() {
		return this._currentListItem;
	}

	_getLinkedItems() {
		return this._linkedItems || [];
	}

	// Item CRUD
	async _handleAdd() {
		const text = this._inputEl?.value.trim();
		if (!text) return;

		const listItem = this._getCurrentListItem();
		if (!listItem) return;

		const newItem = await DBManager.createItem({
			type: 'item',
			content: text,
			meta: { completed: false }
		});

		const links = listItem.links || [];
		links.unshift({ id: newItem.id, order: 0 });
		links.forEach((link, i) => { link.order = i; });
		listItem.links = links;

		this._inputEl.value = "";

		try {
			await DBManager.saveItem(listItem);
			this._linkedItems = await DBManager.getLinkedItems(listItem.id);
			this._onAfterAdd(newItem, listItem);
		} catch (error) {
			console.error(`[${this.constructor.name}] Error saving list:`, error);
			listItem.links.pop();
			this._renderContent();
		}
	}

	async _toggleItem(itemId, newCompletedState) {
		const item = this._linkedItems.find(i => i.id === itemId);
		if (!item) return;

		if (newCompletedState === undefined) {
			newCompletedState = !item.meta.completed;
		}
		item.meta = { ...item.meta, completed: newCompletedState };

		const li = this._listsContainerEl.querySelector(`list-item[item-id="${itemId}"]`);
		if (li) {
			li.completed = newCompletedState;
		}

		this._updateFooter();

		try {
			await DBManager.saveItem(item);
			this._onAfterToggle(itemId, newCompletedState, li);
		} catch (error) {
			console.error(`[${this.constructor.name}] Error saving after toggle:`, error);
			item.meta = { ...item.meta, completed: !newCompletedState };
			if (li) li.completed = !newCompletedState;
			this._updateFooter();
		}
	}

	async _editItem(itemId, newText) {
		const item = this._linkedItems.find(i => i.id === itemId);
		if (!item) return;

		const trimmedText = newText.trim();
		if (!trimmedText || trimmedText === item.content) return;

		const originalText = item.content;
		item.content = trimmedText;

		try {
			await DBManager.saveItem(item);
			const li = this._listsContainerEl.querySelector(`list-item[item-id="${itemId}"]`);
			if (li) {
				li.text = trimmedText;
			}
			this._onAfterEdit(itemId);
		} catch (error) {
			console.error(`[${this.constructor.name}] Error saving after edit:`, error);
			item.content = originalText;
			const li = this._listsContainerEl.querySelector(`list-item[item-id="${itemId}"]`);
			if (li) li.text = originalText;
		}
	}

	async _deleteItem(itemId) {
		const item = this._linkedItems.find(i => i.id === itemId);
		if (!item) return;

		const confirmed = await DialogService.confirm(`Delete "${item.content}"? This cannot be undone.`, "Delete");
		if (!confirmed) return;

		const listItem = this._getCurrentListItem();
		if (!listItem) return;

		const deletedIndex = this._linkedItems.findIndex(i => i.id === itemId);
		listItem.links = (listItem.links || []).filter(l => l.id !== itemId);

		listItem.links.forEach((link, idx) => {
			link.order = idx;
		});

		try {
			await DBManager.saveItem(listItem);
			await DBManager.hardDeleteItem(itemId);
			this._linkedItems = await DBManager.getLinkedItems(listItem.id);
			this._onAfterDelete(itemId);
		} catch (error) {
			console.error(`[${this.constructor.name}] Error saving after delete:`, error);
			await this._loadCurrentList();
			this._renderContent();
		}
	}

	async _moveItem(itemId, direction) {
		const listItem = this._getCurrentListItem();
		if (!listItem) return;

		const links = listItem.links || [];
		const linkIndex = links.findIndex(l => l.id === itemId);
		if (linkIndex === -1) return;

		const newIndex = linkIndex + direction;
		if (newIndex < 0 || newIndex >= links.length) return;

		const tempOrder = links[linkIndex].order;
		links[linkIndex].order = links[newIndex].order;
		links[newIndex].order = tempOrder;
		links.sort((a, b) => a.order - b.order);

		try {
			await DBManager.saveItem(listItem);
			this._linkedItems = await DBManager.getLinkedItems(listItem.id);
			this._onAfterMove(itemId, direction, linkIndex, newIndex);
		} catch (error) {
			console.error(`[${this.constructor.name}] Error saving after move:`, error);
			await this._loadCurrentList();
			this._renderContent();
		}
	}

	async _clearCompleted() {
		const listItem = this._getCurrentListItem();
		if (!listItem) return;

		const completedItems = this._linkedItems.filter(i => i.meta?.completed);
		if (completedItems.length === 0) return;

		const itemText = completedItems.length === 1 ? 'item' : 'items';
		const confirmed = await DialogService.confirm(
			`Clear ${completedItems.length} completed ${itemText}? This cannot be undone.`,
			'Clear'
		);
		if (!confirmed) return;

		const completedIds = completedItems.map(i => i.id);

		listItem.links = (listItem.links || []).filter(l => !completedIds.includes(l.id));
		listItem.links.forEach((link, idx) => {
			link.order = idx;
		});

		try {
			await DBManager.saveItem(listItem);
			for (const id of completedIds) {
				await DBManager.hardDeleteItem(id);
			}
			this._linkedItems = await DBManager.getLinkedItems(listItem.id);
			this._onAfterClear(completedIds);
		} catch (error) {
			console.error(`[${this.constructor.name}] Error saving after clear:`, error);
			await this._loadCurrentList();
			this._renderContent();
		}
	}

	async _sortItems() {
		const listItem = this._getCurrentListItem();
		if (!listItem) return;

		const links = listItem.links || [];
		const items = await DBManager.getLinkedItems(listItem.id);

		links.sort((a, b) => {
			const itemA = items.find(i => i.id === a.id);
			const itemB = items.find(i => i.id === b.id);
			const completedA = itemA?.meta?.completed || false;
			const completedB = itemB?.meta?.completed || false;
			if (completedA !== completedB) {
				return completedA ? 1 : -1;
			}
			return 0;
		});

		links.forEach((link, idx) => {
			link.order = idx;
		});
		listItem.links = links;

		try {
			await DBManager.saveItem(listItem);
			this._linkedItems = await DBManager.getLinkedItems(listItem.id);
			this._onAfterSort();
		} catch (error) {
			console.error(`[${this.constructor.name}] Error saving after sort:`, error);
			await this._loadCurrentList();
			this._renderContent();
		}
	}

	async _showItemActions(itemId) {
		const action = await DialogService.showActions([
			{ label: 'Move to List', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>', action: 'move-to-list' },
			{ label: 'Convert to Note', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>', action: 'convert-to-note' },
			{ label: 'Edit', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>', action: 'edit' },
			{ label: 'Delete', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>', action: 'delete', danger: true }
		]);

		if (!action) return;

		try {
			switch (action) {
				case 'move-to-list':
					await this._doMoveItemToList(itemId);
					break;
				case 'convert-to-note':
					await this._doConvertItemToNote(itemId);
					break;
				case 'edit': {
					const item = this._linkedItems.find(i => i.id === itemId);
					if (item) {
						await DialogService.promptTextarea('Edit item', item.content || '', (value) => {
							if (value && value.trim() && value.trim() !== item.content) {
								this._editItem(itemId, value.trim());
							}
						});
					}
					break;
				}
				case 'delete':
					await this._deleteItem(itemId);
					break;
			}
		} catch (error) {
			console.error('Item action error:', error);
			alert(error.message || 'Action failed');
		}
	}

	async _doMoveItemToList(itemId) {
		const lists = await DBManager.getItems({ type: 'list', archived: false });
		const otherLists = lists.filter(l => l.id !== this._currentListId);
		if (otherLists.length === 0) {
			alert('No other lists available.');
			return;
		}

		const item = this._linkedItems.find(i => i.id === itemId);
		const target = await DialogService.pickItem(
			otherLists.map(l => ({ id: l.id, title: l.content || 'Unnamed List', subtitle: `${l.links?.length || 0} items` })),
			{ title: 'Move to which list?' }
		);
		if (!target) return;

		await DBManager.moveItemToList(itemId, this._currentListId, target.id);
		this._linkedItems = await DBManager.getLinkedItems(this._currentListId);
		this._renderContent();
		this._updateFooter();
	}

	async _doConvertItemToNote(itemId) {
		const item = this._linkedItems.find(i => i.id === itemId);
		if (!item) return;
		const confirmed = await DialogService.confirm(`Create a note from "${item.content}"? The item will be removed from this list.`, 'Convert');
		if (!confirmed) return;

		const noteId = await DBManager.convertItemToNote(itemId, this._currentListId);
		this._linkedItems = await DBManager.getLinkedItems(this._currentListId);
		this._renderContent();
		this._updateFooter();
		Router.go('/note');
		// After navigation, the notes component will load. We could try to open the note,
		// but Router.go('/note') just shows the notes list. A future enhancement could
		// support opening a specific note on navigation.
	}

	// List management
	async _handleCreateList() {
		const name = await DialogService.prompt("Enter a name for the new list:");
		if (!name || !name.trim()) return;

		try {
			const newList = await DBManager.createItem({
				type: 'list',
				content: name.trim(),
				meta: { isDefault: false, order: this._listItems.length }
			});
			this._listItems = await DBManager.getItems({ type: 'list', archived: false });
			this._currentListId = newList.id;
			await this._loadCurrentList();
			this._render();
		} catch (error) {
			console.error(`[${this.constructor.name}] Error creating new list:`, error);
		}
	}

	async _setDefaultList(listId) {
		try {
			const lists = await DBManager.getItems({ type: 'list', archived: false });
			for (const list of lists) {
				list.meta = { ...list.meta, isDefault: list.id === listId, updatedAt: new Date().toISOString() };
				await DBManager.saveItem(list);
			}
			this._listItems = await DBManager.getItems({ type: 'list', archived: false });
			if (this._currentListItem) {
				this._currentListItem.meta = { ...this._currentListItem.meta, isDefault: (this._currentListItem.id === listId) };
			}
			this._render();
		} catch (error) {
			console.error(`[${this.constructor.name}] Error setting default list:`, error);
		}
	}

	async _deleteList(listId) {
		if (this._listItems.length <= 1) {
			alert("Cannot delete the last list");
			return;
		}

		const listMeta = this._listItems.find(item => item.id === listId);
		const confirmed = await DialogService.confirm(`Delete "${listMeta?.content || 'this list'}"? This cannot be undone.`, "Delete");
		if (!confirmed) return;

		try {
			await DBManager.deleteItem(listId);
			this._listItems = this._listItems.filter(item => item.id !== listId);
			if (this._currentListId === listId) {
				const defaultList = this._listItems.find(item => item.meta?.isDefault);
				this._currentListId = defaultList?.id || this._listItems[0]?.id;
				await this._loadCurrentList();
			}
			this._render();
		} catch (error) {
			console.error(`[${this.constructor.name}] Error deleting list:`, error);
		}
	}

	async _editListName() {
		const listItem = this._getCurrentListItem();
		if (!listItem) return;

		const newName = await DialogService.prompt("Rename list:", listItem.content);
		if (newName && newName.trim() && newName.trim() !== listItem.content) {
			listItem.content = newName.trim();
			try {
				await DBManager.saveItem(listItem);
				this._render();
			} catch (error) {
				console.error(`[${this.constructor.name}] Error saving after name edit:`, error);
			}
		}
	}

	async _doMergeListIntoAnother(sourceId) {
		const otherLists = this._listItems.filter(l => l.id !== sourceId);
		if (otherLists.length === 0) {
			alert('No other lists to merge into.');
			return;
		}

		const source = this._listItems.find(l => l.id === sourceId);
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
		this._listItems = await DBManager.getItems({ type: 'list', archived: false });

		if (this._currentListId === sourceId) {
			this._currentListId = target.id;
			await this._loadCurrentList();
		}
		this._render();
		Router.go(`/list/${target.id}`);
	}

	async _editListNameById(listId, newName) {
		const trimmedName = newName.trim();
		if (!trimmedName) return;

		const listItem = this._listItems.find(item => item.id === listId);
		if (!listItem || trimmedName === listItem.content) return;

		listItem.content = trimmedName;
		try {
			await DBManager.saveItem(listItem);
		} catch (error) {
			console.error(`[${this.constructor.name}] Error saving after name edit:`, error);
			return;
		}

		this._render();
	}

	async _moveList(listId, direction) {
		const listIndex = this._listItems.findIndex(item => item.id === listId);
		if (listIndex === -1) return;

		const newIndex = listIndex + direction;
		if (newIndex < 0 || newIndex >= this._listItems.length) return;

		const listA = this._listItems[listIndex];
		const listB = this._listItems[newIndex];

		const tempOrder = listA.meta.order;
		listA.meta = { ...listA.meta, order: listB.meta.order };
		listB.meta = { ...listB.meta, order: tempOrder };
		this._listItems.sort((a, b) => a.meta.order - b.meta.order);

		try {
			await DBManager.saveItem(listA);
			await DBManager.saveItem(listB);
			this._render();
		} catch (error) {
			console.error(`[${this.constructor.name}] Error saving after list move:`, error);
		}
	}

	// List selector dialog
	_showListSelectorDialog() {
		const sortedLists = [...this._listItems].sort((a, b) => (a.meta?.order || 0) - (b.meta?.order || 0));

		const dialog = document.createElement('dialog');
		dialog.className = 'dialog';

		const listItemsHtml = sortedLists.map((item, index) => {
			const isFirst = index === 0;
			const isLast = index === sortedLists.length - 1;
			const isSelected = item.id === this._currentListId;

			return `
				<div class="list-selector-item ${isSelected ? 'selected' : ''}" data-list-id="${item.id}">
					<div class="list-selector-item-info">
						<span class="list-selector-item-name" contenteditable="false" data-list-id="${item.id}">${this._escapeHtml(item.content || 'Unnamed List')}</span>
					</div>
					<div class="list-selector-item-actions">
						<button class="btn-icon-more list-selector-more" data-list-id="${item.id}" title="More actions" type="button">
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
							</svg>
						</button>
					</div>
				</div>
			`;
		}).join('');

		dialog.innerHTML = `
			<div class="dialog-content">
				<h3>Select List</h3>
				<div class="list-selector-list">
					${listItemsHtml}
				</div>
				<div class="dialog-footer">
					<button class="list-selector-create-btn btn btn-outline" type="button">+ New List</button>
				</div>
			</div>
		`;

		document.body.appendChild(dialog);
		dialog.showModal();

		dialog.querySelectorAll('.list-selector-item').forEach(item => {
			item.addEventListener('click', async (e) => {
				if (e.target.closest('.list-selector-item-actions')) return;
				if (e.target.classList.contains('list-selector-item-name')) return;

				const listId = item.dataset.listId;
				await this._setDefaultList(listId);
				this._currentListId = listId;
				dialog.close();
				document.body.removeChild(dialog);
				await this._loadCurrentList();
				this._render();
			});
		});

		dialog.querySelectorAll('.list-selector-item-name').forEach(nameEl => {
			const listId = nameEl.dataset.listId;
			let originalName = '';

			nameEl.addEventListener('click', (e) => {
				e.stopPropagation();
				originalName = nameEl.textContent;
				nameEl.contentEditable = 'true';
				nameEl.focus();
				const range = document.createRange();
				range.selectNodeContents(nameEl);
				const selection = window.getSelection();
				selection.removeAllRanges();
				selection.addRange(range);
			});

			nameEl.addEventListener('blur', async () => {
				nameEl.contentEditable = 'false';
				const newName = nameEl.textContent.trim();
				if (newName && newName !== originalName) {
					await this._editListNameById(listId, newName);
				} else {
					nameEl.textContent = originalName;
				}
			});

			nameEl.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					nameEl.blur();
				} else if (e.key === 'Escape') {
					e.preventDefault();
					nameEl.textContent = originalName;
					nameEl.blur();
				}
			});
		});

		dialog.querySelectorAll('.list-selector-more').forEach(btn => {
			btn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const listId = btn.dataset.listId;
				const listItem = this._listItems.find(l => l.id === listId);
				const listIndex = this._listItems.findIndex(l => l.id === listId);
				const isFirst = listIndex === 0;
				const isLast = listIndex === this._listItems.length - 1;

				const action = await DialogService.showActions([
					{ label: 'Move Up', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>', action: 'move-up', danger: false },
					{ label: 'Move Down', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>', action: 'move-down', danger: false },
					{ label: 'Rename', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>', action: 'rename', danger: false },
					{ label: 'Merge into Another List', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>', action: 'merge', danger: false },
					{ label: 'Delete', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>', action: 'delete', danger: true }
				]);

				if (!action) return;

				if (action === 'move-up' && !isFirst) {
					await this._moveList(listId, -1);
				} else if (action === 'move-down' && !isLast) {
					await this._moveList(listId, 1);
				} else if (action === 'rename') {
					const nameEl = dialog.querySelector(`.list-selector-item-name[data-list-id="${listId}"]`);
					if (nameEl) {
						nameEl.contentEditable = 'true';
						nameEl.focus();
						const range = document.createRange();
						range.selectNodeContents(nameEl);
						const selection = window.getSelection();
						selection.removeAllRanges();
						selection.addRange(range);
					}
					return; // Keep dialog open for rename
				} else if (action === 'merge') {
					dialog.close();
					document.body.removeChild(dialog);
					await this._doMergeListIntoAnother(listId);
					return;
				} else if (action === 'delete') {
					await this._deleteList(listId);
				}

				dialog.close();
				document.body.removeChild(dialog);
				if (this._listItems.length > 0) {
					this._showListSelectorDialog();
				}
			});
		});

		const createBtn = dialog.querySelector('.list-selector-create-btn');
		createBtn.addEventListener('click', async () => {
			dialog.close();
			document.body.removeChild(dialog);
			await this._handleCreateList();
			if (this._listItems.length > 0) {
				this._showListSelectorDialog();
			}
		});

		dialog.addEventListener('click', (e) => {
			if (e.target === dialog) {
				dialog.close();
				document.body.removeChild(dialog);
			}
		});
	}

	// Render helpers
	_render() {
		if (!this._containerEl) return;

		const currentMeta = this._getCurrentListMeta();

		if (this._listSelectorBtn) {
			const nameSpan = this._listSelectorBtn.querySelector('.list-selector-name');
			if (nameSpan) {
				nameSpan.textContent = currentMeta?.content || 'Select List';
			}
		}

		if (this._listActionsEl) {
			this._listActionsEl.innerHTML = `
				<share-button type="list" data-id="${this._escapeHtml(this._currentListId || '')}" title="${this._escapeHtml(currentMeta?.content || 'Untitled List')}"></share-button>
			`;
		}

		this._renderContent();
	}

	_createItemElement(item, index, total) {
		const li = document.createElement('list-item');
		li.itemId = item.id;
		li.text = item.content || '';
		li.completed = item.meta?.completed || false;
		li.index = index;
		li.total = total;
		li.style.viewTransitionName = `item-${item.id}`;
		return li;
	}

	_updateFooter() {
		const items = this._getLinkedItems();

		const hasCompleted = items.some(i => i.meta?.completed);
		if (this._clearCompletedBtn) {
			this._clearCompletedBtn.classList.toggle('hidden', !hasCompleted);
		}

		if (this._sortItemsBtn) {
			this._sortItemsBtn.classList.toggle('hidden', !hasCompleted);
		}
	}

	_getOrderedItems() {
		return [...this._getLinkedItems()];
	}

	_escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}
}
