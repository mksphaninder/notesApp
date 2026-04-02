package com.notesapp.dto;

import com.notesapp.entity.Tag;

import java.util.UUID;

public record TagResponse(
    UUID id,
    String name,
    String color
) {
    public static TagResponse from(Tag tag) {
        return new TagResponse(tag.getId(), tag.getName(), tag.getColor());
    }
}
