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

var (
	admin_template  *template.Template
	monies_template *template.Template
)

func init() {
	var err error
	admin_template, err = template.ParseFiles("templates/admin.html")
	monies_template, err = template.ParseFiles("templates/monies.html")
	if err != nil {
		log.Panic(err)
	}
}
func admin_route(w http.ResponseWriter, r *http.Request) {
	err := admin_template.Execute(w, nil)
	if err != nil {
		http.Error(w, "failed to load template", http.StatusInternalServerError)
	}
}
func monies_route(w http.ResponseWriter, r *http.Request) {
	err := monies_template.Execute(w, nil)
	if err != nil {
		http.Error(w, "failed to load template", http.StatusInternalServerError)
	}
}
func check(e error) {
	if e != nil {
		log.Panic(e)
	}
}
func main() {
	var err error
	admin_template, err = template.ParseFiles("templates/admin.html")
	check(err)
	monies_template, err = template.ParseFiles("templates/monies.html")
	check(err)
	db, err := sql.Open("sqlite3", "./data/pockist.db")
	if err != nil {
		log.Fatalf("db connection failed: %v", err)
	}
	defer db.Close()
	server := http.NewServeMux()
	server.HandleFunc("/admin", admin_route)
	server.HandleFunc("/monies", monies_route)
	server.HandleFunc("/admin/create", admin_handlers.Create_table(db))
	server.HandleFunc("/admin/delete", admin_handlers.Delete_table(db))
	server.HandleFunc("/admin/list_tables", admin_handlers.List_tables(db))
	server.HandleFunc("/admin/insert", admin_handlers.Insert(db))
	server.HandleFunc("/admin/all", admin_handlers.All_select(db))

	// server.HandleFunc("/monies/select_all", select_all_and_print(db))
	// server.HandleFunc("/monies/insert", insert(db))

	server.Handle("/", http.FileServer(http.Dir("public")))
	const addr = ":8080"
	fmt.Println("Server listening on", addr)
	err = http.ListenAndServe(addr, server)
	if err != nil {
		log.Fatalf("Server failed %v", err)
	}
}
