import { routes } from "./Routes.js";
// since there is only one router we are not making it a class just an object
export const Router = {
    init: ()=>{
        window.addEventListener("popstate",()=>{
            Router.go(location.pathname, false); // pathname is the path portion of url
        })
        // enhance current links
        document.querySelectorAll("a").forEach(a=>{
            a.addEventListener("click", event => {
                event.preventDefault();
                const href = a.getAttribute("href");
                Router.go(href);
            })
        });
        // go to the initial route
        Router.go(location.pathname + location.search) // search is the query ?
    },
    //
    go: (route, addToHistory=true)=>{
        if (addToHistory) {
            history.pushState(null, "", route)
        }

        let pageElement = null;
        let needsLogin = false;
        const routePath = route.includes('?') ? route.split("?")[0] : route;
        for (const r of routes){
            if (typeof r.path === "string" && r.path === routePath){
                // string path
                pageElement = new r.component();
                needsLogin = r.loggedIn === true;
                break;
            } else if (r.path instanceof RegExp){
                //RegEx path
                const match = r.path.exec(route);
                if (match) {
                    pageElement = new r.component();
                    // regex api returns the params below
                    const params = match.slice(1);
                    pageElement.params = params;
                    needsLogin = r.loggedIn === true;
                    break;
                }
            }
        }

        if (pageElement) {
            if (needsLogin && app.Store.loggedIn == false) {
                app.Router.go("/account/login");
                return;
            }
        }

        if(pageElement == null){
            pageElement = document.createElement("h1");
            pageElement.textContent = "Page not found :(";
        }

        // i have  a page for the current URL
        // inserting new page into the UI
        const oldPage = document.querySelector("main").firstElementChild;
        if (oldPage) oldPage.style.viewTransitionName = "old";
        pageElement.style.viewTransitionName = "new";

        //page transitions
        function updatePage(){
            document.querySelector("main").innerHTML = "";
            document.querySelector("main").appendChild(pageElement);
        }
        if (!document.startViewTransition){ // if the browser doesn't have view transitions
            updatePage();
        } else {
            document.startViewTransition(()=>{
                updatePage();
            });
        }
    },
};
