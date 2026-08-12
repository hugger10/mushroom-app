module.exports = {
  createThumbnail: jest.fn(() =>
    Promise.resolve({
      path: "",
      size: 0,
      mime: "image/jpeg",
      width: 0,
      height: 0
    })
  )
};
