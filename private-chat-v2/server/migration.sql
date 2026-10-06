USE between_us;

-- Roles: Rupesh = Super Admin, the other account = Admin.
ALTER TABLE users
  ADD COLUMN role ENUM('super_admin','admin') NOT NULL DEFAULT 'admin';

UPDATE users
SET role='super_admin'
WHERE LOWER(username) LIKE '%rupesh%';

UPDATE users
SET role='admin'
WHERE LOWER(username) NOT LIKE '%rupesh%';

-- Editing metadata.
ALTER TABLE messages
  ADD COLUMN edited_at DATETIME NULL AFTER pinned_by;

-- Per-account deletion/hiding.
-- Deleting a message only removes it from that user's own view.
CREATE TABLE message_hidden (
  message_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  hidden_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id),
  CONSTRAINT fk_message_hidden_message
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_message_hidden_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
