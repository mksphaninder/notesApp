package com.notesapp.controller;

import com.notesapp.dto.*;
import com.notesapp.entity.User;
import com.notesapp.service.TagService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/tags")
@RequiredArgsConstructor
public class TagController {

    private final TagService tagService;

    @GetMapping
    public ResponseEntity<List<TagResponse>> listTags(@AuthenticationPrincipal User user) {
        return ResponseEntity.ok(tagService.listTags(user));
    }

    @PostMapping
    public ResponseEntity<TagResponse> createTag(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody CreateTagRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(tagService.createTag(user, request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<TagResponse> updateTag(
            @AuthenticationPrincipal User user,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateTagRequest request) {
        return ResponseEntity.ok(tagService.updateTag(user, id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTag(
            @AuthenticationPrincipal User user,
            @PathVariable UUID id) {
        tagService.deleteTag(user, id);
        return ResponseEntity.noContent().build();
    }
}
