const contacts = [];
let permission = "authorized";

module.exports = {
  __esModule: true,
  __setContacts(nextContacts) {
    contacts.splice(0, contacts.length, ...nextContacts);
  },
  __setPermission(nextPermission) {
    permission = nextPermission;
  },
  checkPermission: jest.fn(async () => permission),
  requestPermission: jest.fn(async () => permission),
  getAllWithoutPhotos: jest.fn(async () => contacts),
  default: {
    checkPermission: jest.fn(async () => permission),
    requestPermission: jest.fn(async () => permission),
    getAllWithoutPhotos: jest.fn(async () => contacts)
  }
};
