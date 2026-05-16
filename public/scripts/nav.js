const root = document.querySelector(":root");
const drawer = document.querySelector("#drawer");
let menu = document.querySelector(".menu");

// Toggle X animation on menu button when popover opens/closes
drawer.addEventListener("toggle", (event) => {
	if (event.newState === "open") {
		menu.classList.add("change");
	} else {
		menu.classList.remove("change");
	}
});

// Close drawer and navigate when clicking nav links
const navLinks = document.querySelectorAll("[data-nav-link]");
navLinks.forEach(link => {
	link.addEventListener("click", () => {
		drawer.hidePopover();
	});
});

function hueCheck(hue){
    root.style.setProperty("--hue", hue);
    if (hue == '360') {
        root.style.setProperty("--mod", 0);
        localStorage.setItem("mod", 0);
    } else {
        root.style.setProperty("--mod", 1);
        localStorage.setItem("mod", 1);
    }
}
const colorSlider = document.getElementById("color-slider");
colorSlider.addEventListener("input", () => {
    localStorage.setItem("hue", colorSlider.value);
    // themeColor = colorSlider.value;
    // console.log(colorSlider.value)
    hueCheck(colorSlider.value)
});

function detectColorScheme() {
	var theme = "dark";
	if (localStorage.getItem("theme")) {
		if (localStorage.getItem("theme") == "light") {
			var theme = "light";
		}
	} else if (!window.matchMedia) {
		//matchMedia method not supported
		return false;
	} else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
		var theme = "light";
		console.log("Preferred Theme", theme);
	} else {
		console.log("Preferred Theme", theme);
	}

	if (theme == "light") {
		document.documentElement.setAttribute("data-theme", "light");
		console.log("Setting theme to light");
	} else {
		document.documentElement.setAttribute("data-theme", "dark");
		console.log("Setthing theme to dark");
	}

	const themeColor = localStorage.getItem("hue");
	console.log("Setting hue to ", themeColor);
	if (colorSlider) {
		colorSlider.value = themeColor;
	}
	root.style.setProperty("--hue", themeColor);
    if (colorSlider.value == '360') {
        root.style.setProperty("--mod", 0);
        localStorage.setItem("mod", 0);
    } else {
        root.style.setProperty("--mod", 1);
        localStorage.setItem("mod", 1);
    }
}
detectColorScheme();

window
	.matchMedia("(prefers-color-scheme: light)")
	.addEventListener("change", (event) => {
		if (!window.matchMedia) {
			//matchMedia method not supported
			return false;
		} else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
			localStorage.setItem("theme", "light");
			document.documentElement.setAttribute("data-theme", "light");
		} else {
			localStorage.setItem("theme", "dark");
			document.documentElement.setAttribute("data-theme", "dark");
		}
		detectColorScheme();
	});

function switchTheme() {
	if (!localStorage.getItem("theme")) {
		localStorage.setItem("theme", "dark");
	}
	if (localStorage.getItem("theme") == "light") {
		localStorage.setItem("theme", "dark");
		document.documentElement.setAttribute("data-theme", "dark");
	} else {
		localStorage.setItem("theme", "light");
		document.documentElement.setAttribute("data-theme", "light");
	}
}
const themeSwitch = document.getElementById("theme-switch");
if (themeSwitch) {
	themeSwitch.addEventListener("click", () => {
		switchTheme();
		detectColorScheme();
	});
}

const settingsSwitch = document.getElementById("settings-switch");
if (settingsSwitch) {
	settingsSwitch.addEventListener("click", () => {
		document.querySelector("#drawer").hidePopover();
		const drawer = document.querySelector('home-settings-drawer');
		if (drawer) {
			drawer.open();
		}
	});
}
