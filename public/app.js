import {API} from "./services/API.js";
import Store from "./services/Store.js";
import { Router } from "./services/Router.js";
import { DBManager } from "./services/DBManager.js";

navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.type === "CACHE_UPDATED") {
        console.log("Cache updated:", event.data.url);
    }
});

window.addEventListener("DOMContentLoaded", async () => {
    // Run database migrations before initializing the router
    // Order matters: first migrate from oldest DB, then migrate to multi-note format, then repair
    try {
        await DBManager.migrateFromOldDB();
        await DBManager.migrateToMultiNoteFormat();
        await DBManager.repairCorruptedNotes();
    } catch (err) {
        console.error("Migration failed:", err);
    }

    app.Router.init();
    
    navigator.serviceWorker.register("/sw.js").then(registration => {
        const showUpdatePrompt = () => {
            const banner = document.createElement("div");
            banner.id = "update-banner";
            banner.innerHTML = `
                <span>A new version is available.</span>
                <button id="update-btn">Reload</button>
            `;
            document.body.appendChild(banner);
            document.getElementById("update-btn").addEventListener("click", () => {
                window.location.reload();
            });
        };

        if (registration.installing) {
            registration.installing.addEventListener("statechange", () => {
                if (registration.installing.state === "installed" && navigator.serviceWorker.controller) {
                    showUpdatePrompt();
                }
            });
        }

        registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                    showUpdatePrompt();
                }
            });
        });
    });
});

window.app = {
    Router,
    API,
    Store,
    showError: (message="There was an error.", goToHome=true)=>{
        document.getElementById("alert-modal").showModal()
        document.querySelector("#alert-modal p").textContent = message;
        if (goToHome) app.Router.go("/");
    },
    closeError: ()=>{
        document.getElementById("alert-modal").close()
    },
    login: async (event) => {
        event.preventDefault();
        let errors = [];
        const email = document.getElementById("login-email").value;
        const password = document.getElementById("login-password").value;
 
        if (email.length < 8) errors.push("Enter your complete email");
        if (password.length < 6) errors.push("Enter a password with 6 characters");
        if (errors.length==0) {
            const response = await API.authenticate(email, password);
            if (response.success) {
                app.Store.jwt = response.jwt;
                app.Router.go("/account/")
            } else {
                app.showError(response.message, false);
            }
        } else {
            app.showError(errors.join(". "), false);
        }
    },
    logout: () => {
        Store.jwt = null;
        app.Router.go("/");
    },
}
