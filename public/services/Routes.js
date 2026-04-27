import { HomePage } from "../components/HomePage.js";
import { LocalNotes } from "../components/LocalNotes.js";
import { WeatherPage } from "../components/WeatherPage.js";
import { TodoListPage } from "../components/TodoListPage.js";
// import { MovieDetailsPage } from "../components/MovieDetailsPage.js";
// import { MoviesPage } from "../components/MoviesPage.js";
// import { RegisterPage } from "../components/RegisterPage.js";
// import { LoginPage } from "../components/LoginPage.js";
// import { AccountPage } from "../components/AccountPage.js";
// import { FavoritePage } from "../components/FavoritePage.js";
// import { WatchlistPage } from "../components/WatchlistPage.js";

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
  // {
  //   path: /\/movies\/(\d+)/,
  //   component: MovieDetailsPage,
  // },
  // {
  //   path: "/movies", // search results
  //   component: MoviesPage,
  // },
  // {
  //   path: "/account/register",
  //   component: RegisterPage,
  // },
  // {
  //   path: "/account/login",
  //   component: LoginPage,
  // },
  // {
  //     path: "/account/",
  //     component: AccountPage,
  //     loggedIn: true
  // },
  // {
  //     path: "/account/favorites",
  //     component: FavoritePage,
  //     loggedIn: true
  // },    
  // {
  //     path: "/account/watchlist",
  //     component: WatchlistPage,
  //     loggedIn: true
  // }, 
];
