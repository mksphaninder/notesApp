package com.notesapp.dto;

import com.notesapp.entity.Note;

import java.time.OffsetDateTime;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

public record NoteSummaryResponse(
    UUID id,
    String title,
    String excerpt,
    Set<TagResponse> tags,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {
    public static NoteSummaryResponse from(Note note) {
        String excerpt = note.getContentText().length() > 150
            ? note.getContentText().substring(0, 150) + "…"
            : note.getContentText();
        return new NoteSummaryResponse(
            note.getId(),
            note.getTitle(),
            excerpt,
            note.getTags().stream().map(TagResponse::from).collect(Collectors.toSet()),
            note.getCreatedAt(),
            note.getUpdatedAt()
        );
    }
}
