package com.notesapp.service;

import com.notesapp.dto.*;
import com.notesapp.entity.RefreshToken;
import com.notesapp.entity.User;
import com.notesapp.exception.EmailAlreadyExistsException;
import com.notesapp.exception.InvalidCredentialsException;
import com.notesapp.exception.InvalidTokenException;
import com.notesapp.repository.RefreshTokenRepository;
import com.notesapp.repository.UserRepository;
import com.notesapp.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("AuthService")
class AuthServiceTest {

    @Mock UserRepository userRepository;
    @Mock RefreshTokenRepository refreshTokenRepository;
    @Mock JwtService jwtService;
    @Mock PasswordEncoder passwordEncoder;
    @Mock AuthenticationManager authenticationManager;

    @InjectMocks AuthService authService;

    private User testUser;

    @BeforeEach
    void setUp() {
        testUser = User.builder()
                .id(UUID.randomUUID())
                .email("maya@example.com")
                .passwordHash("hashed")
                .displayName("Maya Chen")
                .build();

        when(jwtService.generateAccessToken(any())).thenReturn("access.token.jwt");
        when(jwtService.generateRefreshToken()).thenReturn("raw-refresh-token");
        when(jwtService.hashToken(anyString())).thenReturn("hashed-token");
        when(jwtService.getAccessTokenExpiration()).thenReturn(900000L);
        when(jwtService.getRefreshTokenExpiration()).thenReturn(604800000L);
        when(refreshTokenRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    @Nested
    @DisplayName("register()")
    class Register {

        @Test
        @DisplayName("happy path returns AuthResponse with access token")
        void register_success_returnsAuthResponse() {
            when(userRepository.existsByEmail("maya@example.com")).thenReturn(false);
            when(userRepository.save(any())).thenReturn(testUser);

            AuthResponse response = authService.register(
                    new RegisterRequest("maya@example.com", "password123", "Maya Chen"));

            assertThat(response.accessToken()).isEqualTo("access.token.jwt");
            assertThat(response.tokenType()).isEqualTo("Bearer");
            assertThat(response.user().email()).isEqualTo("maya@example.com");
        }

        @Test
        @DisplayName("duplicate email throws EmailAlreadyExistsException")
        void register_duplicateEmail_throwsEmailAlreadyExistsException() {
            when(userRepository.existsByEmail("maya@example.com")).thenReturn(true);

            assertThatThrownBy(() -> authService.register(
                    new RegisterRequest("maya@example.com", "password123", "Maya")))
                    .isInstanceOf(EmailAlreadyExistsException.class)
                    .hasMessageContaining("maya@example.com");
        }

        @Test
        @DisplayName("email is normalized to lowercase before saving")
        void register_emailNormalized_storedLowercase() {
            when(userRepository.existsByEmail(anyString())).thenReturn(false);
            when(userRepository.save(any())).thenReturn(testUser);

            authService.register(new RegisterRequest("MAYA@EXAMPLE.COM", "password123", "Maya"));

            ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
            verify(userRepository).save(captor.capture());
            assertThat(captor.getValue().getEmail()).isEqualTo("maya@example.com");
        }

        @Test
        @DisplayName("password is BCrypt-encoded before saving")
        void register_passwordEncoded_beforeSaving() {
            when(userRepository.existsByEmail(anyString())).thenReturn(false);
            when(passwordEncoder.encode("password123")).thenReturn("$2a$hashed");
            when(userRepository.save(any())).thenReturn(testUser);

            authService.register(new RegisterRequest("maya@example.com", "password123", "Maya"));

            verify(passwordEncoder).encode("password123");
        }
    }

    @Nested
    @DisplayName("login()")
    class Login {

        @Test
        @DisplayName("happy path returns AuthResponse")
        void login_success_returnsAuthResponse() {
            when(userRepository.findByEmail("maya@example.com")).thenReturn(Optional.of(testUser));

            AuthResponse response = authService.login(new LoginRequest("maya@example.com", "password123"));

            assertThat(response.accessToken()).isEqualTo("access.token.jwt");
            verify(authenticationManager).authenticate(any(UsernamePasswordAuthenticationToken.class));
        }

        @Test
        @DisplayName("bad credentials throws InvalidCredentialsException")
        void login_badCredentials_throwsInvalidCredentialsException() {
            doThrow(new BadCredentialsException("bad"))
                    .when(authenticationManager).authenticate(any());

            assertThatThrownBy(() -> authService.login(new LoginRequest("maya@example.com", "wrong")))
                    .isInstanceOf(InvalidCredentialsException.class);
        }

        @Test
        @DisplayName("user not found after auth passes throws InvalidCredentialsException")
        void login_userNotFound_throwsInvalidCredentialsException() {
            when(userRepository.findByEmail("maya@example.com")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> authService.login(new LoginRequest("maya@example.com", "password123")))
                    .isInstanceOf(InvalidCredentialsException.class);
        }
    }

    @Nested
    @DisplayName("refresh()")
    class Refresh {

        private RefreshToken validToken;

        @BeforeEach
        void setUp() {
            validToken = RefreshToken.builder()
                    .id(UUID.randomUUID())
                    .user(testUser)
                    .tokenHash("hashed-token")
                    .expiresAt(OffsetDateTime.now().plusDays(7))
                    .revoked(false)
                    .build();
        }

        @Test
        @DisplayName("valid token returns new access token and rotates refresh token")
        void refresh_success_rotatesToken() {
            when(refreshTokenRepository.findByTokenHash("hashed-token")).thenReturn(Optional.of(validToken));

            AuthResponse response = authService.refresh(new RefreshRequest("raw-refresh-token"));

            assertThat(response.accessToken()).isEqualTo("access.token.jwt");
            assertThat(validToken.isRevoked()).isTrue();
            verify(refreshTokenRepository, times(2)).save(any()); // revoke old + save new
        }

        @Test
        @DisplayName("unknown token throws InvalidTokenException")
        void refresh_tokenNotFound_throwsInvalidTokenException() {
            when(refreshTokenRepository.findByTokenHash(anyString())).thenReturn(Optional.empty());

            assertThatThrownBy(() -> authService.refresh(new RefreshRequest("unknown-token")))
                    .isInstanceOf(InvalidTokenException.class)
                    .hasMessageContaining("not found");
        }

        @Test
        @DisplayName("revoked token triggers reuse detection — revokes all user tokens")
        void refresh_tokenRevoked_revokesAllAndThrows() {
            validToken.setRevoked(true);
            when(refreshTokenRepository.findByTokenHash(anyString())).thenReturn(Optional.of(validToken));

            assertThatThrownBy(() -> authService.refresh(new RefreshRequest("raw-refresh-token")))
                    .isInstanceOf(InvalidTokenException.class)
                    .hasMessageContaining("revoked");

            verify(refreshTokenRepository).revokeAllByUserId(testUser.getId());
        }

        @Test
        @DisplayName("expired token throws InvalidTokenException")
        void refresh_tokenExpired_throwsInvalidTokenException() {
            RefreshToken expiredToken = RefreshToken.builder()
                    .id(UUID.randomUUID())
                    .user(testUser)
                    .tokenHash("hashed-token")
                    .expiresAt(OffsetDateTime.now().minusDays(1))
                    .revoked(false)
                    .build();
            when(refreshTokenRepository.findByTokenHash(anyString())).thenReturn(Optional.of(expiredToken));

            assertThatThrownBy(() -> authService.refresh(new RefreshRequest("raw-refresh-token")))
                    .isInstanceOf(InvalidTokenException.class)
                    .hasMessageContaining("expired");
        }
    }

    @Nested
    @DisplayName("logout()")
    class Logout {

        @Test
        @DisplayName("valid token is marked revoked")
        void logout_validToken_revokesToken() {
            RefreshToken token = RefreshToken.builder()
                    .id(UUID.randomUUID()).user(testUser)
                    .tokenHash("hashed-token")
                    .expiresAt(OffsetDateTime.now().plusDays(1))
                    .revoked(false).build();
            when(refreshTokenRepository.findByTokenHash("hashed-token")).thenReturn(Optional.of(token));

            authService.logout(new LogoutRequest("raw-token"));

            assertThat(token.isRevoked()).isTrue();
            verify(refreshTokenRepository).save(token);
        }

        @Test
        @DisplayName("unknown token — no exception thrown (graceful no-op)")
        void logout_unknownToken_noException() {
            when(refreshTokenRepository.findByTokenHash(anyString())).thenReturn(Optional.empty());

            assertThatNoException().isThrownBy(() ->
                    authService.logout(new LogoutRequest("unknown-token")));
        }
    }
}
