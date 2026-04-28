import {API} from "./services/API.js";
import Store from "./services/Store.js";
import { Router } from "./services/Router.js";
import { DBManager } from "./services/DBManager.js";

navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.type === "CACHE_UPDATED") {
        console.log("[App] Cache updated:", event.data.url);
    }
});

window.addEventListener("DOMContentLoaded", async () => {
    console.log('[App] DOMContentLoaded event fired');
    
    // Log debug status first
    console.log('[App] Getting DBManager debug status...');
    await DBManager.debugStatus();
    
    // Run database migrations before initializing the router
    // Order matters: first migrate from oldest DB, then migrate to multi-note format, then repair
    console.log('[App] Starting database migrations...');
    
    try {
        console.log('[App] Step 1: Running migrateFromOldDB (textAreaDB -> pockist-db)...');
        const oldDBResult = await DBManager.migrateFromOldDB();
        console.log('[App] migrateFromOldDB result:', oldDBResult);
    } catch (err) {
        console.error("[App] migrateFromOldDB failed:", err);
        console.error("[App] Error stack:", err.stack);
        // Continue anyway - don't block the app
    }
    
    try {
        console.log('[App] Step 2: Running migrateToMultiNoteFormat (v2 -> v3)...');
        const multiNoteResult = await DBManager.migrateToMultiNoteFormat();
        console.log('[App] migrateToMultiNoteFormat result:', multiNoteResult);
    } catch (err) {
        console.error("[App] migrateToMultiNoteFormat failed:", err);
        console.error("[App] Error stack:", err.stack);
        // Continue anyway
    }
    
    try {
        console.log('[App] Step 3: Running repairCorruptedNotes...');
        const repairResult = await DBManager.repairCorruptedNotes();
        console.log('[App] repairCorruptedNotes result:', repairResult);
    } catch (err) {
        console.error("[App] repairCorruptedNotes failed:", err);
        console.error("[App] Error stack:", err.stack);
        // Continue anyway
    }
    
    console.log('[App] All migrations completed');

    // Now initialize the router
    console.log('[App] Initializing router...');
    try {
        app.Router.init();
        console.log('[App] Router initialized successfully');
    } catch (err) {
        console.error("[App] Router initialization failed:", err);
    }
    
    // Register service worker
    console.log('[App] Registering service worker...');
    navigator.serviceWorker.register("/sw.js").then(registration => {
        console.log('[App] Service worker registered');
        
        const showUpdatePrompt = () => {
            console.log('[App] Showing update prompt');
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
    }).catch(err => {
        console.error('[App] Service worker registration failed:', err);
    });
    
    console.log('[App] DOMContentLoaded handler complete');
});

window.app = {
    Router,
    API,
    Store,
    showError: (message="There was an error.", goToHome=true)=>{
        console.log('[App] showError called:', message, goToHome);
        document.getElementById("alert-modal").showModal()
        document.querySelector("#alert-modal p").textContent = message;
        if (goToHome) app.Router.go("/");
    },
    closeError: ()=>{
        console.log('[App] closeError called');
        document.getElementById("alert-modal").close()
    },
    login: async (event) => {
        console.log('[App] login called');
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
        console.log('[App] logout called');
        Store.jwt = null;
        app.Router.go("/");
    },
    // Debug helpers exposed for console use
    debug: {
        dbStatus: () => DBManager.debugStatus(),
        forceReset: () => DBManager.forceReset()
    }
}