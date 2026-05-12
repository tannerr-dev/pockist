export const DialogService = {
	confirm(message, confirmText = "Confirm") {
		return new Promise((resolve) => {
			// Create dialog element
			const dialog = document.createElement("dialog");
			dialog.className = "app-dialog";
			
			dialog.innerHTML = `
				<div class="app-dialog-content">
					<p class="app-dialog-message">${this.escapeHtml(message)}</p>
					<div class="app-dialog-actions">
						<button class="app-dialog-btn app-dialog-btn--cancel" type="button">Cancel</button>
						<button class="app-dialog-btn app-dialog-btn--confirm" type="button">${this.escapeHtml(confirmText)}</button>
					</div>
				</div>
			`;
			
			document.body.appendChild(dialog);
			
			const cancelBtn = dialog.querySelector(".app-dialog-btn--cancel");
			const confirmBtn = dialog.querySelector(".app-dialog-btn--confirm");
			
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
			dialog.className = "app-dialog";

			dialog.innerHTML = `
				<div class="app-dialog-content">
					<p class="app-dialog-message">${this.escapeHtml(message)}</p>
					<input type="text" class="app-dialog-input" value="${this.escapeHtml(defaultValue)}" />
					<div class="app-dialog-actions">
						<button class="app-dialog-btn app-dialog-btn--cancel" type="button">Cancel</button>
						<button class="app-dialog-btn app-dialog-btn--confirm" type="button">OK</button>
					</div>
				</div>
			`;

			document.body.appendChild(dialog);

			const input = dialog.querySelector(".app-dialog-input");
			const cancelBtn = dialog.querySelector(".app-dialog-btn--cancel");
			const confirmBtn = dialog.querySelector(".app-dialog-btn--confirm");

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

	escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}
};
