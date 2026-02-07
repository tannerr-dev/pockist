export const API = {
    baseURL: "/api/",
    register: async (name, email, password) => {
        return await API.send("account/register/", {name, email, password})
    },
    authenticate: async (email, password) => {
        return await API.send("account/authenticate/", {email, password})
    },
    send: async (service, args) => {
        try {
            const response = await fetch(API.baseURL + service, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": app.Store.jwt ? `Bearer ${app.Store.jwt}` : null
                },
                body: JSON.stringify(args)
            });
            const result = await response.json();
            return result;
        } catch (e) {
            console.error(e);
            app.showError();
        }
    },
    fetch: async (serviceName, args)=> {
        try{
            const queryString = args ? new URLSearchParams(args).toString(): "";
            const response = await fetch(API.baseURL + serviceName + "?" + queryString,{
                headers: {
                    "Authorization": app.Store.jwt ? `Bearer ${app.Store.jwt}` : null
                },
            });
            const result = await response.json();
            return result;
        } catch (e) {
            console.error(e);
        }
    },
}
