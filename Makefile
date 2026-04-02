.PHONY: up down backend frontend test-backend test-frontend

up:
	docker-compose up -d

down:
	docker-compose down

backend:
	cd backend && ./mvnw spring-boot:run

frontend:
	cd frontend && npm start

test-backend:
	cd backend && ./mvnw test

test-frontend:
	cd frontend && npm run test -- --watch=false --browsers=ChromeHeadless

build:
	cd backend && ./mvnw clean package -DskipTests
	cd frontend && npm run build
