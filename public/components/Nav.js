import { API } from "../services/API.js";

export class Nav extends HTMLElement {
	async connectedCallback() {
		try {
			const response = await fetch("/partials/nav.html");
			if (!response.ok) {
				throw new Error(`Failed to fetch template: ${response.status}`);
			}
			const templateHtml = await response.text();
			const template = document.createElement("template");
			template.innerHTML = templateHtml;
			this.innerHTML = "";
			const content = template.content.cloneNode(true);
			this.appendChild(content);

			if (typeof window.initializeNav === "function") {
				window.initializeNav();
			}
		} catch (error) {
			console.error("Error loading navigation template:", error);
			this.innerHTML = `
                <div style="padding: 20px; text-align: center; color: var(--accent, #ff6b6b);">
                    <p>Navigation failed to load</p>
                    <button onclick="location.reload()" style="margin-top: 10px; padding: 5px 10px; background: var(--accent, #ff6b6b); color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Retry
                    </button>
                </div>
            `;
		}
	}
	// async render() {
	//     const topMovies = await API.getTopMovies()
	//     renderMoviesInList(topMovies, document.querySelector("#top-10 ul"));
	//
	//     const randomMovies = await API.getRandomMovies()
	//     renderMoviesInList(randomMovies, document.querySelector("#random ul"));
	//
	//     function renderMoviesInList(movies, ul) {
	//         ul.innerHTML = "";
	//         movies.forEach(movie => {
	//             const li = document.createElement("li");
	//             li.appendChild(new MovieItemComponent(movie));
	//             ul.appendChild(li);
	//         });
	//     }
	// }
}

customElements.define("nav-component", Nav);
