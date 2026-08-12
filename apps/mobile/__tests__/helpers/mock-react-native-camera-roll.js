const CameraRoll = {
  getPhotos: jest.fn().mockResolvedValue({
    edges: [],
    page_info: { has_next_page: false }
  }),
  save: jest.fn().mockResolvedValue("ph://mock"),
  saveAsset: jest.fn().mockResolvedValue("ph://mock"),
  deletePhotos: jest.fn().mockResolvedValue(undefined)
};

module.exports = {
  __esModule: true,
  CameraRoll,
  default: CameraRoll,
  getPhotos: CameraRoll.getPhotos,
  save: CameraRoll.save,
  saveAsset: CameraRoll.saveAsset,
  deletePhotos: CameraRoll.deletePhotos
};
