package com.notesapp.security;

import com.notesapp.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

@DisplayName("JwtService")
class JwtServiceTest {

    private JwtService jwtService;
    private User testUser;

    @BeforeEach
    void setUp() {
        jwtService = new JwtService();
        ReflectionTestUtils.setField(jwtService, "secret",
                "test-secret-key-that-is-long-enough-for-hs256-algorithm-32chars");
        ReflectionTestUtils.setField(jwtService, "accessTokenExpiration", 900000L);
        ReflectionTestUtils.setField(jwtService, "refreshTokenExpiration", 604800000L);

        testUser = User.builder()
                .id(UUID.randomUUID())
                .email("maya@example.com")
                .passwordHash("hashed")
                .displayName("Maya Chen")
                .build();
    }

    @Test
    @DisplayName("generateAccessToken produces a valid JWT with correct subject")
    void generateAccessToken_validJwt_correctSubject() {
        String token = jwtService.generateAccessToken(testUser);

        assertThat(token).isNotBlank();
        assertThat(jwtService.extractUsername(token)).isEqualTo("maya@example.com");
    }

    @Test
    @DisplayName("isTokenValid returns true for fresh token matching user")
    void isTokenValid_freshToken_returnsTrue() {
        String token = jwtService.generateAccessToken(testUser);
        assertThat(jwtService.isTokenValid(token, testUser)).isTrue();
    }

    @Test
    @DisplayName("isTokenValid returns false for token with wrong user")
    void isTokenValid_wrongUser_returnsFalse() {
        String token = jwtService.generateAccessToken(testUser);
        User otherUser = User.builder()
                .id(UUID.randomUUID())
                .email("sam@example.com")
                .passwordHash("hashed")
                .displayName("Sam")
                .build();
        assertThat(jwtService.isTokenValid(token, otherUser)).isFalse();
    }

    @Test
    @DisplayName("generateRefreshToken returns a non-blank opaque string")
    void generateRefreshToken_returnsOpaqueString() {
        String token = jwtService.generateRefreshToken();
        assertThat(token).isNotBlank().hasSizeGreaterThan(32);
    }

    @Test
    @DisplayName("hashToken returns consistent SHA-256 hex for same input")
    void hashToken_consistent_sha256() {
        String hash1 = jwtService.hashToken("my-raw-token");
        String hash2 = jwtService.hashToken("my-raw-token");
        assertThat(hash1).isEqualTo(hash2).hasSize(64);
    }

    @Test
    @DisplayName("hashToken produces different hashes for different inputs")
    void hashToken_differentInputs_differentHashes() {
        assertThat(jwtService.hashToken("token-a"))
                .isNotEqualTo(jwtService.hashToken("token-b"));
    }
}
