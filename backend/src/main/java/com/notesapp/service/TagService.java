package com.notesapp.service;

import com.notesapp.dto.CreateTagRequest;
import com.notesapp.dto.TagResponse;
import com.notesapp.dto.UpdateTagRequest;
import com.notesapp.entity.Tag;
import com.notesapp.entity.User;
import com.notesapp.exception.DuplicateTagException;
import com.notesapp.exception.ResourceNotFoundException;
import com.notesapp.repository.TagRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TagService {

    private final TagRepository tagRepository;

    @Transactional(readOnly = true)
    public List<TagResponse> listTags(User user) {
        return tagRepository.findByUserIdOrderByNameAsc(user.getId())
            .stream().map(TagResponse::from).collect(Collectors.toList());
    }

    @Transactional
    public TagResponse createTag(User user, CreateTagRequest request) {
        if (tagRepository.existsByUserIdAndName(user.getId(), request.name())) {
            throw new DuplicateTagException(request.name());
        }
        Tag tag = Tag.builder()
            .user(user)
            .name(request.name().trim())
            .color(request.color() != null ? request.color() : "#6366f1")
            .build();
        return TagResponse.from(tagRepository.save(tag));
    }

    @Transactional
    public TagResponse updateTag(User user, UUID tagId, UpdateTagRequest request) {
        Tag tag = tagRepository.findByIdAndUserId(tagId, user.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Tag", tagId.toString()));

        if (request.name() != null && !request.name().isBlank()) {
            if (!request.name().equals(tag.getName()) &&
                tagRepository.existsByUserIdAndName(user.getId(), request.name())) {
                throw new DuplicateTagException(request.name());
            }
            tag.setName(request.name().trim());
        }
        if (request.color() != null) {
            tag.setColor(request.color());
        }
        return TagResponse.from(tagRepository.save(tag));
    }

    @Transactional
    public void deleteTag(User user, UUID tagId) {
        Tag tag = tagRepository.findByIdAndUserId(tagId, user.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Tag", tagId.toString()));
        tagRepository.delete(tag);
    }
}
