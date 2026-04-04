package com.notesapp.dto;

public record NoteUpdateMessage(
    String noteId,
    String title,
    String content,
    String updatedBy,   // email of the user who triggered the update
    long updatedAt      // epoch milliseconds
) {}
