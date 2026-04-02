package com.notesapp.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record CreateNoteRequest(
    @NotBlank @Size(max = 500) String title,
    String content,
    List<UUID> tagIds
) {}
