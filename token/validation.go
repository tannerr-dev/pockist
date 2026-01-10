package token

import (
	"log"
	"github.com/golang-jwt/jwt/v5"
)

func ValidateJWT(tokenString string) (*jwt.Token, error) {
	jwtSecret := GetJWTSecret()

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Ensure the token's signing method is HMAC
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			log.Fatalf("Unexpected signing method", nil)
			return nil, jwt.ErrTokenSignatureInvalid
		}
		return []byte(jwtSecret), nil
	})

	if err != nil {
		log.Fatalf("Failed to validate JWT", err)
		return nil, err
	}

	if !token.Valid {
		log.Fatalf("Invalid JWT token", nil)
		return nil, jwt.ErrTokenInvalidId
	}

	return token, nil
}
