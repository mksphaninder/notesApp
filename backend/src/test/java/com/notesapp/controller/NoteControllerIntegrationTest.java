package com.notesapp.controller;

import com.notesapp.TestcontainersConfiguration;
import com.notesapp.dto.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Import;
import org.springframework.http.*;
import org.springframework.test.annotation.DirtiesContext;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@DisplayName("Notes + Tags API Integration Tests")
class NoteControllerIntegrationTest {

    @Autowired TestRestTemplate restTemplate;

    private static String mayaToken;
    private static String samToken;
    private static UUID noteId;
    private static UUID tagId;

    // ─────────────── Setup helpers ───────────────

    private <T> HttpEntity<T> withAuth(T body, String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, headers);
    }

    private <T> HttpEntity<T> withAuth(String token) {
        return withAuth(null, token);
    }

    // ─────────────── Auth setup ───────────────

    @Test @Order(1)
    @DisplayName("Setup: register Maya")
    void setup_registerMaya() {
        var req = new RegisterRequest("maya@notes.com", "Password123!", "Maya Chen");
        var resp = restTemplate.postForEntity("/api/v1/auth/register", req, AuthResponse.class);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        mayaToken = resp.getBody().accessToken();
    }

    @Test @Order(2)
    @DisplayName("Setup: register Sam")
    void setup_registerSam() {
        var req = new RegisterRequest("sam@notes.com", "Password123!", "Sam Okafor");
        var resp = restTemplate.postForEntity("/api/v1/auth/register", req, AuthResponse.class);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        samToken = resp.getBody().accessToken();
    }

    // ─────────────── Auth enforcement ───────────────

    @Test @Order(3)
    @DisplayName("GET /notes without token → 401")
    void listNotes_noToken_returns401() {
        var resp = restTemplate.getForEntity("/api/v1/notes", String.class);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    // ─────────────── Tag CRUD ───────────────

    @Test @Order(4)
    @DisplayName("POST /tags → 201 Created")
    void createTag_success_returns201() {
        var req = new CreateTagRequest("Work", "#6366f1");
        var resp = restTemplate.exchange("/api/v1/tags", HttpMethod.POST,
                withAuth(req, mayaToken), TagResponse.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(resp.getBody().name()).isEqualTo("Work");
        tagId = resp.getBody().id();
    }

    @Test @Order(5)
    @DisplayName("POST /tags with duplicate name → 409")
    void createTag_duplicate_returns409() {
        var req = new CreateTagRequest("Work", "#6366f1");
        var resp = restTemplate.exchange("/api/v1/tags", HttpMethod.POST,
                withAuth(req, mayaToken), String.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test @Order(6)
    @DisplayName("GET /tags → 200 with Maya's tags")
    void listTags_returns200() {
        var resp = restTemplate.exchange("/api/v1/tags", HttpMethod.GET,
                withAuth(mayaToken), TagResponse[].class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).hasSize(1);
    }

    // ─────────────── Note CRUD ───────────────

    @Test @Order(7)
    @DisplayName("POST /notes → 201 Created with tag attached")
    void createNote_withTag_returns201() {
        var req = new CreateNoteRequest("Q2 planning", "{\"type\":\"doc\",\"content\":[]}", List.of(tagId));
        var resp = restTemplate.exchange("/api/v1/notes", HttpMethod.POST,
                withAuth(req, mayaToken), NoteResponse.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(resp.getBody().title()).isEqualTo("Q2 planning");
        assertThat(resp.getBody().tags()).hasSize(1);
        noteId = resp.getBody().id();
    }

    @Test @Order(8)
    @DisplayName("GET /notes → 200 with paginated list")
    void listNotes_returns200_withNote() {
        var resp = restTemplate.exchange("/api/v1/notes", HttpMethod.GET,
                withAuth(mayaToken), PagedResponse.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody().totalElements()).isEqualTo(1);
    }

    @Test @Order(9)
    @DisplayName("GET /notes/{id} → 200 for owner")
    void getNote_owner_returns200() {
        var resp = restTemplate.exchange("/api/v1/notes/" + noteId, HttpMethod.GET,
                withAuth(mayaToken), NoteResponse.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody().id()).isEqualTo(noteId);
    }

    @Test @Order(10)
    @DisplayName("GET /notes/{id} → 404 for Sam (no info leakage)")
    void getNote_wrongUser_returns404() {
        var resp = restTemplate.exchange("/api/v1/notes/" + noteId, HttpMethod.GET,
                withAuth(samToken), String.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test @Order(11)
    @DisplayName("PUT /notes/{id} → 200 with updated title")
    void updateNote_returns200() {
        var req = new UpdateNoteRequest("Q2 planning (updated)", null, null);
        var resp = restTemplate.exchange("/api/v1/notes/" + noteId, HttpMethod.PUT,
                withAuth(req, mayaToken), NoteResponse.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody().title()).isEqualTo("Q2 planning (updated)");
    }

    @Test @Order(12)
    @DisplayName("GET /notes/search?q=planning → 200 with result")
    void searchNotes_returns200() {
        var resp = restTemplate.exchange("/api/v1/notes/search?q=planning", HttpMethod.GET,
                withAuth(mayaToken), PagedResponse.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test @Order(13)
    @DisplayName("GET /notes?tagId={id} → 200 filtered by tag")
    void listNotes_filterByTag_returns200() {
        var resp = restTemplate.exchange("/api/v1/notes?tagId=" + tagId, HttpMethod.GET,
                withAuth(mayaToken), PagedResponse.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody().totalElements()).isEqualTo(1);
    }

    @Test @Order(14)
    @DisplayName("PUT /tags/{id} → 200 with updated color")
    void updateTag_returns200() {
        var req = new UpdateTagRequest(null, "#10b981");
        var resp = restTemplate.exchange("/api/v1/tags/" + tagId, HttpMethod.PUT,
                withAuth(req, mayaToken), TagResponse.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody().color()).isEqualTo("#10b981");
    }

    @Test @Order(15)
    @DisplayName("DELETE /notes/{id} → 204 No Content")
    void deleteNote_returns204() {
        var resp = restTemplate.exchange("/api/v1/notes/" + noteId, HttpMethod.DELETE,
                withAuth(mayaToken), Void.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    }

    @Test @Order(16)
    @DisplayName("GET /notes/{id} after delete → 404")
    void getNote_afterDelete_returns404() {
        var resp = restTemplate.exchange("/api/v1/notes/" + noteId, HttpMethod.GET,
                withAuth(mayaToken), String.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test @Order(17)
    @DisplayName("DELETE /tags/{id} → 204 No Content")
    void deleteTag_returns204() {
        var resp = restTemplate.exchange("/api/v1/tags/" + tagId, HttpMethod.DELETE,
                withAuth(mayaToken), Void.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    }
}
