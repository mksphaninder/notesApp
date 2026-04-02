package com.notesapp.service;

import com.notesapp.dto.*;
import com.notesapp.entity.Note;
import com.notesapp.entity.Tag;
import com.notesapp.entity.User;
import com.notesapp.exception.ResourceNotFoundException;
import com.notesapp.repository.NoteRepository;
import com.notesapp.repository.TagRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class NoteService {

    private final NoteRepository noteRepository;
    private final TagRepository tagRepository;

    @Transactional(readOnly = true)
    public PagedResponse<NoteSummaryResponse> listNotes(User user, int page, int size, UUID tagId) {
        Pageable pageable = PageRequest.of(page, size);
        var notePage = tagId != null
            ? noteRepository.findByUserIdAndTagId(user.getId(), tagId, pageable)
            : noteRepository.findByUserIdOrderByUpdatedAtDesc(user.getId(), pageable);
        return PagedResponse.from(notePage, NoteSummaryResponse::from);
    }

    @Transactional(readOnly = true)
    public NoteResponse getNote(User user, UUID noteId) {
        Note note = noteRepository.findByIdAndUserId(noteId, user.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Note", noteId.toString()));
        return NoteResponse.from(note);
    }

    @Transactional
    public NoteResponse createNote(User user, CreateNoteRequest request) {
        Set<Tag> tags = resolveTags(user, request.tagIds());

        Note note = Note.builder()
            .user(user)
            .title(request.title().trim())
            .content(request.content() != null ? request.content() : "{\"type\":\"doc\",\"content\":[]}")
            .contentText(extractText(request.content()))
            .tags(tags)
            .build();

        return NoteResponse.from(noteRepository.save(note));
    }

    @Transactional
    public NoteResponse updateNote(User user, UUID noteId, UpdateNoteRequest request) {
        Note note = noteRepository.findByIdAndUserId(noteId, user.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Note", noteId.toString()));

        if (request.title() != null && !request.title().isBlank()) {
            note.setTitle(request.title().trim());
        }
        if (request.content() != null) {
            note.setContent(request.content());
            note.setContentText(extractText(request.content()));
        }
        if (request.tagIds() != null) {
            note.setTags(resolveTags(user, request.tagIds()));
        }

        return NoteResponse.from(noteRepository.save(note));
    }

    @Transactional
    public void deleteNote(User user, UUID noteId) {
        Note note = noteRepository.findByIdAndUserId(noteId, user.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Note", noteId.toString()));
        noteRepository.delete(note);
    }

    @Transactional(readOnly = true)
    public PagedResponse<NoteSummaryResponse> searchNotes(User user, String query, int page, int size) {
        if (query == null || query.isBlank()) {
            return listNotes(user, page, size, null);
        }
        Pageable pageable = PageRequest.of(page, size);
        var notePage = noteRepository.searchByUser(user.getId(), query.trim(), pageable);
        return PagedResponse.from(notePage, NoteSummaryResponse::from);
    }

    private Set<Tag> resolveTags(User user, List<UUID> tagIds) {
        if (tagIds == null || tagIds.isEmpty()) return new HashSet<>();
        return tagIds.stream()
            .map(tagId -> tagRepository.findByIdAndUserId(tagId, user.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Tag", tagId.toString())))
            .collect(Collectors.toSet());
    }

    // Extracts plain text from ProseMirror JSON for full-text search indexing.
    // Phase 3 will replace this with proper TipTap parsing.
    private String extractText(String content) {
        if (content == null || content.isBlank()) return "";
        // Simple regex extraction of "text" values from ProseMirror JSON
        return content.replaceAll("\"text\"\\s*:\\s*\"([^\"]+)\"", "$1 ")
                      .replaceAll("[{},\\[\\]:\"\\\\]", " ")
                      .replaceAll("\\s+", " ")
                      .trim();
    }
}
