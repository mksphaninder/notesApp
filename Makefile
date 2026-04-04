.PHONY: up down dev-up backend frontend test-backend test-frontend test e2e build docker-build

# ── Local dev ─────────────────────────────────────────────────────────────────
up:                          ## Start PostgreSQL only (dev mode)
	docker compose up -d postgres

down:                        ## Stop all Docker services
	docker compose down

dev-up:                      ## Start full stack in Docker (production-like)
	docker compose up -d

backend:                     ## Run Spring Boot in dev mode
	cd backend && ./mvnw spring-boot:run

frontend:                    ## Run Angular dev server
	cd frontend && npm start

# ── Tests ─────────────────────────────────────────────────────────────────────
test-backend:                ## Run backend unit + integration tests
	cd backend && ./mvnw test

test-frontend:               ## Run Angular unit tests (Vitest)
	cd frontend && npm test -- --watch=false

test: test-backend test-frontend  ## Run all unit tests

e2e:                         ## Run Playwright E2E tests (requires stack running on :4200)
	cd e2e && npm test

e2e-headed:                  ## Run E2E tests in headed browser
	cd e2e && npm run test:headed

# ── Build ─────────────────────────────────────────────────────────────────────
build:                       ## Production builds (no Docker)
	cd backend && ./mvnw clean package -DskipTests
	cd frontend && npm run build -- --configuration=production

docker-build:                ## Build Docker images
	docker build -t notesapp-backend ./backend
	docker build -t notesapp-frontend ./frontend

# ── Help ──────────────────────────────────────────────────────────────────────
help:                        ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
