import { Router } from "../services/Router.js";
import "./List.js";

export class ListPage extends HTMLElement {
	connectedCallback() {
		const template = document.getElementById("pockist-list-page");
		const content = template.content.cloneNode(true);
		this.appendChild(content);

		document.querySelectorAll("a.pwa").forEach((a) => {
			a.addEventListener("click", (event) => {
				event.preventDefault();
				const href = a.getAttribute("href");
				Router.go(href);
			});
		});
	}
}

customElements.define("pockist-list-page", ListPage);
