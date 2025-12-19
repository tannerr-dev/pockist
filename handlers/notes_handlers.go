package handlers

import (
	"database/sql"
	"fmt"
	// "fmt"
	"encoding/json"
	"html/template"
	"log"
	"net/http"

	_ "github.com/mattn/go-sqlite3"
)

type Note struct {
	ID           int
	Note         string
	DateCreated  string
	DateModified string
}

type NotesStruct struct {
	NotesSlice []Note
}

type NotesHandler struct {
	db *sql.DB
}

var (
	notesTemplate    *template.Template
	ssrNotesTemplate *template.Template
)

func init() {
	var err error
	notesTemplate, err = template.ParseFiles(
		"templates/layout.html", 
		"templates/nav.html", 
		"templates/notes.html",
	)
	if err != nil {
		log.Fatalf("umm error parsing notes template: %v", err)
	}
	ssrNotesTemplate, err = template.ParseFiles(
		"templates/layout.html", 
		"templates/nav.html",
		"templates/ssrnotes.html",
	)
	if err != nil {
		log.Fatalf("umm error parsing notes template: %v", err)
	}
}
func CreateNotesHandler(db *sql.DB) *NotesHandler {
	return &NotesHandler{
		db: db,
	}
}

func (h *NotesHandler) Notes(w http.ResponseWriter, r *http.Request) {
	err := notesTemplate.Execute(w, nil)
	if err != nil {
		http.Error(w, "failed to exec template", http.StatusInternalServerError)
	}
}

func writeJSONResponse(w http.ResponseWriter, data interface{}) error {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(data); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return err
	}
	return nil
}

func (h *NotesHandler) NotesJson(w http.ResponseWriter, r *http.Request) {
	notes, err := fetchNotesFromDB(h.db)
	if err != nil {
		http.Error(w, "failed to fetch notes", http.StatusInternalServerError)
		return
	}

	data := NotesStruct{NotesSlice: notes}
	if err := writeJSONResponse(w, data); err!= nil {
		http.Error(w, "failed to fetch notes", http.StatusInternalServerError)
	}
}

func (h *NotesHandler) SsrNotesRoute(w http.ResponseWriter, r *http.Request) {
	fmt.Println("INFO served notes ssr route")
	notes, err := fetchNotesFromDB(h.db)
	if err != nil {
		return
	}

	data := NotesStruct{NotesSlice: notes}
	err = ssrNotesTemplate.Execute(w, data)
	if err != nil {
		http.Error(w, "failed to exec template", http.StatusInternalServerError)
	}
}

func fetchNotesFromDB(db *sql.DB) ([]Note, error) {
	query := `SELECT id, note, date_created, date_modified FROM notes ORDER BY date_created DESC`
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notes []Note
	for rows.Next() {
		var note Note
		if err := rows.Scan(&note.ID, &note.Note, &note.DateCreated, &note.DateModified); err != nil {
			return nil, err
		}
		notes = append(notes, note)
	}
	return notes, nil
}

func (h *NotesHandler) NotesInsert(w http.ResponseWriter, r *http.Request) {
	note := r.FormValue("note")
	if note == "" {
		http.Error(w, "Note cannot be empty", http.StatusBadRequest)
		return
	}
	query := `
		INSERT INTO notes (note) VALUES (?)
	`
	_, err := h.db.Exec(query, note)
	if err != nil {
		log.Printf("Error inserting note: %v", err)
		http.Error(w, "Failed to insert note", http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/ssrnotes", http.StatusSeeOther)
}

func (h *NotesHandler) NotesDelete(w http.ResponseWriter, r *http.Request) {
	id := r.FormValue("form_id")
	if id == "" {
		http.Error(w, "ID cannot be empty", http.StatusBadRequest)
		return
	}
	query := `DELETE FROM notes WHERE id = ?`
	_, err := h.db.Exec(query, id)
	if err != nil {
		log.Printf("Error deleting note: %v", err)
		http.Error(w, "Failed to delete note", http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/ssrnotes", http.StatusSeeOther)
}
