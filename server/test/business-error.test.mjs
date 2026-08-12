import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  BusinessError
} = require("../dist/server/src/handler/business_error.js");
const {
  errorHandler
} = require("../dist/server/src/handler/response_wrapper.js");
const loggerModule = require("../dist/server/src/utils/logger.js");

const logger = loggerModule.default;
const originalLoggerError = logger.error;

test.afterEach(() => {
  logger.error = originalLoggerError;
});

test("BusinessError defaults to a client error status", () => {
  assert.equal(new BusinessError("Invalid input").code, 400);
});

test("errorHandler maps default BusinessError to HTTP 400", () => {
  let statusCode = null;
  let body = null;
  logger.error = () => {};
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
    }
  };

  errorHandler()(new BusinessError("Invalid input"), {}, res, () => {});

  assert.equal(statusCode, 400);
  assert.equal(body.code, 400);
  assert.equal(body.message, "Invalid input");
});
