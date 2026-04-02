package com.notesapp.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UpdateTagRequest(
    @Size(max = 50) String name,
    @Pattern(regexp = "^#[0-9A-Fa-f]{6}$") String color
) {}
