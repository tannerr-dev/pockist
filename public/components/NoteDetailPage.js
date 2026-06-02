/**
 * NoteDetailPage - Note editor at /note/:noteId.
 *
 * Wraps a single note editor with back button, share, more actions, and auto-save.
 */
import { DBManager } from '../services/DBManager.js';
import { DialogService } from '../services/DialogService.js';
import { Router } from '../services/Router.js';
import './ShareButton.js';

export class NoteDetailPage extends HTMLElement {
	_timeoutId = null;
	_noteId = null;
	_note = null;

	connectedCallback() {
		this._noteId = this.params?.[0] || null;

		const template = document.getElementById('pockist-note-detail');
		if (!template) {
			console.error('NoteDetailPage: Template not found');
			return;
		}
		const content = template.content.cloneNode(true);
		this.appendChild(content);

		this._init();
	}

	async _init() {
		if (!this._noteId) {
			Router.go('/note');
			return;
		}

		try {
			await DBManager.init();
			this._note = await DBManager.getItem(this._noteId);
			if (!this._note || this._note.type !== 'note') {
				Router.go('/note');
				return;
			}

			this._populateEditor();
			this._attachListeners();
		} catch (error) {
			console.error('[NoteDetailPage] Init error:', error);
			Router.go('/note');
		}
	}

	_populateEditor() {
		const textarea = this.querySelector('#note-content');
		const backBtn = this.querySelector('#back-btn');
		const moreBtn = this.querySelector('#editor-more-btn');
		const shareBtn = this.querySelector('#editor-share-btn');
		const saveIndicator = this.querySelector('#save-indicator');

		if (textarea) {
			textarea.value = this._note.content || '';
			this._autoResizeTextarea();
		}

		if (backBtn) {
			backBtn.addEventListener('click', () => {
				this._flushSave();
				Router.go('/note');
			});
		}

		if (moreBtn) {
			moreBtn.addEventListener('click', () => this._showActions());
		}

		if (shareBtn) {
			shareBtn.setAttribute('data-id', this._noteId);
			shareBtn.setAttribute('title', this._extractTitle(this._note.content));
		}

		if (saveIndicator) {
			saveIndicator.textContent = '';
		}
	}

	_attachListeners() {
		const textarea = this.querySelector('#note-content');
		if (!textarea) return;

		textarea.addEventListener('input', () => {
			this._autoResizeTextarea();
			if (this._timeoutId) clearTimeout(this._timeoutId);
			this._updateIndicator('Saving...');
			this._timeoutId = setTimeout(() => this._save(), 1000);
		});

		textarea.addEventListener('blur', () => {
			if (this._timeoutId) {
				clearTimeout(this._timeoutId);
				this._timeoutId = null;
			}
			this._save();
		});
	}

	_autoResizeTextarea() {
		const textarea = this.querySelector('#note-content');
		if (!textarea) return;
		textarea.style.height = 'auto';
		textarea.style.height = textarea.scrollHeight + 'px';
	}

	async _save() {
		if (!this._noteId || !this._note) return;

		const textarea = this.querySelector('#note-content');
		if (!textarea) return;

		this._note.content = textarea.value;
		this._note.meta = {
			...this._note.meta,
			updatedAt: new Date().toISOString()
		};

		try {
			await DBManager.saveItem(this._note);
			this._updateIndicator('Saved');
		} catch (error) {
			console.error('[NoteDetailPage] Save error:', error);
			this._updateIndicator('Error saving');
		}
	}

	_flushSave() {
		if (this._timeoutId) {
			clearTimeout(this._timeoutId);
			this._timeoutId = null;
		}
		this._save();
	}

	_updateIndicator(text) {
		const el = this.querySelector('#save-indicator');
		if (el) el.textContent = text;
	}

