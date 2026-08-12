import { Request, Response } from "express";
import type {
  UserBlocksResponse,
  UserContactsResponse
} from "@mushroom/shared";
import BlockService from "../service/block_service";
import ContactService from "../service/contact_service";
import { wrapAsync } from "../handler/response_wrapper";
import { BusinessError } from "../handler/business_error";
import { toUserSearchResult } from "../utils/dto";
import {
  optionalNumberField,
  optionalStringField,
  requireNumberField,
  requireStringField
} from "../handler/request_parser";

export class ContactController {
  static getContacts = wrapAsync(
    async (req: Request, res: Response): Promise<UserContactsResponse> => {
      void res;
      return {
        contacts: await ContactService.getContacts(req.JwtPayload!.userId)
      };
    }
  );

  static matchContacts = wrapAsync(async (req: Request, res: Response) => {
    void res;
    const phones = req.body?.phones;
    if (!Array.isArray(phones)) {
      throw new BusinessError("phones is required");
    }

    return {
      matched_users: await ContactService.matchAddressBookPhones(
        req.JwtPayload!.userId,
        phones.map(phone => String(phone))
      )
    };
  });

  static lookupContactByPhone = wrapAsync(
    async (req: Request, res: Response) => {
      void res;
      const phone = requireStringField(
        req.body,
        "phone_e164",
        "phone_e164 is required"
      );
      const defaultCountryCode = optionalStringField(
        req.body,
        "default_country_code"
      );
      const result = await ContactService.lookupUserByPhone(
        req.JwtPayload!.userId,
        phone,
        defaultCountryCode ?? undefined
      );
      return {
        matched: result.matched,
        phone_e164: result.phoneE164 ?? phone,
        user: result.user
          ? {
              ...toUserSearchResult(result.user),
              is_already_contact: result.isAlreadyContact
            }
          : undefined
      };
    }
  );

  static saveContact = wrapAsync(async (req: Request, res: Response) => {
    void res;
    const contactUserId = optionalNumberField(req.body, "contact_user_id");
    if (!contactUserId) {
      throw new BusinessError("contact_user_id is required");
    }

    const contact = await ContactService.saveContact(req.JwtPayload!.userId, {
      contactUserId,
      remarkName: optionalStringField(req.body, "remark_name"),
      remarkNote: optionalStringField(req.body, "remark_note"),
      source: optionalStringField(req.body, "source")
    });

    return { contact };
  });

  static updateContact = wrapAsync(async (req: Request, res: Response) => {
    void res;
    const contactUserId = requireNumberField(
      req.params,
      "contactUserId",
      "contactUserId is required"
    );

    const contact = await ContactService.updateContact(
      req.JwtPayload!.userId,
      contactUserId,
      {
        remarkName: optionalStringField(req.body, "remark_name"),
        remarkNote: optionalStringField(req.body, "remark_note")
      }
    );

    return { contact };
  });

  static deleteContactByParam = wrapAsync(
    async (req: Request, res: Response) => {
      void res;
      const targetUserId = requireNumberField(
        req.params,
        "contactUserId",
        "contactUserId is required"
      );

      await ContactService.deleteContact(req.JwtPayload!.userId, targetUserId);
      return null;
    }
  );

  static getBlocks = wrapAsync(
    async (req: Request, res: Response): Promise<UserBlocksResponse> => {
      void res;
      return {
        blocks: await BlockService.getBlocks(req.JwtPayload!.userId)
      };
    }
  );

  static block = wrapAsync(async (req: Request, res: Response) => {
    void res;
    const targetUserId = optionalNumberField(req.body, "target_user_id");
    if (!targetUserId) {
      throw new BusinessError("target_user_id is required");
    }

    await BlockService.blockUser(req.JwtPayload!.userId, targetUserId);
    return null;
  });

  static unblock = wrapAsync(async (req: Request, res: Response) => {
    void res;
    const targetUserId = optionalNumberField(req.body, "target_user_id");
    if (!targetUserId) {
      throw new BusinessError("target_user_id is required");
    }

    await BlockService.unblockUser(req.JwtPayload!.userId, targetUserId);
    return null;
  });
}
