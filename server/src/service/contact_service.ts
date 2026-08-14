import type { Contact } from "@mushroom/shared";
import {
  CONTACT_REMARK_MAX_LENGTH,
  CONTACT_REMARK_NOTE_MAX_LENGTH
} from "@mushroom/shared";
import pg from "../db/pg";
import { BusinessError } from "../handler/business_error";
import BlockRepository from "../repository/block_repository";
import ContactRepository from "../repository/contact_repository";
import { type DbTx } from "../repository/conversation/conversation_core_repository";
import type { UserRecord as User } from "../repository/models";
import OutboxRepository from "../repository/outbox_repository";
import PrivacyRepository from "../repository/privacy_repository";
import UserRepository from "../repository/user_repository";
import { wsServer } from "../websocket";

function normalizeOptionalContactText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function validatePhoneE164(phone: string) {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

/**
 * Best-effort normalization to E.164. The mobile client is expected to
 * present the user with a country-code picker so the input typically arrives
 * in `+<country><number>` form; we still accept "00" prefix and bare digits
 * (treating leading 0 as a national-trunk to be stripped).
 */
function normalizePhoneE164(
  raw: string,
  defaultCountryCode?: string
): string | null {
  const compact = raw.replace(/[\s\-()]/g, "").trim();
  if (!compact) return null;

  let candidate = compact;
  if (candidate.startsWith("00")) {
    candidate = "+" + candidate.slice(2);
  }
  if (!candidate.startsWith("+")) {
    if (defaultCountryCode) {
      const code = defaultCountryCode.startsWith("+")
        ? defaultCountryCode.slice(1)
        : defaultCountryCode;
      const national = candidate.startsWith("0")
        ? candidate.slice(1)
        : candidate;
      candidate = `+${code}${national}`;
    } else {
      return null;
    }
  }

  return validatePhoneE164(candidate) ? candidate : null;
}

class ContactService {
  validatePhoneE164(phone: string): boolean {
    return validatePhoneE164(phone);
  }

  async areContacts(userId: number, targetUserId: number): Promise<boolean> {
    return ContactRepository.isSavedContact(userId, targetUserId);
  }

  async listSavedContactIds(
    ownerUserId: number,
    candidateUserIds: number[]
  ): Promise<number[]> {
    return ContactRepository.listSavedContactIds(ownerUserId, candidateUserIds);
  }

  /**
   * 判断 searcher 是否可以通过 username / phone 发现 target。
   * 综合考虑双向 block、target 的隐私设置。
   */
  async canDiscoverUser(
    searcherId: number,
    targetUserId: number,
    mode: "username" | "phone"
  ): Promise<boolean> {
    if (searcherId === targetUserId) {
      return true;
    }

    if (
      (await BlockRepository.exists(targetUserId, searcherId)) ||
      (await BlockRepository.exists(searcherId, targetUserId))
    ) {
      return false;
    }

    const settings = await PrivacyRepository.findByUserId(targetUserId);
    const rule =
      mode === "phone"
        ? settings.discoverable_by_phone
        : settings.discoverable_by_username;
    if (rule === 0) {
      return true;
    }
    if (rule === 2) {
      return false;
    }
    return ContactRepository.isSavedContact(targetUserId, searcherId);
  }

  async getContacts(userId: number): Promise<Contact[]> {
    const contacts = await ContactRepository.listContacts(userId);
    return contacts.map(contact => ({
      ...contact,
      contact_user_id: contact.user_id,
      updated_at: new Date(contact.updated_at).toISOString()
    }));
  }

  async matchAddressBookPhones(userId: number, phones: string[]) {
    const normalizedPhones = Array.from(
      new Set(phones.map(phone => phone.trim()).filter(Boolean))
    );

    if (normalizedPhones.length > 500) {
      throw new BusinessError("At most 500 phone numbers can be matched");
    }

    const invalidPhone = normalizedPhones.find(
      phone => !validatePhoneE164(phone)
    );
    if (invalidPhone) {
      throw new BusinessError("phones must use E.164 format");
    }

    const matched = await ContactRepository.matchPhoneIdentities(
      normalizedPhones,
      userId
    );

    return matched.map(item => ({
      phone_e164: item.phone_e164,
      user_id: item.user_id,
      nickname: item.nickname,
      username: item.username,
      avatar_url: item.avatar_url
    }));
  }

  async saveContact(
    userId: number,
    input: {
      contactUserId: number;
      remarkName?: string | null;
      remarkNote?: string | null;
      source?: string | null;
    }
  ): Promise<Contact> {
    if (userId === input.contactUserId) {
      throw new BusinessError("Cannot save yourself as a contact");
    }

    const target = await UserRepository.findById(input.contactUserId);
    if (!target) {
      throw new BusinessError("User not found");
    }

    const existed = await ContactRepository.isSavedContact(
      userId,
      input.contactUserId
    );
    if (existed) {
      throw new BusinessError("该用户已是你的联系人");
    }

    const savedContact = await pg.tx(async (t: DbTx) => {
      const contact = await ContactRepository.upsertContact(
        {
          owner_user_id: userId,
          contact_user_id: input.contactUserId,
          remark_name: normalizeOptionalContactText(input.remarkName),
          remark_note: normalizeOptionalContactText(input.remarkNote),
          source: normalizeOptionalContactText(input.source)
        },
        t
      );
      const savedContact: Contact = {
        ...contact,
        contact_user_id: contact.user_id,
        updated_at: new Date(contact.updated_at).toISOString()
      };
      await OutboxRepository.insertEvents(t, [
        {
          event_type: "contact.changed",
          target_user_id: userId,
          payload: {
            messageClassify: "contact_changed",
            action: "added",
            contact: savedContact
          }
        }
      ]);
      return savedContact;
    });

    wsServer.dispatchToUser(userId, {
      messageClassify: "contact_changed",
      action: "added",
      contact: savedContact
    });

    return savedContact;
  }

  async updateContact(
    userId: number,
    contactUserId: number,
    patch: {
      remarkName?: string | null;
      remarkNote?: string | null;
    }
  ): Promise<Contact> {
    const nextRemarkName = normalizeOptionalContactText(patch.remarkName);
    if (nextRemarkName && nextRemarkName.length > CONTACT_REMARK_MAX_LENGTH) {
      throw new BusinessError(
        `备注名不能超过 ${CONTACT_REMARK_MAX_LENGTH} 个字符`
      );
    }
    const nextRemarkNote = normalizeOptionalContactText(patch.remarkNote);
    if (
      nextRemarkNote &&
      nextRemarkNote.length > CONTACT_REMARK_NOTE_MAX_LENGTH
    ) {
      throw new BusinessError(
        `备注说明不能超过 ${CONTACT_REMARK_NOTE_MAX_LENGTH} 个字符`
      );
    }
    const updatedContact = await pg.tx(async (t: DbTx) => {
      const contact = await ContactRepository.updateContact(
        userId,
        contactUserId,
        {
          remark_name: nextRemarkName,
          remark_note: nextRemarkNote
        },
        t
      );
      if (!contact) {
        throw new BusinessError("Contact not found");
      }
      const updatedContact: Contact = {
        ...contact,
        contact_user_id: contact.user_id,
        updated_at: new Date(contact.updated_at).toISOString()
      };
      await OutboxRepository.insertEvents(t, [
        {
          event_type: "contact.changed",
          target_user_id: userId,
          payload: {
            messageClassify: "contact_changed",
            action: "updated",
            contact: updatedContact
          }
        }
      ]);
      return updatedContact;
    });

    wsServer.dispatchToUser(userId, {
      messageClassify: "contact_changed",
      action: "updated",
      contact: updatedContact
    });

    return updatedContact;
  }

  async deleteContact(userId: number, targetUserId: number): Promise<void> {
    if (userId === targetUserId) {
      throw new BusinessError("Cannot delete yourself from contacts");
    }

    const target = await UserRepository.findById(targetUserId);
    if (!target) {
      throw new BusinessError("User not found");
    }

    await pg.tx(async (t: DbTx) => {
      await ContactRepository.markContactDeleted(userId, targetUserId, t);
      await OutboxRepository.insertEvents(t, [
        {
          event_type: "contact.changed",
          target_user_id: userId,
          payload: {
            messageClassify: "contact_changed",
            action: "removed",
            contact: { user_id: targetUserId }
          }
        }
      ]);
    });

    wsServer.dispatchToUser(userId, {
      messageClassify: "contact_changed",
      action: "removed",
      contact: { user_id: targetUserId }
    });
  }

  /**
   * 通过任意电话字符串查找已注册的 Mushroom 用户。
   * 返回匹配的用户（已应用隐私过滤）和归一化后的 E.164 号码，
   * 调用方可据此回退到 "短信邀请" 流程。
   */
  async lookupUserByPhone(
    selfId: number,
    rawPhone: string,
    defaultCountryCode?: string
  ): Promise<{
    matched: boolean;
    phoneE164: string | null;
    user: User | null;
    isAlreadyContact: boolean;
  }> {
    const normalized = normalizePhoneE164(rawPhone, defaultCountryCode);
    if (!normalized) {
      throw new BusinessError("Invalid phone number");
    }

    const matched = await ContactRepository.matchPhoneIdentities(
      [normalized],
      selfId
    );
    const first = matched[0];
    if (!first) {
      return {
        matched: false,
        phoneE164: normalized,
        user: null,
        isAlreadyContact: false
      };
    }

    const allowed = await this.canDiscoverUser(selfId, first.user_id, "phone");
    if (!allowed) {
      return {
        matched: false,
        phoneE164: normalized,
        user: null,
        isAlreadyContact: false
      };
    }

    const user = await UserRepository.findById(first.user_id);
    const isAlreadyContact = user
      ? await ContactRepository.isSavedContact(selfId, user.id)
      : false;
    return { matched: true, phoneE164: normalized, user, isAlreadyContact };
  }
}

export default new ContactService();
