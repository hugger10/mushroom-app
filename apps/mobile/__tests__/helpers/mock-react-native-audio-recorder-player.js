class MockAudioRecorderPlayer {
  startRecorder = jest.fn().mockResolvedValue("path");
  stopRecorder = jest.fn().mockResolvedValue({ currentPosition: 0 });
  addRecordBackListener = jest.fn();
  removeRecordBackListener = jest.fn();
  startPlayer = jest.fn().mockResolvedValue(0);
  stopPlayer = jest.fn().mockResolvedValue(0);
  addPlayBackListener = jest.fn();
  removePlayBackListener = jest.fn();
  pausePlayer = jest.fn().mockResolvedValue(0);
  resumePlayer = jest.fn().mockResolvedValue(0);
  seekToPlayer = jest.fn().mockResolvedValue(0);
}

module.exports = {
  __esModule: true,
  default: MockAudioRecorderPlayer,
  AudioRecorderPlayer: MockAudioRecorderPlayer,
  AudioSet: {}
};
