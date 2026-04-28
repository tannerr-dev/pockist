import { API } from "../services/API.js";
import { Router } from "../services/Router.js";
import './weather/WeatherCurrent.js';
import './TodoList.js';

export class HomePage extends HTMLElement {  // <home-page>
    connectedCallback() {
        const template = document.getElementById("home-page");
        const content = template.content.cloneNode(true);
        this.appendChild(content);
        document.querySelectorAll("a.pwa").forEach(a=>{
            a.addEventListener("click", event => {
                event.preventDefault();
                const href = a.getAttribute("href");
                Router.go(href);
            })
        });
    }
}

customElements.define("home-page", HomePage);
