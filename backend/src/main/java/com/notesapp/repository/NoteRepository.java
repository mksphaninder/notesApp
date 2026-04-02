package com.notesapp.repository;

import com.notesapp.entity.Note;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface NoteRepository extends JpaRepository<Note, UUID> {

    Page<Note> findByUserIdOrderByUpdatedAtDesc(UUID userId, Pageable pageable);

    Optional<Note> findByIdAndUserId(UUID id, UUID userId);

    @Query(value = """
        SELECT n.* FROM notes n
        WHERE n.user_id = :userId
          AND n.search_vector @@ plainto_tsquery('english', :query)
        ORDER BY ts_rank(n.search_vector, plainto_tsquery('english', :query)) DESC
        """,
        countQuery = """
        SELECT count(*) FROM notes n
        WHERE n.user_id = :userId
          AND n.search_vector @@ plainto_tsquery('english', :query)
        """,
        nativeQuery = true)
    Page<Note> searchByUser(@Param("userId") UUID userId, @Param("query") String query, Pageable pageable);

    @Query(value = """
        SELECT n.* FROM notes n
        JOIN note_tags nt ON nt.note_id = n.id
        WHERE n.user_id = :userId AND nt.tag_id = :tagId
        ORDER BY n.updated_at DESC
        """, nativeQuery = true)
    Page<Note> findByUserIdAndTagId(@Param("userId") UUID userId, @Param("tagId") UUID tagId, Pageable pageable);
}
