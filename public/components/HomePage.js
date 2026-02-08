import { API } from "../services/API.js";
import { Router } from "../services/Router.js";

export class HomePage extends HTMLElement {  // <home-page>
    connectedCallback() {
        const template = document.getElementById("home-page");
        const content = template.content.cloneNode(true);
        this.appendChild(content);
        document.querySelectorAll("a").forEach(a=>{
            a.addEventListener("click", event => {
                event.preventDefault();
                const href = a.getAttribute("href");
                Router.go(href);
            })
        });

        // this.render();
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

customElements.define("home-page", HomePage);
