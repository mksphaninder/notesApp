package com.notesapp.service;

import com.notesapp.dto.*;
import com.notesapp.entity.Note;
import com.notesapp.entity.Tag;
import com.notesapp.entity.User;
import com.notesapp.exception.ResourceNotFoundException;
import com.notesapp.repository.NoteRepository;
import com.notesapp.repository.TagRepository;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.*;

import java.time.OffsetDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("NoteService")
class NoteServiceTest {

    @Mock NoteRepository noteRepository;
    @Mock TagRepository tagRepository;
    @InjectMocks NoteService noteService;

    private User maya;
    private User sam;
    private Note mayaNote;
    private Tag workTag;

    @BeforeEach
    void setUp() {
        maya = User.builder().id(UUID.randomUUID()).email("maya@example.com").displayName("Maya Chen").passwordHash("hash").build();
        sam  = User.builder().id(UUID.randomUUID()).email("sam@example.com").displayName("Sam Okafor").passwordHash("hash").build();

        workTag = Tag.builder().id(UUID.randomUUID()).user(maya).name("Work").color("#6366f1").build();

        mayaNote = Note.builder()
            .id(UUID.randomUUID()).user(maya)
            .title("Meeting notes").content("{\"type\":\"doc\",\"content\":[]}").contentText("Meeting notes")
            .tags(new HashSet<>(Set.of(workTag)))
            .createdAt(OffsetDateTime.now()).updatedAt(OffsetDateTime.now())
            .build();
    }

    // ---- listNotes ----
    @Test @DisplayName("listNotes returns paginated results for owner")
    void listNotes_returnsPagedResults() {
        Page<Note> page = new PageImpl<>(List.of(mayaNote));
        when(noteRepository.findByUserIdOrderByUpdatedAtDesc(eq(maya.getId()), any())).thenReturn(page);

        PagedResponse<NoteSummaryResponse> result = noteService.listNotes(maya, 0, 20, null);

        assertThat(result.content()).hasSize(1);
        assertThat(result.content().get(0).title()).isEqualTo("Meeting notes");
        assertThat(result.totalElements()).isEqualTo(1);
    }

    @Test @DisplayName("listNotes filters by tagId when provided")
    void listNotes_withTagFilter_callsTagFilteredQuery() {
        UUID tagId = workTag.getId();
        Page<Note> page = new PageImpl<>(List.of(mayaNote));
        when(noteRepository.findByUserIdAndTagId(eq(maya.getId()), eq(tagId), any())).thenReturn(page);

        noteService.listNotes(maya, 0, 20, tagId);

        verify(noteRepository).findByUserIdAndTagId(eq(maya.getId()), eq(tagId), any());
        verify(noteRepository, never()).findByUserIdOrderByUpdatedAtDesc(any(), any());
    }

    // ---- getNote ----
    @Test @DisplayName("Maya gets her own note")
    void getNote_owner_returnsNote() {
        when(noteRepository.findByIdAndUserId(mayaNote.getId(), maya.getId())).thenReturn(Optional.of(mayaNote));

        NoteResponse result = noteService.getNote(maya, mayaNote.getId());

        assertThat(result.id()).isEqualTo(mayaNote.getId());
        assertThat(result.title()).isEqualTo("Meeting notes");
    }

