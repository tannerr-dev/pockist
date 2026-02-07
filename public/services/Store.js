const Store = {
    jwt: null,
    get loggedIn() {
        return this.jwt !== null;
    }
}

if (localStorage.getItem("jwt")) {
    Store.jwt = localStorage.getItem("jwt");
}

const proxiedStore = new Proxy(Store, {
    set: (target, prop, value) => {
        switch (prop) {
            case "jwt":
                target[prop] = value;
                if (value==null){
                    localStorage.removeItem("jwt");
                } else {
                    localStorage.setItem("jwt", value);
                }
                break;
        }
        return true;
    }
});


export default proxiedStore;
