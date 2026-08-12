import { useCallback, useEffect, useRef, useState } from "react";

export function useLocalVoiceRecording(props: {
  onStart: () => void;
  onStop: (durationMs: number) => void;
  onCancel: () => void;
}) {
  const [active, setActive] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const activeRef = useRef(false);
  const elapsedRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const onCancelRef = useRef(props.onCancel);
  onCancelRef.current = props.onCancel;

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
      if (activeRef.current) {
        activeRef.current = false;
        onCancelRef.current();
      }
    };
  }, []);

  const start = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    setActive(true);
    setElapsedMs(0);
    elapsedRef.current = 0;
    intervalRef.current = setInterval(() => {
      elapsedRef.current += 100;
      setElapsedMs(elapsedRef.current);
    }, 100);
    props.onStart();
  }, [props.onStart]);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
    const duration = elapsedRef.current;
    setActive(false);
    setElapsedMs(0);
    elapsedRef.current = 0;
    props.onStop(duration);
  }, [props.onStop]);

  const cancel = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
    setActive(false);
    setElapsedMs(0);
    elapsedRef.current = 0;
    props.onCancel();
  }, [props.onCancel]);

  return { active, elapsedMs, start, stop, cancel };
}
