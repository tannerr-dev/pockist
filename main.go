package main

import (
	"database/sql"
	"fmt"
	"html/template"
	"log"
	"net/http"

	_ "github.com/mattn/go-sqlite3"
	"tannerr/pockist/handlers"
)

func main() {
	var err error
	db, err := sql.Open("sqlite3", "./data/pockist.db")
	if err != nil {
		log.Fatalf("db connection failed: %v", err)
	}
	defer db.Close()

	// Keep the global template for standalone templates
	tmpl := template.Must(template.ParseGlob("templates/*.html"))

	server := http.NewServeMux()

	server.HandleFunc("/dashboard", func(w http.ResponseWriter, r *http.Request) {
		// Create a new template set with layout and dashboard
		t := template.Must(template.New("").ParseFiles("templates/layout.html", "templates/dashboard.html"))
		err := t.ExecuteTemplate(w, "layout.html", nil)
		if err != nil {
			fmt.Printf("Dashboard template error: %v\n", err)
			http.Error(w, "failed to exec dashboard template", http.StatusInternalServerError)
			return
		}
	})
	server.HandleFunc("/admin", func(w http.ResponseWriter, r *http.Request) {
		fmt.Println("admin hit")
		// Create a new template set with layout and admin
		t := template.Must(template.New("").ParseFiles("templates/layout.html", "templates/admin.html"))
		err := t.ExecuteTemplate(w, "layout.html", nil)
		if err != nil {
			fmt.Printf("Admin template error: %v\n", err)
			http.Error(w, "failed to load admin template", http.StatusInternalServerError)
			return
		}
	})
	server.HandleFunc("/api/admin/all", handlers.AllSelect(db))
	server.HandleFunc("/api/admin/list_tables", handlers.ListTables(db))
	server.HandleFunc("/api/admin/insert", handlers.Insert(db))
	server.HandleFunc("/api/admin/delete", handlers.DeleteTable(db))
	server.HandleFunc("/api/admin/create", handlers.CreateTable(db))

	server.HandleFunc("/monies", func(w http.ResponseWriter, r *http.Request) {
		err := tmpl.ExecuteTemplate(w, "monies.html", nil)
		if err != nil {
			http.Error(w, "failed to load monies template", http.StatusInternalServerError)
			return
		}
	})
	// server.HandleFunc("/api/monies/all", select_all_and_print(db))
	// server.HandleFunc("/api/monies/insert", insert(db))

	server.HandleFunc("/notes", handlers.NotesRoute(db))
	server.HandleFunc("/api/notes/insert", handlers.NotesInsert(db))

	server.Handle("/", http.FileServer(http.Dir("public")))
	const addr = ":8080"
	fmt.Println("Server listening on", addr)
	err = http.ListenAndServe(addr, server)
	if err != nil {
		log.Fatalf("Server failed %v", err)
	}
}
