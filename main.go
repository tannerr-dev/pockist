package main
import (
    "fmt"
    "net/http"
    "log"
    "database/sql"
    "html/template"

    _ "github.com/mattn/go-sqlite3"
)
var(
    admin_template *template.Template
    monies_template *template.Template
)
func init(){
    var err error
    admin_template, err = template.ParseFiles("templates/admin.html")
    monies_template, err = template.ParseFiles("templates/monies.html")
    if err != nil{
        log.Panic(err)
    }
}
func create_table(db *sql.DB) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request){
        fmt.Println("create table")
        err:= r.ParseForm()
        if err != nil{
            log.Panic(err)
            http.Error(w, "Failed to parse form", http.StatusInternalServerError)
        }

        table_name := r.Form.Get("table_name")
        // table_name := r.FormValue("table_name")
        fmt.Println(table_name)
        query := `
            CREATE TABLE IF NOT EXISTS %s (
                id INTEGER PRIMARY KEY,
                name TEXT,
                amount REAL
            )
        `
        query = fmt.Sprintf(query, table_name)
        _, err = db.Exec(query)
        // _, err := db.Exec(query)
        if err != nil{
            log.Panic(err)
            http.Error(w, "Failed to parse form", http.StatusInternalServerError)
        }
        // message_template, err := template.ParseFiles("templates/message.html")
        // err = message_template.Execute(w, nil)
        http.Redirect(w, r, "/", http.StatusSeeOther)
    }
}
func contains (slice []string, item string) bool {
    for _, v := range slice {
        if v == item {
            return true
        }
    }
    return false
}
func delete_table(db *sql.DB) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request){
        fmt.Println("delete table")
        table_name := r.FormValue("table_name")
        fmt.Println(table_name)
        query := `
            SELECT name FROM sqlite_master WHERE type='table';
        `
        rows, err := db.Query(query)
        if err != nil{
            log.Panic(err)
            http.Error(w, "Failed to parse form", http.StatusInternalServerError)
        }
        defer rows.Close()
        var tables []string
        for rows.Next(){
            var name string
            err := rows.Scan(&name)
            if err != nil{
                log.Panic(err)
                http.Error(w, "Failed to parse form", http.StatusInternalServerError)
            }
            fmt.Println("Table name: ", name)
            tables = append(tables, name)
        }
        is_table := contains(tables, table_name)
        if is_table == false {
            w.Write([]byte("Error!!"))
            return
        }
        query = `DROP TABLE %s;`
        query = fmt.Sprintf(query, table_name)
        _, err = db.Exec(query)
        if err!=nil{
            w.Write([]byte("Error!!"))
        }
        http.Redirect(w, r, "/", http.StatusSeeOther)
    }
}
func list_tables(db *sql.DB) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request){
        fmt.Println("list tables")
        query := `
            SELECT name FROM sqlite_master WHERE type='table';
        `
        rows, err := db.Query(query)
        if err != nil{
            log.Panic(err)
            http.Error(w, "Failed to parse form", http.StatusInternalServerError)
        }
        defer rows.Close()
        var tables []string
        for rows.Next(){
            var name string
            err := rows.Scan(&name)
            if err != nil{
                log.Panic(err)
                http.Error(w, "Failed to parse form", http.StatusInternalServerError)
            }
            fmt.Println("Table name: ", name)
            tables = append(tables, name)
        }
        fmt.Println(tables)
        http.Redirect(w, r, "/", http.StatusSeeOther)
    }
}
func insert(db *sql.DB) http.HandlerFunc{
    return func(w http.ResponseWriter, r *http.Request){
        fmt.Println("insert")
        query := `
            INSERT INTO monies (name, amount) VALUES (?, ?)
        `
        _, err := db.Exec(query, "candy", 5)
        if err != nil{
            log.Panic(err)
            http.Error(w, "Failed to parse form", http.StatusInternalServerError)
        }
        http.Redirect(w, r, "/", http.StatusSeeOther)
    }
}
func select_all_and_print(db *sql.DB) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        fmt.Println("select all and print")
        query := `
            SELECT * FROM %s;
        `
        table_name := r.FormValue("table_name")
        fmt.Println(table_name)
        query = fmt.Sprintf(query, table_name)
        rows, err := db.Query(query)
        if err != nil{
            log.Panic(err)
            http.Error(w, "Failed to parse form", http.StatusInternalServerError)
        }
        defer rows.Close()

        for rows.Next(){
            var id int
            var name string
            var value float64
            err := rows.Scan(&id, &name, &value)
            if err != nil{
                log.Panic(err)
                http.Error(w, "Failed to parse form", http.StatusInternalServerError)
            }
            fmt.Printf("ID: %d, Name: %s, Value: %v \n", id, name, value)
        }
        http.Redirect(w, r, "/", http.StatusSeeOther)
    }
}
func admin_route(w http.ResponseWriter, r *http.Request){
    err:= admin_template.Execute(w, nil)
    if err!=nil{
        http.Error(w, "failed to load template", http.StatusInternalServerError)
    }
}
func monies_route(w http.ResponseWriter, r *http.Request){
    err:= monies_template.Execute(w, nil)
    if err!=nil{
        http.Error(w, "failed to load template", http.StatusInternalServerError)
    }
}
func main(){
    db, err := sql.Open("sqlite3", "./data/pockist.db")
    if err != nil{
        log.Fatalf("db connection failed: %v", err)
    }
    defer db.Close()
    server := http.NewServeMux()
    server.HandleFunc("/admin", admin_route)
    server.HandleFunc("/monies", monies_route)
    server.HandleFunc("/admim/create", create_table(db))
    server.HandleFunc("/admin/delete", delete_table(db))
    server.HandleFunc("/admin/list_tables", list_tables(db))
    server.HandleFunc("/admin/all", select_all_and_print(db))
    server.HandleFunc("/monies/select_all", select_all_and_print(db))
    server.HandleFunc("/monies/insert", insert(db))
    server.Handle("/", http.FileServer(http.Dir("public")))
    const addr = ":8080"
    fmt.Println("Server listening on", addr)
    err = http.ListenAndServe(addr, server)
    if err != nil {
        log.Fatalf("Server failed %v", err)
    }
}