    @Test @DisplayName("Sam cannot access Maya's note — ResourceNotFoundException")
    void getNote_wrongUser_throwsNotFound() {
        when(noteRepository.findByIdAndUserId(mayaNote.getId(), sam.getId())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> noteService.getNote(sam, mayaNote.getId()))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    // ---- createNote ----
    @Test @DisplayName("createNote saves note with resolved tags")
    void createNote_withTag_savesNoteWithTag() {
        CreateNoteRequest req = new CreateNoteRequest("New idea", null, List.of(workTag.getId()));
        when(tagRepository.findByIdAndUserId(workTag.getId(), maya.getId())).thenReturn(Optional.of(workTag));
        when(noteRepository.save(any())).thenReturn(mayaNote);

        NoteResponse result = noteService.createNote(maya, req);

        assertThat(result).isNotNull();
        verify(noteRepository).save(argThat(n -> n.getTitle().equals("New idea")));
    }

    @Test @DisplayName("createNote with unknown tagId throws ResourceNotFoundException")
    void createNote_unknownTag_throwsNotFound() {
        UUID fakeTagId = UUID.randomUUID();
        CreateNoteRequest req = new CreateNoteRequest("Title", null, List.of(fakeTagId));
        when(tagRepository.findByIdAndUserId(fakeTagId, maya.getId())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> noteService.createNote(maya, req))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test @DisplayName("createNote sets default content when content is null")
    void createNote_nullContent_usesDefaultDoc() {
        CreateNoteRequest req = new CreateNoteRequest("Title", null, null);
        when(noteRepository.save(any())).thenReturn(mayaNote);

        noteService.createNote(maya, req);

        verify(noteRepository).save(argThat(n ->
            n.getContent().contains("\"type\":\"doc\"")));
    }

    // ---- updateNote ----
    @Test @DisplayName("updateNote changes title and content")
    void updateNote_titleAndContent_updated() {
        when(noteRepository.findByIdAndUserId(mayaNote.getId(), maya.getId())).thenReturn(Optional.of(mayaNote));
        when(noteRepository.save(any())).thenReturn(mayaNote);

        UpdateNoteRequest req = new UpdateNoteRequest("Updated title", "{\"type\":\"doc\",\"content\":[]}", null);
        noteService.updateNote(maya, mayaNote.getId(), req);

        assertThat(mayaNote.getTitle()).isEqualTo("Updated title");
        verify(noteRepository).save(mayaNote);
    }

    @Test @DisplayName("updateNote by non-owner throws ResourceNotFoundException")
    void updateNote_wrongUser_throwsNotFound() {
        when(noteRepository.findByIdAndUserId(mayaNote.getId(), sam.getId())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> noteService.updateNote(sam, mayaNote.getId(),
            new UpdateNoteRequest("x", null, null)))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    // ---- deleteNote ----
    @Test @DisplayName("Maya deletes her note successfully")
    void deleteNote_owner_deletesNote() {
        when(noteRepository.findByIdAndUserId(mayaNote.getId(), maya.getId())).thenReturn(Optional.of(mayaNote));

        noteService.deleteNote(maya, mayaNote.getId());

        verify(noteRepository).delete(mayaNote);
    }

    @Test @DisplayName("deleteNote by non-owner throws ResourceNotFoundException — note existence not leaked")
    void deleteNote_wrongUser_throwsNotFound() {
        when(noteRepository.findByIdAndUserId(mayaNote.getId(), sam.getId())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> noteService.deleteNote(sam, mayaNote.getId()))
            .isInstanceOf(ResourceNotFoundException.class);
        verify(noteRepository, never()).delete(any());
    }

    // ---- searchNotes ----
    @Test @DisplayName("searchNotes delegates to FTS query")
    void searchNotes_withQuery_callsFtsQuery() {
        Page<Note> page = new PageImpl<>(List.of(mayaNote));
        when(noteRepository.searchByUser(eq(maya.getId()), eq("meeting"), any())).thenReturn(page);

        PagedResponse<NoteSummaryResponse> result = noteService.searchNotes(maya, "meeting", 0, 20);

        assertThat(result.content()).hasSize(1);
        verify(noteRepository).searchByUser(eq(maya.getId()), eq("meeting"), any());
    }

    @Test @DisplayName("searchNotes with blank query falls back to listNotes")
    void searchNotes_blankQuery_fallsBackToList() {
        Page<Note> page = new PageImpl<>(List.of(mayaNote));
        when(noteRepository.findByUserIdOrderByUpdatedAtDesc(eq(maya.getId()), any())).thenReturn(page);

        noteService.searchNotes(maya, "   ", 0, 20);

        verify(noteRepository, never()).searchByUser(any(), any(), any());
        verify(noteRepository).findByUserIdOrderByUpdatedAtDesc(eq(maya.getId()), any());
    }
}
