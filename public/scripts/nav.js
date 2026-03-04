const root = document.querySelector(":root");
const options = document.querySelector("#optionals");
let menu = document.querySelector(".menu");
if (menu) {
	menu.addEventListener("click", () => {
		menu.classList.toggle("change");
        options.classList.toggle("hide");
		// console.log("todo: add drawer lol");
		// if (drawer.style.width == "100%") {
		//   drawer.style.width = "0px";
		//   drawer.style.opacity = "0";
		// } else {
		//   drawer.style.width = "100%";
		//   drawer.style.opacity = "1";
		// }
	});
}

// let drawer = document.querySelector("#drawer");

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
