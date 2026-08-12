import { useCallback, useEffect, useRef } from "react";

interface UseCallVideoBindingArgs {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  showRemoteAsMain: boolean;
  /** 重绑触发依赖：最小化态切换时主/预览所在 DOM 可能变化，需重新绑定。 */
  effectiveMinimized: boolean;
}

interface UseCallVideoBindingResult {
  mainVideoCb: (el: HTMLVideoElement | null) => void;
  previewVideoCb: (el: HTMLVideoElement | null) => void;
  miniVideoCb: (el: HTMLVideoElement | null) => void;
  remoteAudioCb: (el: HTMLAudioElement | null) => void;
  /** 主画面当前应显示的流（local 或 remote）。 */
  mainVideoStream: MediaStream | null;
  /** 预览窗当前应显示的流。 */
  previewVideoStream: MediaStream | null;
}

/**
 * 通话 `<video>` / `<audio>` 元素与媒体流的绑定。
 *
 * 采用「callback ref」而非「useEffect + 对象 ref」：
 * 独立通话窗里出向视频呼叫时，localStream 到达那一刻 `<video>` 尚未挂载，
 * useEffect 里 `ref.current` 为 null → `srcObject` 永不赋值 → 画面全黑；而 ref
 * 赋值不会重跑 effect，故元素挂载后也不会补绑。callback ref 在元素挂载/卸载的
 * 确切时机被 React 调用，无论 stream 与 mount 谁先到都能正确绑定 `srcObject`；
 * 配套一个「流变化 / 主预览互换」重绑 effect 覆盖后到的流。
 */
export function useCallVideoBinding({
  localStream,
  remoteStream,
  showRemoteAsMain,
  effectiveMinimized
}: UseCallVideoBindingArgs): UseCallVideoBindingResult {
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const mainVideoElRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoElRef = useRef<HTMLVideoElement | null>(null);
  const miniVideoElRef = useRef<HTMLVideoElement | null>(null);

  // 用 ref 保存当前应显示的流，供 callback ref 读取最新值。
  const mainVideoStreamRef = useRef<MediaStream | null>(null);
  const previewVideoStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  remoteStreamRef.current = remoteStream;

  // 设流并补一次 play()（<video> 自带 autoPlay，设 srcObject 后补播是无害兜底，
  // play() 在被打断 / 无手势时 reject，吞掉即可，后续帧仍正常渲染）。
  const bindVideo = useCallback(
    (el: HTMLVideoElement | null, stream: MediaStream | null) => {
      if (!el) {
        return;
      }
      if (el.srcObject !== stream) {
        el.srcObject = stream;
        void el.play().catch(() => {
          /* autoplay 被 defer / 打断时静默忽略 */
        });
      }
    },
    []
  );

  const mainVideoCb = useCallback(
    (el: HTMLVideoElement | null) => {
      mainVideoElRef.current = el;
      bindVideo(el, mainVideoStreamRef.current);
    },
    [bindVideo]
  );
  const previewVideoCb = useCallback(
    (el: HTMLVideoElement | null) => {
      previewVideoElRef.current = el;
      bindVideo(el, previewVideoStreamRef.current);
    },
    [bindVideo]
  );
  const miniVideoCb = useCallback(
    (el: HTMLVideoElement | null) => {
      miniVideoElRef.current = el;
      bindVideo(el, remoteStreamRef.current);
    },
    [bindVideo]
  );

  const remoteAudioCb = useCallback((el: HTMLAudioElement | null) => {
    remoteAudioRef.current = el;
    if (el) {
      el.srcObject = remoteStreamRef.current;
    }
  }, []);

  const mainVideoStream =
    showRemoteAsMain && remoteStream ? remoteStream : localStream;
  const previewVideoStream =
    showRemoteAsMain && remoteStream ? localStream : remoteStream;
  mainVideoStreamRef.current = mainVideoStream;
  previewVideoStreamRef.current = previewVideoStream;

  // 流变化（或主/预览切换 / 最小化态变化）时重绑已挂载的视频元素。callback ref
  // 负责「挂载即绑定」，本 effect 负责「流后到 / 主预览互换」的补绑。
  useEffect(() => {
    bindVideo(mainVideoElRef.current, mainVideoStream);
    bindVideo(previewVideoElRef.current, previewVideoStream);
    bindVideo(miniVideoElRef.current, remoteStream);
  }, [
    bindVideo,
    mainVideoStream,
    previewVideoStream,
    remoteStream,
    effectiveMinimized
  ]);

  // 远端音频流变化时刷新 audio 元素（callback ref 只在挂载触发，流后到需补绑）。
  useEffect(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return {
    mainVideoCb,
    previewVideoCb,
    miniVideoCb,
    remoteAudioCb,
    mainVideoStream,
    previewVideoStream
  };
}
