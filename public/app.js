import {API} from "./services/API.js";
import { HomePage } from "./components/HomePage.js";
// import { Router } from "./services/Router.js";
import Store from "./services/Store.js";


window.addEventListener("DOMContentLoaded", event => {
//     app.Router.init()
    // we do not need to inject the homepage or details page anymore since
    // the Router does that now
    document.querySelector("main").appendChild(new HomePage())
    // document.querySelector("main").appendChild(new MovieDetailsPage())
});

window.app = {
    // Router, // same as Router: Router; // js shortcut
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
    // register: async (event) => {
    //     event.preventDefault();
    //     let errors = [];
    //     const name = document.getElementById("register-name").value;
    //     const email = document.getElementById("register-email").value;
    //     const password = document.getElementById("register-password").value;
    //     const passwordConfirm = document.getElementById("register-password-confirm").value;
    //
    //     if (name.length < 4) errors.push("Enter your complete name");
    //     if (email.length < 8) errors.push("Enter your complete email");
    //     if (password.length < 6) errors.push("Enter a password with 6 characters");
    //     if (password != passwordConfirm) errors.push("Passwords don't match");
    //     if (errors.length==0) {
    //         const response = await API.register(name, email, password);
    //         if (response.success) {
    //             app.Store.jwt = response.jwt;
    //             app.Router.go("/account/")
    //         } else {
    //             app.showError(response.message, false);
    //         }
    //     } else {
    //         app.showError(errors.join(". "), false);
    //     }
    // },
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
    // saveToCollection: async (movie_id, collection) => {
    //     if (app.Store.loggedIn) {
    //         try {
    //             const response = await API.saveToCollection(movie_id, collection);
    //             if (response.success) {
    //                 switch(collection) {
    //                     case "favorite":
    //                         app.Router.go("/account/favorites")
    //                     break;
    //                     case "watchlist":
    //                         app.Router.go("/account/watchlist")
    //                 }
    //             } else {
    //                 app.showError("We couldn't save the movie.")
    //             }
    //         } catch (e) {
    //             console.log(e)
    //         }
    //     } else {
    //         app.Router.go("/account/");
    //     }
    // }
}
