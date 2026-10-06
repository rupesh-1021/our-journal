USE between_us;

-- =========================================================
-- 1. MESSAGE PIN SUPPORT
-- =========================================================

ALTER TABLE messages
    ADD COLUMN is_pinned TINYINT(1) NOT NULL DEFAULT 0 AFTER file_size,
    ADD COLUMN pinned_at DATETIME NULL AFTER is_pinned,
    ADD COLUMN pinned_by BIGINT UNSIGNED NULL AFTER pinned_at,
    ADD CONSTRAINT fk_messages_pinned_by
        FOREIGN KEY (pinned_by)
        REFERENCES users(id)
        ON DELETE SET NULL;


-- =========================================================
-- 2. CALL HISTORY
-- =========================================================

CREATE TABLE call_logs (
    id VARCHAR(64) NOT NULL,

    caller_id BIGINT UNSIGNED NOT NULL,
    callee_id BIGINT UNSIGNED NOT NULL,

    call_type ENUM(
        'voice',
        'video'
    ) NOT NULL,

    status ENUM(
        'ringing',
        'answered',
        'completed',
        'missed',
        'declined',
        'failed'
    ) NOT NULL DEFAULT 'ringing',

    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    answered_at DATETIME NULL,

    ended_at DATETIME NULL,

    duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,

    ended_by BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    INDEX idx_call_logs_started_at (started_at),

    INDEX idx_call_logs_caller (caller_id),

    INDEX idx_call_logs_callee (callee_id),

    CONSTRAINT fk_call_logs_caller
        FOREIGN KEY (caller_id)
        REFERENCES users(id),

    CONSTRAINT fk_call_logs_callee
        FOREIGN KEY (callee_id)
        REFERENCES users(id),

    CONSTRAINT fk_call_logs_ended_by
        FOREIGN KEY (ended_by)
        REFERENCES users(id)
        ON DELETE SET NULL
);