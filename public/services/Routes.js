import { HomePage } from "../components/HomePage.js";
import { LocalNotes } from "../components/LocalNotes.js";
import { WeatherPage } from "../components/WeatherPage.js";
import { TodoListPage } from "../components/TodoListPage.js";
import { AboutPage } from "../components/AboutPage.js";
import { ShareView } from "../components/ShareView.js";

export const routes = [
  {
    path: "/",
    component: HomePage,
  },
  {
    path: "/note",
    component: LocalNotes,
  },
  {
    path: "/weather",
    component: WeatherPage,
  },
  {
    path: "/list",
    component: TodoListPage,
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
