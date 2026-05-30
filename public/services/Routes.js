import { HomePage } from "../components/HomePage.js";
import { NoteIndexPage } from "../components/NoteIndexPage.js";
import { NoteDetailPage } from "../components/NoteDetailPage.js";
import { WeatherPage } from "../components/WeatherPage.js";
import { ListIndexPage } from "../components/ListIndexPage.js";
import { ListDetailPage } from "../components/ListDetailPage.js";
import { ArchivePage } from "../components/ArchivePage.js";
import { AboutPage } from "../components/AboutPage.js";
import { ShareView } from "../components/ShareView.js";

export const routes = [
  {
    path: "/",
    component: HomePage,
  },
  {
    path: "/note",
    component: NoteIndexPage,
  },
  {
    path: /^\/note\/(.+)$/,  // Matches /note/:noteId
    component: NoteDetailPage,
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
    path: "/archive",
    component: ArchivePage,
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
