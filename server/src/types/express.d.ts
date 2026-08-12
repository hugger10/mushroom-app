import type { ApiResult } from "@mushroom/shared";
import type { JwtPayload } from "../handler/jwt";

declare global {
  namespace Express {
    interface Request {
      JwtPayload?: JwtPayload;
    }
    interface Response {
      sendResult<T>(data: T | ApiResult<T | null>): Response;
    }
  }
}
