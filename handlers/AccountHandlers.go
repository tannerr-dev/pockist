package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"tannerr/pockist/token"
)

type AccountHandler struct {
	db *sql.DB
}

func CreateAccountHandler(db *sql.DB) *AccountHandler {
	return &AccountHandler{
		db: db,
	}
}

// Request/Response structures
type AuthRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

type AuthResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	JWT     string `json:"jwt,omitempty"`
}

// Utility functions
func (h *AccountHandler) writeJSONResponse(w http.ResponseWriter, data interface{}) error {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Failed to encode response: %v", err)
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return err
	}
	return nil
}

// Register a new user
func (h *AccountHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Failed to decode registration request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate input
	if req.Email == "" || req.Password == "" {
		h.writeJSONResponse(w, AuthResponse{
			Success: false,
			Message: "Email and password are required",
		})
		return
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("Failed to hash password: %v", err)
		http.Error(w, "Failed to process password", http.StatusInternalServerError)
		return
	}

	// Check if user already exists
	var existingID int
	err = h.db.QueryRow("SELECT id FROM users WHERE email = ?", req.Email).Scan(&existingID)
	if err == nil {
		h.writeJSONResponse(w, AuthResponse{
			Success: false,
			Message: "User already exists",
		})
		return
	} else if err != sql.ErrNoRows {
		log.Printf("Failed to check existing user: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Insert new user
	result, err := h.db.Exec(
		"INSERT INTO users (email, password_hash) VALUES (?, ?)",
		req.Email, string(hashedPassword),
	)
	if err != nil {
		log.Printf("Failed to create user: %v", err)
		http.Error(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	userID, err := result.LastInsertId()
	if err != nil {
		log.Printf("Failed to get user ID: %v", err)
		http.Error(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	// Create JWT token
	user := token.User{
		ID:    int(userID),
		Email: req.Email,
		Name:  req.Name,
	}
	jwtToken := token.CreateJWT(user)

	response := AuthResponse{
		Success: true,
		Message: "User registered successfully",
		JWT:     jwtToken,
	}

	if err := h.writeJSONResponse(w, response); err == nil {
		log.Printf("Successfully registered user with email: %s", req.Email)
	}
}

// Authenticate an existing user
func (h *AccountHandler) Authenticate(w http.ResponseWriter, r *http.Request) {
	var req AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Failed to decode authentication request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate input
	if req.Email == "" || req.Password == "" {
		h.writeJSONResponse(w, AuthResponse{
			Success: false,
			Message: "Email and password are required",
		})
		return
	}

	// Get user from database
	var userID int
	var storedHash string
	err := h.db.QueryRow("SELECT id, password_hash FROM users WHERE email = ?", req.Email).Scan(&userID, &storedHash)
	if err == sql.ErrNoRows {
		h.writeJSONResponse(w, AuthResponse{
			Success: false,
			Message: "Invalid email or password",
		})
		return
	} else if err != nil {
		log.Printf("Failed to query user: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Verify password
	err = bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(req.Password))
	if err != nil {
		h.writeJSONResponse(w, AuthResponse{
			Success: false,
			Message: "Invalid email or password",
		})
		return
	}

	// Create JWT token
	user := token.User{
		ID:    userID,
		Email: req.Email,
		Name:  "", // You can add name to the users table if needed
	}
	jwtToken := token.CreateJWT(user)

	response := AuthResponse{
		Success: true,
		Message: "User authenticated successfully",
		JWT:     jwtToken,
	}

	if err := h.writeJSONResponse(w, response); err == nil {
		log.Printf("Successfully authenticated user with email: %s", req.Email)
	}
}

// AuthMiddleware validates JWT tokens
func (h *AccountHandler) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenStr := r.Header.Get("Authorization")
		if tokenStr == "" {
			http.Error(w, "Missing authorization token", http.StatusUnauthorized)
			return
		}

		// Remove "Bearer " prefix if present
		tokenStr = strings.TrimPrefix(tokenStr, "Bearer ")

		// Parse and validate the token
		parsedToken, err := jwt.Parse(tokenStr,
			func(t *jwt.Token) (interface{}, error) {
				// Ensure the signing method is HMAC
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, jwt.ErrSignatureInvalid
				}
				return []byte(token.GetJWTSecret()), nil
			},
		)
		if err != nil || !parsedToken.Valid {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		// Extract claims from the token
		claims, ok := parsedToken.Claims.(jwt.MapClaims)
		if !ok {
			http.Error(w, "Invalid token claims", http.StatusUnauthorized)
			return
		}

		// Get the email and user ID from claims
		email, ok := claims["email"].(string)
		if !ok {
			http.Error(w, "Email not found in token", http.StatusUnauthorized)
			return
		}

		userIDFloat, ok := claims["id"].(float64)
		if !ok {
			http.Error(w, "User ID not found in token", http.StatusUnauthorized)
			return
		}
		userID := int(userIDFloat)

		// Inject user info into the request context
		ctx := context.WithValue(r.Context(), "email", email)
		ctx = context.WithValue(ctx, "user_id", userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
