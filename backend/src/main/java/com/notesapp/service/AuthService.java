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
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new EmailAlreadyExistsException(request.email());
        }

        User user = User.builder()
                .email(request.email().toLowerCase().trim())
                .passwordHash(passwordEncoder.encode(request.password()))
                .displayName(request.displayName().trim())
                .build();

        userRepository.save(user);

        String accessToken = jwtService.generateAccessToken(user);
        String rawRefreshToken = createAndSaveRefreshToken(user);

        return AuthResponse.of(accessToken, rawRefreshToken, jwtService.getAccessTokenExpiration(), UserResponse.from(user));
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.email(), request.password())
            );
        } catch (BadCredentialsException e) {
            throw new InvalidCredentialsException();
        }

        User user = userRepository.findByEmail(request.email())
                .orElseThrow(InvalidCredentialsException::new);

        String accessToken = jwtService.generateAccessToken(user);
        String rawRefreshToken = createAndSaveRefreshToken(user);

        return AuthResponse.of(accessToken, rawRefreshToken, jwtService.getAccessTokenExpiration(), UserResponse.from(user));
    }

    @Transactional
    public AuthResponse refresh(RefreshRequest request) {
        String tokenHash = jwtService.hashToken(request.refreshToken());

        RefreshToken refreshToken = refreshTokenRepository.findByTokenHash(tokenHash)
                .orElseThrow(() -> new InvalidTokenException("Refresh token not found"));

        if (refreshToken.isRevoked()) {
            // Token reuse detected — revoke all tokens for this user (security measure)
            refreshTokenRepository.revokeAllByUserId(refreshToken.getUser().getId());
            throw new InvalidTokenException("Refresh token has been revoked");
        }

        if (refreshToken.isExpired()) {
            throw new InvalidTokenException("Refresh token has expired");
        }

        User user = refreshToken.getUser();

        // Rotate: revoke old, issue new
        refreshToken.setRevoked(true);
        refreshTokenRepository.save(refreshToken);

        String newAccessToken = jwtService.generateAccessToken(user);
        String newRawRefreshToken = createAndSaveRefreshToken(user);

        return AuthResponse.of(newAccessToken, newRawRefreshToken, jwtService.getAccessTokenExpiration(), UserResponse.from(user));
    }

    @Transactional
    public void logout(LogoutRequest request) {
        String tokenHash = jwtService.hashToken(request.refreshToken());
        refreshTokenRepository.findByTokenHash(tokenHash)
                .ifPresent(token -> {
                    token.setRevoked(true);
                    refreshTokenRepository.save(token);
                });
    }

    private String createAndSaveRefreshToken(User user) {
        String rawToken = jwtService.generateRefreshToken();
        RefreshToken refreshToken = RefreshToken.builder()
                .user(user)
                .tokenHash(jwtService.hashToken(rawToken))
                .expiresAt(OffsetDateTime.now().plusSeconds(jwtService.getRefreshTokenExpiration() / 1000))
                .build();
        refreshTokenRepository.save(refreshToken);
        return rawToken;
    }
}
