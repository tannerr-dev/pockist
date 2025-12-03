package main

import (
	"fmt"
	"os"
	"log"
	"net/http"
	"html/template"
	"database/sql"

	_ "github.com/mattn/go-sqlite3"
	"tannerr/pockist/handlers"
)
func loginHandler(w http.ResponseWriter, r *http.Request) {
	//TODO simple auth flow with jwt
	if r.FormValue("username") == os.Getenv("POCKIST_USERNAME")&& r.FormValue("password") ==  os.Getenv("POCKIST_PASSWORD"){
		http.Redirect(w, r, "/dashboard", http.StatusSeeOther)
	} else {
		http.Redirect(w, r, "/", http.StatusSeeOther)
	}
}
func default_handler(filename string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		t := template.Must(template.New("").ParseFiles("templates/layout.tmpl", fmt.Sprintf("templates/%s.tmpl", filename)))
		err := t.ExecuteTemplate(w, "layout.tmpl", nil)
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

	server := http.NewServeMux()
	server.HandleFunc("/api/login", loginHandler)
	server.HandleFunc("/dashboard", default_handler("dashboard"))
	server.HandleFunc("/admin", default_handler("admin"))
	server.HandleFunc("/heatmap", default_handler("heatmap"))

	server.HandleFunc("/api/admin/all", handlers.AllSelect(db))
	server.HandleFunc("/api/admin/list_tables", handlers.ListTables(db))
	server.HandleFunc("/api/admin/insert", handlers.Insert(db))
	server.HandleFunc("/api/admin/delete", handlers.DeleteTable(db))
	server.HandleFunc("/api/admin/create", handlers.CreateTable(db))

	server.HandleFunc("/monies", default_handler("monies"))
	// server.HandleFunc("/api/monies/all", select_all_and_print(db))
	// server.HandleFunc("/api/monies/insert", insert(db))

	server.HandleFunc("/notes", handlers.NotesRoute(db))
	server.HandleFunc("/api/notes/insert", handlers.NotesInsert(db))
	server.HandleFunc("/api/notes/delete", handlers.NotesDelete(db))

	server.Handle("/", http.FileServer(http.Dir("public")))
	const addr = ":8080"
	fmt.Println("Server listening on", addr)
	err = http.ListenAndServe(addr, server)
	if err != nil {
		log.Fatalf("Server failed %v", err)
	}
}
