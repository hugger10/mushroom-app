import pg from "../db/pg";
import type { DbTx } from "./conversation/conversation_core_repository";
import type { ContactMatchRecord, ContactRecord } from "./models";

export type UpsertContactInput = {
  owner_user_id: number;
  contact_user_id: number;
  remark_name?: string | null;
  remark_note?: string | null;
  source?: string | null;
};

class ContactRepository {
  async listContacts(userId: number) {
    return pg.manyOrNone<ContactRecord>(
      `SELECT
         c.contact_user_id::integer AS user_id,
         c.contact_user_id::integer AS contact_user_id,
         c.remark_name,
         c.remark_note,
         c.source,
         c.status,
         u.username,
         u.nickname,
         u.gender,
         u.avatar_url,
         u.signature,
         c.updated_at
       FROM user_contacts c
       JOIN users u
         ON u.id = c.contact_user_id
        AND u.is_deleted = FALSE
       LEFT JOIN user_blocks blocks
         ON blocks.blocker_id = $1
        AND blocks.blocked_id = u.id
       WHERE c.owner_user_id = $1
         AND c.status = 'normal'
         AND blocks.blocked_id IS NULL
       ORDER BY c.updated_at DESC, u.nickname ASC, u.username ASC`,
      [userId]
    );
  }

  /**
   * 列出"把指定用户加为联系人"的反向所有者 user_ids。
   * 用于 presence 推送等需要双向覆盖的场景：即使被广播者本人没有保存某用户，
   * 只要那位用户保存了被广播者，就应当能收到状态变更。
   */
  async listReverseContactOwners(contactUserId: number) {
    const rows = await pg.manyOrNone<{ owner_user_id: number }>(
      `SELECT owner_user_id::integer AS owner_user_id
         FROM user_contacts
        WHERE contact_user_id = $1
          AND status = 'normal'`,
      [contactUserId]
    );
    return rows.map(row => row.owner_user_id);
  }

  /**
   * 批量判断 ownerUserId 是否把候选 user_ids 中的某个加为联系人。
   * 返回 ownerUserId 视角下"已保存为联系人"的 user_id 集合。
   * 用于 presence 可见性过滤等需要批量双向判定的场景。
   */
  async listSavedContactIds(
    ownerUserId: number,
    candidateUserIds: number[]
  ): Promise<number[]> {
    if (candidateUserIds.length === 0) {
      return [];
    }
    const rows = await pg.manyOrNone<{ contact_user_id: number }>(
      `SELECT contact_user_id::integer AS contact_user_id
         FROM user_contacts
        WHERE owner_user_id = $1
          AND status = 'normal'
          AND contact_user_id = ANY($2::bigint[])`,
      [ownerUserId, candidateUserIds]
    );
    return rows.map(row => row.contact_user_id);
  }

  async isSavedContact(
    userId: number,
    otherUserId: number,
    t: DbTx | typeof pg = pg
  ) {
    const row = await t.oneOrNone<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1
         FROM user_contacts
         WHERE owner_user_id = $1
           AND contact_user_id = $2
           AND status = 'normal'
       ) AS exists`,
      [userId, otherUserId]
    );

    return Boolean(row?.exists);
  }

  async upsertContact(input: UpsertContactInput, t: DbTx | typeof pg = pg) {
    return t.one<ContactRecord>(
      `WITH saved AS (
         INSERT INTO user_contacts (
           owner_user_id,
           contact_user_id,
           remark_name,
           remark_note,
           source,
           status,
           created_at,
           updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, 'normal', NOW(), NOW()
         )
         ON CONFLICT (owner_user_id, contact_user_id) DO UPDATE
         SET remark_name = COALESCE(EXCLUDED.remark_name, user_contacts.remark_name),
             remark_note = COALESCE(EXCLUDED.remark_note, user_contacts.remark_note),
             source = COALESCE(EXCLUDED.source, user_contacts.source),
             status = 'normal',
             updated_at = NOW()
         RETURNING *
       )
       SELECT
         saved.contact_user_id::integer AS user_id,
         saved.contact_user_id::integer AS contact_user_id,
         saved.remark_name,
         saved.remark_note,
         saved.source,
         saved.status,
         u.username,
         u.nickname,
         u.gender,
         u.avatar_url,
         u.signature,
         saved.updated_at
       FROM saved
       JOIN users u ON u.id = saved.contact_user_id`,
      [
        input.owner_user_id,
        input.contact_user_id,
        input.remark_name ?? null,
        input.remark_note ?? null,
        input.source ?? null
      ]
    );
  }

  async updateContact(
    ownerUserId: number,
    contactUserId: number,
    patch: {
      remark_name?: string | null;
      remark_note?: string | null;
    },
    t: DbTx | typeof pg = pg
  ) {
    return t.oneOrNone<ContactRecord>(
      `WITH updated AS (
         UPDATE user_contacts
         SET remark_name = COALESCE($3, remark_name),
             remark_note = COALESCE($4, remark_note),
             updated_at = NOW()
         WHERE owner_user_id = $1
           AND contact_user_id = $2
           AND status = 'normal'
         RETURNING *
       )
       SELECT
         updated.contact_user_id::integer AS user_id,
         updated.contact_user_id::integer AS contact_user_id,
         updated.remark_name,
         updated.remark_note,
         updated.source,
         updated.status,
         u.username,
         u.nickname,
         u.gender,
         u.avatar_url,
         u.signature,
         updated.updated_at
       FROM updated
       JOIN users u ON u.id = updated.contact_user_id`,
      [
        ownerUserId,
        contactUserId,
        patch.remark_name ?? null,
        patch.remark_note ?? null
      ]
    );
  }

  async markContactDeleted(
    ownerUserId: number,
    contactUserId: number,
    t: DbTx | typeof pg = pg
  ) {
    return t.result(
      `UPDATE user_contacts
       SET status = 'deleted',
           updated_at = NOW()
       WHERE owner_user_id = $1
         AND contact_user_id = $2
         AND status <> 'deleted'`,
      [ownerUserId, contactUserId]
    );
  }

  async matchPhoneIdentities(phoneE164List: string[], selfId?: number) {
    if (phoneE164List.length === 0) {
      return [];
    }

    return pg.manyOrNone<ContactMatchRecord>(
      `SELECT
         identity.phone_e164,
         u.id::integer AS user_id,
         u.username,
         u.nickname,
         u.avatar_url
       FROM user_phone_identity identity
       JOIN users u
         ON u.id = identity.user_id
        AND u.is_deleted = FALSE
       WHERE identity.phone_e164 = ANY($1)
         AND ($2::BIGINT IS NULL OR u.id <> $2)
       ORDER BY u.nickname ASC, u.username ASC`,
      [phoneE164List, selfId ?? null]
    );
  }

  async upsertPhoneIdentity(
    userId: number,
    phoneE164: string,
    t: DbTx | typeof pg = pg
  ) {
    return t.none(
      `INSERT INTO user_phone_identity (
         user_id,
         phone_e164,
         phone_country_code,
         verified_at,
         created_at,
         updated_at
       ) VALUES (
         $1,
         $2,
         substring($2 from '^\\+\\d{1,3}'),
         NOW(),
         NOW(),
         NOW()
       )
       ON CONFLICT (user_id) DO UPDATE
       SET phone_e164 = EXCLUDED.phone_e164,
           phone_country_code = EXCLUDED.phone_country_code,
           verified_at = EXCLUDED.verified_at,
           updated_at = NOW()`,
      [userId, phoneE164]
    );
  }
}

export default new ContactRepository();