	async _showActions() {
		const action = await DialogService.showActions([
			{ label: 'Share', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>', action: 'share' },
			{ label: 'Duplicate Note', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>', action: 'duplicate' },
			{ label: 'Copy to List', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>', action: 'copy-to-list' },
			{ label: 'Convert to List', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>', action: 'convert' },
			{ label: 'Move to List', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>', action: 'move-to-list' },
			{ label: 'Merge with Note', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>', action: 'merge' },
			{ label: 'Archive', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>', action: 'archive', danger: true }
		]);

		if (!action) return;

		try {
			switch (action) {
			case 'share':
				await this._doShare();
				break;
			case 'duplicate':
				await this._doDuplicate();
				break;
			case 'copy-to-list':
				await this._doCopyToList();
				break;
			case 'convert':
				await this._doConvert();
				break;
			case 'move-to-list':
				await this._doMoveToList();
				break;
			case 'merge':
				await this._doMerge();
				break;
			case 'archive':
				await this._doArchive();
				break;
			}
		} catch (error) {
			console.error('Note detail action error:', error);
			alert(error.message || 'Action failed');
		}
	}

	async _doShare() {
		const title = this._extractTitle(this._note.content);
		const shareBtn = document.createElement('share-button');
		shareBtn.setAttribute('type', 'note');
		shareBtn.setAttribute('data-id', this._noteId);
		shareBtn.setAttribute('title', title);
		shareBtn.style.position = 'fixed';
		shareBtn.style.top = '-9999px';
		shareBtn.style.left = '-9999px';
		document.body.appendChild(shareBtn);

		requestAnimationFrame(() => {
			const btn = shareBtn.querySelector('button, .share-trigger-btn, [type="button"]');
			if (btn) btn.click(); else shareBtn.click();
			setTimeout(() => {
				if (shareBtn.parentNode) shareBtn.parentNode.removeChild(shareBtn);
			}, 100);
		});
	}

	async _doDuplicate() {
		const newNoteId = await DBManager.duplicateNote(this._noteId);
		Router.go(`/note/${newNoteId}`);
	}

	async _doCopyToList() {
		const lists = await DBManager.getItems({ type: 'list', archived: false });
		if (lists.length === 0) {
			alert('No lists available. Create a list first.');
			return;
		}

		const title = this._extractTitle(this._note.content);

		const target = await DialogService.pickItem(
			lists.map(l => ({ id: l.id, title: l.content || 'Unnamed List', subtitle: `${l.links?.length || 0} items` })),
			{ title: `Copy "${title}" to which list?` }
		);
		if (!target) return;

		await DBManager.copyNoteToList(this._noteId, target.id);
	}

	async _doConvert() {
		const title = this._extractTitle(this._note.content);
		const confirmed = await DialogService.confirm(`Convert "${title}" to a list? Each line will become an item.`, 'Convert');
		if (!confirmed) return;

		const newListId = await DBManager.convertNoteToList(this._noteId);
		Router.go(`/list/${newListId}`);
	}

	async _doMoveToList() {
		const lists = await DBManager.getItems({ type: 'list', archived: false });
		if (lists.length === 0) {
			alert('No lists available. Create a list first.');
			return;
		}

		const title = this._extractTitle(this._note.content);
		const target = await DialogService.pickItem(
			lists.map(l => ({ id: l.id, title: this._extractTitle(l.content), subtitle: `${l.links?.length || 0} items` })),
			{ title: 'Move to which list?' }
		);
		if (!target) return;

		const confirmed = await DialogService.confirm(`Add "${title}" to "${this._extractTitle(target.content)}"?`, 'Move');
		if (!confirmed) return;

		await DBManager.moveNoteToList(this._noteId, target.id);
		Router.go(`/list/${target.id}`);
	}

	async _doMerge() {
		const allNotes = await DBManager.getItems({ type: 'note', archived: false });
		const otherNotes = allNotes.filter(n => n.id !== this._noteId);
		if (otherNotes.length === 0) {
			alert('No other notes to merge with.');
			return;
		}

		const sourceTitle = this._extractTitle(this._note.content);
		const target = await DialogService.pickItem(
			otherNotes.map(n => ({ id: n.id, title: this._extractTitle(n.content), subtitle: this._formatDate(n.meta?.updatedAt || n.meta?.createdAt) })),
			{ title: 'Merge into which note?' }
		);
		if (!target) return;

		const targetTitle = this._extractTitle(target.content);
		const confirmed = await DialogService.confirm(`Merge "${sourceTitle}" into "${targetTitle}"?`, 'Merge');
		if (!confirmed) return;

		await DBManager.mergeNotes(target.id, this._noteId);
		Router.go(`/note/${target.id}`);
	}

	async _doArchive() {
		const title = this._extractTitle(this._note.content);
		const confirmed = await DialogService.confirm(`Archive "${title}"?`, 'Archive');
		if (!confirmed) return;

		await DBManager.archiveItem(this._noteId);
		Router.go('/note');
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

	disconnectedCallback() {
		if (this._timeoutId) {
			clearTimeout(this._timeoutId);
			this._timeoutId = null;
		}
		this._save();
	}
}

customElements.define('pockist-note-detail', NoteDetailPage);
