export class WelcomeSplash extends HTMLElement {
    connectedCallback() {
        const shellTemplate = document.getElementById("welcome-splash");
        const aboutTemplate = document.getElementById("about-page");
        if (!shellTemplate || !aboutTemplate) return;

        const shell = shellTemplate.content.cloneNode(true);
        const about = aboutTemplate.content.cloneNode(true);
        this.appendChild(shell);

        const scrollContainer = this.querySelector(".welcome-splash-scroll");
        if (scrollContainer) {
            scrollContainer.appendChild(about);
        }

        // Fade in
        requestAnimationFrame(() => {
            this.classList.add("welcome-splash--visible");
        });

        const dismissBtn = this.querySelector(".welcome-splash-dismiss");
        if (dismissBtn) {
            dismissBtn.addEventListener("click", () => this.dismiss());
        }
    }

    dismiss() {
        localStorage.setItem("pockist-welcome-shown", "true");
        document.body.classList.remove("showing-welcome");
        this.classList.remove("welcome-splash--visible");
        this.addEventListener("transitionend", () => this.remove(), { once: true });
        // Fallback in case transitionend doesn't fire
        setTimeout(() => this.remove(), 400);
    }
}

customElements.define("welcome-splash", WelcomeSplash);
