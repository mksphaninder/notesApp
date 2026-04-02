package com.notesapp.service;

import com.notesapp.dto.CreateTagRequest;
import com.notesapp.dto.TagResponse;
import com.notesapp.dto.UpdateTagRequest;
import com.notesapp.entity.Tag;
import com.notesapp.entity.User;
import com.notesapp.exception.DuplicateTagException;
import com.notesapp.exception.ResourceNotFoundException;
import com.notesapp.repository.TagRepository;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("TagService")
class TagServiceTest {

    @Mock TagRepository tagRepository;
    @InjectMocks TagService tagService;

    private User maya;
    private Tag workTag;

    @BeforeEach
    void setUp() {
        maya = User.builder().id(UUID.randomUUID()).email("maya@example.com")
                .displayName("Maya Chen").passwordHash("hash").build();

        workTag = Tag.builder().id(UUID.randomUUID()).user(maya)
                .name("Work").color("#6366f1").build();
    }

    @Nested
    @DisplayName("listTags()")
    class ListTags {

        @Test
        @DisplayName("returns Maya's tags sorted by name")
        void listTags_returnsSortedList() {
            when(tagRepository.findByUserIdOrderByNameAsc(maya.getId()))
                    .thenReturn(List.of(workTag));

            List<TagResponse> result = tagService.listTags(maya);

            assertThat(result).hasSize(1);
            assertThat(result.get(0).name()).isEqualTo("Work");
        }

        @Test
        @DisplayName("returns empty list when Maya has no tags")
        void listTags_empty_returnsEmptyList() {
            when(tagRepository.findByUserIdOrderByNameAsc(maya.getId())).thenReturn(List.of());

            assertThat(tagService.listTags(maya)).isEmpty();
        }
    }

    @Nested
    @DisplayName("createTag()")
    class CreateTag {

        @Test
        @DisplayName("Maya creates a Work tag successfully")
        void createTag_success_savedAndReturned() {
            when(tagRepository.existsByUserIdAndName(maya.getId(), "Design")).thenReturn(false);
            when(tagRepository.save(any())).thenReturn(
                    Tag.builder().id(UUID.randomUUID()).user(maya).name("Design").color("#ef4444").build());

            TagResponse result = tagService.createTag(maya, new CreateTagRequest("Design", "#ef4444"));

            assertThat(result.name()).isEqualTo("Design");
            assertThat(result.color()).isEqualTo("#ef4444");
        }

        @Test
        @DisplayName("duplicate tag name throws DuplicateTagException")
        void createTag_duplicateName_throwsDuplicateTagException() {
            when(tagRepository.existsByUserIdAndName(maya.getId(), "Work")).thenReturn(true);

            assertThatThrownBy(() -> tagService.createTag(maya, new CreateTagRequest("Work", null)))
                    .isInstanceOf(DuplicateTagException.class)
                    .hasMessageContaining("Work");
        }

        @Test
        @DisplayName("null color defaults to #6366f1")
        void createTag_nullColor_usesDefault() {
            when(tagRepository.existsByUserIdAndName(any(), any())).thenReturn(false);
            when(tagRepository.save(any())).thenReturn(workTag);

            tagService.createTag(maya, new CreateTagRequest("Work", null));

            verify(tagRepository).save(argThat(t -> t.getColor().equals("#6366f1")));
        }
    }

    @Nested
    @DisplayName("updateTag()")
    class UpdateTag {

        @Test
        @DisplayName("Maya renames her tag")
        void updateTag_rename_success() {
            when(tagRepository.findByIdAndUserId(workTag.getId(), maya.getId()))
                    .thenReturn(Optional.of(workTag));
            when(tagRepository.existsByUserIdAndName(maya.getId(), "Personal")).thenReturn(false);
            when(tagRepository.save(any())).thenReturn(workTag);

            tagService.updateTag(maya, workTag.getId(), new UpdateTagRequest("Personal", null));

            assertThat(workTag.getName()).isEqualTo("Personal");
        }

        @Test
        @DisplayName("renaming to existing name throws DuplicateTagException")
        void updateTag_renameToExisting_throwsDuplicate() {
            when(tagRepository.findByIdAndUserId(workTag.getId(), maya.getId()))
                    .thenReturn(Optional.of(workTag));
            when(tagRepository.existsByUserIdAndName(maya.getId(), "Personal")).thenReturn(true);

            assertThatThrownBy(() ->
                    tagService.updateTag(maya, workTag.getId(), new UpdateTagRequest("Personal", null)))
                    .isInstanceOf(DuplicateTagException.class);
        }

        @Test
        @DisplayName("updating color without changing name succeeds")
        void updateTag_colorOnly_success() {
            when(tagRepository.findByIdAndUserId(workTag.getId(), maya.getId()))
                    .thenReturn(Optional.of(workTag));
            when(tagRepository.save(any())).thenReturn(workTag);

            tagService.updateTag(maya, workTag.getId(), new UpdateTagRequest(null, "#10b981"));

            assertThat(workTag.getColor()).isEqualTo("#10b981");
        }

        @Test
        @DisplayName("non-owner update throws ResourceNotFoundException")
        void updateTag_wrongUser_throwsNotFound() {
            User sam = User.builder().id(UUID.randomUUID()).email("sam@example.com")
                    .displayName("Sam").passwordHash("hash").build();
            when(tagRepository.findByIdAndUserId(workTag.getId(), sam.getId()))
                    .thenReturn(Optional.empty());

            assertThatThrownBy(() ->
                    tagService.updateTag(sam, workTag.getId(), new UpdateTagRequest("x", null)))
                    .isInstanceOf(ResourceNotFoundException.class);
        }
    }

    @Nested
    @DisplayName("deleteTag()")
    class DeleteTag {

        @Test
        @DisplayName("Maya deletes her tag")
        void deleteTag_owner_success() {
            when(tagRepository.findByIdAndUserId(workTag.getId(), maya.getId()))
                    .thenReturn(Optional.of(workTag));

            tagService.deleteTag(maya, workTag.getId());

            verify(tagRepository).delete(workTag);
        }

        @Test
        @DisplayName("non-owner delete throws ResourceNotFoundException — no delete called")
        void deleteTag_wrongUser_throwsNotFound() {
            User sam = User.builder().id(UUID.randomUUID()).email("sam@example.com")
                    .displayName("Sam").passwordHash("hash").build();
            when(tagRepository.findByIdAndUserId(workTag.getId(), sam.getId()))
                    .thenReturn(Optional.empty());

            assertThatThrownBy(() -> tagService.deleteTag(sam, workTag.getId()))
                    .isInstanceOf(ResourceNotFoundException.class);
            verify(tagRepository, never()).delete(any());
        }
    }
}
