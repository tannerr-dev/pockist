let menu = document.querySelector(".menu");
// let drawer = document.querySelector("#drawer");
menu.addEventListener("click", () => {
  menu.classList.toggle("change");
    console.log("todo: add drawer lol")
  // if (drawer.style.width == "100%") {
  //   drawer.style.width = "0px";
  //   drawer.style.opacity = "0";
  // } else {
  //   drawer.style.width = "100%";
  //   drawer.style.opacity = "1";
  // }
});

const colorSlider = document.getElementById("color-slider");
colorSlider.addEventListener("input", () => {
  root.style.setProperty("--hue", colorSlider.value);
  localStorage.setItem("hue", colorSlider.value);
  themeColor = colorSlider.value;
});

const root = document.querySelector(":root");

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
    console.log("Preferred Theme",theme)
  } else {
    console.log("Preferred Theme",theme)
  }

  if (theme == "light") {
    document.documentElement.setAttribute("data-theme", "light");
    console.log("Setting theme to light");
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    console.log("Setthing theme to dark");
  }

  const themeColor =  localStorage.getItem("hue");
  console.log("Setting hue to ", themeColor);
  colorSlider.value = themeColor;
  root.style.setProperty("--hue", themeColor);
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
  }
);

function switchTheme() {
  if (!localStorage.getItem("theme")) {
      localStorage.setItem("theme", "dark");
  }
  if (localStorage.getItem("theme") == "light"){
    localStorage.setItem("theme", "dark");
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    localStorage.setItem("theme", "light");
    document.documentElement.setAttribute("data-theme", "light");
  }
}
document.getElementById("theme-switch").addEventListener("click", ()=>{
  switchTheme();
  detectColorScheme();
});
