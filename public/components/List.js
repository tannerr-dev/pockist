import { ListBase } from './ListBase.js';
import './ShareButton.js';

export class List extends ListBase {
	_getTemplateId() {
		return 'pockist-list';
	}

	_setupAddListeners() {
		this._addBtn?.addEventListener("click", () => this._handleAdd());
		this._inputEl?.addEventListener("keydown", (e) => {
			if (e.key === "Enter") this._handleAdd();
		});
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
			}, 200);
		}

		this.#updateItemIndices();
		this._updateFooter();
	}

	_onAfterMove(itemId, direction, oldIndex, newIndex) {
		const items = Array.from(this._listsContainerEl.querySelectorAll('list-item'));
		const currentItem = items.find(item => item.itemId === itemId);
		if (!currentItem) return;

		const targetItem = direction === -1
			? currentItem.previousElementSibling
			: currentItem.nextElementSibling;
		if (!targetItem || targetItem.classList.contains('list-empty')) return;

		currentItem.style.transition = 'transform 0.2s';
		targetItem.style.transition = 'transform 0.2s';

		if (direction === -1) {
			currentItem.parentNode.insertBefore(currentItem, targetItem);
		} else {
			currentItem.parentNode.insertBefore(targetItem, currentItem);
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
