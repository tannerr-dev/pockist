let menu = document.querySelector(".menu");
let drawer = document.querySelector("#drawer");
menu.addEventListener("click", () => {
  menu.classList.toggle("change");
  if (drawer.style.width == "100%") {
    drawer.style.width = "0px";
    drawer.style.opacity = "0";
  } else {
    drawer.style.width = "100%";
    drawer.style.opacity = "1";
  }
});

// console.log("hello from the nav script");
const root = document.querySelector(":root");
const colorSlider = document.getElementById("color-slider");
colorSlider.addEventListener("input", () => {
  root.style.setProperty("--hue", colorSlider.value);
  localStorage.setItem("hue", colorSlider.value);
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
  }
  if (theme == "light") {
    document.documentElement.setAttribute("data-theme", "light");
    console.log("Setting theme to light");
  } else {
    console.log("Setthing theme to dark");
  }
  colorSlider.value = localStorage.getItem("hue");
  console.log("Setting hue to ", colorSlider.value);
  root.style.setProperty("--hue", colorSlider.value);
}
detectColorScheme();

window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", (event) => {
    detectColorScheme();
  });

// function switchTheme(e) {
//   if (e.target.checked) {
//     localStorage.setItem("theme", "light");
//     document.documentElement.setAttribute("data-theme", "light");
//     // toggleSwitch.checked = true;
//   } else {
//     localStorage.setItem("theme", "dark");
//     document.documentElement.setAttribute("data-theme", "dark");
//     // toggleSwitch.checked = false;
//   }
// }
// const toggleSwitch = document.querySelector('#theme-switch input[type="checkbox"]');
// toggleSwitch.addEventListener("change", switchTheme, false);

//pre-check the dark-theme checkbox if dark-theme is set
// if (document.documentElement.getAttribute("data-theme") == "light") {
//   toggleSwitch.checked = true;
// }

document.getElementById("theme-switch").addEventListener("click", ()=>{
  if (localStorage.getItem("theme")) {
    if (localStorage.getItem("theme") == "light"){
      localStorage.setItem("theme", "dark");
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      localStorage.setItem("theme", "light");
      document.documentElement.setAttribute("data-theme", "light");
    }
  }
  detectColorScheme();
});
