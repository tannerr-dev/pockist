package main

import (
	"database/sql"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"

	"tannerr/pockist/handlers"

	_ "github.com/mattn/go-sqlite3"
)

func loginHandler(w http.ResponseWriter, r *http.Request) {
	//TODO simple auth flow with jwt
	if r.FormValue("username") == os.Getenv("POCKIST_USERNAME") && r.FormValue("password") == os.Getenv("POCKIST_PASSWORD") {
		http.Redirect(w, r, "/dashboard", http.StatusSeeOther)
	} else {
		http.Redirect(w, r, "/", http.StatusSeeOther)
	}
}

func templater(s string) *template.Template {
	prefix := "templates/"
	tmp, err := template.ParseFiles(
		prefix + "layouts/base.tmpl",
		prefix + "partials/nav.tmpl",
		prefix + "pages/" + s + ".tmpl",
	)
	if err != nil {
		log.Fatalf("Templater error parsing notes template: %v", err)
	}
	return tmp
}

func my_handler(s string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tmpl := templater(s)
		fmt.Printf("INFO served route %s\n", s)
		err := tmpl.Execute(w, nil)
		if err != nil {
			fmt.Printf("template error: %v\n", err)
			http.Error(w, "failed to exec dashboard template", http.StatusInternalServerError)
			return
		}
	}
}

func main() {
	db, err := sql.Open("sqlite3", "./data/pockist.db")
	if err != nil {
		log.Fatalf("db connection failed: %v", err)
	}
	defer db.Close()

	notesHandler := handlers.CreateNotesHandler(db)
	adminHandler := handlers.CreateAdminHandler(db)

	server := http.NewServeMux()

	server.HandleFunc("/api/login", loginHandler)
	server.HandleFunc("/dashboard", my_handler("dashboard"))

	server.HandleFunc("/note", notesHandler.Note)
	server.HandleFunc("/notes", notesHandler.Notes)
	// server.HandleFunc("/api/notes/json", notesHandler.NotesJson)

	server.HandleFunc("/ssrnotes", notesHandler.SsrNotesRoute)
	server.HandleFunc("/api/notes/insert", notesHandler.NotesInsert)
	server.HandleFunc("/api/notes/delete", notesHandler.NotesDelete)

	server.HandleFunc("/heatmap", my_handler("heatmap"))
	server.HandleFunc("/clock", my_handler("clock"))

	server.HandleFunc("/admin", my_handler("admin"))
	server.HandleFunc("/api/admin/all", adminHandler.AllSelect)
	server.HandleFunc("/api/admin/list_tables", adminHandler.ListTables)
	server.HandleFunc("/api/admin/insert", adminHandler.Insert)
	server.HandleFunc("/api/admin/delete", adminHandler.DeleteTable)
	server.HandleFunc("/api/admin/create", adminHandler.CreateTable)

	server.HandleFunc("/monies", my_handler("monies"))
	// server.HandleFunc("/api/monies/all", select_all_and_print(db))
	// server.HandleFunc("/api/monies/insert", insert(db))

	server.Handle("/", http.FileServer(http.Dir("public")))
	const addr = ":8080"
	fmt.Println("Server listening on", addr)
	err = http.ListenAndServe(addr, server)
	if err != nil {
		log.Fatalf("Server failed %v", err)
	}
}
