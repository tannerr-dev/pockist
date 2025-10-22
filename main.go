package main
import (
	"fmt"
	"net/http"
	"log"
	"database/sql"
	"os"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)
func check(e error){
	if e != nil{
		panic(e)
	}
}
func select_all_and_print(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request){
		query := `
			SELECT * FROM playing_with_neon;
		`
		rows, err := db.Query(query)
		check(err)
		defer rows.Close()

		for rows.Next(){
			var id int
			var name string
			var value float64
			err := rows.Scan(&id, &name, &value)
			check(err)
			fmt.Printf("ID: %d, Name: %s, Value: %v \n", id, name, value)
		}
	}
}
func main(){
	fmt.Println("lello")

	// Load .env file, this mergest .env into the os env variables
	if err := godotenv.Load(); err != nil {
		log.Printf("No .env file found or failed to load: %v", err)
	}

	// Database connection
	dbConnStr := os.Getenv("DATABASE_URL")
	if dbConnStr == "" {
		log.Fatalf("DATABASE_URL not set in environment")
	}
	db, err := sql.Open("postgres", dbConnStr)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()
	// err := db.QueryRow()

	server := http.NewServeMux()
	server.HandleFunc("/all", select_all_and_print(db))
	server.Handle("/", http.FileServer(http.Dir("public")))

	const addr = ":8080"
	fmt.Println("Server listening on", addr)
	err = http.ListenAndServe(addr, server)
	if err != nil {
		log.Fatalf("Server failed %v", err)
	}
}
