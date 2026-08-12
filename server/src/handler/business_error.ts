export class BusinessError extends Error {
  code: number;

  constructor(message: string, code: number = 400) {
    super(message);
    this.code = code;
    Object.setPrototypeOf(this, BusinessError.prototype);
  }
}
