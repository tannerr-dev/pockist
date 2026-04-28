import { Router } from "../services/Router.js";

export class AboutPage extends HTMLElement {
	connectedCallback() {
		const template = document.getElementById("about-page");
		const content = template.content.cloneNode(true);
		this.appendChild(content);

		// Set up PWA navigation links
		document.querySelectorAll("a.pwa").forEach((a) => {
			a.addEventListener("click", (event) => {
				event.preventDefault();
				const href = a.getAttribute("href");
				Router.go(href);
			});
		});
	}
}

customElements.define("about-page", AboutPage);
