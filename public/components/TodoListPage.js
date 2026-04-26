import { Router } from "../services/Router.js";
import "./TodoList.js";

export class TodoListPage extends HTMLElement {
	connectedCallback() {
		const template = document.getElementById("todo-list-page");
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

customElements.define("todo-list-page", TodoListPage);
