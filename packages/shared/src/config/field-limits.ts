/**
 * 业务表单字段的长度上限（唯一事实来源）。
 *
 * 这些值 < DB 物理列宽，仅为业务层约定：在移动端限制输入（maxLength），
 * 在服务端拒绝超长请求，避免超长文本在手机上溢出布局，也避免直接打到
 * 数据库列宽限制（PG 的 `value too long`）报出难以理解的错误。
 *
 * 若未来需要调整，只需改这里，移动端与服务端会自动同步。
 */

/** 用户名（登录/注册），对应 users.username VARCHAR(64)，业务取小。 */
export const USERNAME_MAX_LENGTH = 20;

/** 昵称，对应 users.nickname VARCHAR(255)，业务取小。 */
export const NICKNAME_MAX_LENGTH = 32;

/** 邮箱，对应 users.email VARCHAR(255)。 */
export const EMAIL_MAX_LENGTH = 255;

/** 手机号，对应 users.phone VARCHAR(32)（E.164 最长 16）。 */
export const PHONE_MAX_LENGTH = 20;

/** 个性签名，对应 users.signature TEXT。 */
export const SIGNATURE_MAX_LENGTH = 100;

/** 好友备注名，对应 user_contacts.remark_name VARCHAR(100)。 */
export const CONTACT_REMARK_MAX_LENGTH = 32;

/** 好友备注说明，对应 user_contacts.remark_note VARCHAR(500)。 */
export const CONTACT_REMARK_NOTE_MAX_LENGTH = 500;

/** 群名称，对应 conversations.name VARCHAR(255)，业务取小。 */
export const GROUP_NAME_MAX_LENGTH = 16;

/** 群简介，对应 conversations.description TEXT。 */
export const GROUP_DESCRIPTION_MAX_LENGTH = 100;

/** 群公告，存于 conversations.settings JSONB。 */
export const GROUP_ANNOUNCEMENT_MAX_LENGTH = 200;

/**
 * 密码（注册/修改密码），对应 users.password TEXT。
 * 上限取 64：低于 bcrypt 的 72 字节有效长度，避免超过 72 字节时
 * bcrypt 静默截断导致"前 72 字节相同"的不同密码可互相登录。
 */
export const PASSWORD_MAX_LENGTH = 64;

/** 搜索关键词，服务端 user_repository 静默截断到 50。 */
export const SEARCH_KEYWORD_MAX_LENGTH = 50;
