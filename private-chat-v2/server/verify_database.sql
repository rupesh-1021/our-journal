USE between_us;

SELECT id, username, role FROM users ORDER BY id;

SHOW COLUMNS FROM messages LIKE 'edited_at';

SHOW TABLES LIKE 'message_hidden';

SELECT
  mh.message_id,
  mh.user_id,
  u.username,
  mh.hidden_at
FROM message_hidden mh
JOIN users u ON u.id = mh.user_id
ORDER BY mh.hidden_at DESC
LIMIT 20;
