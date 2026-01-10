package token

import (
	"time"
	"log"

	"github.com/golang-jwt/jwt/v5"
)

type User struct {
	ID int `json:"id"`
	Name string `json:"name"`
	Email string `json:"email"`
	Password string `json:"password"`
}

// func CreateJWT(user models.User, logger logger.Logger) string {
func CreateJWT(user User) string {
	jwtSecret := GetJWTSecret()

	// Create a JWT token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"id":    user.ID,
		"email": user.Email,
		"name":  user.Name,
		"exp":   time.Now().Add(time.Hour * 72).Unix(), // Token expires in 72 hours
	})

	// Sign the token with the secret
	tokenString, err := token.SignedString([]byte(jwtSecret))
	if err != nil {
		log.Fatalf("Failed to sign JWT", err)
		return ""
	}

	return tokenString
}
