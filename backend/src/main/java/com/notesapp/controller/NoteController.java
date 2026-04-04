package com.notesapp.controller;

import com.notesapp.dto.*;
import com.notesapp.entity.User;
import com.notesapp.service.NoteService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/notes")
@RequiredArgsConstructor
public class NoteController {

    private final NoteService noteService;
    private final SimpMessagingTemplate messagingTemplate;

    @GetMapping
    public ResponseEntity<PagedResponse<NoteSummaryResponse>> listNotes(
            @AuthenticationPrincipal User user,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) UUID tagId) {
        return ResponseEntity.ok(noteService.listNotes(user, page, size, tagId));
    }

    @GetMapping("/search")
    public ResponseEntity<PagedResponse<NoteSummaryResponse>> searchNotes(
            @AuthenticationPrincipal User user,
            @RequestParam String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(noteService.searchNotes(user, q, page, size));
    }

    @GetMapping("/{id}")
    public ResponseEntity<NoteResponse> getNote(
            @AuthenticationPrincipal User user,
            @PathVariable UUID id) {
        return ResponseEntity.ok(noteService.getNote(user, id));
    }

    @PostMapping
    public ResponseEntity<NoteResponse> createNote(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody CreateNoteRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(noteService.createNote(user, request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<NoteResponse> updateNote(
            @AuthenticationPrincipal User user,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateNoteRequest request) {
        NoteResponse updated = noteService.updateNote(user, id, request);
        messagingTemplate.convertAndSend(
                "/topic/notes/" + id,
                new NoteUpdateMessage(
                        id.toString(),
                        updated.title(),
                        updated.content(),
                        user.getUsername(),
                        Instant.now().toEpochMilli()));
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteNote(
            @AuthenticationPrincipal User user,
            @PathVariable UUID id) {
        noteService.deleteNote(user, id);
        return ResponseEntity.noContent().build();
    }
}
