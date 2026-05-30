export const DialogService = {
	confirm(message, confirmText = "Confirm") {
		return new Promise((resolve) => {
			// Create dialog element
			const dialog = document.createElement("dialog");
			dialog.className = "dialog";

			dialog.innerHTML = `
				<div class="dialog-content">
					<p class="app-dialog-message">${this.escapeHtml(message)}</p>
					<div class="dialog-footer">
						<button class="btn btn-ghost" type="button">Cancel</button>
						<button class="btn btn-outline" type="button">${this.escapeHtml(confirmText)}</button>
					</div>
				</div>
			`;

			document.body.appendChild(dialog);

			const cancelBtn = dialog.querySelector(".btn.btn-ghost");
			const confirmBtn = dialog.querySelector(".btn.btn-outline");
			
			const cleanup = () => {
				dialog.remove();
			};
			
			const handleCancel = () => {
				dialog.close();
				cleanup();
				resolve(false);
			};
			
			const handleConfirm = () => {
				dialog.close();
				cleanup();
				resolve(true);
			};
			
			cancelBtn.addEventListener("click", handleCancel);
			confirmBtn.addEventListener("click", handleConfirm);
			
			// Close on backdrop click
			dialog.addEventListener("click", (e) => {
				if (e.target === dialog) {
					handleCancel();
				}
			});
			
			// Close on Escape key (native dialog behavior)
			dialog.addEventListener("close", () => {
				cleanup();
				resolve(false);
			});
			
			// Show the dialog with animation
			dialog.showModal();
		});
	},
	
	prompt(message, defaultValue = "") {
		return new Promise((resolve) => {
			const dialog = document.createElement("dialog");
			dialog.className = "dialog";

			dialog.innerHTML = `
				<div class="dialog-content">
					<p class="app-dialog-message">${this.escapeHtml(message)}</p>
					<input type="text" class="app-dialog-input" value="${this.escapeHtml(defaultValue)}" />
					<div class="dialog-footer">
						<button class="btn btn-ghost" type="button">Cancel</button>
						<button class="btn btn-outline" type="button">OK</button>
					</div>
				</div>
			`;

			document.body.appendChild(dialog);

			const input = dialog.querySelector(".app-dialog-input");
			const cancelBtn = dialog.querySelector(".btn.btn-ghost");
			const confirmBtn = dialog.querySelector(".btn.btn-outline");

			// Focus input after dialog is shown
			setTimeout(() => input.focus(), 0);

			const cleanup = () => {
				dialog.remove();
			};

			const handleCancel = () => {
				dialog.close();
				cleanup();
				resolve(null);
			};

			const handleConfirm = () => {
				const value = input.value.trim();
				dialog.close();
				cleanup();
				resolve(value || null);
			};

			cancelBtn.addEventListener("click", handleCancel);
			confirmBtn.addEventListener("click", handleConfirm);

			input.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					e.stopPropagation();
					handleConfirm();
				} else if (e.key === "Escape") {
					e.preventDefault();
					e.stopPropagation();
					handleCancel();
				}
			});

			dialog.addEventListener("click", (e) => {
				if (e.target === dialog) {
					handleCancel();
				}
			});

			dialog.addEventListener("close", () => {
				cleanup();
				resolve(null);
			});

			dialog.showModal();
		});
	},

	promptTextarea(message, defaultValue = "", onChange = null) {
		return new Promise((resolve) => {
			const dialog = document.createElement("dialog");
			dialog.className = "dialog dialog--textarea";

			dialog.innerHTML = `
				<div class="dialog-content">
					<p class="app-dialog-message">${this.escapeHtml(message)}</p>
					<textarea class="app-dialog-textarea" rows="5" style="resize: none;">${this.escapeHtml(defaultValue)}</textarea>
					<div class="dialog-footer">
						<button class="btn btn-ghost" type="button">Close</button>
					</div>
				</div>
			`;

			document.body.appendChild(dialog);

			const textarea = dialog.querySelector(".app-dialog-textarea");
			const closeBtn = dialog.querySelector(".btn.btn-ghost");

			let debounceTimer = null;
			let lastSavedValue = defaultValue;

			const doSave = (value) => {
				if (value === lastSavedValue) return;
				lastSavedValue = value;
				if (onChange) onChange(value);
			};

			const debouncedSave = (value) => {
				clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => doSave(value), 300);
			};

			const cleanup = () => {
				clearTimeout(debounceTimer);
				dialog.remove();
			};

			const handleClose = () => {
				// Flush any pending save
				const value = textarea.value.trim();
				if (value && value !== lastSavedValue) {
					doSave(value);
				}
				dialog.close();
				cleanup();
				resolve(null);
			};

			closeBtn.addEventListener("click", handleClose);

			textarea.addEventListener("input", () => {
				const value = textarea.value.trim();
				if (!value) return;
				debouncedSave(value);
			});

			textarea.addEventListener("keydown", (e) => {
				if (e.key === "Escape") {
					e.preventDefault();
					e.stopPropagation();
					handleClose();
				}
			});

			dialog.addEventListener("click", (e) => {
				if (e.target === dialog) {
					handleClose();
				}
			});

			dialog.addEventListener("close", () => {
				cleanup();
				resolve(null);
			});

			dialog.showModal();
			closeBtn.focus();
		});
	},

	/**
	 * Show a vertical action sheet dialog
	 * @param {Array<{label: string, icon?: string, action: string, danger?: boolean}>} actions
	 * @returns {Promise<string|null>} The selected action key or null
	 */
	showActions(actions) {
		return new Promise((resolve) => {
			const dialog = document.createElement("dialog");
			dialog.className = "dialog dialog--actions";

			const rows = actions.map((a) => `
				<button class="dialog-action-row ${a.danger ? 'dialog-action-row--danger' : ''}" data-action="${this.escapeHtml(a.action)}" type="button">
					${a.icon ? `<span class="dialog-action-icon">${a.icon}</span>` : ''}
					<span class="dialog-action-label">${this.escapeHtml(a.label)}</span>
				</button>
			`).join('');

			dialog.innerHTML = `
				<div class="dialog-content dialog-content--actions">
					${rows}
					<div class="dialog-footer dialog-footer--actions">
						<button class="btn btn-ghost dialog-action-cancel" type="button">Cancel</button>
					</div>
				</div>
			`;

			document.body.appendChild(dialog);

			const cleanup = () => {
				dialog.remove();
			};

			const handleCancel = () => {
				dialog.close();
				cleanup();
				resolve(null);
			};

			dialog.querySelectorAll('.dialog-action-row').forEach(btn => {
				btn.addEventListener('click', () => {
					dialog.close();
					cleanup();
					resolve(btn.dataset.action);
				});
			});

			dialog.querySelector('.dialog-action-cancel').addEventListener('click', handleCancel);

			dialog.addEventListener('click', (e) => {
				if (e.target === dialog) handleCancel();
			});
			dialog.addEventListener('close', () => {
				cleanup();
				resolve(null);
			});

			dialog.showModal();
		});
	},

	/**
	 * Show a scrollable item picker dialog
	 * @param {Array<{id: string, title?: string, subtitle?: string}>} items
	 * @param {Object} options
	 * @param {string} [options.title]
	 * @param {string} [options.emptyText]
	 * @returns {Promise<Object|null>} Selected item or null
	 */
	pickItem(items, options = {}) {
		return new Promise((resolve) => {
			const dialog = document.createElement("dialog");
			dialog.className = "dialog dialog--picker";

			const titleHtml = options.title ? `<h3>${this.escapeHtml(options.title)}</h3>` : '';
			const emptyText = options.emptyText || 'No items available';

			let listHtml;
			if (items.length === 0) {
				listHtml = `<div class="dialog-picker-empty">${this.escapeHtml(emptyText)}</div>`;
			} else {
				listHtml = items.map(item => `
					<button class="dialog-picker-item" data-id="${this.escapeHtml(item.id)}" type="button">
						<div class="dialog-picker-item-title">${this.escapeHtml(item.title || item.id)}</div>
						${item.subtitle ? `<div class="dialog-picker-item-subtitle">${this.escapeHtml(item.subtitle)}</div>` : ''}
					</button>
				`).join('');
			}

			dialog.innerHTML = `
				<div class="dialog-content dialog-content--picker">
					${titleHtml}
					<div class="dialog-picker-list">
						${listHtml}
					</div>
					<div class="dialog-footer">
						<button class="btn btn-ghost dialog-picker-cancel" type="button">Cancel</button>
					</div>
				</div>
			`;

			document.body.appendChild(dialog);

			const cleanup = () => {
				dialog.remove();
			};

			const handleCancel = () => {
				dialog.close();
				cleanup();
				resolve(null);
			};

			dialog.querySelectorAll('.dialog-picker-item').forEach(btn => {
				btn.addEventListener('click', () => {
					const id = btn.dataset.id;
					const selected = items.find(i => i.id === id) || null;
					dialog.close();
					cleanup();
					resolve(selected);
				});
			});

			dialog.querySelector('.dialog-picker-cancel').addEventListener('click', handleCancel);

			dialog.addEventListener('click', (e) => {
				if (e.target === dialog) handleCancel();
			});
			dialog.addEventListener('close', () => {
				cleanup();
				resolve(null);
			});

			dialog.showModal();
		});
	},

	escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}
};
