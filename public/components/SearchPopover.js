import { DBManager } from '../services/DBManager.js';
import { Router } from '../services/Router.js';

/**
 * SearchPopover - Full-text search overlay for notes, lists, and items.
 *
 * Triggered by nav search icon or '/' key on desktop.
 * Shows results grouped by type with archived badges and text highlighting.
 */
export class SearchPopover extends HTMLElement {
	#input = null;
	#results = null;
	#overlay = null;
	#debounceTimer = null;
	#isOpen = false;

	connectedCallback() {
		this.innerHTML = `
			<div class="search-overlay" id="search-overlay">
				<div class="search-panel">
					<div class="search-header">
						<svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
						<input type="text" class="search-input" placeholder="Search notes, lists, and items..." autocomplete="off" />
						<button class="search-close-btn" type="button" title="Close (Esc)">
							<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
						</button>
					</div>
					<div class="search-results"></div>
				</div>
			</div>
		`;

		this.#overlay = this.querySelector('#search-overlay');
		this.#input = this.querySelector('.search-input');
		this.#results = this.querySelector('.search-results');

		this.querySelector('.search-close-btn')?.addEventListener('click', () => this.close());

		this.#input?.addEventListener('input', () => {
			clearTimeout(this.#debounceTimer);
			this.#debounceTimer = setTimeout(() => this.#performSearch(), 200);
		});

		this.#input?.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				this.close();
			}
		});

		this.#overlay?.addEventListener('click', (e) => {
			if (e.target === this.#overlay) this.close();
		});

		// Global '/' shortcut (desktop only)
		document.addEventListener('keydown', (e) => {
			if (e.key === '/' && !this.#isInputFocused(e.target)) {
				e.preventDefault();
				this.open();
			}
		});
	}

	#isInputFocused(target) {
		const tag = target?.tagName?.toLowerCase();
		return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
	}

	open() {
		if (this.#isOpen) return;
		this.#isOpen = true;
		this.#overlay.classList.add('open');
		this.#input.value = '';
		this.#results.innerHTML = '';
		requestAnimationFrame(() => this.#input.focus());
		document.body.style.overflow = 'hidden';
	}

	close() {
		if (!this.#isOpen) return;
		this.#isOpen = false;
		this.#overlay.classList.remove('open');
		this.#input.value = '';
		this.#results.innerHTML = '';
		document.body.style.overflow = '';
	}

	async #performSearch() {
		const query = this.#input.value.trim();
		if (!query) {
			this.#results.innerHTML = '';
			return;
		}

		try {
			const results = await DBManager.searchItems(query);
			this.#renderResults(results, query);
		} catch (error) {
			console.error('[SearchPopover] Search error:', error);
			this.#results.innerHTML = '<div class="search-empty">Search failed. Try again.</div>';
		}
	}

	#renderResults(results, query) {
		if (results.length === 0) {
			this.#results.innerHTML = `<div class="search-empty">No results found for "${this.#escapeHtml(query)}"</div>`;
			return;
		}

		const notes = results.filter(r => r.type === 'note');
		const lists = results.filter(r => r.type === 'list');
		const items = results.filter(r => r.type === 'item');

		let html = '';

		if (notes.length > 0) {
			html += `<div class="search-group"><div class="search-group-label">Notes (${notes.length})</div>`;
			for (const note of notes) {
				html += this.#renderNoteItem(note, query);
			}
			html += '</div>';
		}

		if (lists.length > 0) {
			html += `<div class="search-group"><div class="search-group-label">Lists (${lists.length})</div>`;
			for (const list of lists) {
				html += this.#renderListItem(list, query);
			}
			html += '</div>';
		}

		if (items.length > 0) {
			html += `<div class="search-group"><div class="search-group-label">List Items (${items.length})</div>`;
			for (const item of items) {
				html += this.#renderListItemResult(item, query);
			}
			html += '</div>';
		}

		this.#results.innerHTML = html;

		// Attach click handlers
		this.#results.querySelectorAll('.search-result').forEach(el => {
			el.addEventListener('click', () => {
				const type = el.dataset.type;
				const id = el.dataset.id;
				const parentId = el.dataset.parentId;
				this.close();
				if (type === 'note') {
					Router.go(`/note/${id}`);
				} else if (type === 'list') {
					Router.go(`/list/${id}`);
				} else if (type === 'item' && parentId) {
					// Store scroll target so the list component can scroll to it
					try { sessionStorage.setItem('scrollToItem', id); } catch (e) {}
					Router.go(`/list/${parentId}`);
				}
			});
		});
	}

	#renderNoteItem(note, query) {
		const title = this.#extractTitle(note.content);
		const preview = this.#getPreview(note.content);
		const archivedBadge = note.meta?.archived ? '<span class="search-badge search-badge--archived">Archived</span>' : '';
		return `
			<div class="search-result" data-type="note" data-id="${this.#escapeHtml(note.id)}">
				<div class="search-result-title">${this.#highlightText(this.#escapeHtml(title), query)}${archivedBadge}</div>
				<div class="search-result-preview">${this.#highlightText(this.#escapeHtml(preview), query)}</div>
			</div>
		`;
	}

	#renderListItem(list, query) {
		const title = list.content || 'Unnamed List';
		const archivedBadge = list.meta?.archived ? '<span class="search-badge search-badge--archived">Archived</span>' : '';
		return `
			<div class="search-result" data-type="list" data-id="${this.#escapeHtml(list.id)}">
				<div class="search-result-title">${this.#highlightText(this.#escapeHtml(title), query)}${archivedBadge}</div>
				<div class="search-result-preview">List</div>
			</div>
		`;
	}

	#renderListItemResult(item, query) {
		const text = item.content || 'Unnamed item';
		const parentLabel = item.parentName ? `in "${this.#escapeHtml(item.parentName)}"` : '';
		const archivedBadge = item.meta?.archived ? '<span class="search-badge search-badge--archived">Archived</span>' : '';
		return `
			<div class="search-result" data-type="item" data-id="${this.#escapeHtml(item.id)}" data-parent-id="${this.#escapeHtml(item.parentId || '')}">
				<div class="search-result-title">${this.#highlightText(this.#escapeHtml(text), query)}${archivedBadge}</div>
				${parentLabel ? `<div class="search-result-preview">${parentLabel}</div>` : ''}
			</div>
		`;
	}

	#extractTitle(content) {
		if (!content) return 'Untitled';
		const firstLine = content.split('\n')[0].trim();
		return firstLine || 'Untitled';
	}

	#getPreview(content, maxLength = 80) {
		if (!content) return '';
		const text = content.replace(/\n/g, ' ').trim();
		if (text.length <= maxLength) return text;
		return text.slice(0, maxLength) + '...';
	}

	#highlightText(text, query) {
		const terms = query.toLowerCase().trim().split(/\s+/).filter(t => t.length > 0);
		if (terms.length === 0) return text;
		// Escape regex special chars
		const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
		const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
		return text.replace(pattern, '<mark>$1</mark>');
	}

	#escapeHtml(str) {
		if (!str) return '';
		return str
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}
}

customElements.define('search-popover', SearchPopover);
