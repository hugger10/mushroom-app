import pg from "./pg";
import logger from "../utils/logger";

interface ServerMigration {
  id: number;
  name: string;
  statements: string[];
}

const consolidatedMigration: ServerMigration = {
  id: 1,
  name: "consolidated_init_schema",
  statements: [
    `CREATE TABLE IF NOT EXISTS users (
       id BIGSERIAL PRIMARY KEY,
       username VARCHAR(64) NOT NULL,
       password TEXT NOT NULL,
       email VARCHAR(255),
       phone VARCHAR(32),
       avatar_url TEXT,
       nickname VARCHAR(255) NOT NULL DEFAULT '',
       gender SMALLINT NOT NULL DEFAULT 0 CHECK (gender IN (0, 1, 2)),
       birthday DATE,
       signature TEXT,
       is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       last_login_at TIMESTAMPTZ,
       status SMALLINT NOT NULL DEFAULT 0 CHECK (status IN (0, 1, 2)),
       CONSTRAINT users_username_unique UNIQUE (username),
       CONSTRAINT users_email_unique UNIQUE (email),
       CONSTRAINT users_phone_unique UNIQUE (phone)
     )`,
    `CREATE TABLE IF NOT EXISTS conversations (
       id BIGINT PRIMARY KEY,
       type SMALLINT NOT NULL CHECK (type IN (1, 2)),
       owner_id BIGINT,
       name VARCHAR(255) NOT NULL DEFAULT '',
       avatar_url TEXT,
       description TEXT,
       settings JSONB,
       status SMALLINT NOT NULL DEFAULT 0 CHECK (status IN (0, 1, 2)),
       is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
       message_seq BIGINT NOT NULL DEFAULT 0,
       last_message_id VARCHAR(64),
       last_message_at TIMESTAMPTZ,
       last_reaction_sequence BIGINT NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE TABLE IF NOT EXISTS conversation_members (
       conversation_id BIGINT NOT NULL,
       user_id BIGINT NOT NULL,
       role SMALLINT NOT NULL DEFAULT 0 CHECK (role IN (0, 1, 2)),
       nickname VARCHAR(255),
       avatar_url TEXT,
       join_seq BIGINT NOT NULL DEFAULT 0,
       leave_seq BIGINT,
       mute_until TIMESTAMPTZ,
       muted_by BIGINT,
       joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       left_at TIMESTAMPTZ,
       PRIMARY KEY (conversation_id, user_id)
     )`,
    `CREATE TABLE IF NOT EXISTS conversation_user_state (
       conversation_id BIGINT NOT NULL,
       user_id BIGINT NOT NULL,
       is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
       is_muted BOOLEAN NOT NULL DEFAULT FALSE,
       is_archived BOOLEAN NOT NULL DEFAULT FALSE,
       draft TEXT,
       hidden_before_seq BIGINT NOT NULL DEFAULT 0,
       last_read_seq BIGINT NOT NULL DEFAULT 0,
       last_delivered_seq BIGINT NOT NULL DEFAULT 0,
       unread_count INTEGER NOT NULL DEFAULT 0,
       peer_id BIGINT,
       settings JSONB,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (conversation_id, user_id)
     )`,
    `CREATE TABLE IF NOT EXISTS messages (
       id VARCHAR(64) PRIMARY KEY,
       conversation_id BIGINT NOT NULL,
       seq BIGINT NOT NULL,
       client_message_id VARCHAR(64),
       sender_id BIGINT NOT NULL,
       type SMALLINT NOT NULL CHECK (type IN (0, 1, 2)),
       content JSONB NOT NULL,
       is_recalled BOOLEAN NOT NULL DEFAULT FALSE,
       recalled_at TIMESTAMPTZ,
       reply_to_message_id VARCHAR(64),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE TABLE IF NOT EXISTS message_outbox (
       id BIGSERIAL PRIMARY KEY,
       event_type VARCHAR(32) NOT NULL,
       message_id VARCHAR(64),
       conversation_id BIGINT,
       target_user_id BIGINT,
       target_device_id VARCHAR(128),
       payload JSONB NOT NULL,
       status SMALLINT NOT NULL DEFAULT 0 CHECK (status IN (0, 1, 2, 3, 9)),
       retry_count INTEGER NOT NULL DEFAULT 0,
       next_retry_at TIMESTAMPTZ,
       processing_started_at TIMESTAMPTZ,
       lease_expires_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE TABLE IF NOT EXISTS attachment_uploads (
       id VARCHAR(64) PRIMARY KEY,
       uploader_id BIGINT NOT NULL,
       object_name TEXT NOT NULL,
       original_name TEXT NOT NULL,
       size BIGINT NOT NULL,
       mime_type TEXT,
       file_url TEXT,
       status SMALLINT NOT NULL DEFAULT 0 CHECK (status IN (0, 1, 2)),
       bound_message_id VARCHAR(64),
       category VARCHAR(16) NOT NULL DEFAULT 'file' CHECK (category IN ('image', 'video', 'audio', 'voice', 'file')),
       upload_mode VARCHAR(16) NOT NULL DEFAULT 'single' CHECK (upload_mode IN ('single', 'multipart')),
       multipart_upload_id TEXT,
       width INTEGER,
       height INTEGER,
       duration_ms INTEGER,
       thumb_object_key TEXT,
       preview_object_key TEXT,
       thumb_status VARCHAR(16) NOT NULL DEFAULT 'none' CHECK (thumb_status IN ('none', 'pending', 'ready', 'failed')),
       attachment_uploads ADD COLUMN IF NOT EXISTS parent_upload_id VARCHAR(64),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE TABLE IF NOT EXISTS message_user_state (
       message_id VARCHAR(64) NOT NULL,
       user_id BIGINT NOT NULL,
       is_favorited BOOLEAN NOT NULL DEFAULT FALSE,
       is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (message_id, user_id)
     )`,
    `CREATE TABLE IF NOT EXISTS message_reactions (
       message_id VARCHAR(64) NOT NULL,
       conversation_id BIGINT NOT NULL,
       user_id BIGINT NOT NULL,
       emoji VARCHAR(32) NOT NULL,
       sequence BIGINT NOT NULL DEFAULT 0,
       is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (message_id, user_id)
     )`,
    `CREATE TABLE IF NOT EXISTS call_sessions (
       id BIGSERIAL PRIMARY KEY,
       call_id VARCHAR(64) NOT NULL,
       conversation_id BIGINT NOT NULL,
       call_scope SMALLINT NOT NULL CHECK (call_scope IN (1, 2)),
       media_type SMALLINT NOT NULL CHECK (media_type IN (1, 2)),
       initiator_user_id BIGINT NOT NULL,
       status SMALLINT NOT NULL CHECK (status IN (1, 2, 3, 4, 5, 6, 7)),
       active_device_count INTEGER NOT NULL DEFAULT 0,
       participant_count INTEGER NOT NULL DEFAULT 0,
       started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       answered_at TIMESTAMPTZ,
       ended_at TIMESTAMPTZ,
       end_reason SMALLINT CHECK (end_reason IN (1, 2, 3, 4, 5, 6, 7)),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       CONSTRAINT call_sessions_call_id_unique UNIQUE (call_id)
     )`,
    `CREATE TABLE IF NOT EXISTS call_participants (
       id BIGSERIAL PRIMARY KEY,
       call_id VARCHAR(64) NOT NULL,
       conversation_id BIGINT NOT NULL,
       user_id BIGINT NOT NULL,
       device_id VARCHAR(128) NOT NULL,
       participant_role SMALLINT NOT NULL DEFAULT 1 CHECK (participant_role IN (1, 2)),
       participant_status SMALLINT NOT NULL CHECK (participant_status IN (1, 2, 3, 4, 5, 6, 7, 8, 9)),
       ringing_at TIMESTAMPTZ,
       answered_at TIMESTAMPTZ,
       joined_at TIMESTAMPTZ,
       left_at TIMESTAMPTZ,
       end_reason SMALLINT CHECK (end_reason IN (1, 2, 3, 4, 5, 6, 7)),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       CONSTRAINT call_participants_call_device_unique UNIQUE (call_id, device_id)
     )`,
    `CREATE TABLE IF NOT EXISTS call_events (
       id BIGSERIAL PRIMARY KEY,
       call_id VARCHAR(64) NOT NULL,
       conversation_id BIGINT NOT NULL,
       event_type VARCHAR(64) NOT NULL,
       request_id VARCHAR(64),
       sender_user_id BIGINT,
       sender_device_id VARCHAR(128),
       payload JSONB NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE TABLE IF NOT EXISTS user_devices (
       id BIGSERIAL PRIMARY KEY,
       user_id BIGINT NOT NULL,
       device_id VARCHAR(128) NOT NULL,
       device_type SMALLINT NOT NULL DEFAULT 0 CHECK (device_type IN (0, 1, 2, 3, 9)),
       device_name VARCHAR(255),
       push_provider VARCHAR(32),
       push_token TEXT,
       voip_token TEXT,
       push_app_id VARCHAR(128),
       app_version VARCHAR(64),
       last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       last_ip INET,
       status SMALLINT NOT NULL DEFAULT 1 CHECK (status IN (0, 1, 2)),
       metadata JSONB,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       CONSTRAINT user_devices_user_device_unique UNIQUE (user_id, device_id)
     )`,
    `CREATE TABLE IF NOT EXISTS user_sessions (
       id BIGSERIAL PRIMARY KEY,
       session_id VARCHAR(64) NOT NULL,
       user_id BIGINT NOT NULL,
       device_id VARCHAR(128),
       refresh_token_hash TEXT NOT NULL,
       access_jti VARCHAR(64),
       previous_refresh_token_hash TEXT,
       previous_refresh_rotated_at TIMESTAMPTZ,
       previous_access_jti VARCHAR(64),
       previous_access_rotated_at TIMESTAMPTZ,
       issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       expires_at TIMESTAMPTZ NOT NULL,
       last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       last_ip INET,
       user_agent TEXT,
       status SMALLINT NOT NULL DEFAULT 0 CHECK (status IN (0, 1, 2)),
       revoked_at TIMESTAMPTZ,
       revoke_reason VARCHAR(64),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       CONSTRAINT user_sessions_session_id_unique UNIQUE (session_id)
     )`,
    `CREATE TABLE IF NOT EXISTS auth_audit_logs (
       id BIGSERIAL PRIMARY KEY,
       user_id BIGINT,
       device_id VARCHAR(128),
       session_id VARCHAR(64),
       action VARCHAR(64) NOT NULL,
       action_status SMALLINT NOT NULL DEFAULT 0 CHECK (action_status IN (0, 1)),
       ip INET,
       user_agent TEXT,
       details JSONB,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE TABLE IF NOT EXISTS user_privacy_settings (
       user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
       discoverable_by_username SMALLINT NOT NULL DEFAULT 0 CHECK (discoverable_by_username IN (0, 1, 2)),
       discoverable_by_phone SMALLINT NOT NULL DEFAULT 1 CHECK (discoverable_by_phone IN (0, 1, 2)),
       message_permission SMALLINT NOT NULL DEFAULT 0 CHECK (message_permission IN (0, 1, 2)),
       presence_visibility SMALLINT NOT NULL DEFAULT 1 CHECK (presence_visibility IN (0, 1, 2)),
       read_receipts_visibility SMALLINT NOT NULL DEFAULT 0 CHECK (read_receipts_visibility IN (0, 1, 2)),
       version INTEGER NOT NULL DEFAULT 0,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE TABLE IF NOT EXISTS user_notification_settings (
       user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
       messages_enabled BOOLEAN NOT NULL DEFAULT TRUE,
       calls_enabled BOOLEAN NOT NULL DEFAULT TRUE,
       sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
       group_messages_enabled BOOLEAN NOT NULL DEFAULT TRUE,
       mention_only BOOLEAN NOT NULL DEFAULT FALSE,
       in_app_banner_enabled BOOLEAN NOT NULL DEFAULT TRUE,
       preview_mode VARCHAR(16) NOT NULL DEFAULT 'full' CHECK (preview_mode IN ('full', 'sender', 'hidden')),
       quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
       quiet_hours_start CHAR(5) NOT NULL DEFAULT '22:00',
       quiet_hours_end CHAR(5) NOT NULL DEFAULT '08:00',
       quiet_hours_allow_mentions BOOLEAN NOT NULL DEFAULT TRUE,
       quiet_hours_allow_calls BOOLEAN NOT NULL DEFAULT TRUE,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE TABLE IF NOT EXISTS user_blocks (
       blocker_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       blocked_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (blocker_id, blocked_id)
     )`,
    `CREATE TABLE IF NOT EXISTS user_phone_identity (
       user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
       phone_e164 VARCHAR(32) NOT NULL,
       phone_country_code VARCHAR(8),
       verified_at TIMESTAMPTZ NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       CONSTRAINT user_phone_identity_phone_unique UNIQUE (phone_e164)
     )`,
    `CREATE TABLE IF NOT EXISTS user_contacts (
       id BIGSERIAL PRIMARY KEY,
       owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       contact_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       remark_name VARCHAR(100),
       remark_note VARCHAR(500),
       source VARCHAR(32),
       status VARCHAR(32) NOT NULL DEFAULT 'normal' CHECK (status IN ('normal', 'deleted')),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       CONSTRAINT user_contacts_owner_contact_unique UNIQUE (owner_user_id, contact_user_id),
       CONSTRAINT user_contacts_not_self CHECK (owner_user_id <> contact_user_id)
     )`,
    `CREATE TABLE IF NOT EXISTS direct_conversation_pairs (
       user_low_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       user_high_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       conversation_id BIGINT NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (user_low_id, user_high_id),
       CONSTRAINT direct_conversation_pairs_order_check CHECK (user_low_id < user_high_id)
     )`,
    `CREATE TABLE IF NOT EXISTS api_idempotency_keys (
       user_id           BIGINT      NOT NULL,
       method            TEXT        NOT NULL,
       path              TEXT        NOT NULL,
       client_request_id TEXT        NOT NULL,
       request_hash      TEXT        NOT NULL,
       status_code       INT         NOT NULL,
       response_body     JSONB       NOT NULL,
       created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       expires_at        TIMESTAMPTZ NOT NULL,
       PRIMARY KEY (user_id, method, path, client_request_id)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_users_username ON users (username)`,
    `CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_conversations_owner_id ON conversations (owner_id)`,
    `CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations (updated_at DESC)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conversation_seq_unique
     ON messages (conversation_id, seq)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_sender_client_unique
     ON messages (sender_id, client_message_id)
     WHERE client_message_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
     ON messages (conversation_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_conversation_members_user_conversation
     ON conversation_members (user_id, conversation_id)`,
    `CREATE INDEX IF NOT EXISTS idx_conversation_members_conversation_active
     ON conversation_members (conversation_id, left_at, user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_conversation_user_state_user_updated
     ON conversation_user_state (user_id, updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_conversation_user_state_user_unread
     ON conversation_user_state (user_id, unread_count)`,
    `CREATE INDEX IF NOT EXISTS idx_message_outbox_status_next_retry
     ON message_outbox (status, next_retry_at, lease_expires_at)`,
    // Phase 3 cleanup：按 updated_at 范围删除 dispatched(1) / dead(2) 历史记录
    `CREATE INDEX IF NOT EXISTS idx_message_outbox_dispatched_updated_at
     ON message_outbox (updated_at)
     WHERE status = 1`,
    `CREATE INDEX IF NOT EXISTS idx_message_outbox_dead_updated_at
     ON message_outbox (updated_at)
     WHERE status = 2`,
    `CREATE INDEX IF NOT EXISTS idx_attachment_uploads_uploader_status_created
     ON attachment_uploads (uploader_id, status, created_at DESC)`,
    // Phase 3 cleanup：按 created_at 范围找未绑定(status=0)的孤儿上传
    `CREATE INDEX IF NOT EXISTS idx_attachment_uploads_pending_bind_created_at
     ON attachment_uploads (created_at)
     WHERE status = 0`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_attachment_uploads_object_name
     ON attachment_uploads (object_name)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_attachment_uploads_bound_message
     ON attachment_uploads (bound_message_id)
     WHERE bound_message_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_attachment_uploads_parent_upload
     ON attachment_uploads (parent_upload_id)`,
    `CREATE INDEX IF NOT EXISTS idx_message_user_state_user_updated
     ON message_user_state (user_id, updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_message_user_state_message
     ON message_user_state (message_id, user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_message_reactions_message
     ON message_reactions (message_id)`,
    `CREATE INDEX IF NOT EXISTS idx_message_reactions_conversation_updated
     ON message_reactions (conversation_id, updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_message_reactions_conversation_sequence
     ON message_reactions (conversation_id, sequence)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_call_sessions_call_id
     ON call_sessions (call_id)`,
    `CREATE INDEX IF NOT EXISTS idx_call_sessions_conversation_started_at
     ON call_sessions (conversation_id, started_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_call_sessions_initiator_started_at
     ON call_sessions (initiator_user_id, started_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_call_sessions_status_started_at
     ON call_sessions (status, started_at DESC)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_call_participants_call_device
     ON call_participants (call_id, device_id)`,
    `CREATE INDEX IF NOT EXISTS idx_call_participants_call_user
     ON call_participants (call_id, user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_call_participants_user_status_created_at
     ON call_participants (user_id, participant_status, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_call_participants_conversation_created_at
     ON call_participants (conversation_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_call_events_call_created_at
     ON call_events (call_id, created_at ASC)`,
    `CREATE INDEX IF NOT EXISTS idx_call_events_request_id
     ON call_events (request_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_devices_user_status_seen
     ON user_devices (user_id, status, last_seen_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_user_devices_device_id
     ON user_devices (device_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_devices_status_seen
     ON user_devices (status, last_seen_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_user_devices_push_provider
     ON user_devices (push_provider, status, last_seen_at DESC)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_session_id
     ON user_sessions (session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_sessions_user_status_seen
     ON user_sessions (user_id, status, last_seen_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_user_sessions_user_device_status
     ON user_sessions (user_id, device_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at
     ON user_sessions (expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_token_hash
     ON user_sessions (refresh_token_hash)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_previous_refresh_token_hash
     ON user_sessions (previous_refresh_token_hash)
     WHERE previous_refresh_token_hash IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_user_created_at
     ON auth_audit_logs (user_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_device_created_at
     ON auth_audit_logs (device_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_action_created_at
     ON auth_audit_logs (action, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked
     ON user_blocks (blocked_id, blocker_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker_created_at
     ON user_blocks (blocker_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_user_phone_identity_phone
     ON user_phone_identity (phone_e164)`,
    `CREATE INDEX IF NOT EXISTS idx_user_contacts_owner_status_updated
     ON user_contacts (owner_user_id, status, updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_user_contacts_contact_user
     ON user_contacts (contact_user_id, owner_user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_direct_conversation_pairs_conversation
     ON direct_conversation_pairs (conversation_id)`,
    `CREATE INDEX IF NOT EXISTS api_idempotency_keys_expires_idx
       ON api_idempotency_keys(expires_at)`,
    `COMMENT ON TABLE users IS '用户账号表'`,
    `COMMENT ON TABLE conversations IS '会话表，包含私聊与群聊'`,
    `COMMENT ON TABLE conversation_members IS '会话成员关系表'`,
    `COMMENT ON TABLE conversation_user_state IS '用户维度的会话状态表（置顶、免打扰、未读、草稿等）'`,
    `COMMENT ON TABLE messages IS '消息表'`,
    `COMMENT ON TABLE message_outbox IS '服务端投递发件箱表（异步派发与重试）'`,
    `COMMENT ON TABLE attachment_uploads IS '附件上传记录表，支持待绑定与已绑定到消息的两种状态'`,
    `COMMENT ON INDEX idx_message_outbox_dispatched_updated_at IS '服务于 outbox cleanup：按 updated_at 删除 dispatched(1) 历史记录'`,
    `COMMENT ON INDEX idx_message_outbox_dead_updated_at IS '服务于 outbox cleanup：按 updated_at 删除 dead(2) 死信记录'`,
    `COMMENT ON INDEX idx_attachment_uploads_pending_bind_created_at IS '服务于 attachment orphan cleanup：按 created_at 查找未绑定上传(status=0)'`,
    `COMMENT ON TABLE message_user_state IS '用户维度的消息状态（收藏、置顶等）'`,
    `COMMENT ON TABLE message_reactions IS '消息表情反应表（同一用户对同一消息只允许一个表情）'`,
    `COMMENT ON TABLE call_sessions IS '实时通话会话表'`,
    `COMMENT ON TABLE call_participants IS '实时通话参与者及设备状态表'`,
    `COMMENT ON TABLE call_events IS '实时通话审计与事件日志表'`,
    `COMMENT ON TABLE user_devices IS '用户设备登记与状态表'`,
    `COMMENT ON TABLE user_sessions IS '用户登录会话表（含 refresh token 状态）'`,
    `COMMENT ON TABLE auth_audit_logs IS '认证与设备管理审计日志'`,
    `COMMENT ON TABLE user_privacy_settings IS '用户隐私与可发现性设置'`,
    `COMMENT ON TABLE user_notification_settings IS '用户通知偏好设置'`,
    `COMMENT ON TABLE user_blocks IS '用户拉黑关系表（独立于联系人关系）'`,
    `COMMENT ON TABLE user_phone_identity IS '用户手机号身份表（与 users.phone 解耦，便于换绑与验证状态独立管理）'`,
    `COMMENT ON TABLE user_contacts IS '用户联系人/通讯录表（owner 视角的单向关系）'`,
    `COMMENT ON TABLE direct_conversation_pairs IS '私聊会话对索引表，确保两位用户之间至多一条私聊会话'`,
    `COMMENT ON COLUMN users.status IS '账号状态：0=正常, 1=禁用, 2=受限或保留'`,
    `COMMENT ON COLUMN users.gender IS '用户性别：0=未知, 1=男, 2=女'`,
    `COMMENT ON COLUMN users.is_deleted IS '软删除标志；TRUE 表示账号已注销'`,
    `COMMENT ON COLUMN users.last_login_at IS '最近一次成功登录时间，用于活跃度统计'`,
    `COMMENT ON COLUMN conversations.type IS '会话类型：1=私聊, 2=群聊'`,
    `COMMENT ON COLUMN conversations.status IS '会话状态：0=正常, 1=禁用, 2=归档或保留'`,
    `COMMENT ON COLUMN conversations.owner_id IS '群主用户ID；私聊为 NULL'`,
    `COMMENT ON COLUMN conversations.settings IS '会话级设置 JSON：如群公告、入群审批等扩展配置'`,
    `COMMENT ON COLUMN conversations.is_deleted IS '软删除标志；TRUE 表示会话已被清退'`,
    `COMMENT ON COLUMN conversations.message_seq IS '当前会话已分配的最大消息 seq；新消息自增'`,
    `COMMENT ON COLUMN conversations.last_message_id IS '冗余的最新一条消息ID，便于会话列表展示'`,
    `COMMENT ON COLUMN conversations.last_reaction_sequence IS '当前会话已分配的最大反应序号；用作反应增量同步的游标上界'`,
    `COMMENT ON COLUMN conversation_members.role IS '成员角色：0=普通成员, 1=管理员, 2=群主'`,
    `COMMENT ON COLUMN conversation_members.join_seq IS '入群时基准 seq；用于裁剪历史消息可见范围'`,
    `COMMENT ON COLUMN conversation_members.leave_seq IS '离群时 seq；NULL 表示当前仍在群中'`,
    `COMMENT ON COLUMN conversation_members.mute_until IS '禁言截止时间；NULL 表示未被禁言'`,
    `COMMENT ON COLUMN conversation_members.muted_by IS '执行禁言操作的管理员/群主用户ID'`,
    `COMMENT ON COLUMN conversation_members.left_at IS '离群时间；NULL 表示当前仍在群中'`,
    `COMMENT ON COLUMN conversation_user_state.hidden_before_seq IS '小于等于该 seq 的消息对当前用户隐藏'`,
    `COMMENT ON COLUMN conversation_user_state.last_read_seq IS '最近已读消息的 seq'`,
    `COMMENT ON COLUMN conversation_user_state.last_delivered_seq IS '最近已投递消息的 seq'`,
    `COMMENT ON COLUMN conversation_user_state.peer_id IS '私聊场景下的对端用户ID'`,
    `COMMENT ON COLUMN conversation_user_state.is_pinned IS '用户是否在会话列表中置顶该会话'`,
    `COMMENT ON COLUMN conversation_user_state.is_muted IS '用户是否对该会话开启免打扰'`,
    `COMMENT ON COLUMN conversation_user_state.is_archived IS '用户是否已归档该会话'`,
    `COMMENT ON COLUMN conversation_user_state.draft IS '用户在该会话的输入草稿（多端同步）'`,
    `COMMENT ON COLUMN conversation_user_state.unread_count IS '未读消息计数（缓存值，权威值由 last_read_seq 推导）'`,
    `COMMENT ON COLUMN conversation_user_state.settings IS '用户级会话设置 JSON：扩展字段'`,
    `COMMENT ON COLUMN messages.type IS '消息类型：0=系统消息, 1=文本, 2=文件'`,
    `COMMENT ON COLUMN messages.seq IS '会话内单调递增序号（与 conversation_id 联合唯一），用于增量同步'`,
    `COMMENT ON COLUMN messages.client_message_id IS '客户端去重ID；同一发送者下唯一，用于幂等发送'`,
    `COMMENT ON COLUMN messages.content IS '消息内容 JSON；按 type 区分结构（text/file/system 各自字段）'`,
    `COMMENT ON COLUMN messages.is_recalled IS '消息撤回标志；TRUE 表示已被发送者撤回'`,
    `COMMENT ON COLUMN messages.recalled_at IS '消息被撤回的时间'`,
    `COMMENT ON COLUMN messages.reply_to_message_id IS '引用回复的目标消息ID；NULL 表示非回复消息'`,
    `COMMENT ON COLUMN message_outbox.event_type IS '事件类型：chat.message.deliver, conversation.read, conversation.sync, message.recall, message.edit'`,
    `COMMENT ON COLUMN message_outbox.status IS '发件箱状态：0=待处理, 1=已派发, 2=死信, 3=待重试, 9=处理中'`,
    `COMMENT ON COLUMN message_outbox.target_user_id IS '投递目标用户ID；为 NULL 表示扇出由消费端按会话成员展开'`,
    `COMMENT ON COLUMN message_outbox.target_device_id IS '投递目标设备ID；NULL 表示该用户全部在线设备'`,
    `COMMENT ON COLUMN message_outbox.payload IS '投递载荷 JSON，结构由 event_type 决定'`,
    `COMMENT ON COLUMN message_outbox.retry_count IS '已重试次数；超过阈值后置为死信(2)'`,
    `COMMENT ON COLUMN message_outbox.next_retry_at IS '下一次允许重试的时间；调度器据此挑选任务'`,
    `COMMENT ON COLUMN message_outbox.processing_started_at IS '当前处理开始时间；与 lease_expires_at 联用做超时回收'`,
    `COMMENT ON COLUMN message_outbox.lease_expires_at IS '处理租约到期时间；过期后任务可被其他 worker 抢占'`,
    `COMMENT ON COLUMN attachment_uploads.status IS '附件上传状态：0=待绑定, 1=已绑定, 2=已删除或过期'`,
    `COMMENT ON COLUMN attachment_uploads.thumb_status IS '图片缩略图状态：none/pending/ready/failed；视频不在服务端生成（none）'`,
    `COMMENT ON COLUMN attachment_uploads.upload_mode IS '上传模式：single（一次性 PUT）或 multipart（MinIO 分片）'`,
    `COMMENT ON COLUMN attachment_uploads.category IS '业务类别，影响限额校验：image/video/audio/voice/file'`,
    `COMMENT ON COLUMN attachment_uploads.object_name IS '对象存储中的对象键（object key），全局唯一'`,
    `COMMENT ON COLUMN attachment_uploads.bound_message_id IS '绑定到的消息ID；NULL 表示尚未绑定（孤儿附件，定期清理）'`,
    `COMMENT ON COLUMN attachment_uploads.file_url IS '外部访问URL；分片上传未完成时为 NULL'`,
    `COMMENT ON COLUMN attachment_uploads.multipart_upload_id IS 'MinIO/S3 分片上传ID；upload_mode=multipart 时使用'`,
    `COMMENT ON COLUMN attachment_uploads.width IS '图片/视频宽度（像素）'`,
    `COMMENT ON COLUMN attachment_uploads.height IS '图片/视频高度（像素）'`,
    `COMMENT ON COLUMN attachment_uploads.duration_ms IS '音频/视频时长（毫秒）'`,
    `COMMENT ON COLUMN attachment_uploads.thumb_object_key IS '缩略图对象键；图片异步生成，视频不在服务端生成'`,
    `COMMENT ON COLUMN attachment_uploads.preview_object_key IS '预览图对象键（如视频首帧）'`,
    `COMMENT ON COLUMN attachment_uploads.parent_upload_id IS '该行作为其它附件（如视频首帧缩略图）的父附件 upload_id'`,
    `COMMENT ON COLUMN message_user_state.is_favorited IS '用户是否收藏了该消息'`,
    `COMMENT ON COLUMN message_user_state.is_pinned IS '用户是否在会话内置顶了该消息'`,
    `COMMENT ON COLUMN message_reactions.sequence IS '会话内单调递增序号，用于反应的增量同步'`,
    `COMMENT ON COLUMN message_reactions.is_deleted IS '墓碑标志：TRUE 表示反应已被移除；保留行以便增量同步传播删除'`,
    `COMMENT ON COLUMN message_reactions.emoji IS '反应表情字符；同一用户对同一消息只允许一个表情'`,
    `COMMENT ON COLUMN call_sessions.call_scope IS '通话范围：1=私聊, 2=群聊'`,
    `COMMENT ON COLUMN call_sessions.media_type IS '媒体类型：1=语音, 2=视频'`,
    `COMMENT ON COLUMN call_sessions.status IS '通话状态：1=已发起, 2=振铃中, 3=进行中, 4=已结束, 5=已取消, 6=超时未接, 7=失败'`,
    `COMMENT ON COLUMN call_sessions.active_device_count IS '当前在通话中的设备数量；归零触发会话结束判定'`,
    `COMMENT ON COLUMN call_sessions.participant_count IS '累计参与过的用户数；用于统计'`,
    `COMMENT ON COLUMN call_sessions.answered_at IS '首位被叫接通的时间'`,
    `COMMENT ON COLUMN call_sessions.ended_at IS '会话结束时间'`,
    `COMMENT ON COLUMN call_sessions.end_reason IS '结束原因：1=正常挂断, 2=取消, 3=拒接, 4=超时未接, 5=网络/服务故障, 6=被替代, 7=其他'`,
    `COMMENT ON COLUMN call_participants.participant_role IS '参与者角色：1=发起方, 2=被邀请方'`,
    `COMMENT ON COLUMN call_participants.participant_status IS '参与者状态：1=已邀请, 2=振铃中, 3=已接受, 4=已加入, 5=已拒绝, 6=忙线, 7=超时, 8=已离开, 9=被同账号其他设备替代'`,
    `COMMENT ON COLUMN call_participants.ringing_at IS '振铃开始时间'`,
    `COMMENT ON COLUMN call_participants.answered_at IS '该参与者接通时间'`,
    `COMMENT ON COLUMN call_participants.joined_at IS '实际加入媒体通道的时间'`,
    `COMMENT ON COLUMN call_participants.left_at IS '离开通话的时间'`,
    `COMMENT ON COLUMN call_participants.end_reason IS '参与者结束原因（语义同 call_sessions.end_reason）'`,
    `COMMENT ON COLUMN call_events.event_type IS '事件类型：invite/ring/accept/reject/cancel/join/leave/end 等'`,
    `COMMENT ON COLUMN call_events.request_id IS '幂等请求ID；同一 request_id 仅记录一次'`,
    `COMMENT ON COLUMN call_events.payload IS '事件载荷 JSON，按 event_type 区分结构'`,
    `COMMENT ON COLUMN user_devices.device_type IS '设备类型：0=未知, 1=web, 2=electron, 3=mobile, 9=其他'`,
    `COMMENT ON COLUMN user_devices.status IS '设备状态：0=禁用, 1=活跃, 2=已登出或已撤销'`,
    `COMMENT ON COLUMN user_devices.push_provider IS '推送通道：apns/fcm/hms/mipush/web/none 等'`,
    `COMMENT ON COLUMN user_devices.push_token IS '推送服务下发的设备 token（敏感，仅服务端使用）'`,
    `COMMENT ON COLUMN user_devices.voip_token IS 'iOS PushKit VoIP 推送 token（敏感，仅用于 call.invite 唤醒系统通话界面）'`,
    `COMMENT ON COLUMN user_devices.push_app_id IS '推送平台的应用ID（多 bundle/多产品线区分）'`,
    `COMMENT ON COLUMN user_devices.last_seen_at IS '最近一次连接/心跳时间'`,
    `COMMENT ON COLUMN user_devices.last_login_at IS '该设备最近一次登录时间'`,
    `COMMENT ON COLUMN user_devices.last_ip IS '最近一次连接来源IP'`,
    `COMMENT ON COLUMN user_devices.metadata IS '设备扩展信息 JSON：型号、OS版本、UA 等'`,
    `COMMENT ON COLUMN user_sessions.status IS '会话状态：0=活跃, 1=已撤销, 2=已过期'`,
    `COMMENT ON COLUMN user_sessions.session_id IS '会话标识；用于撤销与设备级会话管理'`,
    `COMMENT ON COLUMN user_sessions.refresh_token_hash IS '当前 refresh token 的哈希值（不存明文）'`,
    `COMMENT ON COLUMN user_sessions.access_jti IS '当前 access token 的 jti，用于黑名单/旋转校验'`,
    `COMMENT ON COLUMN user_sessions.expires_at IS 'refresh token 过期时间'`,
    `COMMENT ON COLUMN user_sessions.revoked_at IS '会话被撤销的时间；与 status 联用'`,
    `COMMENT ON COLUMN user_sessions.revoke_reason IS '撤销原因：logout/admin/security/replaced 等'`,
    `COMMENT ON COLUMN user_sessions.previous_refresh_token_hash IS '旋转前的 refresh token 哈希；用于吸收旋转期间的并发请求'`,
    `COMMENT ON COLUMN user_sessions.previous_refresh_rotated_at IS 'previous_refresh_token_hash 的旋转时间，用于宽限期判断'`,
    `COMMENT ON COLUMN user_sessions.previous_access_jti IS '旋转前的 access_jti；在 JWT_ACCESS_GRACE_SECONDS 宽限期内仍可被接受，避免刷新期间的并发请求被误判'`,
    `COMMENT ON COLUMN user_sessions.previous_access_rotated_at IS 'previous_access_jti 的旋转时间，与之联用做宽限期判定'`,
    `COMMENT ON COLUMN auth_audit_logs.action_status IS '动作结果：0=成功, 1=失败'`,
    `COMMENT ON COLUMN auth_audit_logs.action IS '审计动作：login/logout/refresh/revoke/register/password_change 等'`,
    `COMMENT ON COLUMN auth_audit_logs.details IS '审计详情 JSON：失败原因、设备信息等扩展字段'`,
    `COMMENT ON COLUMN user_privacy_settings.discoverable_by_username IS '按用户名被发现：0=任何人, 1=仅联系人, 2=不允许'`,
    `COMMENT ON COLUMN user_privacy_settings.discoverable_by_phone IS '按手机号被发现：0=任何人, 1=仅联系人, 2=不允许'`,
    `COMMENT ON COLUMN user_privacy_settings.message_permission IS '消息权限：0=任何人, 1=仅联系人, 2=不允许'`,
    `COMMENT ON COLUMN user_privacy_settings.presence_visibility IS '在线状态可见性：0=任何人, 1=仅联系人, 2=不允许'`,
    `COMMENT ON COLUMN user_privacy_settings.read_receipts_visibility IS '已读回执可见性：0=任何人（默认）, 1=仅联系人（预留）, 2=不允许；关闭后双向失效（既不发回执也不收他人回执）'`,
    `COMMENT ON COLUMN user_notification_settings.preview_mode IS '通知预览模式：full=显示发送人和内容, sender=仅发送人, hidden=不显示内容'`,
    `COMMENT ON COLUMN user_notification_settings.sound_enabled IS '是否播放通知声音；勿扰时段强制静音'`,
    `COMMENT ON COLUMN user_notification_settings.quiet_hours_start IS '勿扰时段起始时间，本地时区 HH:mm'`,
    `COMMENT ON COLUMN user_notification_settings.quiet_hours_end IS '勿扰时段结束时间，本地时区 HH:mm'`,
    `COMMENT ON COLUMN user_notification_settings.messages_enabled IS '消息通知总开关'`,
    `COMMENT ON COLUMN user_notification_settings.calls_enabled IS '通话通知总开关'`,
    `COMMENT ON COLUMN user_notification_settings.group_messages_enabled IS '群消息通知开关'`,
    `COMMENT ON COLUMN user_notification_settings.mention_only IS '仅在被 @ 时通知（针对群消息）'`,
    `COMMENT ON COLUMN user_notification_settings.in_app_banner_enabled IS '前台运行时是否显示应用内横幅'`,
    `COMMENT ON COLUMN user_notification_settings.quiet_hours_enabled IS '勿扰时段总开关'`,
    `COMMENT ON COLUMN user_notification_settings.quiet_hours_allow_mentions IS '勿扰时段内仍允许 @ 我的消息突破'`,
    `COMMENT ON COLUMN user_notification_settings.quiet_hours_allow_calls IS '勿扰时段内仍允许通话突破'`,
    `COMMENT ON COLUMN user_phone_identity.phone_e164 IS 'E.164 格式手机号（含国家码，如 +8613800001234）'`,
    `COMMENT ON COLUMN user_phone_identity.phone_country_code IS '国家/地区码（如 86、1、44），便于按区域统计'`,
    `COMMENT ON COLUMN user_phone_identity.verified_at IS '手机号验证通过时间；存在即视为已验证'`,
    `COMMENT ON COLUMN user_contacts.remark_name IS '本地备注名（仅 owner 可见）'`,
    `COMMENT ON COLUMN user_contacts.remark_note IS '本地备注说明（仅 owner 可见）'`,
    `COMMENT ON COLUMN user_contacts.source IS '添加来源：search/qr/contact_book/group/recommend 等'`,
    `COMMENT ON COLUMN user_contacts.status IS '联系人状态：normal=正常, deleted=已删除（保留行用于增量同步）'`,
    `COMMENT ON COLUMN direct_conversation_pairs.user_low_id IS '私聊两位用户中较小的一方ID（保证 (low,high) 唯一映射到一个会话）'`,
    `COMMENT ON COLUMN direct_conversation_pairs.user_high_id IS '私聊两位用户中较大的一方ID'`,
    `COMMENT ON COLUMN direct_conversation_pairs.conversation_id IS '对应的私聊会话ID（一对一映射，UNIQUE）'`,
    `COMMENT ON TABLE api_idempotency_keys IS 'HTTP 接口幂等键缓存：命中 (user_id, method, path, client_request_id) 时直接回放上次响应'`,
    `COMMENT ON COLUMN api_idempotency_keys.request_hash IS '请求体 sha256，命中 key 但 hash 不一致返回 409'`,
    `COMMENT ON COLUMN api_idempotency_keys.response_body IS '上次成功响应的完整 JSON 体，由中间件原样回放'`,
    `COMMENT ON COLUMN api_idempotency_keys.expires_at IS '过期时间，定时清理任务按此列删除'`
  ]
};

export async function runServerMigrations() {
  await pg.none(`
    CREATE TABLE IF NOT EXISTS app_schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrations = [consolidatedMigration];

  for (const migration of migrations) {
    const applied = await pg.oneOrNone<{ id: number }>(
      "SELECT id FROM app_schema_migrations WHERE id = $1",
      [migration.id]
    );

    if (applied) {
      continue;
    }

    logger.info(
      {
        migrationId: migration.id,
        migrationName: migration.name
      },
      "Running server migration"
    );

    await pg.tx(async t => {
      for (const statement of migration.statements) {
        await t.none(statement);
      }

      await t.none(
        "INSERT INTO app_schema_migrations (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
        [migration.id, migration.name]
      );
    });
  }
}
