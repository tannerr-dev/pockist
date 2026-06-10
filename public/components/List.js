import { ListBase } from './ListBase.js';
import { DraggableList } from '../services/DraggableList.js';
import './ShareButton.js';

export class List extends ListBase {
	_draggableList = null;

	_getTemplateId() {
		return 'pockist-list';
	}

	_setupAddListeners() {
		this._addBtn?.addEventListener("click", () => {
			this._handleAdd();
			this._inputEl?.blur();
		});
		this._inputEl?.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this._handleAdd();
			}
		});
	}

	connectedCallback() {
		super.connectedCallback();
	}

	disconnectedCallback() {
		if (this._draggableList) {
			this._draggableList.destroy();
			this._draggableList = null;
		}
	}

	_onAfterAdd(item, listItem) {
		let container = this._listsContainerEl.querySelector('.list-ul');

		if (!container) {
			this._listsContainerEl.innerHTML = '';
			container = document.createElement('div');
			container.className = 'list-ul';
			this._listsContainerEl.appendChild(container);
		}

		const li = this._createItemElement(item, 0, this._getLinkedItems().length);
		li.style.opacity = '0';
		li.style.transform = 'translateY(-10px)';
		container.insertBefore(li, container.firstChild);

		requestAnimationFrame(() => {
			li.style.transition = 'opacity 0.2s, transform 0.2s';
			li.style.opacity = '1';
			li.style.transform = 'translateY(0)';
		});

		this.#updateItemIndices();
		this._updateFooter();
		this._initDraggableList();
	}

	_onAfterDelete(itemId) {
		const item = this._listsContainerEl.querySelector(`list-item[item-id="${itemId}"]`);
		const items = this._getLinkedItems();

		if (item) {
			item.style.transition = 'opacity 0.2s, transform 0.2s';
			item.style.opacity = '0';
			item.style.transform = 'translateX(20px)';

			setTimeout(() => {
				item.remove();
				if (items.length === 0) {
					this._listsContainerEl.innerHTML = '<div class="list-empty">No items yet. Add one above!</div>';
				}
				this._initDraggableList();
			}, 200);
		}

		this.#updateItemIndices();
		this._updateFooter();
	}

	_onAfterMove(itemId, direction, oldIndex, newIndex) {
		const items = Array.from(this._listsContainerEl.querySelectorAll('list-item'));
		const currentItem = items.find(item => item.itemId === itemId);
		if (!currentItem) return;

		const targetItem = items[newIndex];
		if (!targetItem || targetItem === currentItem) {
			// newIndex may be out of bounds when there are archived items in the list
			// (items.length includes archived items, but DOM items do not).
			// Fall back to appending/prepending when the target is missing.
			if (newIndex >= items.length && currentItem !== items[items.length - 1]) {
				currentItem.parentNode.appendChild(currentItem);
				this.#updateItemIndices();
				this._updateFooter();
			} else if (newIndex < 0 && currentItem !== items[0]) {
				currentItem.parentNode.insertBefore(currentItem, items[0]);
				this.#updateItemIndices();
				this._updateFooter();
			}
			return;
		}

		const container = currentItem.parentNode;

		if (newIndex > oldIndex) {
			if (targetItem.nextElementSibling) {
				container.insertBefore(currentItem, targetItem.nextElementSibling);
			} else {
				container.appendChild(currentItem);
			}
		} else {
			container.insertBefore(currentItem, targetItem);
		}

		this.#updateItemIndices();
	}

	_onAfterClear(completedIds) {
		const items = this._getLinkedItems();

		completedIds.forEach((id, index) => {
			const item = this._listsContainerEl.querySelector(`list-item[item-id="${id}"]`);
			if (item) {
				item.style.transition = 'opacity 0.2s, transform 0.2s';
				item.style.opacity = '0';
				item.style.transform = 'translateX(20px)';

				setTimeout(() => {
					item.remove();
				}, 200 + (index * 50));
			}
		});

		this.#updateItemIndices();
		this._updateFooter();

		if (items.length === 0) {
			setTimeout(() => {
				this._listsContainerEl.innerHTML = '<div class="list-empty">No items yet. Add one above!</div>';
				this._initDraggableList();
			}, 200 + (completedIds.length * 50));
		} else {
			setTimeout(() => {
				this._initDraggableList();
			}, 200 + (completedIds.length * 50));
		}
	}

	_onAfterSort() {
		const ul = this._listsContainerEl.querySelector('.list-ul');
		if (ul) {
			ul.style.opacity = '0.5';
			ul.style.transition = 'opacity 0.2s';
		}
		this._renderList();
	}

	_renderContent() {
		this._renderList();
	}

	_renderList() {
		const items = this._getLinkedItems();

		if (!this._listsContainerEl) return;
		this._listsContainerEl.innerHTML = "";

		if (items.length === 0) {
			this._listsContainerEl.innerHTML = '<div class="list-empty">No items yet. Add one above!</div>';
		} else {
			const div = document.createElement('div');
			div.className = 'list-ul';

			items.forEach((item, index) => {
				const li = this._createItemElement(item, index, items.length);
				div.appendChild(li);
			});

			this._listsContainerEl.appendChild(div);
		}

		this._updateFooter();
		this._initDraggableList();
	}

	_initDraggableList() {
		if (this._draggableList) {
			this._draggableList.destroy();
			this._draggableList = null;
		}

		const ul = this._listsContainerEl.querySelector('.list-ul');
		if (!ul) return;

		this._draggableList = new DraggableList(ul, {
			itemSelector: 'list-item',
			handleSelector: '.drag-hint',
			onReorder: (oldIndex, newIndex) => {
				this._reorderItem(oldIndex, newIndex);
			}
		});
	}

	#updateItemIndices() {
		const items = this._listsContainerEl.querySelectorAll('list-item');
		items.forEach((item, index) => {
			item.index = index;
			item.total = items.length;
		});
	}
}

customElements.define("pockist-list", List);
