package token

import (
	"os"
	"log"
)

func GetJWTSecret() string {
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "default-secret-for-dev"
		log.Fatalf("JWT_SECRET not set, using default development secret")
	} else {
		log.Println("Using JWT_SECRET from environment")
	}
	return jwtSecret
}
