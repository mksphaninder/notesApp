package com.notesapp.controller;

import com.notesapp.TestcontainersConfiguration;
import com.notesapp.dto.*;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Import;
import org.springframework.http.*;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@DisplayName("Auth API Integration Tests")
class AuthControllerIntegrationTest {

    @Autowired TestRestTemplate restTemplate;

    private static final String EMAIL = "maya@example.com";
    private static final String PASSWORD = "SecurePass123!";
    private static String refreshToken;

    @Test
    @Order(1)
    @DisplayName("POST /auth/register — 201 Created with access token")
    void register_success_returns201() {
        RegisterRequest request = new RegisterRequest(EMAIL, PASSWORD, "Maya Chen");

        ResponseEntity<AuthResponse> response = restTemplate.postForEntity(
                "/api/v1/auth/register", request, AuthResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().accessToken()).isNotBlank();
        assertThat(response.getBody().tokenType()).isEqualTo("Bearer");
        assertThat(response.getBody().user().email()).isEqualTo(EMAIL);
    }

    @Test
    @Order(2)
    @DisplayName("POST /auth/register — 409 Conflict on duplicate email")
    void register_duplicateEmail_returns409() {
        RegisterRequest request = new RegisterRequest(EMAIL, PASSWORD, "Maya Chen");

        ResponseEntity<String> response = restTemplate.postForEntity(
                "/api/v1/auth/register", request, String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    @Order(3)
    @DisplayName("POST /auth/register — 400 Bad Request on invalid email")
    void register_invalidEmail_returns400() {
        RegisterRequest request = new RegisterRequest("not-an-email", PASSWORD, "Maya");

        ResponseEntity<String> response = restTemplate.postForEntity(
                "/api/v1/auth/register", request, String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    @Order(4)
    @DisplayName("POST /auth/login — 200 OK with access token")
    void login_success_returns200() {
        LoginRequest request = new LoginRequest(EMAIL, PASSWORD);

        ResponseEntity<AuthResponse> response = restTemplate.postForEntity(
                "/api/v1/auth/login", request, AuthResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().accessToken()).isNotBlank();

        // Capture refresh token for subsequent tests
        // (In a real app, this comes from Set-Cookie header, but we return it in body for now)
        refreshToken = response.getBody().accessToken(); // placeholder
    }

    @Test
    @Order(5)
    @DisplayName("POST /auth/login — 401 Unauthorized on wrong password")
    void login_wrongPassword_returns401() {
        LoginRequest request = new LoginRequest(EMAIL, "wrong-password");

        ResponseEntity<String> response = restTemplate.postForEntity(
                "/api/v1/auth/login", request, String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @Order(6)
    @DisplayName("POST /auth/login — 401 Unauthorized on unknown email")
    void login_unknownEmail_returns401() {
        LoginRequest request = new LoginRequest("unknown@example.com", PASSWORD);

        ResponseEntity<String> response = restTemplate.postForEntity(
                "/api/v1/auth/login", request, String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @Order(7)
    @DisplayName("POST /auth/refresh — 401 on invalid token")
    void refresh_invalidToken_returns401() {
        RefreshRequest request = new RefreshRequest("invalid-refresh-token");

        ResponseEntity<String> response = restTemplate.postForEntity(
                "/api/v1/auth/refresh", request, String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @Order(8)
    @DisplayName("POST /auth/logout — 204 No Content")
    void logout_invalidToken_returns204() {
        // Logout with any token — graceful no-op for unknown tokens
        LogoutRequest request = new LogoutRequest("any-token");

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<LogoutRequest> entity = new HttpEntity<>(request, headers);

        ResponseEntity<Void> response = restTemplate.exchange(
                "/api/v1/auth/logout", HttpMethod.POST, entity, Void.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    }

    @Test
    @Order(9)
    @DisplayName("GET /notes — 401 Unauthorized without token")
    void protectedEndpoint_noToken_returns401() {
        ResponseEntity<String> response = restTemplate.getForEntity("/api/v1/notes", String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
