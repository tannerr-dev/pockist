import { HomePage } from "../components/HomePage.js";
import { Notes } from "../components/Notes.js";
import { WeatherPage } from "../components/WeatherPage.js";
import { ListIndexPage } from "../components/ListIndexPage.js";
import { ListDetailPage } from "../components/ListDetailPage.js";
import { AboutPage } from "../components/AboutPage.js";
import { ShareView } from "../components/ShareView.js";

export const routes = [
  {
    path: "/",
    component: HomePage,
  },
  {
    path: "/note",
    component: Notes,
  },
  {
    path: "/weather",
    component: WeatherPage,
  },
  {
    path: "/list",
    component: ListIndexPage,
  },
  {
    path: /^\/list\/(.+)$/,  // Matches /list/:listId
    component: ListDetailPage,
  },
  {
    path: "/about",
    component: AboutPage,
  },
  {
    path: /^\/share\/(.+)$/,  // Matches /share/:shareId
    component: ShareView,
  },
];
