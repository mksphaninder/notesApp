package com.notesapp.dto;

import com.notesapp.entity.Note;

import java.time.OffsetDateTime;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

public record NoteResponse(
    UUID id,
    String title,
    String content,
    Set<TagResponse> tags,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {
    public static NoteResponse from(Note note) {
        return new NoteResponse(
            note.getId(),
            note.getTitle(),
            note.getContent(),
            note.getTags().stream().map(TagResponse::from).collect(Collectors.toSet()),
            note.getCreatedAt(),
            note.getUpdatedAt()
        );
    }
}
