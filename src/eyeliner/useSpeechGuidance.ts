import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "../session";

type SpeechScope = {
  speechSynthesis?: SpeechSynthesis;
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
};

export class SpeechGuide {
  private enabled = false;
  private lastKey = "";

  constructor(
    private synthesis: Pick<SpeechSynthesis, "cancel" | "speak">,
    private makeUtterance: (text: string) => SpeechSynthesisUtterance,
  ) {}

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.lastKey = "";
    if (!enabled) this.synthesis.cancel();
  }

  announce(key: string, text: string) {
    if (!this.enabled || this.lastKey === key) return;
    this.lastKey = key;
    this.synthesis.cancel();
    this.synthesis.speak(this.makeUtterance(text));
  }

  stop() {
    this.lastKey = "";
    this.synthesis.cancel();
  }
}

export function createSpeechGuide(scope: SpeechScope): SpeechGuide | null {
  if (!scope.speechSynthesis || !scope.SpeechSynthesisUtterance) return null;
  return new SpeechGuide(
    scope.speechSynthesis,
    (text) => new scope.SpeechSynthesisUtterance!(text),
  );
}

export function useSpeechGuidance({
  active,
  visible,
  error,
  session,
}: {
  active: boolean;
  visible: boolean;
  error: string;
  session: Session;
}) {
  const guide = useRef<SpeechGuide | null>(null);
  if (guide.current === null && typeof window !== "undefined")
    guide.current = createSpeechGuide(window);
  const available = guide.current !== null;
  const [enabled, setEnabled] = useState(false);
  const resultSerial = useRef(0);

  const toggle = useCallback(() => {
    if (!guide.current) return;
    setEnabled((current) => {
      guide.current!.setEnabled(!current);
      return !current;
    });
  }, []);
  const stop = useCallback(() => guide.current?.stop(), []);

  useEffect(() => {
    if (!active) return;
    guide.current?.announce(
      visible ? "vision:found" : "vision:lost",
      visible ? "眼部定位成功。" : "眼部定位丢失，请正视镜头。",
    );
  }, [active, visible]);

  useEffect(() => {
    if (session.step === "wing")
      guide.current?.announce("step:wing", "进入画眼尾步骤。");
    else if (session.step === "connect")
      guide.current?.announce("step:connect", "进入连接外段步骤。");
    else if (session.step === "done")
      guide.current?.announce("step:done", "练习完成。");
  }, [session.step]);

  useEffect(() => {
    if (error) guide.current?.announce(`error:${error}`, error);
  }, [error]);

  useEffect(() => {
    if (!session.result) return;
    guide.current?.announce(
      `result:${++resultSerial.current}`,
      `检查结果：${session.result.message}。`,
    );
  }, [session.result]);

  useEffect(() => {
    const hide = () => {
      if (document.hidden) guide.current?.stop();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      guide.current?.stop();
    };
  }, []);

  return { available, enabled, toggle, stop };
}
