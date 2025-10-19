package main
import (
	"fmt"
	"net/http"
	"log"
	"database/sql"
	_ "github.com/lib/pq"
)
func check(e error){
	if e != nil{
		panic(e)
	}
}
func main(){
	fmt.Println("lello")
	server := http.NewServeMux()

	// dbConnStr := os.Getenv("DATABASE_URL")
	dbConnStr := "postgresql://neondb_owner:npg_Y3wRkZ5uWgOV@ep-fancy-truth-adlclke5-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
	db, err := sql.Open("postgres", dbConnStr)
	check(err)
	defer db.Close()
	// err := db.QueryRow()
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

	server.Handle("/", http.FileServer(http.Dir("public")))

	const addr = ":8080"
	fmt.Println("Server listening on", addr)
	err = http.ListenAndServe(addr, server)
	if err != nil {
		log.Fatalf("Server failed %v", err)
	}
}
