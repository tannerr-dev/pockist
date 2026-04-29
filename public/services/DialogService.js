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
				document.body.removeChild(dialog);
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
	
	escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}
};
