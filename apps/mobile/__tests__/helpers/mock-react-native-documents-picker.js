const errorCodes = {
  OPERATION_CANCELED: "OPERATION_CANCELED"
};

module.exports = {
  errorCodes,
  isErrorWithCode(error) {
    return Boolean(error && typeof error === "object" && "code" in error);
  },
  async pick() {
    throw Object.assign(new Error("Operation canceled"), {
      code: errorCodes.OPERATION_CANCELED
    });
  },
  types: {
    allFiles: "*/*"
  }
};
