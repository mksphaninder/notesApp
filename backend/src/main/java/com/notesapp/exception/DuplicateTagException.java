package com.notesapp.exception;

public class DuplicateTagException extends RuntimeException {
    public DuplicateTagException(String name) {
        super("Tag already exists: " + name);
    }
}
